// Disparadores. Todo lo caro (firmar, estimar, resolver la función) ya ha
// ocurrido cuando llegamos aquí; esto solo decide *cuándo* soltar la difusión.
import { decodeRevert } from './detect.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitForTrigger(pool, trigger, { pollIntervalMs = 150, log = () => {} } = {}) {
  switch (trigger.type) {
    case 'now':
      return { firedBy: 'inmediato' };
    case 'timestamp':
      return waitForTimestamp(trigger, log);
    case 'block':
      return waitForBlock(pool, trigger, pollIntervalMs, log);
    case 'state':
      return waitForState(pool, trigger, pollIntervalMs, log);
    default:
      throw new Error(`Tipo de disparador desconocido: ${trigger.type}`);
  }
}

// Dormir hasta ~500ms antes y luego afinar con esperas cortas: `setTimeout` a
// varios minutos puede desviarse decenas de ms, y aquí eso importa.
async function waitForTimestamp(trigger, log) {
  const target = new Date(trigger.at).getTime();
  if (!Number.isFinite(target)) throw new Error(`Fecha de disparo inválida: ${trigger.at}`);

  const coarse = target - Date.now() - 500;
  if (coarse > 0) {
    log(`Esperando hasta ${new Date(target).toISOString()} (${Math.round(coarse / 1000)}s).`);
    await sleep(coarse);
  }
  while (Date.now() < target) await sleep(2);
  return { firedBy: `timestamp ${new Date(target).toISOString()}` };
}

async function waitForBlock(pool, trigger, pollIntervalMs, log) {
  const target = Number(trigger.block);
  let last = -1;
  for (;;) {
    const current = await pool.primary.getBlockNumber();
    if (current !== last) {
      log(`Bloque ${current} (objetivo ${target}).`);
      last = current;
    }
    if (current >= target) return { firedBy: `bloque ${current}` };
    await sleep(pollIntervalMs);
  }
}

// El disparador más fiable para un mint: simular la propia llamada de mint hasta
// que deje de revertir. No depende de que la colección exponga un flag público.
async function waitForState(pool, trigger, pollIntervalMs, log) {
  const { to, data, value, from } = trigger;
  let lastReason = null;
  let polls = 0;

  for (;;) {
    polls += 1;
    try {
      await pool.primary.call({ to, from, data, value });
      return { firedBy: `simulación en verde tras ${polls} sondeos` };
    } catch (err) {
      const reason = decodeRevert(err);
      if (reason !== lastReason) {
        log(`Aún cerrado: ${truncate(reason)}`);
        lastReason = reason;
      }
      await sleep(pollIntervalMs);
    }
  }
}

function truncate(text, max = 120) {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
