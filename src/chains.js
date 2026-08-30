// Perfiles de red.
//
// Deliberadamente NO llevan un chainId ni un RPC público "quemado" en el código.
// Publicar un chainId inventado es la forma más rápida de que firmes una
// transacción para la cadena equivocada, y un RPC hardcodeado es un punto único
// de censura y de fallo. El bot detecta `eth_chainId` del RPC que tú aportes y
// lo fija en el config; a partir de ahí, cualquier RPC que no coincida se
// rechaza antes de firmar nada.
export const NETWORKS = {
  testnet: {
    id: 'testnet',
    label: 'Robinhood Chain Testnet (recomendado en la primera ejecución)',
    envRpc: 'RH_TESTNET_RPC',
    testnet: true,
  },
  mainnet: {
    id: 'mainnet',
    label: 'Robinhood Chain Mainnet (fondos reales)',
    envRpc: 'RH_MAINNET_RPC',
    testnet: false,
  },
};

export function networkFromId(id) {
  const net = NETWORKS[id];
  if (!net) throw new Error(`Red desconocida: ${id}`);
  return net;
}

// RPC públicos: solo se usan si tú los defines por variable de entorno o en el
// config. Si no hay ninguno, el asistente te pedirá pegar el tuyo.
export function defaultRpcsFor(network) {
  const fromEnv = process.env[network.envRpc];
  if (!fromEnv) return [];
  return fromEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
