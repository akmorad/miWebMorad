// Resolver "URL de colección de OpenSea" -> dirección de contrato.
//
// Esta es la ÚNICA petición de red del bot que no va a un RPC tuyo, y es
// opcional: requiere que tú pongas OPENSEA_API_KEY. Sin clave, el asistente te
// pide la dirección del contrato directamente y aquí no se llama a nada.
// No se envía tu clave privada, ni tu dirección, ni tu config: solo el slug de
// la colección que tú has pegado.
const API = 'https://api.opensea.io/api/v2';

export function parseCollectionUrl(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)opensea\.io$/.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);

    // /collection/<slug>
    const idx = parts.indexOf('collection');
    if (idx !== -1 && parts[idx + 1]) return { type: 'slug', slug: parts[idx + 1] };

    // /assets/<chain>/<address>/<tokenId> o /item/<chain>/<address>/<tokenId>
    const assetIdx = parts.findIndex((p) => p === 'assets' || p === 'item');
    if (assetIdx !== -1 && /^0x[0-9a-fA-F]{40}$/.test(parts[assetIdx + 2] ?? '')) {
      return { type: 'address', address: parts[assetIdx + 2] };
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveContractFromOpenSea(url, { apiKey = process.env.OPENSEA_API_KEY } = {}) {
  const parsed = parseCollectionUrl(url);
  if (!parsed) throw new Error('No reconozco esa URL de OpenSea. Pega la dirección del contrato a mano.');
  if (parsed.type === 'address') return { address: parsed.address, source: 'url' };
  if (!apiKey) {
    throw new Error(
      'Esa URL es un slug de colección y hace falta OPENSEA_API_KEY para traducirlo a contrato. ' +
        'Sin clave, pega la dirección del contrato directamente.',
    );
  }

  const res = await fetch(`${API}/collections/${encodeURIComponent(parsed.slug)}`, {
    headers: { accept: 'application/json', 'x-api-key': apiKey },
  });
  if (!res.ok) throw new Error(`OpenSea respondió ${res.status}. Pega la dirección del contrato a mano.`);

  const body = await res.json();
  const contracts = body?.contracts ?? [];
  if (contracts.length === 0) throw new Error('OpenSea no devolvió ningún contrato para esa colección.');
  return { address: contracts[0].address, chain: contracts[0].chain, source: 'opensea', slug: parsed.slug };
}
