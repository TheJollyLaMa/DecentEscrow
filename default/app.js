import { JsonRpcProvider, Contract, ZeroAddress } from 'ethers';
import { DecentHead } from '../decent-head.js';
import { integer, address, native, json, descriptions, stateOf } from './model.js';

const $ = id => document.getElementById(id);
let config, abi, provider, signer, contract, actor, busy = false;
const fields = {};
const tokenABI = ['function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)'];

function message(text, error = false) {
  $('status').textContent = text;
  $('status').className = error ? 'error' : 'success';
}
function controls() {
  for (const button of document.querySelectorAll('button')) button.disabled = busy || (!signer && button.id !== 'connect');
  $('connect').disabled = busy || !config || config.mode === 'unconfigured';
  $('actor').disabled = busy;
}
function field(parent, key, label, value, type = 'text') {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const input = document.createElement('input');
  input.id = key;
  input.name = key;
  input.type = type;
  input.value = value;
  input.required = true;
  if (type !== 'text') input.inputMode = 'numeric';
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}
function disconnect(reason) {
  signer = null; contract = null; actor = null;
  $('connection').textContent = reason;
  $('record').textContent = 'No current record loaded. Reconnect and load again.';
  $('actions').replaceChildren();
  controls();
}
async function run(work) {
  if (busy) return;
  busy = true; controls();
  try { await work(); }
  catch (error) {
    if (signer && !contract) disconnect('Connection failed. Reconnect after checking wallet, chain and configured contract.');
    const detail = error.info?.error?.message || error.reason || error.shortMessage || error.message;
    message(`Not completed: ${detail}. No success is assumed; reload the record to check chain state.`, true);
  } finally { busy = false; controls(); }
}
async function verifyChain() {
  const chain = BigInt(await provider.send('eth_chainId', []));
  if (chain !== BigInt(config.chainId)) throw Error(`Wrong chain: expected ${config.chainId}, received ${chain}`);
}
async function connect() {
  disconnect('Connecting…');
  if (config.mode === 'local') provider?.destroy();
  if (config.mode === 'local') {
    provider = new JsonRpcProvider(new URL('/rpc', location.href).href, undefined, { cacheTimeout: -1 });
    provider.pollingInterval = 100;
    await verifyChain();
    signer = await provider.getSigner($('actor').value);
  } else {
    const session = DecentHead.getWallet();
    if (!session.snapshot().connected) await session.connect();
    provider = session.snapshot().provider;
    await verifyChain();
    signer = await provider.getSigner();
  }
  actor = await signer.getAddress();
  if ((await provider.getCode(config.address)) === '0x') throw Error('No contract code at configured address');
  if (config.mode === 'wallet') {
    const state = DecentHead.getWallet().snapshot();
    if (!state.connected || state.address?.toLowerCase() !== actor?.toLowerCase() || BigInt(state.chainId) !== BigInt(config.chainId)) {
      throw Error('Wallet session changed during verification; reconnect and review');
    }
  }
  contract = new Contract(config.address, abi, signer);
  $('connection').textContent = `Connected actor: ${actor}\nChain: ${config.chainId}\nContract: ${config.address}`;
  if (fields.payee) fields.payee.value = config.accounts?.find(a => a !== actor) || '';
  if (fields.payer) fields.payer.value = config.accounts?.find(a => a !== actor) || '';
  if ($('subscriber-view')) $('subscriber-view').value = actor;
  message('Connected. Review terms and raw units before submitting.');
}
async function approve(asset, amount) {
  if (native(asset)) return;
  const token = new Contract(asset, tokenABI, signer);
  const current = await token.allowance(actor, config.address);
  if (current === amount) return;
  if (current > 0n) {
    message('Resetting existing token allowance to zero; awaiting confirmation…');
    await (await token.approve(config.address, 0)).wait();
  }
  message(`Approve exactly ${amount} raw units for ${config.address}; awaiting confirmation…`);
  await (await token.approve(config.address, amount)).wait();
}
async function transact(send) {
  await verifyChain();
  message('Submitting transaction; awaiting inclusion. Do not treat this as success yet.');
  const tx = await send();
  $('receipt').textContent = `Pending transaction: ${tx.hash}`;
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw Error('Transaction reverted');
  const events = receipt.logs.flatMap(log => {
    try {
      const event = contract.interface.parseLog(log);
      return event ? [{ name: event.name, values: Array.from(event.args) }] : [];
    } catch { return []; }
  });
  $('receipt').textContent = json({
    chainId: config.chainId, contract: config.address, transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber, status: 'Confirmed locally; not a finality guarantee', events
  });
  const created = events.find(event => ['Created', 'Issued', 'PlanCreated'].includes(event.name));
  if (created) $('record-id').value = String(created.values[0]);
  message(`Confirmed in block ${receipt.blockNumber}. Receipt is public. Refresh for current lifecycle state.`);
  await inspect();
}
async function create() {
  if (!contract) throw Error('Connect first');
  await verifyChain();
  const asset = address(fields.asset.value.trim());
  const amount = integer(fields.amount.value, config.kind === 'subscriptions' ? 'Price' : 'Amount');
  const context = fields.context.value;
  if (new TextEncoder().encode(context).length > 512) throw Error('Public context exceeds 512 UTF-8 bytes');
  if (config.kind === 'escrow') {
    const payee = address(fields.payee.value.trim());
    const deadline = integer(fields.deadline.value, 'Deadline');
    await approve(asset, amount);
    await transact(() => contract.create(payee, asset, amount, deadline, context, { value: native(asset) ? amount : 0n }));
  } else if (config.kind === 'invoice') {
    await transact(() => contract.issue(address(fields.payer.value.trim()), asset, amount, integer(fields.due.value, 'Due timestamp'), context));
  } else {
    await transact(() => contract.createPlan(asset, amount, integer(fields.duration.value, 'Duration'), context));
  }
}
function action(label, work) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => run(work));
  $('actions').append(button);
}
async function inspect() {
  if (!contract) throw Error('Connect first');
  await verifyChain();
  const id = integer($('record-id').value, 'Record ID');
  const kind = config.kind;
  const r = await contract[kind === 'escrow' ? 'orders' : kind === 'invoice' ? 'invoices' : 'plans'](id);
  if ((kind === 'subscriptions' ? r.price : r.amount) === 0n) throw Error('Record does not exist');
  const now = BigInt((await provider.getBlock('latest')).timestamp);
  const subscriber = kind === 'subscriptions' ? address($('subscriber-view').value.trim()) : null;
  const expires = subscriber ? await contract.expiry(id, subscriber) : 0n;
  const detail = Object.fromEntries(r.toArray().map((value, i) => [
    ({ escrow: ['payer', 'payee', 'asset', 'amount', 'deadline', 'settled', 'context'],
      invoice: ['payee', 'payer', 'asset', 'amount', 'due', 'state', 'context'],
      subscriptions: ['payee', 'asset', 'price', 'duration', 'enabled', 'context'] })[kind][i], value
  ]));
  $('record').textContent = `${stateOf(kind, r, now, expires)}\n${json({ id, ...detail, ...(subscriber ? { subscriber, expires } : {}), observedAt: now })}`;
  $('actions').replaceChildren();
  if (kind === 'escrow' && !r.settled) {
    if (actor === r.payer) {
      action('Release full amount to payee', () => transact(() => contract.release(id)));
      if (now >= r.deadline) {
        const payout = field($('actions'), 'payout', 'Payee payout (raw units, remainder refunded to payer)', '0');
        action('Settle split / refund', () => transact(() => contract.settleAfterDeadline(id, integer(payout.value, 'Payout', true))));
      }
    }
    if (actor === r.payee) action('Return all funds to payer', () => transact(() => contract.refund(id)));
  }
  if (kind === 'invoice' && r.state === 0n) {
    if (actor === r.payee) action('Cancel unpaid invoice', () => transact(() => contract.cancel(id)));
    if (actor === r.payer && now < r.due) action('Approve if needed and pay full invoice', async () => {
      await verifyChain(); await approve(r.asset, r.amount);
      await transact(() => contract.pay(id, { value: native(r.asset) ? r.amount : 0n }));
    });
  }
  if (kind === 'subscriptions') {
    if (actor === r.payee) action(r.enabled ? 'Disable new purchases' : 'Enable new purchases', () => transact(() => contract.setEnabled(id, !r.enabled)));
    if (r.enabled) {
      const periods = field($('actions'), 'periods', 'Periods to buy / renew for inspected subscriber', '1');
      action('Approve if needed and buy prepaid access', async () => {
        await verifyChain();
        const count = integer(periods.value, 'Periods');
        const total = r.price * count;
        if (total >= 2n ** 256n) throw Error('Total outside uint256 range');
        await approve(r.asset, total);
        await transact(() => contract.subscribe(id, subscriber, count, { value: native(r.asset) ? total : 0n }));
      });
    }
    if (actor === subscriber && expires > now) action('Cancel now — forfeit access, NO refund', () => transact(() => contract.cancel(id)));
  }
  controls();
}

