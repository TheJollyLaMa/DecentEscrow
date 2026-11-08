import { ZeroAddress, getAddress } from 'ethers';

export function integer(value, label, allowZero = false) {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw Error(`${label}: use an integer in raw units`);
  const number = BigInt(value);
  if ((!allowZero && number === 0n) || number >= 2n ** 256n) throw Error(`${label}: outside uint256 range`);
  return number;
}

export const address = value => getAddress(value);
export const native = asset => asset === ZeroAddress;
export const json = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2);

export const descriptions = {
  escrow: 'Fund a work order. The payer can release in full at any time and choose a split/refund after the deadline. The payee may return all funds early. No neutral arbitration or guaranteed worker payment.',
  invoice: 'Issue a payment request to a named payer. Only that payer may pay, in full, before expiry; only the issuer/payee may cancel. A request is not a loan or legally enforced debt.',
  subscriptions: 'Create a prepaid access plan with fixed asset, price, duration and merchant. Buy or sponsor periods; renew explicitly. Cancellation forfeits remaining access without a refund. No automatic billing.'
};

export function stateOf(kind, record, now, expires) {
  if (kind === 'escrow') return record.settled ? 'Settled' : now >= record.deadline ? 'Funded · payer may split/refund' : 'Funded · locked against partial settlement';
  if (kind === 'invoice') return ['Open', 'Paid', 'Canceled'][Number(record.state)] === 'Open'
    ? now >= record.due ? 'Expired · payment unavailable' : 'Open · payable'
    : ['Open', 'Paid', 'Canceled'][Number(record.state)];
  return `${record.enabled ? 'Plan enabled' : 'New purchases disabled'} · ${expires > now ? 'subscriber active' : 'subscriber inactive'}`;
}
