import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(__dirname, '..', 'audio');
fs.mkdirSync(AUDIO_DIR, { recursive: true });

// Apply the schema on boot: Render's Postgres starts empty and there is no
// separate migration runner, so the server creates its own tables
// (CREATE TABLE IF NOT EXISTS — safe to run on every start).
try {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    await pool.query(fs.readFileSync(schemaPath, 'utf8'));
    console.log('DB schema applied');
  }
} catch (e) { console.error('DB schema apply failed:', e.message); }

app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174').split(',') }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: true, legacyHeaders: false }));

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const publicBase = () => (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const admin = (req, res, next) => {
  if (!process.env.ADMIN_TOKEN || req.header('authorization') !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
};
const audit = async (actor, action, details) => {
  try { await pool.query('INSERT INTO audit_logs(actor,action,details) VALUES($1,$2,$3)', [actor, action, details || {}]); } catch { /* audit must never break the request */ }
};

/** Verify a raw access key; returns the DB row or null. */
async function findKey(key) {
  if (!key) return null;
  const q = await pool.query('SELECT id,status,expires_at FROM access_keys WHERE key_hash=$1', [hash(key)]);
  const row = q.rows[0];
  if (!row || row.status !== 'active') return null;
  if (row.expires_at && new Date(row.expires_at) <= new Date()) return null;
  return row;
}
function keyFromReq(req) {
  return String(req.body?.key || '').trim() ||
    String(req.header('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, service: 'as-anamul-voice-api' }); }
  catch { res.status(503).json({ ok: false }); }
});

// Generated audio files (MP3 only, no directory traversal).
app.get('/files/:name', (req, res) => {
  const name = path.basename(String(req.params.name || ''));
  if (!/^[A-Za-z0-9_-]+\.mp3$/.test(name)) return res.status(400).json({ error: 'bad_file' });
  const f = path.join(AUDIO_DIR, name);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'not_found' });
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(f).pipe(res);
});

// --- Android-facing contract (see API_CONTRACT.md) ---
app.post('/api/app/verify', async (req, res) => {
  const key = String(req.body?.key || '');
  if (!key) return res.status(400).json({ error: 'key_required' });
  try {
    const q = await pool.query('SELECT status,expires_at FROM access_keys WHERE key_hash=$1', [hash(key)]);
    const row = q.rows[0];
    const valid = !!row && row.status === 'active' && (!row.expires_at || new Date(row.expires_at) > new Date());
    res.json({ valid, expiresAt: row?.expires_at || null });
  } catch { res.status(500).json({ error: 'database_error' }); }
});

app.post('/api/app/redeem', async (req, res) => {
  const code = String(req.body?.coupon || '').trim();
  const key = String(req.body?.key || '').trim();
  if (!code || !key) return res.status(400).json({ error: 'coupon_and_key_required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cq = await client.query(
      'SELECT id,days,max_uses,used_count,active FROM coupons WHERE code_hash=$1 FOR UPDATE', [hash(code)]);
    const cp = cq.rows[0];
    if (!cp || !cp.active || cp.used_count >= cp.max_uses) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'invalid_coupon' });
    }
    const kq = await client.query(
      'SELECT id,status,expires_at FROM access_keys WHERE key_hash=$1 FOR UPDATE', [hash(key)]);
    const k = kq.rows[0];
    if (!k || k.status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'invalid_key' });
    }
    const upd = await client.query(
      `UPDATE access_keys SET expires_at = GREATEST(COALESCE(expires_at, now()), now()) + ($1 || ' days')::interval
       WHERE id=$2 RETURNING expires_at`, [String(cp.days), k.id]);
    await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id=$1', [cp.id]);
    await client.query('INSERT INTO audit_logs(actor,action,details) VALUES($1,$2,$3)',
      ['app', 'coupon_redeem', { coupon_id: cp.id, key_id: k.id, days: cp.days }]);
    await client.query('COMMIT');
    res.json({ ok: true, expiresAt: upd.rows[0].expires_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
    res.status(500).json({ error: 'database_error' });
  } finally { client.release(); }
});

