import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { getAddress, formatEther, parseEther } from 'ethers';

import { banner, section, ask, askSecret, choose, confirm, c } from './ui.js';
import { CONFIG_DIR, KEYSTORE_PATH, loadConfig, saveConfig } from './config.js';
import { NETWORKS, networkFromId, defaultRpcsFor } from './chains.js';
import { encryptPrivateKey, normalizePrivateKey, saveKeystore, secretsMatch } from './keystore.js';
import { RpcPool, safeHost } from './rpc/pool.js';
import { parseCollectionUrl, resolveContractFromOpenSea } from './opensea.js';
import { inspectCollection, resolveMintFunction, looksLikeNotStarted } from './mint/detect.js';
import { encodeFromSignature } from './mint/calldata.js';

export async function runSetup() {
  banner('Robinhood Chain NFT Sniper - Inicio rápido', [
    'Elige números, pega solo los valores que se te piden y pulsa Y para empezar.',
    'Tu clave privada se oculta al escribirla, se cifra en local y nunca se transmite.',
  ]);

  const config = await loadConfig();
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });

  await stepNetwork(config);
  const pool = await stepRpcs(config);

  try {
    const chainId = pool.assertChainConsistency();
    config.chainId = chainId;
    console.log(`${c.green('✓')} chainId detectado y fijado: ${c.bold(chainId)}\n`);

    const address = await stepWallet(config, pool);
    await stepCollection(config, pool);
    await stepMintDetails(config, pool, address);
    await stepLimits(config);
    await stepTrigger(config);

    config.dryRun = !(await confirm(
      `${c.yellow('¿Enviar transacciones reales?')} Responde "n" para quedarte en simulación`,
    ));
    console.log('');

    await saveConfig(config);
    printSummary(config, address);
    return config;
  } finally {
    pool.destroy();
  }
}

async function stepNetwork(config) {
  config.network = await choose({ n: 1, text: 'Elige la red' }, [
    { label: NETWORKS.testnet.label, value: 'testnet' },
    { label: NETWORKS.mainnet.label, value: 'mainnet' },
  ]);
  if (config.network === 'mainnet') {
    console.log(
      `${c.yellow('!')} Mainnet mueve fondos reales. Usa una billetera nueva y dedicada, y no dejes en ella más de lo que puedas perder.\n`,
    );
  }
}

async function stepRpcs(config) {
  const network = networkFromId(config.network);
  const mode = await choose({ n: 2, text: 'Elige la configuración de RPC' }, [
    { label: 'Usar el RPC público de Robinhood (fácil; puede tener límite de peticiones)', value: 'public' },
    { label: 'Usar un RPC HTTPS propio (recomendado por velocidad)', value: 'single' },
    { label: 'Usar un RPC propio más RPC de respaldo (máxima fiabilidad)', value: 'multi' },
  ]);

  let rpcs = [];
  if (mode === 'public') {
    rpcs = defaultRpcsFor(network);
    if (rpcs.length === 0) {
      console.log(
        `${c.yellow('!')} No hay ningún RPC público configurado para ${network.id}. Este bot no trae ` +
          `endpoints "quemados" en el código a propósito: un chainId o una URL inventados te harían firmar\n` +
          `  contra la cadena equivocada. Define ${c.bold(network.envRpc)} o pega tu enlace ahora.\n`,
      );
      rpcs = [await askRpc('Pega tu enlace HTTPS de Robinhood Chain')];
    }
  } else {
    rpcs = [await askRpc('Pega tu enlace HTTPS de Robinhood Chain')];
    if (mode === 'multi') {
      console.log(c.dim('  Añade respaldos uno a uno. Deja la línea vacía para terminar.'));
      for (;;) {
        const extra = await ask('RPC de respaldo (vacío = terminar)');
        if (!extra) break;
        try {
          rpcs.push(validateRpc(extra));
        } catch (err) {
          console.log(`  ${c.red('✗')} ${err.message}`);
        }
      }
    }
  }

  config.rpcs = [...new Set(rpcs)];
  console.log('');
  console.log(c.dim(`  Midiendo ${config.rpcs.length} RPC…`));

  const pool = new RpcPool(config.rpcs, config.chainId);
  const report = await pool.refresh();
  printRpcTable(report);
  return pool;
}

