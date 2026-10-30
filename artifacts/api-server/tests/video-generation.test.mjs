import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  submitDanceVideo,
  getDanceVideoStatus,
  VideoProviderNotConfiguredError,
} from "../src/lib/video-generation.ts";

// Dummy credentials and HTTP stubs only: no provider requests or paid generations.
const credentials = "unit-test-id:unit-test-secret";
const photo = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(100)]).toString("base64")}`;
const input = { imageDataUrl: photo, styleId: "bubblegum-rush", duration: 5 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const uploadHandle = {
  upload_url: "https://storage.example.test/signed-upload",
  public_url: "https://cdn.example.test/photo.jpg",
  upload_headers: { "Content-Type": "image/jpeg", "x-amz-tagging": "retention=temporary" },
};

beforeEach(() => { process.env.higgs_api = credentials; });

function stub(t, responses) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    const response = responses.shift();
    assert.ok(response, "Unexpected extra provider request");
    if (response instanceof Error) throw response;
    return response;
  });
  return calls;
}

test("missing or malformed credentials fail before any network request", async (t) => {
  const calls = stub(t, []);
  delete process.env.higgs_api;
  await assert.rejects(submitDanceVideo(input), VideoProviderNotConfiguredError);
  process.env.higgs_api = "only-one-part";
  await assert.rejects(submitDanceVideo(input), /ID:secret/);
  assert.equal(calls.length, 0);
});

for (const duration of [5, 10, 15]) {
  test(`uploads photo and submits a real ${duration}s PixVerse request`, async (t) => {
    const calls = stub(t, [
      json(uploadHandle),
      new Response(null, { status: 200 }),
      json({ status: "queued", request_id: "request-123" }),
    ]);
    assert.deepEqual(await submitDanceVideo({ ...input, duration }), { requestId: "request-123" });
    assert.equal(calls[0].url, "https://api.higgsfield.ai/files/generate-upload-url");
    assert.deepEqual(JSON.parse(calls[0].init.body), { content_type: "image/jpeg" });
    assert.equal(calls[1].url, uploadHandle.upload_url);
    assert.equal(calls[1].init.method, "PUT");
    assert.deepEqual(calls[1].init.headers, uploadHandle.upload_headers);
    assert.equal(calls[1].init.headers.Authorization, undefined);
    assert.equal(await calls[1].init.body.arrayBuffer().then((b) => b.byteLength), 103);
    assert.equal(calls[2].url, "https://api.higgsfield.ai/pixverse/v6/image-to-video");
    assert.equal(calls[2].init.headers.Authorization, `Key ${credentials}`);
    assert.match(calls[2].init.headers["Idempotency-Key"], /^[a-f0-9-]{36}$/);
    assert.equal(calls[2].init.redirect, "error");
    const body = JSON.parse(calls[2].init.body);
    assert.equal(body.duration, duration);
    assert.equal(body.image_url, uploadHandle.public_url);
    assert.equal(body.resolution, "720p");
    assert.equal(body.generate_audio, false);
    assert.match(body.prompt, /K-pop/);
    assert.equal(calls.length, 3);
  });
}

for (const [providerStatus, status] of [
  ["queued", "queued"], ["in_progress", "processing"],
  ["failed", "failed"], ["nsfw", "failed"], ["canceled", "failed"],
]) {
  test(`maps Higgsfield ${providerStatus} honestly to ${status}`, async (t) => {
    const calls = stub(t, [json({ status: providerStatus })]);
    const result = await getDanceVideoStatus("request-123");
    assert.equal(result.status, status);
    assert.equal(result.videoUrl, null);
    assert.equal(result.queuePosition, null);
    assert.equal(Boolean(result.error), status === "failed");
    assert.equal(calls[0].url, "https://api.higgsfield.ai/requests/request-123/status");
  });
}

test("completed result exposes the actual provider video URL", async (t) => {
  stub(t, [json({ status: "completed", video: { url: "https://cdn.example.test/dance.mp4" } })]);
  const result = await getDanceVideoStatus("request-123");
  assert.equal(result.status, "completed");
  assert.equal(result.videoUrl, "https://cdn.example.test/dance.mp4");
});

for (const [status, message] of [[401, /не принял ключ/], [402, /Недостаточно средств/], [429, /Лимит запросов/]]) {
  test(`provider HTTP ${status} produces a safe localized error`, async (t) => {
    stub(t, [json({ detail: "Do not expose provider details" }, status)]);
    await assert.rejects(getDanceVideoStatus("request-123"), message);
  });
}

test("failed upload does not submit a billable generation", async (t) => {
  const calls = stub(t, [json(uploadHandle), new Response(null, { status: 403 })]);
  await assert.rejects(submitDanceVideo(input), /загрузить фото/);
  assert.equal(calls.length, 2);
});

test("unsafe upload headers are rejected instead of forwarding credentials", async (t) => {
  const calls = stub(t, [json({ ...uploadHandle, upload_headers: { Authorization: "unexpected" } })]);
  await assert.rejects(submitDanceVideo(input), /параметры загрузки/);
  assert.equal(calls.length, 1);
});

test("unknown state or missing/unsafe output remains an error, not a fake completion", async (t) => {
  stub(t, [
    json({ status: "unknown" }),
    json({ status: "completed" }),
    json({ status: "completed", video: { url: "http://unsafe.example.test/video" } }),
  ]);
  await assert.rejects(getDanceVideoStatus("request-123"), /Неизвестный статус/);
  await assert.rejects(getDanceVideoStatus("request-123"), /некорректный ответ/);
  await assert.rejects(getDanceVideoStatus("request-123"), /ссылку/);
});

test("ambiguous submission timeout warns about duplicates and never retries automatically", async (t) => {
  const calls = stub(t, [json(uploadHandle), new Response(null), new Error("Timeout")]);
  await assert.rejects(submitDanceVideo(input), /не оплатить дубликат/);
  assert.equal(calls.length, 3);
});

test("invalid images and request IDs are rejected without network requests", async (t) => {
  const calls = stub(t, []);
  await assert.rejects(submitDanceVideo({ ...input, imageDataUrl: "not-an-image" }), /JPG/);
  await assert.rejects(submitDanceVideo({ ...input, imageDataUrl: "data:image/png;base64,YmFk" }), /прочитать фото/);
  await assert.rejects(getDanceVideoStatus("../another-path"), /номер запроса/);
  assert.equal(calls.length, 0);
});
