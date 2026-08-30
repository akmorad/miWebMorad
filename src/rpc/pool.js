// Pool multi-RPC.
//
// La idea central del bot: en una cadena con secuenciador FCFS (primero en
// llegar, primero servido) no ganas pagando más gas — ganas llegando antes al
// secuenciador. Lo que se puede optimizar es la latencia del salto de red y la
// probabilidad de que ese salto no se pierda. De ahí dos mecanismos:
//
//   1. Se mide cada RPC (latencia mediana + retraso de bloque) y se ordenan.
//   2. La transacción ya firmada se difunde a TODOS los RPC en paralelo. Es el
//      mismo tx hash por todos los caminos, así que no hay riesgo de doble
//      mint: el primero que entre gana, los demás devuelven "already known".
import { JsonRpcProvider, Network } from 'ethers';

export class RpcEndpoint {
  constructor(url, chainId) {
    this.url = url;
    this.host = safeHost(url);
    this.provider = new JsonRpcProvider(
      url,
      chainId ? Network.from(Number(chainId)) : undefined,
      // staticNetwork evita un eth_chainId antes de cada llamada; batchMaxCount:1
      // evita que ethers agrupe peticiones y añada latencia en la ruta crítica.
      { staticNetwork: Boolean(chainId), batchMaxCount: 1, polling: false },
    );
    this.latencyMs = Number.POSITIVE_INFINITY;
    this.blockNumber = 0;
    this.chainId = chainId ? Number(chainId) : null;
    this.healthy = false;
    this.error = null;
  }

  async probe({ samples = 3, timeoutMs = 4000 } = {}) {
    const latencies = [];
    try {
      // Se pregunta eth_chainId POR EL CABLE a propósito. Con staticNetwork,
      // provider.getNetwork() devuelve el chainId que le dimos nosotros, no el
      // que responde el RPC: usarlo aquí haría que la comprobación de cadena se
      // validara contra sí misma y nunca detectase un RPC de otra red.
      const raw = await withTimeout(this.provider.send('eth_chainId', []), timeoutMs);
      this.chainId = Number(BigInt(raw));
      for (let i = 0; i < samples; i += 1) {
        const started = performance.now();
        this.blockNumber = await withTimeout(this.provider.getBlockNumber(), timeoutMs);
        latencies.push(performance.now() - started);
      }
      this.latencyMs = median(latencies);
      this.healthy = true;
      this.error = null;
    } catch (err) {
      this.healthy = false;
      this.latencyMs = Number.POSITIVE_INFINITY;
      this.error = err.shortMessage || err.message;
    }
    return this;
  }

  // Penaliza quedarse atrás: un RPC rapidísimo pero desincronizado te da un
  // nonce viejo y te tira la transacción.
  score(bestBlock) {
    if (!this.healthy) return Number.POSITIVE_INFINITY;
    const lag = Math.max(0, bestBlock - this.blockNumber);
    return this.latencyMs + lag * 250;
  }

  destroy() {
    this.provider.destroy();
  }
}

export class RpcPool {
  constructor(urls, chainId) {
    const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
    if (unique.length === 0) throw new Error('No hay ningún RPC configurado.');
    this.endpoints = unique.map((url) => new RpcEndpoint(url, chainId));
    this.expectedChainId = chainId ? Number(chainId) : null;
  }

  async refresh(opts) {
    await Promise.all(this.endpoints.map((ep) => ep.probe(opts)));
    const bestBlock = Math.max(0, ...this.endpoints.filter((e) => e.healthy).map((e) => e.blockNumber));
    this.endpoints.sort((a, b) => a.score(bestBlock) - b.score(bestBlock));
    return this.report(bestBlock);
  }

  report(bestBlock = Math.max(0, ...this.endpoints.map((e) => e.blockNumber))) {
    return this.endpoints.map((ep) => ({
      host: ep.host,
      healthy: ep.healthy,
      latencyMs: Number.isFinite(ep.latencyMs) ? Math.round(ep.latencyMs) : null,
      blockNumber: ep.blockNumber,
      lag: ep.healthy ? Math.max(0, bestBlock - ep.blockNumber) : null,
      chainId: ep.chainId,
      error: ep.error,
    }));
  }

  get healthy() {
    return this.endpoints.filter((ep) => ep.healthy);
  }

  // El RPC más rápido y sincronizado. Se usa para lecturas normales.
  get primary() {
    const ep = this.healthy[0] ?? this.endpoints[0];
    return ep.provider;
  }

  // Rechaza mezclar cadenas: si un RPC responde con otro chainId, fuera.
  assertChainConsistency() {
    const seen = new Set(this.healthy.map((ep) => ep.chainId));
    if (seen.size === 0) throw new Error('Ningún RPC respondió. Revisa tus enlaces y tu conexión.');
    if (seen.size > 1) {
      throw new Error(`Tus RPC no están en la misma cadena (chainIds: ${[...seen].join(', ')}). Abortando.`);
    }
    const [only] = seen;
    if (this.expectedChainId && only !== this.expectedChainId) {
      throw new Error(
        `El RPC responde chainId ${only}, pero el config está fijado a ${this.expectedChainId}. ` +
          'Si cambiaste de red a propósito, vuelve a ejecutar `setup`.',
      );
    }
    return only;
  }

  // La ruta crítica. Misma transacción firmada, todos los caminos, en paralelo.
  async broadcastRaw(signedTx) {
    const started = performance.now();
    const attempts = this.healthy.map(async (ep) => {
      const sent = performance.now();
      try {
        const hash = await ep.provider.send('eth_sendRawTransaction', [signedTx]);
        return { ok: true, host: ep.host, hash, ms: performance.now() - sent };
      } catch (err) {
        return { ok: false, host: ep.host, error: normalizeRpcError(err), ms: performance.now() - sent };
      }
    });

    const results = await Promise.all(attempts);
    const accepted = results.filter((r) => r.ok);
    // "already known" / "nonce too low" tras una aceptación no es un fallo: es
    // el eco de nuestra propia transacción llegando por otro camino.
    const benign = results.filter(
      (r) => !r.ok && /already known|known transaction|nonce too low|replacement/i.test(r.error),
    );
    return {
      accepted,
      benign,
      failed: results.filter((r) => !r.ok && !benign.includes(r)),
      all: results,
      totalMs: performance.now() - started,
    };
  }

  destroy() {
    for (const ep of this.endpoints) ep.destroy();
  }
}

function normalizeRpcError(err) {
  // ethers deja el error original del nodo en distintos sitios segun lo
  // reconozca o no: los que no encajan en sus categorias llegan envueltos en
  // "could not coalesce error" con el de verdad colgando de err.error.
  return String(
    err?.info?.error?.message ||
      err?.error?.message ||
      err?.shortMessage ||
      err?.message ||
      err,
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout tras ${ms}ms`)), ms).unref?.()),
  ]);
}

// Nunca imprimimos la URL completa: las claves de API de los RPC de pago van en
// el path o en el query string.
export function safeHost(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '<rpc inválido>';
  }
}