async function askRpc(prompt) {
  for (;;) {
    const raw = await ask(prompt);
    try {
      return validateRpc(raw);
    } catch (err) {
      console.log(`  ${c.red('✗')} ${err.message}`);
    }
  }
}

function validateRpc(raw) {
  const value = String(raw).trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Eso no es una URL válida.');
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    // Un RPC en texto plano deja ver tus transacciones firmadas y tu dirección a
    // cualquiera en el camino, y permite reescribir las respuestas.
    throw new Error('Usa https:// (se permite http solo contra localhost).');
  }
  return url.toString();
}

export function printRpcTable(report) {
  console.log('');
  for (const [i, row] of report.entries()) {
    const rank = c.dim(`${String(i + 1).padStart(2)}.`);
    if (!row.healthy) {
      console.log(`  ${rank} ${c.red('✗')} ${row.host} ${c.dim(`— ${row.error}`)}`);
      continue;
    }
    const flag = row.lag === 0 ? c.green('✓') : c.yellow('~');
    const lag = row.lag === 0 ? '' : c.dim(` (${row.lag} bloques por detrás)`);
    console.log(
      `  ${rank} ${flag} ${row.host.padEnd(40)} ${String(row.latencyMs).padStart(5)} ms  ` +
        `bloque ${row.blockNumber}${lag}`,
    );
  }
  console.log('');
}

async function stepWallet(config, pool) {
  section(3, 'Billetera');
  if (existsSync(KEYSTORE_PATH)) {
    const reuse = await confirm('Ya existe una billetera cifrada. ¿Reutilizarla?');
    if (reuse) {
      const { loadKeystore } = await import('./keystore.js');
      const ks = await loadKeystore(KEYSTORE_PATH);
      console.log(`  ${c.green('✓')} Usando ${ks.address}\n`);
      await reportBalance(pool, ks.address);
      return ks.address;
    }
  }

  console.log(
    c.dim('  Crea una billetera nueva solo para esto. No guardes en ella más de lo que vayas a gastar.'),
  );

  const { Wallet } = await import('ethers');
  let wallet;
  for (;;) {
    const raw = await askSecret('Pega la clave privada de la billetera (no se mostrará)');
    try {
      wallet = new Wallet(normalizePrivateKey(raw));
      break;
    } catch (err) {
      console.log(`  ${c.red('✗')} ${err.message}`);
    }
  }

  let password;
  for (;;) {
    password = await askSecret('Elige una contraseña para cifrar la clave');
    if (password.length < 8) {
      console.log(`  ${c.red('✗')} Mínimo 8 caracteres.`);
      continue;
    }
    const again = await askSecret('Repite la contraseña');
    if (!secretsMatch(password, again)) {
      console.log(`  ${c.red('✗')} No coinciden.`);
      continue;
    }
    break;
  }

  const keystore = await encryptPrivateKey(wallet.privateKey, password, { address: wallet.address });
  await saveKeystore(KEYSTORE_PATH, keystore);
  console.log(`  ${c.green('✓')} Cifrada con AES-256-GCM en ${KEYSTORE_PATH} (permisos 600)`);
  console.log(`  ${c.green('✓')} Dirección: ${c.bold(wallet.address)}\n`);

  await reportBalance(pool, wallet.address);
  return wallet.address;
}

async function reportBalance(pool, address) {
  try {
    const balance = await pool.primary.getBalance(address);
    const line = `  Saldo: ${c.bold(formatEther(balance))}`;
    console.log(balance === 0n ? `${line} ${c.yellow('— sin fondos para el gas')}` : line);
  } catch {
    console.log(c.dim('  No se pudo leer el saldo desde el RPC.'));
  }
  console.log('');
}