app.get('/api/app/config', async (_req, res) => {
  try {
    const q = await pool.query('SELECT key,value FROM app_config');
    const config = Object.fromEntries(q.rows.map((r) => [r.key, r.value]));
    res.json({
      appName: 'AS ANAMUL VOICE',
      telegramUrl: process.env.TELEGRAM_URL || 'https://t.me/crackffpanel',
      update: { version: process.env.APK_VERSION || '2.7.0', url: process.env.APK_URL || '', releaseNotes: process.env.RELEASE_NOTES || '' },
      config,
    });
  } catch { res.status(500).json({ error: 'database_error' }); }
});

app.get('/api/voices', async (_req, res) => {
  try {
    const q = await pool.query('SELECT id,name,language,provider FROM voices WHERE active=true ORDER BY name');
    res.json(q.rows);
  } catch { res.status(500).json({ error: 'database_error' }); }
});

// --- TTS provider adapter (ElevenLabs, server-side only) ---
// The provider key lives in TTS_API_KEY env only; it is never sent to the app.
// Until it is set, this endpoint honestly returns provider_not_configured.
const TTS_MODELS = new Set(['eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5']);
app.post('/api/app/tts', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const voiceId = String(req.body?.voiceId || req.body?.voice_id || '').trim();
  if (!text || !voiceId) return res.status(400).json({ error: 'text_and_voice_required' });
  if (text.length > 3000) return res.status(413).json({ error: 'text_too_long' });
  // Key check is optional here on purpose: the Android app as supplied
  // sends {text, voiceId} with no key field (its key gate is the Home
  // screen's /api/app/verify). If a key IS supplied, it must be valid.
  const suppliedKey = keyFromReq(req);
  if (suppliedKey) {
    let keyRow;
    try { keyRow = await findKey(suppliedKey); } catch { return res.status(500).json({ error: 'database_error' }); }
    if (!keyRow) return res.status(401).json({ error: 'invalid_key' });
  }
  if (!process.env.TTS_API_KEY) {
    return res.status(501).json({ error: 'provider_not_configured', message: 'Set TTS_API_KEY on the server first.' });
  }
  let voice;
  try {
    const q = await pool.query('SELECT provider_voice_id FROM voices WHERE id=$1 AND active=true', [voiceId]);
    voice = q.rows[0];
  } catch { return res.status(500).json({ error: 'database_error' }); }
  // voiceId may also be a raw provider voice id (admin profiles use it directly).
  const providerVoiceId = voice?.provider_voice_id || (/^[A-Za-z0-9_-]{5,100}$/.test(voiceId) ? voiceId : null);
  if (!providerVoiceId) return res.status(400).json({ error: 'voice_not_found' });
  const model = TTS_MODELS.has(String(process.env.TTS_MODEL_ID || '')) ? process.env.TTS_MODEL_ID : 'eleven_multilingual_v2';
  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(providerVoiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': process.env.TTS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.78, style: 0.15, use_speaker_boost: true } }),
        signal: AbortSignal.timeout(90000),
      });
    if (!upstream.ok) {
      const err = upstream.status === 401 || upstream.status === 403 ? 'provider_auth_failed'
        : upstream.status === 402 ? 'provider_quota'
        : upstream.status === 429 ? 'provider_rate_limited' : 'tts_provider_error';
      return res.status(502).json({ error: err, provider_status: upstream.status });
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    if (!audio.length) return res.status(502).json({ error: 'empty_audio' });
    const file = `${crypto.randomBytes(12).toString('hex')}.mp3`;
    fs.writeFileSync(path.join(AUDIO_DIR, file), audio);
    const audioUrl = `${publicBase()}/files/${file}`;
    const g = await pool.query(
      'INSERT INTO generations(voice_id,text_chars,status,audio_url) VALUES($1,$2,$3,$4) RETURNING id',
      [voiceId, text.length, 'done', audioUrl]);
    res.json({ id: String(g.rows[0].id), audioUrl, voiceId });
  } catch {
    res.status(502).json({ error: 'tts_request_failed', message: 'Could not reach the voice provider. Try again later.' });
  }
});

