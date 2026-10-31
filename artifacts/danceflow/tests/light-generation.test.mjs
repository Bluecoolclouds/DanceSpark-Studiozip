import assert from 'node:assert/strict';
import test from 'node:test';
import { launchLightGeneration, lightDraftBlocker, validatePhotoPayload, lightRejectionReason } from '../lib/light-generation.ts';

const draft = {
  id: 'light-draft-123', templateId: 'dance-one', photoUri: 'file:///one.jpg',
  duration: 5, createdAt: 1, model: 'object-swap', resolution: '720p',
  sourceVideoUri: 'https://example.invalid/original.mp4',
  templateSnapshot: { videoUri: 'https://example.invalid/original.mp4' },
  referenceImageUris: ['photo-one', 'photo-two'], prompt: '  keep spacing  ',
};
const input = {
  clientRequestId: draft.id, templateId: draft.templateId,
  model: 'higgsfield/genjutsu-light/object-swap/v1.0',
  resolution: draft.resolution, photos: ['first', 'second'], prompt: draft.prompt,
};

function setup(overrides = {}) {
  const updates = [];
  const submissions = [];
  const options = {
    ownerId: 'owner-a', draft: { ...draft }, active: () => true,
    prepare: async () => input,
    persist: async value => { updates.push(value); return true; },
    submit: async value => { submissions.push(value); return { requestId: 'job-123', status: 'queued' }; },
    ...overrides,
  };
  return { options, updates, submissions };
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test('nothing starts without an explicit call, then exact ordered payload is submitted once', async () => {
  const s = setup();
  assert.equal(s.submissions.length, 0);
  await launchLightGeneration(s.options);
  assert.deepEqual(s.submissions, [input]);
  assert.deepEqual(s.updates.map(u => u.generationStatus), ['uploading', 'submitting', 'queued']);
  assert.equal(s.updates[1].lightSubmissionStarted, true);
});

test('double tap across components is single-flight', async () => {
  const wait = deferred();
  const s = setup({ prepare: async () => { await wait.promise; return input; } });
  const first = launchLightGeneration(s.options);
  await launchLightGeneration(s.options);
  wait.resolve();
  await first;
  assert.equal(s.submissions.length, 1);
});

test('photo preparation failure never calls paid submit', async () => {
  const s = setup({ prepare: async () => { throw new Error('Фото недоступно'); } });
  await launchLightGeneration(s.options);
  assert.equal(s.submissions.length, 0);
  assert.equal(s.updates.at(-1).generationStatus, 'failed');
  assert.equal(s.updates.some(u => u.lightSubmissionStarted), false);
});

test('unavailable durable storage blocks paid submit before and after preparation', async () => {
  for (const failAt of [1, 2]) {
    let saves = 0;
    const s = setup({ persist: async () => ++saves !== failAt });
    await launchLightGeneration(s.options);
    assert.equal(s.submissions.length, 0);
  }
});

test('missing acknowledgement is unknown, and reopening cannot re-submit', async () => {
  const s = setup({ submit: async () => { throw new TypeError('network failure'); } });
  await launchLightGeneration(s.options);
  assert.equal(s.updates.at(-1).generationStatus, 'unknown');
  assert.equal(s.updates.some(u => u.lightSubmissionStarted === false), false);
  const reopened = setup({ draft: { ...draft, ...Object.assign({}, ...s.updates) } });
  await launchLightGeneration(reopened.options);
  assert.equal(reopened.submissions.length, 0);
});

test('account transition while preparing prevents any paid request', async () => {
  const wait = deferred();
  let active = true;
  const s = setup({ active: () => active, prepare: async () => { await wait.promise; return input; } });
  const run = launchLightGeneration(s.options);
  active = false;
  wait.resolve();
  await run;
  assert.equal(s.submissions.length, 0);
});

test('late accepted job does not write into the next account', async () => {
  const wait = deferred();
  let active = true;
  const s = setup({
    active: () => active,
    submit: async () => { active = false; await wait.promise; return { requestId: 'private-job', status: 'queued' }; },
  });
  const run = launchLightGeneration(s.options);
  wait.resolve();
  await run;
  assert.equal(s.updates.some(u => u.generationRequestId === 'private-job'), false);
});

test('custom sources require server validation and never become a different catalogue input', () => {
  assert.equal(lightDraftBlocker(draft), null);
  for (const sourceVideoUri of ['file:///my-video.mp4', 'blob:picker', 'https://example.invalid/preview.mp4']) {
    const custom = { ...draft, sourceVideoUri };
    assert.match(lightDraftBlocker(custom), /проверь и загрузи своё видео/);
    assert.equal(lightDraftBlocker({ ...custom, lightSourceVideoId: 'server-video-id' }), null);
  }
  assert.match(lightDraftBlocker({ ...draft, templateSnapshot: undefined }), /проверь и загрузи своё видео/);
  assert.match(lightDraftBlocker({ ...draft, model: undefined }), /старом черновике/);
});

test('custom paid submission contains the server source ID and no device URI', async () => {
  const sourceId = 'server-owned-video-id';
  const s = setup({
    draft: { ...draft, sourceVideoUri: 'file:///private/source.mp4', lightSourceVideoId: sourceId },
    prepare: async () => ({
      clientRequestId: draft.id, sourceVideoId: sourceId,
      model: 'higgsfield/genjutsu-light/object-swap/v1.0', resolution: '720p',
      photos: ['first'], prompt: draft.prompt,
    }),
  });
  await launchLightGeneration(s.options);
  assert.deepEqual(s.submissions[0], {
    clientRequestId: draft.id, sourceVideoId: sourceId,
    model: 'higgsfield/genjutsu-light/object-swap/v1.0', resolution: '720p',
    photos: ['first'], prompt: draft.prompt,
  });
  assert.doesNotMatch(JSON.stringify(s.submissions[0]), /file:|blob:|example\.invalid/);
});

test('total photo limit and allowed inline formats are checked before submission', () => {
  validatePhotoPayload(['data:image/jpeg;base64,/9j/AA==', 'data:image/png;base64,iVBORw==']);
  assert.throws(() => validatePhotoPayload(['file:///one.jpg']), /формате/);
  assert.throws(() => validatePhotoPayload([]), /от 1 до 8/);
  assert.throws(() => validatePhotoPayload(Array(9).fill('data:image/jpeg;base64,/9j/AA==')), /от 1 до 8/);
  assert.throws(() => validatePhotoPayload(['data:image/jpeg;base64,' + 'AAAA'.repeat(4194305)]), /12 МБ/);
});

test('known server rejections explain the issue without exposing raw errors or enabling resubmission', () => {
  assert.match(lightRejectionReason({ data: { code: 'subscription_required' } }), /оплаченная подписка/);
  assert.match(lightRejectionReason({ data: { code: 'generation_paused' } }), /приостановлена/);
  assert.match(lightRejectionReason({ data: { code: 'light_pricing_not_configured' } }), /оценка расходов/);
  assert.doesNotMatch(lightRejectionReason(new Error('provider private credentials')), /private|credentials/);
});