async function stepCollection(config, pool) {
  section(4, 'Colección');
  for (;;) {
    const raw = await ask('Pega la URL de OpenSea o la dirección del contrato', {
      default: config.contract ?? '',
    });
    try {
      if (/^0x[0-9a-fA-F]{40}$/.test(raw.trim())) {
        config.contract = getAddress(raw.trim());
        config.collectionUrl = null;
      } else {
        const parsed = parseCollectionUrl(raw);
        if (!parsed) throw new Error('No reconozco eso como URL de OpenSea ni como dirección 0x…');
        const resolved = await resolveContractFromOpenSea(raw);
        config.contract = getAddress(resolved.address);
        config.collectionUrl = raw;
        console.log(`  ${c.dim(`resuelto vía ${resolved.source}`)}`);
      }

      const info = await inspectCollection(pool.primary, config.contract);
      printCollection(info);
      config.mint.valuePerNftWei = info.price ? info.price.wei.toString() : config.mint.valuePerNftWei;
      return info;
    } catch (err) {
      console.log(`  ${c.red('✗')} ${err.message}`);
    }
  }
}

function printCollection(info) {
  console.log(`  ${c.green('✓')} ${c.bold(info.name ?? '(sin nombre)')} ${info.symbol ? c.dim(`(${info.symbol})`) : ''}`);
  console.log(`    contrato   ${info.address}`);
  if (info.price) console.log(`    precio     ${info.price.eth} ${c.dim(`vía ${info.price.fn}()`)}`);
  else console.log(`    precio     ${c.dim('no expuesto — lo confirmarás a mano')}`);
  if (info.totalSupply && info.maxSupply) {
    console.log(`    acuñados   ${info.totalSupply.value} / ${info.maxSupply.value}`);
  }
  if (info.saleActive) {
    const on = Boolean(info.saleActive.value);
    console.log(`    venta      ${on ? c.green('abierta') : c.yellow('aún cerrada')} ${c.dim(`(${info.saleActive.fn}())`)}`);
  }
  if (info.paused?.value) console.log(`    ${c.yellow('el contrato está en pausa')}`);
  console.log('');
}

async function stepMintDetails(config, pool, walletAddress) {
  section(5, 'Detalles del mint');
  config.mint.quantity = Math.max(1, Number.parseInt(await ask('Cantidad a acuñar', { default: '1' }), 10) || 1);

  const suggested = config.mint.valuePerNftWei ? formatEther(config.mint.valuePerNftWei) : '0';
  const priceEth = await ask('Precio por NFT (en la moneda nativa)', { default: suggested });
  config.mint.valuePerNftWei = parseEther(String(priceEth || '0')).toString();

  const valueWei = BigInt(config.mint.valuePerNftWei) * BigInt(config.mint.quantity);
  console.log(c.dim('  Buscando la función de mint (simulación con eth_call, no gasta nada)…'));

  const resolved = await resolveMintFunction(pool.primary, {
    contract: config.contract,
    wallet: walletAddress,
    quantity: config.mint.quantity,
    valueWei,
  });

  if (resolved.signature) {
    config.mint.mode = 'auto';
    config.mint.signature = resolved.signature;
    config.mint.args = resolved.args;
    console.log(`  ${c.green('✓')} ${resolved.signature} ${c.dim(resolved.selector)}\n`);
    return;
  }

  // Ninguna simuló en verde. Si alguna revirtió con "sale not started", esa es
  // casi seguro la función correcta y el mint simplemente no ha abierto.
  const notStarted = resolved.attempted.filter((a) => looksLikeNotStarted(a.reason));
  if (notStarted.length > 0) {
    console.log(`  ${c.yellow('~')} La venta todavía no ha abierto, pero la función encaja:`);
    for (const a of notStarted) console.log(`      ${a.signature} ${c.dim(`— "${a.reason}"`)}`);
    const pick = notStarted[0];
    const { argsTemplateFor } = await import('./mint/calldata.js');
    config.mint.mode = 'auto';
    config.mint.signature = pick.signature;
    config.mint.args = argsTemplateFor(pick.signature);
    console.log(`  ${c.green('✓')} Usaremos ${pick.signature}\n`);
    return;
  }

  console.log(`  ${c.yellow('!')} No he podido deducir la función de mint. Motivos de cada intento:`);
  for (const a of resolved.attempted) console.log(`      ${a.signature.padEnd(52)} ${c.dim(a.reason)}`);
  console.log('');
  console.log(c.dim('  Cópiala del explorador de bloques o de la web de la colección.'));

  for (;;) {
    const sig = await ask('Firma de la función, p. ej. "function mint(uint256 quantity) payable"');
    try {
      const { argsTemplateFor } = await import('./mint/calldata.js');
      const args = argsTemplateFor(sig.startsWith('function') ? sig : `function ${sig}`);
      encodeFromSignature(sig, args.map((a) => (a === '$WALLET' ? walletAddress : BigInt(config.mint.quantity))));
      config.mint.mode = 'signature';
      config.mint.signature = sig.startsWith('function') ? sig : `function ${sig}`;
      config.mint.args = args;
      console.log(`  ${c.green('✓')} Guardada.\n`);
      return;
    } catch (err) {
      console.log(`  ${c.red('✗')} ${err.message}`);
    }
  }
}

