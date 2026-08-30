import { Interface, getAddress, isHexString } from 'ethers';

// Firmas de mint más habituales en colecciones EVM. El modo 'auto' las prueba
// una por una con eth_call (simulación, sin gastar nada) y se queda con la
// primera que no revierte. Es lento hacerlo en el momento del mint, así que se
// resuelve ANTES y se guarda: en la ruta crítica ya no se descubre nada.
export const CANDIDATE_MINTS = [
  { signature: 'function mint(uint256 quantity) payable', args: (ctx) => [ctx.quantity] },
  { signature: 'function mint(address to, uint256 quantity) payable', args: (ctx) => [ctx.to, ctx.quantity] },
  { signature: 'function publicMint(uint256 quantity) payable', args: (ctx) => [ctx.quantity] },
  { signature: 'function mintPublic(uint256 quantity) payable', args: (ctx) => [ctx.quantity] },
  { signature: 'function purchase(uint256 quantity) payable', args: (ctx) => [ctx.quantity] },
  { signature: 'function claim(uint256 quantity) payable', args: (ctx) => [ctx.quantity] },
  { signature: 'function mint() payable', args: () => [] },
  { signature: 'function mintTo(address to) payable', args: (ctx) => [ctx.to] },
];

export function encodeFromSignature(signature, args) {
  const iface = new Interface([signature.startsWith('function') ? signature : `function ${signature}`]);
  const fragment = iface.fragments[0];
  return iface.encodeFunctionData(fragment, args);
}

// Construye el calldata final según el modo configurado.
export function buildCalldata(config, { to }) {
  const { mode, signature, args, quantity } = config.mint;

  if (mode === 'raw') {
    if (!isHexString(signature)) {
      throw new Error('En modo "raw", mint.signature debe ser el calldata hexadecimal completo (0x...).');
    }
    return signature;
  }

  if (mode === 'signature') {
    if (!signature) throw new Error('Falta mint.signature. Ejecuta `setup` o edita el config.');
    return encodeFromSignature(signature, resolveArgs(args, { to, quantity }));
  }

  if (mode === 'auto') {
    if (!signature) {
      throw new Error(
        'El modo "auto" no ha resuelto todavía la función de mint. Ejecuta `rh-sniper detect` primero.',
      );
    }
    return encodeFromSignature(signature, resolveArgs(args, { to, quantity }));
  }

  throw new Error(`Modo de mint desconocido: ${mode}`);
}

// Los argumentos guardados en el config admiten dos marcadores para no tener que
// reescribirlos si cambias de billetera o de cantidad.
function resolveArgs(args, { to, quantity }) {
  return (args ?? []).map((arg) => {
    if (arg === '$WALLET') return getAddress(to);
    if (arg === '$QUANTITY') return BigInt(quantity);
    return arg;
  });
}

export function argsTemplateFor(signature) {
  const iface = new Interface([signature]);
  return iface.fragments[0].inputs.map((input) => {
    if (input.type === 'address') return '$WALLET';
    return '$QUANTITY';
  });
}
