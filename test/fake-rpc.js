// Servidor JSON-RPC mínimo en memoria: suficiente para ejercitar el pool, la
// pre-firma y la difusión sin depender de una cadena real.
import { createServer } from 'node:http';

export function startFakeRpc({ chainId = 8888, latencyMs = 0, blockNumber = 1000, behavior = {} } = {}) {
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const request = JSON.parse(body);
      const respond = (result) => {
        const payload = JSON.stringify({ jsonrpc: '2.0', id: request.id, ...result });
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(payload);
        }, latencyMs);
      };

      switch (request.method) {
        case 'eth_chainId':
          return respond({ result: `0x${chainId.toString(16)}` });
        case 'eth_blockNumber':
          return respond({ result: `0x${blockNumber.toString(16)}` });
        case 'eth_getBlockByNumber':
          return respond({
            result: {
              number: `0x${blockNumber.toString(16)}`,
              baseFeePerGas: '0x3b9aca00',
              hash: `0x${'11'.repeat(32)}`,
              parentHash: `0x${'22'.repeat(32)}`,
              timestamp: '0x0',
              transactions: [],
              gasLimit: '0x1c9c380',
              gasUsed: '0x0',
              difficulty: '0x0',
              miner: `0x${'00'.repeat(20)}`,
              extraData: '0x',
            },
          });
        case 'eth_getTransactionReceipt':
          return respond({
            result: {
              transactionHash: request.params[0],
              blockNumber: `0x${blockNumber.toString(16)}`,
              blockHash: `0x${'11'.repeat(32)}`,
              status: '0x1',
              gasUsed: '0x1d4c0',
              effectiveGasPrice: '0x3b9aca00',
              cumulativeGasUsed: '0x1d4c0',
              logs: [],
              logsBloom: `0x${'00'.repeat(256)}`,
              transactionIndex: '0x0',
              from: `0x${'33'.repeat(20)}`,
              to: `0x${'22'.repeat(20)}`,
              contractAddress: null,
              type: '0x2',
            },
          });
        case 'eth_getCode':
          return respond({ result: behavior.noCode ? '0x' : '0x60806040' });
        case 'eth_getBalance':
          return respond({ result: '0xde0b6b3a7640000' }); // 1.0
        case 'eth_getTransactionCount':
          return respond({ result: '0x7' });
        case 'eth_call':
          return behavior.callReverts
            ? respond({ error: { code: 3, message: 'execution reverted: sale not started' } })
            : respond({ result: '0x' });
        case 'eth_sendRawTransaction': {
          seen.push(request.params[0]);
          if (behavior.rejectSend) {
            return respond({ error: { code: -32000, message: behavior.rejectSend } });
          }
          return respond({ result: `0x${'ab'.repeat(32)}` });
        }
        default:
          return respond({ result: null });
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        seen,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