async function stepLimits(config) {
  section(6, 'Topes de gasto y comisiones');
  console.log(
    c.dim(
      '  En una cadena FCFS (primero en llegar, primero servido) pagar más gas NO te adelanta en la cola.\n' +
        '  Estos valores son topes de seguridad, no una puja. El bot aborta antes de firmar si los supera.',
    ),
  );
  const l = config.limits;
  l.maxFeePerGasGwei = Number(await ask('maxFeePerGas (gwei)', { default: String(l.maxFeePerGasGwei) }));
  l.maxPriorityFeePerGasGwei = Number(
    await ask('maxPriorityFeePerGas (gwei)', { default: String(l.maxPriorityFeePerGasGwei) }),
  );
  l.gasLimit = Number(await ask('Límite de gas', { default: String(l.gasLimit) }));
  l.maxSpendPerTxEth = await ask('Gasto máximo por transacción', { default: String(l.maxSpendPerTxEth) });
  l.maxTotalSpendEth = await ask('Gasto máximo total de la sesión', { default: String(l.maxTotalSpendEth) });
  config.strategy.attempts = Math.max(
    1,
    Number.parseInt(await ask('Intentos (nonces consecutivos)', { default: String(config.strategy.attempts) }), 10) || 1,
  );
  console.log('');
}

async function stepTrigger(config) {
  const type = await choose({ n: 7, text: 'Cuándo disparar' }, [
    { label: 'Cuando la venta abra (simula el mint hasta que deje de revertir) — recomendado', value: 'state' },
    { label: 'Ahora mismo', value: 'now' },
    { label: 'A una hora exacta (ISO 8601)', value: 'timestamp' },
    { label: 'A partir de un número de bloque', value: 'block' },
  ]);

  if (type === 'timestamp') {
    const at = await ask('Hora de apertura, p. ej. 2026-09-01T15:00:00Z');
    config.strategy.trigger = { type, at };
  } else if (type === 'block') {
    const block = await ask('Número de bloque');
    config.strategy.trigger = { type, block: Number(block) };
  } else {
    config.strategy.trigger = { type };
  }

  if (type === 'state' || type === 'block') {
    config.strategy.pollIntervalMs = Math.max(
      50,
      Number.parseInt(
        await ask('Intervalo de sondeo (ms)', { default: String(config.strategy.pollIntervalMs) }),
        10,
      ) || 150,
    );
  }
  console.log('');
}

function printSummary(config, address) {
  const t = config.strategy.trigger;
  banner('Listo', [
    `Red        ${config.network} (chainId ${config.chainId})`,
    `RPC        ${config.rpcs.map(safeHost).join(', ')}`,
    `Billetera  ${address}`,
    `Contrato   ${config.contract}`,
    `Mint       ${config.mint.signature} x${config.mint.quantity} @ ${formatEther(config.mint.valuePerNftWei ?? 0)} cada uno`,
    `Disparo    ${t.type}${t.at ? ` @ ${t.at}` : ''}${t.block ? ` @ bloque ${t.block}` : ''}`,
    `Modo       ${config.dryRun ? 'SIMULACIÓN (no envía nada)' : 'REAL (envía transacciones)'}`,
    '',
    'Arranca con:  npm run snipe',
  ]);
}
