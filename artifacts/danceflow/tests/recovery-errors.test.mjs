import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveryError } from '../lib/recovery-errors.ts';

test('network and unknown provider errors do not leak raw messages', () => {
  for (const error of [null, undefined, new Error('private provider details'), { code: 'unknown', message: 'account@example.test exists' }]) {
    assert.match(recoveryError(error), /Проверь подключение/);
    assert.doesNotMatch(recoveryError(error), /private|example\.test/);
  }
});

test('Clerk returned error envelopes and direct errors are translated', () => {
  assert.match(recoveryError({ errors: [{ code: 'form_code_incorrect' }] }), /Код не подошёл/);
  assert.match(recoveryError({ code: 'verification_expired' }), /истёк/);
  assert.match(recoveryError({ code: 'form_password_pwned' }), /надёжный пароль/);
  assert.match(recoveryError({ code: 'form_identifier_not_found' }), /Если регистрировались через Google/);
  assert.match(recoveryError({ code: 'factor_not_found' }), /Если регистрировались через Google/);
  assert.match(recoveryError({ code: 'form_identifier_invalid' }), /формат электронной почты/);
});

test('rate limiting and exhausted codes advise waiting rather than retrying', () => {
  for (const error of [{ status: 429 }, { code: 'too_many_requests' }, { errors: [{ code: 'verification_max_attempts_reached' }] }]) {
    assert.match(recoveryError(error), /Подожди несколько минут/);
  }
});

test('expired sign-in attempts require starting over', () => {
  assert.match(recoveryError({ code: 'resource_not_found' }), /Начни заново/);
  assert.match(recoveryError({ code: 'session_expired' }), /Начни заново/);
});
