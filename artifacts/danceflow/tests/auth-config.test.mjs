import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAuthConfigWithRetry } from '../../../lib/auth-web/src/config-retry.ts';
import { customFetch, setAuthTokenGetter } from '../../../lib/api-client-react/src/custom-fetch.ts';

const fast = { delays: [0, 0, 0], timeoutMs: 50 };

test('configuration recovers from transient failures without changing the returned provider', async () => {
  let attempts = 0;
  const result = await loadAuthConfigWithRetry(async () => {
    if (++attempts < 3) throw new TypeError('Network unavailable');
    return { enabled: false };
  }, new AbortController().signal, fast);
  assert.deepEqual(result, { enabled: false });
  assert.equal(attempts, 3);
});

test('persistent configuration failures fail closed after bounded retries', async () => {
  let attempts = 0;
  await assert.rejects(loadAuthConfigWithRetry(async () => {
    attempts++;
    throw new TypeError('Network unavailable');
  }, new AbortController().signal, fast), /Network unavailable/);
  assert.equal(attempts, 3);
});

test('permanent HTTP failures are not retried', async () => {
  let attempts = 0;
  await assert.rejects(loadAuthConfigWithRetry(async () => {
    attempts++;
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }, new AbortController().signal, fast), /Forbidden/);
  assert.equal(attempts, 1);
});

test('hung requests time out and abort their transport', async () => {
  const signals = [];
  await assert.rejects(loadAuthConfigWithRetry((signal) => {
    signals.push(signal);
    return new Promise(() => {});
  }, new AbortController().signal, { delays: [0, 0], timeoutMs: 5 }), /timed out/);
  assert.equal(signals.length, 2);
  assert.ok(signals.every(signal => signal.aborted));
});

test('unmount cancels pending configuration without another attempt', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const pending = loadAuthConfigWithRetry(async () => {
    attempts++;
    controller.abort(new Error('Unmounted'));
    throw new Error('Network unavailable');
  }, controller.signal, fast);
  await assert.rejects(pending, /Unmounted|Network unavailable/);
  assert.equal(attempts, 1);
});

test('public config does not read credentials or send Authorization; protected requests still do', async () => {
  const originalFetch = globalThis.fetch;
  let tokenReads = 0;
  const requests = [];
  setAuthTokenGetter(() => { tokenReads++; return 'synthetic-test-token'; });
  globalThis.fetch = async (_input, options) => {
    requests.push(options);
    return Response.json({ enabled: false });
  };
  try {
    await customFetch('https://example.test/api/auth/config', { skipAuth: true });
    assert.equal(tokenReads, 0);
    assert.equal(requests[0].headers.has('authorization'), false);
    assert.equal('skipAuth' in requests[0], false);
    await customFetch('https://example.test/api/auth/session');
    assert.equal(tokenReads, 1);
    assert.equal(requests[1].headers.get('authorization'), 'Bearer synthetic-test-token');
  } finally {
    setAuthTokenGetter(null);
    globalThis.fetch = originalFetch;
  }
});
