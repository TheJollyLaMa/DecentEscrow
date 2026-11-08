import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const vendor = new URL('vendor/decent-head/2.0.0/', root);
globalThis.window = new EventTarget();
globalThis.DECENT_CONFIG = { chain: null, ens: { enabled: false } };
const { WalletSession, loadEthers } = await import(new URL('js/wallet.js', vendor));
const { IPFSSession } = await import(new URL('js/ipfs.js', vendor));

test('pinned native header, license and receiver privacy gates', async () => {
  const provenance = JSON.parse(await readFile(new URL('provenance.json', vendor)));
  assert.equal(provenance.commit, '00691c4fe93fd280f5aec780bdc4fac651bfcdb1');
  for (const file of provenance.manifest) assert.ok((await readFile(new URL(file, vendor))).length);
  const adapted = new Set(['js/wallet.js', 'js/ipfs.js', 'js/components/Header/WalletConnect.js', 'js/components/Header/IPFSControls.js', 'js/components/Header/IPFSStatus.js', 'css/decent-head.css']);
  for (const file of provenance.manifest.filter(file => !adapted.has(file))) {
    assert.equal(createHash('sha256').update(await readFile(new URL(file, vendor))).digest('hex'), provenance.upstreamSha256[file], file);
  }
  assert.equal(createHash('sha256').update(await readFile(new URL('js/ipfs.js', vendor))).digest('hex'), provenance.sharedProbe.sha256['js/ipfs.js']);
  const umd = await readFile(new URL('js/vendor/ethers.umd.min.js', vendor), 'utf8');
  const wrapper = await readFile(new URL('js/vendor/ethers-v6.mjs', vendor), 'utf8');
  assert.equal(wrapper, `const exports = {}; const module = { exports };\n${umd}\nexport default module.exports;\n`);
  const context = { window: {}, document: { getElementById: () => null } };
  vm.runInNewContext(await readFile(new URL('decent-head.config.js', root), 'utf8'), context);
  const config = context.window.DECENT_CONFIG;
  assert.equal(config.chain, null);
  assert.equal(config.ens.enabled, false);
  assert.ok(config.about.summary.length > 20);
  assert.equal(config.data, undefined);
  assert.equal(config.supporterDnft, undefined);
  const status = await config.ipfsAdapter.getStatus();
  assert.equal(status.backup.state, 'unavailable');
  const controls = await readFile(new URL('js/components/Header/IPFSControls.js', vendor), 'utf8');
  assert.match(controls, /getElementById\('community-settings'\)\.hidden = true/);
  assert.match(controls, /getElementById\('pin'\)\.disabled = true/);
  const sharedControls = controls
    .replace("    root.getElementById('community-settings').hidden = true;\n", '')
    .replace("    root.getElementById('pin').disabled = true;\n", '');
  assert.equal(createHash('sha256').update(sharedControls).digest('hex'), provenance.sharedProbe.sha256['js/components/Header/IPFSControls.js']);
});

test('click-only shared wallet observes networks, rejects and cleans account/disconnect listeners; ethers v5 untouched', async () => {
  const legacy = { version: 'ethers/5.7.2' };
  globalThis.ethers = legacy;
  const v6 = await loadEthers();
  assert.match(v6.version, /^6\./);
  assert.equal(globalThis.ethers, legacy);
  const listeners = new Map(), methods = [];
  let reject = true, chain = '0xa';
  const first = '0x' + '1'.repeat(40), second = '0x' + '2'.repeat(40);
  const raw = {
    async request({ method }) {
      methods.push(method);
      if (method === 'eth_requestAccounts') {
        if (reject) throw Object.assign(new Error('Rejected by user'), { code: 4001 });
        return [first];
      }
      if (method === 'eth_chainId') return chain;
      throw new Error(`Unexpected wallet method ${method}`);
    },
    on: (name, callback) => listeners.set(name, callback),
    removeListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  const session = new WalletSession();
  assert.deepEqual(methods, []);
  await assert.rejects(session.connect(raw), /Rejected/);
  assert.equal(session.snapshot().connected, false);
  assert.equal(listeners.size, 0);
  reject = false;
  await session.connect(raw);
  assert.equal(session.rawProvider, raw);
  assert.equal(session.snapshot().chainId, '0xa');
  listeners.get('accountsChanged')([second]);
  assert.equal(session.snapshot().address, second);
  chain = '0x270f';
  listeners.get('chainChanged')(chain);
  assert.equal(session.snapshot().chainId, chain);
  await assert.rejects(session.ensureChain(), /No operation chain configured/);
  listeners.get('disconnect')();
  assert.equal(session.snapshot().connected, false);
  assert.equal(listeners.size, 0);
  await session.connect(raw);
  listeners.get('accountsChanged')([]);
  assert.equal(session.snapshot().address, null);
  assert.equal(listeners.size, 0);
  assert.equal(methods.filter(method => method === 'eth_requestAccounts').length, 3);
  assert.equal(methods.some(method => /switch|addEthereum/.test(method)), false);
  assert.equal(globalThis.ethers, legacy);
});

test('provider unconfigured, synthetic failure and ready do not imply app backup or retention', async t => {
  const storage = new IPFSSession({
    default: 'pinata', pinata: { uploadUrl: 'https://api.pinata.cloud/pinning/pinFileToIPFS' },
    local: { apiUrl: 'http://127.0.0.1:5001' }, gateway: 'https://ipfs.io/ipfs/',
  });
  assert.equal(storage.snapshot().credentialsConfigured, false);
  assert.throws(() => storage.headers(), /Enter your Pinata/);
  storage.configure({ provider: 'pinata', jwt: 'synthetic-only' });
  assert.equal(storage.snapshot().credentialsConfigured, true);
  assert.equal(storage.snapshot().cid, undefined);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
  await assert.rejects(storage.upload({ synthetic: true }), /HTTP 503/);
  storage.configure({ provider: 'local' });
  assert.equal(storage.snapshot().credentialsConfigured, false);
  await assert.rejects(storage.upload({ synthetic: true }), /HTTP 503/);
  const cid = 'b' + 'a'.repeat(30);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, text: async () => JSON.stringify({ Hash: cid }) }));
  assert.equal(await storage.upload({ synthetic: true }), cid);
  assert.equal(storage.snapshot().cid, undefined);
});
