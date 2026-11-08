import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { ZeroAddress } from 'ethers';
import { setup, mined } from './helpers.mjs';

let f, snapshot;
before(async () => { f = await setup('DecentEscrowV1'); });
after(async () => f?.close());
beforeEach(async () => { snapshot = await f.provider.send('evm_snapshot', []); });
afterEach(async () => { await f.provider.send('evm_revert', [snapshot]); });
const create = async (asset = ZeroAddress, amount = 100n, payee = f.addresses[1]) =>
  mined(f.contract.create(payee, asset, amount, (await f.now()) + 100, 'work:public-hash', { value: asset === ZeroAddress ? amount : 0n }));

test('native deposit, payer release and immutable terminal state', async () => {
  const receipt = await create();
  assert.equal(f.contract.interface.parseLog(receipt.logs[0]).name, 'Created');
  assert.equal((await f.contract.orders(1)).payer, f.addresses[0]);
  await mined(f.contract.release(1));
  assert.equal((await f.contract.orders(1)).settled, true);
  assert.equal(await f.provider.send('eth_getBalance', [f.contract.target, 'latest']), '0x0');
  await assert.rejects(() => f.contract.release(1));
});

test('only payer can release or choose post-deadline split', async () => {
  await create();
  await assert.rejects(() => f.contract.connect(f.signers[2]).release(1));
  await assert.rejects(() => f.contract.connect(f.signers[1]).settleAfterDeadline(1, 50));
  await assert.rejects(() => f.contract.settleAfterDeadline(1, 50));
  await f.advance(101);
  await assert.rejects(() => f.contract.settleAfterDeadline(1, 101));
  await mined(f.contract.settleAfterDeadline(1, 40));
  assert.equal((await f.contract.orders(1)).settled, true);
});

test('payee may refund early; unrelated actors cannot refund', async () => {
  await create();
  await assert.rejects(() => f.contract.refund(1));
  await mined(f.contract.connect(f.signers[1]).refund(1));
  assert.equal((await f.contract.orders(1)).settled, true);
});

test('ERC20 accounting isolates orders and supports exact split', async () => {
  await create(f.token.target);
  await create(f.token.target);
  await f.advance(101);
  await mined(f.contract.settleAfterDeadline(1, 30));
  assert.equal(await f.token.balanceOf(f.addresses[1]), 1000030n);
  assert.equal(await f.token.balanceOf(f.contract.target), 100n);
  assert.equal((await f.contract.orders(2)).settled, false);
});

test('invalid addresses, zero, past deadlines, nonexistent IDs and native mismatch reject', async () => {
  await assert.rejects(() => create(ZeroAddress, 0n));
  await assert.rejects(() => create(ZeroAddress, 100n, ZeroAddress));
  await assert.rejects(() => create(ZeroAddress, 100n, f.addresses[0]));
  await assert.rejects(() => create(f.addresses[2]));
  await assert.rejects(() => f.contract.create(f.addresses[1], ZeroAddress, 1, 1, '', { value: 1 }));
  await assert.rejects(() => f.contract.create(f.addresses[1], ZeroAddress, 100, 9999999999, '', { value: 99 }));
  await assert.rejects(() => f.contract.release(999));
});

test('missing approval, false-return and fee-on-transfer collection revert atomically', async () => {
  await mined(f.token.approve(f.contract.target, 0));
  await assert.rejects(() => create(f.token.target));
  await mined(f.token.approve(f.contract.target, 1000));
  await mined(f.token.configure(true, false));
  await assert.rejects(() => create(f.token.target));
  await mined(f.token.configure(false, true));
  await assert.rejects(() => create(f.token.target));
  assert.equal(await f.contract.orderCount(), 0n);
  assert.equal(await f.token.balanceOf(f.contract.target), 0n);
});

test('failed ERC20 payout restores settlement and funds', async () => {
  await create(f.token.target);
  await mined(f.token.configure(true, false));
  await assert.rejects(() => f.contract.release(1));
  assert.equal((await f.contract.orders(1)).settled, false);
  await mined(f.token.configure(false, true));
  await assert.rejects(() => f.contract.release(1));
  assert.equal(await f.token.balanceOf(f.contract.target), 100n);
});

test('sender-side token fee cannot silently overcharge the payer', async () => {
  await mined(f.token.configureSenderFee(true));
  await assert.rejects(() => create(f.token.target));
  assert.equal(await f.token.balanceOf(f.addresses[0]), 1000000n);
  assert.equal(await f.contract.orderCount(), 0n);
});

test('non-returning standard token works', async () => {
  const token = await f.deploy('NoReturnToken');
  await mined(token.mint(f.addresses[0], 100));
  await mined(token.approve(f.contract.target, 100));
  await create(token.target);
  await mined(f.contract.release(1));
  assert.equal(await token.balanceOf(f.addresses[1]), 100n);
});

test('native rejection restores open state; reentry cannot settle twice', async () => {
  const receiver = await f.deploy('Receiver');
  await create(ZeroAddress, 100n, receiver.target);
  await mined(receiver.configure(true, ZeroAddress, '0x'));
  await assert.rejects(() => f.contract.release(1));
  assert.equal((await f.contract.orders(1)).settled, false);
  await mined(receiver.configure(false, f.contract.target, f.contract.interface.encodeFunctionData('refund', [1])));
  await mined(f.contract.release(1));
  assert.equal(await receiver.callbackSucceeded(), false);
  assert.equal((await f.contract.orders(1)).settled, true);
});
