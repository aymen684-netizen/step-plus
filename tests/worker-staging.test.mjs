// Run with: node --test tests/worker-staging.test.mjs (Node.js 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../backend/worker-staging.js', import.meta.url), 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const origin = 'https://aymen684-netizen.github.io';
const owner = 'aymen684@gmail.com';
const aud = '0dbb2f48add6b4973115ffb89fb3c1e98aa7bdc5726c13272211fbdb1b3d6a1f';
const request = (path, method = 'GET', from = origin) => new Request('https://staging.example.test' + path, {
  method, headers: { Origin: from, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }
});
const access = (email = owner, audience = aud) => ({
  access: { aud: audience, async getIdentity() { return { email }; } }
});
async function call(path, method, context, from = origin) {
  const response = await worker.fetch(request(path, method, from), {}, context);
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test('missing Access context fails closed', async () => {
  const r = await call('/api/auth/status', 'GET', {});
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'access_required');
});
test('wrong Access audience fails closed', async () => {
  const r = await call('/api/auth/status', 'GET', access(owner, 'wrong'));
  assert.equal(r.status, 403);
});
test('different identity cannot use owner route', async () => {
  const r = await call('/api/auth/status', 'GET', access('other@example.test'));
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'owner_only');
});
test('identity lookup error fails closed', async () => {
  const r = await call('/api/auth/status', 'GET', {
    access: { aud, async getIdentity() { throw new Error('unavailable'); } }
  });
  assert.equal(r.status, 403);
});
test('owner status explicitly states paid AI disabled', async () => {
  const r = await call('/api/auth/status', 'GET', access());
  assert.equal(r.status, 200);
  assert.equal(r.body.paidAiEnabled, false);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
for (const route of ['/api/writing/review', '/api/speaking/session']) {
  test(route + ' remains disabled even for owner', async () => {
    const r = await call(route, 'POST', access());
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'ai_disabled_pending_usage_limits');
  });
}
test('untrusted origin does not receive CORS permission', async () => {
  const r = await call('/health', 'GET', access(), 'https://untrusted.example.test');
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});
test('untrusted preflight is denied', async () => {
  const r = await worker.fetch(request('/api/writing/review', 'OPTIONS', 'https://untrusted.example.test'), {}, {});
  assert.equal(r.status, 403);
});
