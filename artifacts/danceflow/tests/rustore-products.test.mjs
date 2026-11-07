import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('owner-provided RuStore products map uniquely to existing Danceflow plans', async () => {
  const config = JSON.parse(await readFile(new URL('../rustore/products.json', import.meta.url), 'utf8'));
  const { expo } = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8'));
  assert.equal(config.consoleApplicationId, '2063784286');
  assert.equal(config.androidPackage, expo.android.package);
  assert.deepEqual(config.products.map(({ productId, planId, accountPlan }) => [productId, planId, accountPlan]), [
    ['razminka', 'monthly_10', 'warmup'],
    ['tancpol', 'monthly_25', 'dancefloor'],
    ['cena', 'monthly_unlimited', 'stage'],
  ]);
  for (const field of ['productId', 'planId', 'accountPlan']) {
    assert.equal(new Set(config.products.map((product) => product[field])).size, config.products.length);
  }
  const subscriptions = await readFile(new URL('../constants/subscriptions.ts', import.meta.url), 'utf8');
  for (const { planId } of config.products) assert.ok(subscriptions.includes(`id: '${planId}'`));
  assert.match(subscriptions, /export const PAYMENTS_CONNECTED = false;/,
    'product configuration alone must not enable purchases');
});