$('create-form').addEventListener('submit', event => { event.preventDefault(); run(create); });
$('lookup-form').addEventListener('submit', event => { event.preventDefault(); run(async () => { await inspect(); message('Loaded current record from chain.'); }); });
$('connect').addEventListener('click', () => run(connect));
$('actor').addEventListener('change', () => run(connect));
DecentHead.on('wallet', () => {
  if (config?.mode === 'wallet') disconnect('Wallet session changed. Reconnect and review before acting.');
});

await run(async () => {
  const response = await fetch('./config.json');
  if (!response.ok) throw Error('Configuration unavailable');
  config = await response.json();
  document.title = config.title;
  $('title').textContent = config.title;
  $('description').textContent = descriptions[config.kind];
  if (config.mode === 'unconfigured' || !config.address || !config.chainId) {
    $('environment').textContent = 'Unavailable: no V1 deployment configured. Run npm run preview for a synthetic local chain. Legacy deployment addresses are never reused.';
    config.mode = 'unconfigured';
    throw Error('No V1 deployment configured');
  }
  const abiResponse = await fetch('./abi.json');
  if (!abiResponse.ok) throw Error('ABI unavailable; run npm run build');
  abi = await abiResponse.json();
  $('environment').textContent = config.mode === 'local'
    ? 'LOCAL SANDBOX ONLY · Synthetic accounts, synthetic assets, no real funds. No wallet needed. State resets on server restart. Choose actor 1 for a client/subscriber, actor 2 for a counterpart; invoices are issued by their payee.'
    : `Configured wallet mode · chain ${config.chainId}. Verify the address and ABI independently. This interface is unaudited.`;
  $('connect').textContent = config.mode === 'local' ? 'Connect selected test actor' : 'Connect wallet';
  if (config.mode === 'local') {
    $('actor-label').hidden = false;
    config.accounts.forEach((account, i) => {
      const option = document.createElement('option');
      option.value = account;
      option.textContent = `Actor ${i + 1} · ${account}`;
      $('actor').append(option);
    });
    $('test-token').textContent = `Optional mock ERC20 asset: ${config.token} · each actor has 1,000,000 raw units. Never use these accounts on public networks.`;
  }
  const form = $('create-fields');
  if (config.kind === 'escrow') fields.payee = field(form, 'payee', 'Payee / worker address', '');
  if (config.kind === 'invoice') fields.payer = field(form, 'payer', 'Named payer address', '');
  fields.asset = field(form, 'asset', 'Asset address (zero = native coin)', ZeroAddress);
  fields.amount = field(form, 'amount', config.kind === 'subscriptions' ? 'Price per period (raw units)' : 'Amount (raw units)', '100');
  if (config.kind === 'escrow') fields.deadline = field(form, 'deadline', 'Partial-settlement deadline (Unix seconds)', String(Math.floor(Date.now() / 1000) + 3600));
  if (config.kind === 'invoice') fields.due = field(form, 'due', 'Payment due / expiry (Unix seconds; exclusive)', String(Math.floor(Date.now() / 1000) + 3600));
  if (config.kind === 'subscriptions') {
    fields.duration = field(form, 'duration', 'Duration per period (seconds; 30 days = 2592000)', '2592000');
    field($('lookup-form'), 'subscriber-view', 'Subscriber address to inspect / sponsor', config.accounts?.[0] || '');
  }
  fields.context = field(form, 'context', 'Public context reference (no secrets; max 512 UTF-8 bytes)', 'project:example');
  message('Ready. Connect explicitly; no transaction has been sent.');
});
