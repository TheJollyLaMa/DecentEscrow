import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setup, artifact } from '../test/helpers.mjs';

const config = JSON.parse(await fs.readFile('default/config.json'));

export async function createPreview(port = config.port) {
  const f = await setup(config.contractName);
  const runtime = { ...config, mode: 'local', chainId: 31337, address: f.contract.target,
    token: f.token.target, accounts: f.addresses };
  const allowed = new Map([
    ['/default/', ['default/index.html', 'text/html']],
    ['/default/app.js', ['default/app.js', 'text/javascript']],
    ['/default/model.js', ['default/model.js', 'text/javascript']],
    ['/default/style.css', ['default/style.css', 'text/css']],
    ['/default/vendor/ethers.js', ['default/vendor/ethers.js', 'text/javascript']],
    ['/default/vendor/ethers-LICENSE.md', ['default/vendor/ethers-LICENSE.md', 'text/plain']]
  ]);
  const headRoot = 'vendor/decent-head/2.0.0';
  const head = JSON.parse(await fs.readFile(`${headRoot}/provenance.json`));
  for (const file of [...head.manifest, 'js/vendor/ethers-v6.mjs', 'docs/ADOPTING.md', 'docs/IPFS-HOST.md']) {
    const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/plain';
    allowed.set(`/${headRoot}/${file}`, [`${headRoot}/${file}`, mime]);
  }
  for (const file of ['decent-head.js', 'decent-head.config.js']) allowed.set(`/${file}`, [file, 'text/javascript']);
  const server = http.createServer(async (req, res) => {
    const origin = `http://${req.headers.host}`;
    if (![`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`].includes(req.headers.host)) {
      res.writeHead(403).end('Loopback host only'); return;
    }
    if (req.headers.origin && req.headers.origin !== origin) {
      res.writeHead(403).end('Same origin only'); return;
    }
    const pathname = new URL(req.url, origin).pathname;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (pathname === '/rpc' && req.method === 'POST') {
      let raw = '';
      try {
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 100000) throw Error('Request too large');
        }
        const request = JSON.parse(raw);
        const call = async item => {
          try { return { jsonrpc: '2.0', id: item.id, result: await f.chain.request({ method: item.method, params: item.params || [] }) }; }
          catch (error) { return { jsonrpc: '2.0', id: item.id, error: { code: error.code || -32603, message: error.message, data: error.data } }; }
        };
        const result = Array.isArray(request) ? await Promise.all(request.map(call)) : await call(request);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
      } catch {
        res.writeHead(400).end('Invalid RPC request');
      }
      return;
    }
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (pathname === '/' || pathname === '/default') {
      res.writeHead(302, { Location: '/default/' }).end(); return;
    }
    if (pathname === '/default/config.json' || pathname === '/default/abi.json') {
      const body = pathname.endsWith('config.json') ? runtime : artifact(config.contractName).abi;
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body)); return;
    }
    const entry = allowed.get(pathname);
    if (!entry) { res.writeHead(404).end('Not found'); return; }
    try { res.writeHead(200, { 'Content-Type': entry[1] }).end(await fs.readFile(entry[0])); }
    catch { res.writeHead(500).end('Build or static file unavailable'); }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (error) { await f.close(); throw error; }
  return { server, runtime, url: `http://127.0.0.1:${server.address().port}/default/`,
    close: async () => { await new Promise(resolve => server.close(resolve)); await f.close(); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/preview.mjs')) {
  const preview = await createPreview(Number(process.env.PORT || config.port));
  console.log(`${config.title}: ${preview.url}\nSynthetic local chain ONLY. No real funds. State resets on restart.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
