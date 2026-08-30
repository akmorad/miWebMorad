// Pruebas de la ruta crítica. Sin framework: node test/run.js
import assert from 'node:assert/strict';
import { Wallet, Transaction, parseEther, parseUnits } from 'ethers';

import { startFakeRpc } from './fake-rpc.js';
import { RpcPool, safeHost } from '../src/rpc/pool.js';
import { encryptPrivateKey, decryptPrivateKey, normalizePrivateKey } from '../src/keystore.js';
import { buildCalldata, encodeFromSignature } from '../src/mint/calldata.js';
import { presignBatch, assertWithinSpendLimits } from '../src/mint/sender.js';
import { resolveMintFunction, looksLikeNotStarted } from '../src/mint/detect.js';
import { buildFees } from '../src/fees.js';
import { parseCollectionUrl } from '../src/opensea.js';
import { popUtf8Char } from '../src/ui.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('la clave privada va y vuelve del cifrado, y una contraseña mala falla', async () => {
  const key = normalizePrivateKey('0x' + '11'.repeat(32));
  const ks = await encryptPrivateKey(key, 'contraseña-larga', { address: '0xabc' });
  assert.equal(ks.cipher, 'aes-256-gcm');
  assert.ok(!JSON.stringify(ks).includes(key.slice(2)), 'la clave no debe aparecer en claro');
  assert.equal(await decryptPrivateKey(ks, 'contraseña-larga'), key);
  await assert.rejects(() => decryptPrivateKey(ks, 'otra-cosa'), /Contraseña incorrecta/);
});

test('normalizePrivateKey rechaza basura', () => {
  assert.throws(() => normalizePrivateKey('0x123'), /64 caracteres/);
  assert.throws(() => normalizePrivateKey('no soy una clave'), /64 caracteres/);
  assert.equal(normalizePrivateKey('AB'.repeat(32)), '0x' + 'ab'.repeat(32));
});

test('el pool ordena por latencia y penaliza el retraso de bloque', async () => {
  const fast = await startFakeRpc({ latencyMs: 1, blockNumber: 1000 });
  const slow = await startFakeRpc({ latencyMs: 60, blockNumber: 1000 });
  const stale = await startFakeRpc({ latencyMs: 1, blockNumber: 990 });

  const pool = new RpcPool([slow.url, stale.url, fast.url], 8888);
  const report = await pool.refresh({ samples: 2 });
  assert.equal(report[0].host, safeHost(fast.url), 'el más rápido y sincronizado va primero');
  assert.ok(report.every((r) => r.healthy));
  // El desincronizado, aunque rápido, cae por detrás del lento pero al día.
  const order = report.map((r) => r.host);
  assert.ok(order.indexOf(safeHost(stale.url)) > order.indexOf(safeHost(slow.url)));

  pool.destroy();
  await Promise.all([fast.close(), slow.close(), stale.close()]);
});

test('un RPC en otra cadena aborta antes de firmar nada', async () => {
  const a = await startFakeRpc({ chainId: 8888 });
  const b = await startFakeRpc({ chainId: 1 });
  const pool = new RpcPool([a.url, b.url], null);
  await pool.refresh({ samples: 1 });
  assert.throws(() => pool.assertChainConsistency(), /no están en la misma cadena/);
  pool.destroy();
  await Promise.all([a.close(), b.close()]);
});

test('un chainId distinto al fijado en el config aborta', async () => {
  const a = await startFakeRpc({ chainId: 4242 });
  const pool = new RpcPool([a.url], 8888);
  await pool.refresh({ samples: 1 });
  assert.throws(() => pool.assertChainConsistency(), /está fijado a 8888/);
  pool.destroy();
  await a.close();
});

test('la difusión manda la MISMA transacción firmada a todos los RPC', async () => {
  const a = await startFakeRpc({});
  const b = await startFakeRpc({});
  const c = await startFakeRpc({ behavior: { rejectSend: 'already known' } });

  const pool = new RpcPool([a.url, b.url, c.url], 8888);
  await pool.refresh({ samples: 1 });

  const wallet = new Wallet('0x' + '11'.repeat(32));
  const signed = await presignBatch({
    wallet,
    chainId: 8888,
    to: '0x' + '22'.repeat(20),
    data: '0xa0712d68' + '01'.padStart(64, '0'),
    value: 0n,
    fees: { maxFeePerGas: parseUnits('1', 'gwei'), maxPriorityFeePerGas: parseUnits('0.01', 'gwei') },
    gasLimit: 200000,
    nonce: 7,
    attempts: 1,
  });

  const result = await pool.broadcastRaw(signed[0].raw);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.benign.length, 1, '"already known" es el eco de nuestra propia tx, no un fallo');
  assert.equal(result.failed.length, 0);
  assert.equal(a.seen[0], b.seen[0], 'los bytes enviados deben ser idénticos por todos los caminos');
  assert.equal(a.seen[0], signed[0].raw);

  pool.destroy();
  await Promise.all([a.close(), b.close(), c.close()]);
});

