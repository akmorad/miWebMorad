import { Wallet, Transaction, formatEther, parseEther } from 'ethers';
import { worstCaseCost } from '../fees.js';

// Pre-firma. Aquí está la ganancia real de velocidad: cuando el mint abre, ya
// no queda nada por calcular ni por consultar. Solo un eth_sendRawTransaction
// contra todos los RPC a la vez. Todo lo demás — nonce, gas, comisiones,
// calldata, firma — se resolvió antes.
export async function presignBatch({ wallet, chainId, to, data, value, fees, gasLimit, nonce, attempts }) {
  const signed = [];
  for (let i = 0; i < attempts; i += 1) {
    const tx = Transaction.from({
      type: 2,
      chainId: Number(chainId),
      to,
      data,
      value,
      gasLimit: BigInt(gasLimit),
      nonce: nonce + i,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
    const raw = await wallet.signTransaction(tx);
    signed.push({ nonce: nonce + i, raw, hash: Transaction.from(raw).hash });
  }
  return signed;
}

// Barrera de gasto. Se evalúa ANTES de firmar y se calcula sobre el peor caso
// (gasLimit completo al maxFeePerGas), no sobre una estimación optimista.
export function assertWithinSpendLimits({ limits, gasLimit, fees, value, attempts, balance }) {
  const perTx = worstCaseCost({ gasLimit, maxFeePerGas: fees.maxFeePerGas, value });
  const total = perTx * BigInt(attempts);
  const perTxCap = parseEther(String(limits.maxSpendPerTxEth));
  const totalCap = parseEther(String(limits.maxTotalSpendEth));

  if (perTx > perTxCap) {
    throw new Error(
      `Coste máximo por transacción ${formatEther(perTx)} > tope ${limits.maxSpendPerTxEth}. Abortando.`,
    );
  }
  if (total > totalCap) {
    throw new Error(
      `Coste máximo total ${formatEther(total)} (${attempts} intentos) > tope ${limits.maxTotalSpendEth}. Abortando.`,
    );
  }
  if (balance !== undefined && total > balance) {
    throw new Error(
      `Saldo insuficiente: tienes ${formatEther(balance)} y el peor caso son ${formatEther(total)}.`,
    );
  }
  return { perTx, total };
}

export function walletFromPrivateKey(privateKey) {
  return new Wallet(privateKey);
}

// Nunca lanza. Llegados aquí la transacción YA está en la red: si el nodo
// devuelve un recibo que ethers no sabe leer, eso es un problema del nodo, no
// una razón para escupir un stack trace encima de un mint que puede haber
// salido bien. Se degrada a "desconocida" con el hash para comprobarlo a mano.
export async function confirmMint(provider, hash, { timeoutMs = 120000 } = {}) {
  let receipt;
  try {
    receipt = await Promise.race([
      provider.waitForTransaction(hash, 1, timeoutMs),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs).unref?.()),
    ]);
  } catch (err) {
    return { status: 'desconocida', hash, error: err.shortMessage || err.message };
  }
  if (!receipt) return { status: 'pendiente', hash };
  return {
    status: receipt.status === 1 ? 'confirmada' : 'revertida',
    hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed?.toString(),
  };
}
