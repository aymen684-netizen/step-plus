import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Safe, offline checks of the ACTUAL repository Worker. No provider requests,
// Cloudflare credentials, network calls, or production deployment are used.
const workerSource = readFileSync(new URL('../backend/worker.js', import.meta.url), 'utf8');
const ORIGIN = 'https://aymen684-netizen.github.io';
const TEST_TOKEN = 'synthetic-unit-test-token-not-a-secret';

function runtime(overrides = {}) {
  const handlers = [];
  let providerCalls = 0;
  const scope = {
    OPENAI_API_KEY: 'synthetic-key-not-a-real-api-key',
    ADMIN_TEST_TOKEN: TEST_TOKEN,
    ENABLE_ADMIN_SELF_TEST: 'false',
    ...overrides,
    URL,
    Response,
    AbortSignal,
    addEventListener(type, callback) {
      if (type === 'fetch') handlers.push(callback);
    },
    async fetch() {
      providerCalls++;
      throw new Error('Unexpected outbound request in offline safety test');
    }
  };
  runInNewContext(workerSource, scope, {filename: 'backend/worker.js', timeout: 1000});
  assert.equal(handlers.length, 1, 'Worker should register one fetch handler');
  async function dispatch(path, {method = 'GET', origin = ORIGIN, token, body} = {}) {
    const headers = new Headers();
    if (origin !== null) headers.set('Origin', origin);
    if (token !== undefined) headers.set('Authorization', 'Bearer ' + token);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const request = new Request('https://englishplus.test' + path, {
      method, headers, ...(body === undefined ? {} : {body: JSON.stringify(body)})
    });
    let response;
    handlers[0]({request, respondWith(promise) {response = Promise.resolve(promise);}});
    assert.ok(response, 'Worker must call respondWith');
    return await response;
  }
  return {dispatch, providerCalls: () => providerCalls};
}

test('health is setup-required and never calls the provider', async () => {
  const app = runtime();
  const res = await app.dispatch('/health', {origin: null});
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'setup-required');
  assert.equal(data.writingAi, false);
  assert.equal(data.speakingAi, false);
  assert.equal(app.providerCalls(), 0);
});

test('only allowlisted API routes exist', async () => {
  const app = runtime();
  const res = await app.dispatch('/api/unexpected', {method: 'POST'});
  assert.equal(res.status, 404);
  assert.equal(app.providerCalls(), 0);
});

test('untrusted origin cannot invoke administrator route', async () => {
  const app = runtime();
  const res = await app.dispatch('/api/admin/self-test', {
    method: 'POST', origin: 'https://not-our-site.example', token: TEST_TOKEN
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'origin_not_allowed');
  assert.equal(app.providerCalls(), 0);
});

test('missing configured secrets fail closed', async () => {
  const app = runtime({ADMIN_TEST_TOKEN: undefined});
  const res = await app.dispatch('/api/admin/self-test', {method: 'POST'});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'not_enabled');
  assert.equal(app.providerCalls(), 0);
});

test('missing administrator bearer token is rejected', async () => {
  const app = runtime();
  const res = await app.dispatch('/api/admin/self-test', {method: 'POST'});
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'unauthorized');
  assert.equal(app.providerCalls(), 0);
});

test('incorrect bearer token of equal length is rejected', async () => {
  const app = runtime();
  const res = await app.dispatch('/api/admin/self-test', {
    method: 'POST', token: 'x'.repeat(TEST_TOKEN.length)
  });
  assert.equal(res.status, 401);
  assert.equal(app.providerCalls(), 0);
});

test('admin self-test remains disabled even with valid synthetic credentials', async () => {
  const app = runtime();
  const res = await app.dispatch('/api/admin/self-test', {
    method: 'POST', token: TEST_TOKEN
  });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'test_disabled');
  assert.equal(app.providerCalls(), 0);
});

test('writing remains disabled even with valid synthetic credentials and draft', async () => {
  const app = runtime();
  const res = await app.dispatch('/api/writing/review', {
    method: 'POST', token: TEST_TOKEN,
    body: {draft: 'A synthetic draft used only in local unit tests.', stage: 'sentence', level: 'A1'}
  });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'not_enabled');
  assert.equal(app.providerCalls(), 0);
});

test('preflight does not authorize an untrusted website', async () => {
  const app = runtime();
  const res = await app.dispatch('/api/admin/self-test', {
    method: 'OPTIONS', origin: 'https://not-our-site.example'
  });
  assert.equal(res.status, 204);
  assert.notEqual(res.headers.get('access-control-allow-origin'), 'https://not-our-site.example');
  assert.equal(app.providerCalls(), 0);
});

test('preflight for configured frontend does not contact provider', async () => {
  const app = runtime();
  const res = await app.dispatch('/api/admin/self-test', {method: 'OPTIONS'});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(app.providerCalls(), 0);
});

test('writing rejects invalid stage before contacting provider', async () => {
  const app = runtime({ENABLE_WRITING_AI: 'true'});
  const res = await app.dispatch('/api/writing/review', {
    method: 'POST', token: TEST_TOKEN,
    body: {draft: 'This is a harmless synthetic writing test with enough words.', stage: 'not-allowed', level: 'B1'}
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid_input');
  assert.equal(app.providerCalls(), 0);
});

test('writing rejects invalid level before contacting provider', async () => {
  const app = runtime({ENABLE_WRITING_AI: 'true'});
  const res = await app.dispatch('/api/writing/review', {
    method: 'POST', token: TEST_TOKEN,
    body: {draft: 'This is a harmless synthetic writing test with enough words.', stage: 'paragraph', level: 'C9'}
  });
  assert.equal(res.status, 400);
  assert.equal(app.providerCalls(), 0);
});

test('writing rejects short drafts before contacting provider', async () => {
  const app = runtime({ENABLE_WRITING_AI: 'true'});
  const res = await app.dispatch('/api/writing/review', {
    method: 'POST', token: TEST_TOKEN,
    body: {draft: 'Too short.', stage: 'sentence', level: 'A1'}
  });
  assert.equal(res.status, 400);
  assert.equal(app.providerCalls(), 0);
});

test('writing rejects drafts beyond the configured size limit', async () => {
  const app = runtime({ENABLE_WRITING_AI: 'true'});
  const res = await app.dispatch('/api/writing/review', {
    method: 'POST', token: TEST_TOKEN,
    body: {draft: 'a'.repeat(6001), stage: 'paragraph', level: 'B1'}
  });
  assert.equal(res.status, 400);
  assert.equal(app.providerCalls(), 0);
});
