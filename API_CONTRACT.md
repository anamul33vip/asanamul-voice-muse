# Android ↔ Backend API contract

Base URL: HTTPS deployment URL, configured in Android `ApiClient.kt`.

| Method | Path | Request | Purpose |
|---|---|---|---|
| POST | `/api/app/verify` | `{ "key": "..." }` | Verify access key |
| POST | `/api/app/redeem` | `{ "key": "...", "coupon": "..." }` | Redeem coupon / extend validity |
| GET | `/api/app/config` | — | Remote config, limits, Telegram and update info |
| GET | `/api/voices` | — | Active voice catalog |
| POST | `/api/app/tts` | `{ "text": "...", "voiceId": "..." }` | Generate speech |
| GET | `/api/app/update` | — | Latest version metadata |

All protected endpoints must authenticate the user/key. TTS credentials remain server-side. Return structured JSON errors such as `{ "error": "provider_not_configured" }` rather than fake success.
