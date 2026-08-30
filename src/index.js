#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { formatEther } from 'ethers';

import { banner, section, askSecret, c } from './ui.js';
import { loadConfig, KEYSTORE_PATH, CONFIG_PATH } from './config.js';
import { loadKeystore, decryptPrivateKey } from './keystore.js';
import { RpcPool, safeHost } from './rpc/pool.js';
import { buildFees, describeFees } from './fees.js';
import { buildCalldata } from './mint/calldata.js';
import { inspectCollection } from './mint/detect.js';
import { waitForTrigger } from './mint/watcher.js';
import { presignBatch, assertWithinSpendLimits, walletFromPrivateKey, confirmMint } from './mint/sender.js';
import { runSetup, printRpcTable } from './wizard.js';

const USAGE = `
${c.bold('rh-sniper')} — sniper de mints NFT para Robinhood Chain

  ${c.green('setup')}    Asistente interactivo: red, RPC, billetera cifrada, colección, topes
  ${c.green('doctor')}   Mide tus RPC y verifica config, saldo y estado de la colección
  ${c.green('snipe')}    Ejecuta el sniper (respeta dryRun del config)
  ${c.green('snipe --live')}      Fuerza envío real en esta ejecución
  ${c.green('snipe --dry-run')}   Fuerza simulación en esta ejecución

Config:   ${CONFIG_PATH}
Keystore: ${KEYSTORE_PATH}
`;

async function main() {
  const [command = 'setup', ...flags] = process.argv.slice(2);

  switch (command) {
    case 'setup':
      await runSetup();
      return;
    case 'doctor':
      await runDoctor();
      return;
    case 'snipe':
      await runSnipe(flags);
      return;
    case '-h':
    case '--help':
    case 'help':
      console.log(USAGE);
      return;
    default:
      console.log(USAGE);
      process.exitCode = 1;
  }
}

async function requireConfig() {
  const config = await loadConfig();
  if (!config.contract || config.rpcs.length === 0) {
    throw new Error('Config incompleto. Ejecuta primero: npm run setup');
  }
  if (!existsSync(KEYSTORE_PATH)) {
    throw new Error('No hay billetera cifrada. Ejecuta primero: npm run setup');
  }
  return config;
}

async function runDoctor() {
  const config = await requireConfig();
  banner('Diagnóstico', [`Red ${config.network} (chainId ${config.chainId})`, `Contrato ${config.contract}`]);

  const pool = new RpcPool(config.rpcs, config.chainId);
  try {
    printRpcTable(await pool.refresh());
    pool.assertChainConsistency();
    console.log(`${c.green('✓')} Todos los RPC coinciden en chainId ${config.chainId}.`);

    const keystore = await loadKeystore(KEYSTORE_PATH);
    const balance = await pool.primary.getBalance(keystore.address);
    console.log(`${c.green('✓')} Billetera ${keystore.address} — saldo ${formatEther(balance)}`);

    const info = await inspectCollection(pool.primary, config.contract);
    console.log(`${c.green('✓')} Colección ${info.name ?? '(sin nombre)'} en ${info.address}`);
    if (info.totalSupply && info.maxSupply) {
      console.log(`  acuñados ${info.totalSupply.value} / ${info.maxSupply.value}`);
    }
    if (info.saleActive) {
      console.log(`  venta ${info.saleActive.value ? c.green('abierta') : c.yellow('cerrada')}`);
    }

    const fees = await buildFees(pool.primary, config.limits);
    const d = describeFees(fees);
    console.log(`${c.green('✓')} Comisiones: base ${d.baseFeeGwei} / max ${d.maxFeeGwei} / propina ${d.priorityGwei} gwei`);
  } finally {
    pool.destroy();
  }
}

