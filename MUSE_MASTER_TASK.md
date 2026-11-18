# MUSE AI MASTER TASK — AS ANAMUL VOICE backend suite

You are building the separate server-side ecosystem for the Android app **AS ANAMUL VOICE**. The Android source is built by GitHub Actions; this repository is for backend, database, admin panel and browser voice-generator website.

The supplied files are starter scaffolding. Inspect them first, then implement and test the missing production functionality. Do not merely return a plan. Work in small commits and preserve API compatibility with the Android `ApiClient.kt`.

## Brand and links
- App name: AS ANAMUL VOICE
- Theme: dark background with RGB cyan/blue/purple/pink/green neon accents; restrained glow, accessible contrast.
- Telegram: https://t.me/crackffpanel
- Supplied logo asset: `assets/anamul-modz-logo-reference.png`

## Required deliverables
1. Express/Node backend with PostgreSQL migrations, validation, structured errors, authentication, authorization, rate limiting, audit logs and tests.
2. Responsive React admin dashboard.
3. Responsive browser TTS generator website.
4. OpenAPI 3.1 API documentation and `.env.example`.
5. Docker Compose for local development and deployment instructions.
6. Provider adapter interface and at least one provider implementation only after its official API docs and credentials are supplied. Never invent a provider endpoint or credential.
7. Storage adapter for generated audio and user uploads (local development plus S3-compatible production option).

## API compatibility contract
Maintain these Android-facing endpoints:
- `POST /api/app/verify` — `{ key }` -> `{ valid, expiresAt }`
- `POST /api/app/redeem` — `{ key, coupon }` -> redemption result; implement transactionally and prevent reuse.
- `GET /api/app/config` — app config, Telegram URL, update metadata and limits.
- `POST /api/app/tts` — `{ text, voiceId }` -> generation id and playable audio URL; require auth/key and enforce quotas.
- `GET /api/voices` — active public voice catalog.
- `GET /api/app/update` — `{ version, url, releaseNotes }`.

Add routes for:
- user profile and key status;
- voice CRUD and per-user saved voices;
- upload/download audio with ownership checks;
- generation history and status;
- admin user/key/coupon/voice/provider/config/announcement/update management;
- health/readiness checks.

## Admin panel requirements
- Dashboard metrics.
- Users: search, status, expiry, revoke.
- Keys: create, assign, disable, expiry, usage limits.
- Coupons: create, expiry, redemption cap, extension days, audit history.
- Voice profiles: display name, language, provider, provider voice ID, active flag, image URL.
- TTS providers: provider name, base URL/model/voice mapping, enabled flag; secrets stored only server-side and masked in UI.
- TTS settings: max characters, quotas, allowed languages, concurrency.
- Audio: generated files, size, owner, retention/deletion.
- App config, announcements, Telegram link and APK release metadata.
- Audit log and admin role management.

## Generator website requirements
- Login/key validation.
- Bengali and English text input.
- Voice/language selection from `/api/voices`.
- Generate, progress/error states, preview player, download and generation history.
- Never expose provider API keys in browser JavaScript.

## Provider integration
Create a provider-neutral interface, for example `synthesize({ text, voiceId, language, format })`. Store provider credentials in environment variables or a secrets manager. The app owner will provide a legitimate provider and API documentation separately. Until then, return a clear `provider_not_configured` error; do not fake successful audio generation.

## Security and privacy
- Hash access keys/coupons at rest where practical.
- Use secure password hashing for admin accounts and short-lived sessions/JWT with refresh strategy.
- Enforce role-based access control and ownership checks.
- Validate uploads by MIME, extension, size and actual media signature; store outside web root.
- Use HTTPS in production, CORS allowlist, Helmet, rate limits, request-size limits, SQL parameterization, backups and retention controls.
- Never log passwords, raw keys, provider secrets or private audio URLs.

## Explicitly out of scope
Do not implement bypasses or covert injection into another app's private microphone/audio session. The Android app can use supported playback, overlay and device-authorized audio integrations only. Do not promise compatibility with every game/device.

## Definition of done
- `npm test` passes.
- Database migrations run on a clean database.
- Admin and generator build without errors.
- OpenAPI docs match actual routes.
- Android-facing endpoints are integration-tested.
- No placeholder button silently pretends to work.
- Deployment, backup, secrets and API setup are documented.
