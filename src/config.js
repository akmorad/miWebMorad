import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const CONFIG_DIR = process.env.RH_SNIPER_HOME
  ? path.resolve(process.env.RH_SNIPER_HOME)
  : path.resolve(process.cwd(), '.rh-sniper');

export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
export const KEYSTORE_PATH = path.join(CONFIG_DIR, 'keystore.json');

export const DEFAULTS = {
  network: 'testnet',
  chainId: null,
  rpcs: [],
  contract: null,
  collectionUrl: null,
  mint: {
    // Cómo se construye la llamada. 'auto' inspecciona el contrato; 'signature'
    // usa la firma que indiques; 'raw' usa calldata que pegues tal cual.
    mode: 'auto',
    signature: null,
    args: [],
    quantity: 1,
    valuePerNftWei: null,
  },
  limits: {
    // Topes duros. El bot aborta antes de firmar si los superaría.
    maxFeePerGasGwei: 0.5,
    maxPriorityFeePerGasGwei: 0.01,
    gasLimit: 250000,
    maxSpendPerTxEth: '0.01',
    maxTotalSpendEth: '0.05',
  },
  strategy: {
    // Intentos secuenciales por nonce. 1 = una sola transacción.
    attempts: 1,
    // Difusión: se envía la MISMA transacción firmada a todos los RPC a la vez.
    broadcastToAllRpcs: true,
    trigger: { type: 'now' },
    pollIntervalMs: 150,
  },
  dryRun: true,
};

export async function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  return mergeDeep(structuredClone(DEFAULTS), raw);
}

export async function saveConfig(config) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function mergeDeep(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? base : patch;
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) ? mergeDeep(out[key], value) : value;
  }
  return out;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
