import test from 'node:test';
import assert from 'node:assert/strict';
import { JsonRpcProvider, Contract } from 'ethers';
import { createPreview } from '../scripts/preview.mjs';
import { integer, stateOf } from '../default/model.js';

test('local preview serves usable ABI, synthetic actors and chain; rejects cross-origin RPC', async () => {
  const preview = await createPreview(0);
  const base = preview.url;
  let provider;
  try {
    const html = await (await fetch(base)).text();
    assert.match(html, /id="create-form"/);
    const config = await (await fetch(new URL('config.json', base))).json();
    assert.equal(config.mode, 'local');
    assert.equal(config.accounts.length, 3);
    const abi = await (await fetch(new URL('abi.json', base))).json();
    provider = new JsonRpcProvider(new URL('/rpc', base).href, undefined, { cacheTimeout: -1 });
    provider.pollingInterval = 10;
    assert.equal((await provider.getNetwork()).chainId, 31337n);
    const contract = new Contract(config.address, abi, await provider.getSigner(config.accounts[0]));
    assert.notEqual(await provider.getCode(contract.target), '0x');
    assert.equal((await fetch(new URL('/rpc', base), { method: 'POST', headers: { Origin: 'https://other.invalid' }, body: '{}' })).status, 403);
    assert.equal((await fetch(new URL('/package.json', base))).status, 404);
    assert.equal((await fetch(new URL('app.js', base))).status, 200);
  } finally {
    provider?.destroy();
    await preview.close();
  }
});

test('interface uses integer units and current state rather than misleading historical labels', () => {
  assert.equal(integer('1000000000000000001', 'Amount'), 1000000000000000001n);
  for (const value of ['1.2', '-1', '1e18', '', '01', '0']) assert.throws(() => integer(value, 'Amount'));
  assert.equal(stateOf('invoice', { state: 0n, due: 10n }, 10n), 'Expired · payment unavailable');
  assert.equal(stateOf('subscriptions', { enabled: false }, 10n, 11n), 'New purchases disabled · subscriber active');
  assert.equal(stateOf('escrow', { settled: true }, 10n), 'Settled');
});
