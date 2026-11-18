import test from 'node:test';
import assert from 'node:assert/strict';

// DB-independent contract checks: no DATABASE_URL here, so /health must
// honestly report 503 instead of pretending the database is up.
process.env.NODE_ENV = 'test';
const { app } = await import('../src/server.js');
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => new Promise((res) => server.close(res)));

test('update endpoint returns the current app version', async () => {
  const r = await fetch(`${base}/api/app/update`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.version, '2.7.0');
});

test('verify requires a key', async () => {
  const r = await fetch(`${base}/api/app/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'key_required');
});

test('tts validates input before touching the provider', async () => {
  const r = await fetch(`${base}/api/app/tts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '', voiceId: '' }),
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'text_and_voice_required');
});

test('admin routes require the admin token', async () => {
  const r = await fetch(`${base}/api/admin/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 401);
});

test('audio download rejects non-MP3 / bad file names', async () => {
  const r = await fetch(`${base}/files/not-an-mp3.txt`);
  assert.equal(r.status, 400);
});

test('health reports database down when there is no database', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).ok, false);
});