app.get('/api/app/update', (_req, res) => res.json({
  version: process.env.APK_VERSION || '2.7.0',
  url: process.env.APK_URL || '',
  releaseNotes: process.env.RELEASE_NOTES || '',
}));

// --- Admin ---
app.get('/api/admin/summary', admin, async (_req, res) => {
  try {
    const [u, v, g] = await Promise.all([
      pool.query('SELECT count(*) FROM users'),
      pool.query('SELECT count(*) FROM voices'),
      pool.query('SELECT count(*) FROM generations'),
    ]);
    res.json({ users: +u.rows[0].count, voices: +v.rows[0].count, generations: +g.rows[0].count });
  } catch { res.status(500).json({ error: 'database_error' }); }
});

app.get('/api/admin/voices', admin, async (_req, res) => {
  const q = await pool.query('SELECT * FROM voices ORDER BY created_at DESC');
  res.json(q.rows);
});
app.post('/api/admin/voices', admin, async (req, res) => {
  const { id, name, language = 'bn', provider, providerVoiceId } = req.body || {};
  if (!id || !name || !provider || !providerVoiceId) return res.status(400).json({ error: 'missing_fields' });
  try {
    await pool.query('INSERT INTO voices(id,name,language,provider,provider_voice_id) VALUES($1,$2,$3,$4,$5)',
      [id, name, language, provider, providerVoiceId]);
    res.status(201).json({ ok: true });
  } catch { res.status(409).json({ error: 'voice_create_failed' }); }
});

// Seed Voice A (Jessica, female, ElevenLabs premade) — the proven default.
app.post('/api/admin/seed-voices', admin, async (_req, res) => {
  try {
    await pool.query(
      `INSERT INTO voices(id,name,language,provider,provider_voice_id) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      ['voice-a', 'Voice A', 'bn', 'ElevenLabs', 'cgSgspJ2msm6clMCkdW9']);
    await audit('admin', 'seed_voices', { id: 'voice-a' });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'database_error' }); }
});

// Keys: the plain key is returned ONCE here — Admin must copy it now.
app.post('/api/admin/keys', admin, async (req, res) => {
  const days = Math.max(1, Math.min(365, Number(req.body?.days || 30)));
  const plain = `ANM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  try {
    const q = await pool.query(
      `INSERT INTO access_keys(key_hash,expires_at,status) VALUES($1, now() + ($2 || ' days')::interval, 'active')
       RETURNING id,expires_at`, [hash(plain), String(days)]);
    await audit('admin', 'key_create', { key_id: q.rows[0].id, days });
    res.status(201).json({ id: q.rows[0].id, key: plain, expiresAt: q.rows[0].expires_at });
  } catch { res.status(500).json({ error: 'database_error' }); }
});
app.get('/api/admin/keys', admin, async (_req, res) => {
  const q = await pool.query('SELECT id,expires_at,status,created_at FROM access_keys ORDER BY created_at DESC LIMIT 200');
  res.json(q.rows);
});
app.post('/api/admin/keys/:id/revoke', admin, async (req, res) => {
  await pool.query("UPDATE access_keys SET status='revoked' WHERE id=$1", [req.params.id]);
  await audit('admin', 'key_revoke', { key_id: req.params.id });
  res.json({ ok: true });
});

app.get('/api/admin/config', admin, async (_req, res) => {
  const q = await pool.query('SELECT key,value FROM app_config');
  res.json(Object.fromEntries(q.rows.map((r) => [r.key, r.value])));
});
app.put('/api/admin/config/:key', admin, async (req, res) => {
  await pool.query(
    'INSERT INTO app_config(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=now()',
    [req.params.key, JSON.stringify(req.body?.value ?? null)]);
  res.json({ ok: true });
});

export { app, pool };
const port = Number(process.env.PORT || 8080);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`AS ANAMUL VOICE API listening on ${port}`));
}