test('la pre-firma produce nonces consecutivos y hashes distintos', async () => {
  const wallet = new Wallet('0x' + '11'.repeat(32));
  const signed = await presignBatch({
    wallet,
    chainId: 8888,
    to: '0x' + '22'.repeat(20),
    data: '0x1249c58b',
    value: parseEther('0.01'),
    fees: { maxFeePerGas: parseUnits('1', 'gwei'), maxPriorityFeePerGas: parseUnits('0.01', 'gwei') },
    gasLimit: 200000,
    nonce: 5,
    attempts: 3,
  });
  assert.deepEqual(signed.map((s) => s.nonce), [5, 6, 7]);
  assert.equal(new Set(signed.map((s) => s.hash)).size, 3);
  for (const s of signed) {
    const parsed = Transaction.from(s.raw);
    assert.equal(parsed.from, wallet.address);
    assert.equal(parsed.chainId, 8888n);
    assert.equal(parsed.type, 2);
  }
});

test('los topes de gasto se evalúan sobre el peor caso, no sobre una estimación', () => {
  const fees = { maxFeePerGas: parseUnits('1', 'gwei'), maxPriorityFeePerGas: 0n };
  const limits = { maxSpendPerTxEth: '0.01', maxTotalSpendEth: '0.05' };

  // 200000 * 1 gwei = 0.0002 + 0.005 de precio = 0.0052 -> pasa
  const ok = assertWithinSpendLimits({
    limits, gasLimit: 200000, fees, value: parseEther('0.005'), attempts: 1, balance: parseEther('1'),
  });
  assert.ok(ok.perTx > 0n);

  assert.throws(
    () => assertWithinSpendLimits({
      limits, gasLimit: 200000, fees, value: parseEther('0.02'), attempts: 1, balance: parseEther('1'),
    }),
    /por transacción/,
  );

  // Individualmente caben, pero 9 intentos rompen el tope de sesión.
  assert.throws(
    () => assertWithinSpendLimits({
      limits, gasLimit: 200000, fees, value: parseEther('0.005'), attempts: 10, balance: parseEther('1'),
    }),
    /total/,
  );

  assert.throws(
    () => assertWithinSpendLimits({
      limits, gasLimit: 200000, fees, value: parseEther('0.005'), attempts: 1, balance: parseEther('0.001'),
    }),
    /Saldo insuficiente/,
  );
});

test('buildFees respeta el tope y aborta si la baseFee lo supera', async () => {
  const rpc = await startFakeRpc({}); // baseFee = 1 gwei
  const pool = new RpcPool([rpc.url], 8888);
  await pool.refresh({ samples: 1 });

  const fees = await buildFees(pool.primary, { maxFeePerGasGwei: 5, maxPriorityFeePerGasGwei: 0.01 });
  assert.equal(fees.baseFee, parseUnits('1', 'gwei'));
  assert.equal(fees.maxFeePerGas, parseUnits('2.01', 'gwei'), 'colchón de 2x baseFee + propina');

  // Tope por debajo de la baseFee: no se firma nada.
  await assert.rejects(
    () => buildFees(pool.primary, { maxFeePerGasGwei: 0.5, maxPriorityFeePerGasGwei: 0.01 }),
    /supera tu tope/,
  );

  // Tope entre medias: se recorta al tope, no se lo salta.
  const capped = await buildFees(pool.primary, { maxFeePerGasGwei: 1.5, maxPriorityFeePerGasGwei: 0.01 });
  assert.equal(capped.maxFeePerGas, parseUnits('1.5', 'gwei'));
  assert.ok(capped.maxPriorityFeePerGas <= capped.maxFeePerGas);

  pool.destroy();
  await rpc.close();
});

