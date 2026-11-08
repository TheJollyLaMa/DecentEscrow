import assert from 'node:assert/strict';
import { createPreview } from './preview.mjs';

// Optional browser tooling may be supplied by an existing local installation.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const preview = await createPreview(0);
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(preview.url);
  const kind = preview.runtime.kind;
  const ready = () => page.waitForFunction(() => !document.querySelector('#connect').disabled && !document.querySelector('#create-form button').disabled);
  const state = async () => {
    await ready();
    return JSON.parse((await page.locator('#record').innerText()).split('\n').slice(1).join('\n'));
  };
  const load = async () => {
    await page.locator('#lookup-form button').click();
    await ready();
    assert.match(await page.locator('main #status').innerText(), /Loaded current record/);
  };
  const actor = async index => {
    await page.locator('#actor').selectOption({ index });
    await ready();
    assert.match(await page.locator('#connection').innerText(), new RegExp(preview.runtime.accounts[index]));
  };
  const create = async () => {
    await page.locator('#create-form button').click();
    await ready();
    assert.match(await page.locator('main #status').innerText(), /Confirmed in block/);
  };
  await page.locator('main #connect').click();
  await ready();
  await page.locator('#amount').fill('1.2');
  await page.locator('#create-form button').click();
  await ready();
  assert.match(await page.locator('main #status').innerText(), /Not completed:.*integer/);
  await page.locator('#amount').fill('100');
  await create();
  if (kind === 'escrow') {
    await page.getByRole('button', { name: 'Release full amount to payee', exact: true }).click();
    assert.equal((await state()).settled, true);
    await page.locator('#asset').fill(preview.runtime.token);
    await create();
    assert.equal((await state()).asset, preview.runtime.token);
    await actor(1);
    await load();
    await page.getByRole('button', { name: 'Return all funds to payer', exact: true }).click();
    assert.equal((await state()).settled, true);
  } else if (kind === 'invoice') {
    await actor(1);
    await load();
    await page.getByRole('button', { name: 'Approve if needed and pay full invoice', exact: true }).click();
    assert.equal((await state()).state, '1');
    await actor(0);
    await page.locator('#asset').fill(preview.runtime.token);
    await create();
    await actor(1);
    await load();
    await page.getByRole('button', { name: 'Approve if needed and pay full invoice', exact: true }).click();
    assert.equal((await state()).state, '1');
  } else {
    await actor(1);
    await load();
    const buy = () => page.getByRole('button', { name: 'Approve if needed and buy prepaid access', exact: true }).click();
    await buy();
    const first = BigInt((await state()).expires);
    assert(first > 0n);
    await buy();
    assert.equal(BigInt((await state()).expires), first + 2592000n);
    await page.getByRole('button', { name: 'Cancel now — forfeit access, NO refund', exact: true }).click();
    await ready();
    assert.match(await page.locator('#record').innerText(), /subscriber inactive/);
    await actor(0);
    await page.locator('#asset').fill(preview.runtime.token);
    await create();
    await actor(1);
    await load();
    await buy();
    assert(BigInt((await state()).expires) > 0n);
    await actor(0);
    await load();
    await page.getByRole('button', { name: 'Disable new purchases', exact: true }).click();
    assert.equal((await state()).enabled, false);
  }
  assert.match(await page.locator('#receipt').innerText(), /transactionHash/);
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    elements: (() => {
      const all = [];
      const walk = root => { for (const el of root.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } };
      walk(document);
      return all.filter(el => el.getBoundingClientRect().right > innerWidth).map(el => [el.tagName, el.id, el.getBoundingClientRect().right]);
    })(),
  }));
  assert.equal(overflow.width <= overflow.viewport, true, `375px layout does not overflow: ${JSON.stringify(overflow)}`);
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log(`${preview.runtime.title}: native + ERC20 lifecycle, form failures, receipt and 375px layout PASS`);
} finally {
  await browser?.close();
  await preview.close();
}