async function runSnipe(flags) {
  const config = await requireConfig();
  if (flags.includes('--live')) config.dryRun = false;
  if (flags.includes('--dry-run')) config.dryRun = true;

  banner(config.dryRun ? 'Sniper — SIMULACIÓN' : 'Sniper — EN VIVO', [
    `Red ${config.network} (chainId ${config.chainId}) · ${config.rpcs.length} RPC`,
    `Contrato ${config.contract} · cantidad ${config.mint.quantity}`,
    config.dryRun
      ? 'Se firmará todo pero NO se enviará nada. Añade --live cuando estés listo.'
      : 'Se enviarán transacciones reales y se gastarán fondos reales.',
  ]);

  const keystore = await loadKeystore(KEYSTORE_PATH);
  const password = await askSecret(`Contraseña para desbloquear ${keystore.address}`);
  const privateKey = await decryptPrivateKey(keystore, password);
  const wallet = walletFromPrivateKey(privateKey);

  const pool = new RpcPool(config.rpcs, config.chainId);
  try {
    section(1, 'Preparando (todo el trabajo caro ocurre AQUÍ, antes del disparo)');
    printRpcTable(await pool.refresh());
    pool.assertChainConsistency();

    const value = BigInt(config.mint.valuePerNftWei ?? 0) * BigInt(config.mint.quantity);
    const data = buildCalldata(config, { to: wallet.address });
    const fees = await buildFees(pool.primary, config.limits);
    const balance = await pool.primary.getBalance(wallet.address);
    const attempts = config.strategy.attempts;

    const spend = assertWithinSpendLimits({
      limits: config.limits,
      gasLimit: config.limits.gasLimit,
      fees,
      value,
      attempts,
      balance,
    });

    const nonce = await pool.primary.getTransactionCount(wallet.address, 'pending');
    const d = describeFees(fees);
    console.log(`  calldata   ${data.slice(0, 10)}… ${c.dim(`(${(data.length - 2) / 2} bytes)`)}`);
    console.log(`  valor      ${formatEther(value)}`);
    console.log(`  gas        ${config.limits.gasLimit} @ max ${d.maxFeeGwei} gwei (base ${d.baseFeeGwei})`);
    console.log(`  peor caso  ${formatEther(spend.total)} en ${attempts} intento(s)`);
    console.log(`  nonce      ${nonce}`);

    const signed = await presignBatch({
      wallet,
      chainId: config.chainId,
      to: config.contract,
      data,
      value,
      fees,
      gasLimit: config.limits.gasLimit,
      nonce,
      attempts,
    });
    // La clave en claro ya no hace falta: a partir de aquí solo manejamos bytes
    // firmados.
    scrub();
    console.log(`  ${c.green('✓')} ${signed.length} transacción(es) pre-firmada(s). Ruta crítica lista.\n`);

    section(2, 'Esperando el disparo');
    const trigger =
      config.strategy.trigger.type === 'state'
        ? { type: 'state', to: config.contract, from: wallet.address, data, value }
        : config.strategy.trigger;

    const fired = await waitForTrigger(pool, trigger, {
      pollIntervalMs: config.strategy.pollIntervalMs,
      log: (msg) => console.log(`  ${c.dim(msg)}`),
    });
    console.log(`  ${c.green('✓')} Disparo: ${fired.firedBy}\n`);

    section(3, config.dryRun ? 'Simulación (no se envía nada)' : 'Difusión');
    if (config.dryRun) {
      for (const tx of signed) {
        console.log(`  ${c.dim('[simulado]')} nonce ${tx.nonce} → hash ${tx.hash}`);
      }
      console.log(`\n  ${c.yellow('Nada enviado.')} Vuelve a ejecutar con ${c.bold('npm run snipe -- --live')}.`);
      return;
    }

    const result = await pool.broadcastRaw(signed[0].raw);
    for (const r of result.all) {
      const mark = r.ok ? c.green('✓') : /already known|nonce too low/i.test(r.error) ? c.dim('=') : c.red('✗');
      console.log(`  ${mark} ${r.host.padEnd(40)} ${String(Math.round(r.ms)).padStart(5)} ms ${r.ok ? r.hash : c.dim(r.error)}`);
    }
    console.log(`\n  difusión completa en ${Math.round(result.totalMs)} ms`);

    if (result.accepted.length === 0 && result.benign.length === 0) {
      console.log(`  ${c.red('✗')} Ningún RPC aceptó la transacción.`);
      process.exitCode = 1;
      return;
    }

    const hash = result.accepted[0]?.hash ?? signed[0].hash;
    console.log(`  ${c.green('✓')} Aceptada por ${result.accepted.length} RPC → ${c.bold(hash)}\n`);

    section(4, 'Confirmación');
    const receipt = await confirmMint(pool.primary, hash);
    if (receipt.status === 'confirmada') {
      console.log(`  ${c.green('✓')} Minteado en el bloque ${receipt.blockNumber} (gas ${receipt.gasUsed})`);
    } else if (receipt.status === 'revertida') {
      console.log(`  ${c.red('✗')} La transacción entró pero revirtió (bloque ${receipt.blockNumber}).`);
      process.exitCode = 1;
    } else if (receipt.status === 'desconocida') {
      console.log(
        `  ${c.yellow('~')} La transacción se envió, pero el RPC no devolvió un recibo legible ` +
          `(${receipt.error}).\n      Compruébala tú: ${hash}`,
      );
    } else {
      console.log(`  ${c.yellow('~')} Sigue pendiente. Consulta ${hash} en el explorador.`);
    }
  } finally {
    pool.destroy();
  }
}

// El string ya es inmutable en JS; lo que sí podemos es soltar la referencia y
// pedir al GC que la recoja cuanto antes.
function scrub() {
  if (globalThis.gc) globalThis.gc();
}

main().catch((err) => {
  console.error(`\n${c.red('Error:')} ${err.message}\n`);
  process.exitCode = 1;
});