test('el calldata sustituye $WALLET y $QUANTITY', () => {
  const config = {
    mint: {
      mode: 'signature',
      signature: 'function mint(address to, uint256 quantity) payable',
      args: ['$WALLET', '$QUANTITY'],
      quantity: 3,
    },
  };
  const wallet = '0x' + '33'.repeat(20);
  const data = buildCalldata(config, { to: wallet });
  const expected = encodeFromSignature(config.mint.signature, [wallet, 3n]);
  assert.equal(data, expected);
  assert.ok(data.includes('33'.repeat(20)));
  assert.ok(data.endsWith('3'));
});

test('el modo raw exige hexadecimal y el modo auto exige haber resuelto la firma', () => {
  assert.throws(
    () => buildCalldata({ mint: { mode: 'raw', signature: 'no-hex' } }, { to: '0x' + '33'.repeat(20) }),
    /calldata hexadecimal/,
  );
  assert.throws(
    () => buildCalldata({ mint: { mode: 'auto', signature: null } }, { to: '0x' + '33'.repeat(20) }),
    /detect/,
  );
});

test('resolveMintFunction elige la primera firma que no revierte', async () => {
  const rpc = await startFakeRpc({}); // eth_call devuelve 0x -> no revierte
  const pool = new RpcPool([rpc.url], 8888);
  await pool.refresh({ samples: 1 });

  const resolved = await resolveMintFunction(pool.primary, {
    contract: '0x' + '22'.repeat(20),
    wallet: '0x' + '33'.repeat(20),
    quantity: 1,
    valueWei: 0n,
  });
  assert.equal(resolved.signature, 'function mint(uint256 quantity) payable');
  assert.equal(resolved.selector, '0xa0712d68');

  pool.destroy();
  await rpc.close();
});

test('"sale not started" se reconoce como venta cerrada, no como firma equivocada', async () => {
  const rpc = await startFakeRpc({ behavior: { callReverts: true } });
  const pool = new RpcPool([rpc.url], 8888);
  await pool.refresh({ samples: 1 });

  const resolved = await resolveMintFunction(pool.primary, {
    contract: '0x' + '22'.repeat(20),
    wallet: '0x' + '33'.repeat(20),
    quantity: 1,
    valueWei: 0n,
  });
  assert.equal(resolved.signature, null);
  assert.ok(resolved.attempted.length > 0);
  assert.ok(resolved.attempted.some((a) => looksLikeNotStarted(a.reason)));

  pool.destroy();
  await rpc.close();
});

test('safeHost no filtra la clave de API del RPC', () => {
  assert.equal(safeHost('https://rpc.example.com/v2/CLAVE_SECRETA'), 'https://rpc.example.com');
  assert.equal(safeHost('https://rpc.example.com/?key=CLAVE_SECRETA'), 'https://rpc.example.com');
});

test('parseCollectionUrl entiende slugs y URLs de item, y rechaza dominios ajenos', () => {
  assert.deepEqual(parseCollectionUrl('https://opensea.io/collection/mi-coleccion'), {
    type: 'slug', slug: 'mi-coleccion',
  });
  assert.deepEqual(
    parseCollectionUrl(`https://opensea.io/assets/ethereum/0x${'44'.repeat(20)}/1`),
    { type: 'address', address: `0x${'44'.repeat(20)}` },
  );
  assert.equal(parseCollectionUrl('https://opensea.io.phishing.example/collection/x'), null);
  assert.equal(parseCollectionUrl('no es una url'), null);
});

test('la lectura de contraseñas maneja caracteres multibyte', () => {
  // Regresión: decodificar byte a byte partía "contraseña" en dos y producía
  // una contraseña distinta de la escrita.
  const original = 'contraseña-año-€';
  const bytes = [...Buffer.from(original, 'utf8')];
  assert.ok(bytes.length > original.length, 'la cadena de prueba debe ser multibyte');
  assert.equal(Buffer.from(bytes).toString('utf8'), original);

  // Un backspace borra el carácter entero, no medio byte de la ñ.
  const backspaced = [...Buffer.from('contraseñ', 'utf8')];
  popUtf8Char(backspaced);
  assert.equal(Buffer.from(backspaced).toString('utf8'), 'contrase');

  const emoji = [...Buffer.from('gm🚀', 'utf8')];
  popUtf8Char(emoji);
  assert.equal(Buffer.from(emoji).toString('utf8'), 'gm');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${err.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} pruebas pasadas`);
process.exit(failed ? 1 : 0);
