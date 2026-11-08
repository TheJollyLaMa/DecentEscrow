import test from 'node:test';
import assert from 'node:assert/strict';
import { IPFSSession } from '../vendor/decent-head/2.0.0/js/ipfs.js';

const options = {
  default: 'pinata',
  pinata: { uploadUrl: 'https://api.pinata.cloud/pinning/pinFileToIPFS' },
  local: { apiUrl: 'http://127.0.0.1:5001' }
};

function fixture(t, response) {
  const events = [];
  for (const [key, value] of [
    ['window', { dispatchEvent: event => events.push(event.detail) }],
    ['CustomEvent', class { constructor(name, { detail }) { this.detail = detail; } }]
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init });
    if (response instanceof Error) throw response;
    return typeof response === 'function' ? response() : response;
  });
  return { session: new IPFSSession(options), requests, events };
}

test('selection stays unverified and missing credentials cause no request', async t => {
  const { session, requests } = fixture(t);
  session.configure({ provider: 'pinata' });
  assert.equal(session.snapshot().connection.state, 'unverified');
  await assert.rejects(session.verifyConnection(), /personal Pinata/);
  assert.equal(requests.length, 0);
  assert.equal(session.snapshot().connection.state, 'error');
});

test('Pinata authenticates explicitly without uploading or leaking credentials into snapshots', async t => {
  const { session, requests, events } = fixture(t, {
    ok: true, json: async () => ({ message: 'Congratulations! You are communicating with the Pinata API!' })
  });
  session.configure({ provider: 'pinata', jwt: 'synthetic-secret' });
  assert.equal(requests.length, 0);
  const result = await session.verifyConnection();
  assert.equal(result.state, 'ready');
  assert.match(result.detail, /not verified/);
  assert.equal(requests[0].url, 'https://api.pinata.cloud/data/testAuthentication');
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer synthetic-secret');
  assert.equal(requests[0].init.redirect, 'error');
  assert.equal(requests[0].init.credentials, 'omit');
  assert.equal('body' in requests[0].init, false);
  assert.doesNotMatch(JSON.stringify(events), /synthetic-secret/);
  session.configure({ provider: 'local' });
  assert.equal(session.snapshot().connection.state, 'unverified');
});

test('local Kubo reads version without forwarding Pinata credentials', async t => {
  const { session, requests } = fixture(t, { ok: true, json: async () => ({ Version: '0.34.0' }) });
  session.configure({ provider: 'local', jwt: 'synthetic-secret' });
  assert.equal((await session.verifyConnection()).state, 'ready');
  assert.equal(requests[0].url, 'http://127.0.0.1:5001/api/v0/version');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal('headers' in requests[0].init, false);
  assert.equal('body' in requests[0].init, false);
});

test('HTTP, malformed and network failures never report ready or expose raw credentials', async t => {
  for (const response of [
    { ok: false, status: 401 },
    { ok: true, json: async () => ({}) },
    { ok: true, json: async () => { throw new Error('synthetic-secret'); } },
    new Error('synthetic-secret')
  ]) {
    await t.test('failed response', async t => {
      const { session } = fixture(t, response);
      session.configure({ provider: 'pinata', jwt: 'synthetic-secret' });
      await assert.rejects(session.verifyConnection(), error => !error.message.includes('synthetic-secret'));
      assert.equal(session.snapshot().connection.state, 'error');
    });
  }
});

test('changed providers discard stale connection results and reject duplicate checks', async t => {
  let resolve;
  const { session } = fixture(t, () => new Promise(done => { resolve = done; }));
  session.configure({ provider: 'pinata', jwt: 'synthetic-secret' });
  const check = session.verifyConnection();
  await assert.rejects(session.verifyConnection(), /already running/);
  session.configure({ provider: 'local' });
  resolve({ ok: true, json: async () => ({ message: 'Congratulations! You are communicating with the Pinata API!' }) });
  await assert.rejects(check, /Provider changed/);
  assert.equal(session.snapshot().connection.state, 'unverified');
});

test('local probe rejects non-loopback and credential-bearing endpoints without requests', async t => {
  const { session, requests } = fixture(t);
  for (const apiUrl of ['https://example.com', 'http://secret@localhost:5001', 'http://localhost:5001?token=secret']) {
    session.options = { ...options, local: { apiUrl } };
    session.configure({ provider: 'local' });
    await assert.rejects(session.verifyConnection(), /loopback/);
  }
  assert.equal(requests.length, 0);
});
