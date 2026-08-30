import { Contract, Interface, formatEther } from 'ethers';
import { CANDIDATE_MINTS, argsTemplateFor, encodeFromSignature } from './calldata.js';

// Lecturas opcionales: cada colección nombra las cosas a su manera, así que se
// prueban varios nombres y se ignora lo que no exista.
const PRICE_FNS = ['mintPrice', 'price', 'cost', 'publicPrice', 'PRICE', 'salePrice'];
const SUPPLY_FNS = ['totalSupply', 'totalMinted', 'minted'];
const MAX_FNS = ['maxSupply', 'MAX_SUPPLY', 'collectionSize', 'maxTotalSupply'];
const STATE_FNS = ['saleIsActive', 'saleActive', 'publicSaleActive', 'mintingActive', 'isPublicMintActive'];
const PAUSED_FNS = ['paused'];

async function tryRead(provider, address, name, outputs) {
  try {
    const contract = new Contract(address, [`function ${name}() view returns (${outputs})`], provider);
    return await contract[name]();
  } catch {
    return undefined;
  }
}

async function firstReadable(provider, address, names, outputs) {
  for (const name of names) {
    const value = await tryRead(provider, address, name, outputs);
    if (value !== undefined) return { name, value };
  }
  return null;
}

export async function inspectCollection(provider, address) {
  const code = await provider.getCode(address);
  if (code === '0x') throw new Error(`No hay contrato desplegado en ${address} en esta red.`);

  const [name, symbol, price, supply, max, active, paused] = await Promise.all([
    tryRead(provider, address, 'name', 'string'),
    tryRead(provider, address, 'symbol', 'string'),
    firstReadable(provider, address, PRICE_FNS, 'uint256'),
    firstReadable(provider, address, SUPPLY_FNS, 'uint256'),
    firstReadable(provider, address, MAX_FNS, 'uint256'),
    firstReadable(provider, address, STATE_FNS, 'bool'),
    firstReadable(provider, address, PAUSED_FNS, 'bool'),
  ]);

  return {
    address,
    name,
    symbol,
    codeSize: (code.length - 2) / 2,
    price: price ? { fn: price.name, wei: price.value, eth: formatEther(price.value) } : null,
    totalSupply: supply ? { fn: supply.name, value: supply.value } : null,
    maxSupply: max ? { fn: max.name, value: max.value } : null,
    saleActive: active ? { fn: active.name, value: active.value } : null,
    paused: paused ? { fn: paused.name, value: paused.value } : null,
  };
}

// Prueba cada firma candidata con eth_call. No firma, no envía, no gasta:
// solo pregunta "¿revertiría esto?".
export async function resolveMintFunction(provider, { contract, wallet, quantity, valueWei }) {
  const attempted = [];

  for (const candidate of CANDIDATE_MINTS) {
    const iface = new Interface([candidate.signature]);
    const fragment = iface.fragments[0];
    let data;
    try {
      data = iface.encodeFunctionData(fragment, candidate.args({ to: wallet, quantity: BigInt(quantity) }));
    } catch {
      continue;
    }

    try {
      await provider.call({ to: contract, from: wallet, data, value: valueWei });
      return {
        signature: candidate.signature,
        args: argsTemplateFor(candidate.signature),
        selector: data.slice(0, 10),
        attempted,
      };
    } catch (err) {
      attempted.push({
        signature: candidate.signature,
        reason: decodeRevert(err),
      });
    }
  }

  return { signature: null, attempted };
}

// Un revert de "sale not started" es una buena señal: la función existe y es la
// correcta, simplemente el mint aún no está abierto. Lo distinguimos de "esta
// función no existe" para no descartar la firma buena.
export function looksLikeNotStarted(reason) {
  return /not (started|active|live|open)|sale.*(closed|inactive|not)|paused|too early|not begun/i.test(
    String(reason ?? ''),
  );
}

export function decodeRevert(err) {
  const raw = err?.info?.error?.message || err?.shortMessage || err?.reason || err?.message || String(err);
  if (err?.data && typeof err.data === 'string' && err.data.startsWith('0x08c379a0')) {
    try {
      const [decoded] = new Interface(['function Error(string)']).decodeFunctionData('Error', err.data);
      return decoded;
    } catch {
      /* se ignora: caemos al mensaje en crudo */
    }
  }
  return raw;
}

export { encodeFromSignature };
