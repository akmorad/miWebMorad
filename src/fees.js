import { parseUnits, formatUnits } from 'ethers';

// Estrategia de comisiones.
//
// En un rollup con secuenciador FCFS, subir la propina NO te adelanta en la
// cola: el orden ya está decidido por el momento de llegada. La propina solo
// sirve para no quedarte por debajo del mínimo que el secuenciador acepta. Por
// eso aquí el objetivo es "suficiente y con tope", no "lo más alto posible".
export async function buildFees(provider, limits) {
  const maxFeeCap = parseUnits(String(limits.maxFeePerGasGwei), 'gwei');
  const priorityCap = parseUnits(String(limits.maxPriorityFeePerGasGwei), 'gwei');

  const block = await provider.getBlock('latest');
  const baseFee = block?.baseFeePerGas ?? 0n;

  // Colchón de 2x sobre la base actual: cubre varias subidas de baseFee
  // seguidas sin volver a firmar (la pre-firma es lo que nos da la velocidad).
  const wanted = baseFee * 2n + priorityCap;
  const maxFeePerGas = wanted > maxFeeCap ? maxFeeCap : wanted;

  if (baseFee > maxFeePerGas) {
    throw new Error(
      `La baseFee actual (${formatUnits(baseFee, 'gwei')} gwei) supera tu tope ` +
        `maxFeePerGas (${limits.maxFeePerGasGwei} gwei). Sube el tope a conciencia o espera. Abortando.`,
    );
  }

  const maxPriorityFeePerGas = priorityCap > maxFeePerGas ? maxFeePerGas : priorityCap;
  return { maxFeePerGas, maxPriorityFeePerGas, baseFee };
}

export function describeFees({ maxFeePerGas, maxPriorityFeePerGas, baseFee }) {
  return {
    baseFeeGwei: formatUnits(baseFee, 'gwei'),
    maxFeeGwei: formatUnits(maxFeePerGas, 'gwei'),
    priorityGwei: formatUnits(maxPriorityFeePerGas, 'gwei'),
  };
}

// Coste máximo absoluto de una transacción: gas * maxFee + value.
export function worstCaseCost({ gasLimit, maxFeePerGas, value }) {
  return BigInt(gasLimit) * maxFeePerGas + BigInt(value ?? 0n);
}
