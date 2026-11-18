# AS ANAMUL VOICE — Muse backend suite (completed)

Express + PostgreSQL API, React Admin panel and React TTS Generator website
for the Android app in the `asanamul-voice-connected` repo.

## Connection — how the two ZIPs connect

```
Android app  ── ApiClient.BASE_URL ──►  this backend (or the live one below)
  POST /api/app/verify  {key}            -> {valid, expiresAt}
  POST /api/app/redeem  {key, coupon}    -> {ok, expiresAt}  (transactional)
  GET  /api/app/config                   -> app config + Telegram + update
  GET  /api/voices                      -> active voice catalog
  POST /api/app/tts     {key, text, voiceId} -> {id, audioUrl} (MP3)
  GET  /api/app/update                   -> {version, url, releaseNotes}
  GET  /health  •  GET /files/<id>.mp3
Admin:  GET/POST /api/admin/voices, /api/admin/keys (+revoke),
        POST /api/admin/seed-voices (Voice A = Jessica),
        GET /api/admin/summary, /api/admin/config
```

**Live today:** the Android v2.7.0 APK is wired to the already-live Voice
Master backend `https://asanamul-voice-master.onrender.com` (same keys, same
Jessica TTS, proven). This Postgres backend is the completed Muse server —
deploy it with `render.yaml` (Blueprint), seed voices, create a key in
Admin, set `TTS_API_KEY`, and the app switches over with a one-line
`BASE_URL` change in `ApiClient.kt`.

## What was completed (was starter-only before)

- **TTS adapter** — ElevenLabs, server-side key only (`TTS_API_KEY` env).
  No key → honest `501 provider_not_configured`, never fake audio.
- **Coupon redeem** — real Postgres transaction (`FOR UPDATE` locks,
  usage cap, expiry extension, audit log, rollback on failure).
- **Admin keys** — create (plain key returned once), list, revoke.
- **Seed voices** — `POST /api/admin/seed-voices` adds Voice A (Jessica).
- **Tests** — `npm test` in `backend/` (DB-independent contract checks).
- **Vite configs** — admin + generator now build (`vite.config.js` added).

## Deploy (Render Blueprint)

1. Push this repo to GitHub, Render → New → Blueprint → connect repo.
2. Set `TTS_API_KEY` in the Render dashboard (ElevenLabs key, server only).
3. `POST /api/admin/seed-voices` with the `ADMIN_TOKEN` Render generated.
4. `POST /api/admin/keys` → copy the key once, use it in the app.
5. Point the app's `BASE_URL` at `https://asanamul-voice-muse.onrender.com`.

Honest limits: Render Free sleeps after inactivity (~50s wake); its free
PostgreSQL is a trial — export keys/voices regularly. Never commit `.env`,
API keys, or the keystore.
