# English+ Cloudflare Worker (safe setup)

This worker is a deployable **service-status and disabled-API skeleton**. It does not call OpenAI and does not store audio or transcripts.

- GET /health: returns service status
- POST /api/writing/review: 503 until a secure authenticated implementation is deployed
- POST /api/speaking/session: 503 until a secure Realtime implementation is deployed

The public GitHub Pages frontend must never contain standard OpenAI API keys.

## For production, implement in this order
1. Cloudflare Turnstile or identity-based authentication (prefer individual accounts), origin restriction, per-user and IP quotas, and explicit budget ceilings.
2. Add OPENAI_API_KEY via Cloudflare Workers secret manager; do not commit keys to GitHub or send them in chat.
3. Implement writing evaluation with server-side schema validation and structured scoring, and non-storing default. Avoid user draft logs.
4. Review OpenAI data retention and eligibility for a zero-retention arrangement *before* making any zero-retention claims.
5. For voice, set hard 120-second session expiry server side, use browser WebRTC with ephemeral credentials, stop microphone tracks on completion, and perform content and topic safety checks.
6. Do end-to-end iOS microphone tests and security testing before enabling public voice AI.

OpenAI Realtime voice: https://developers.openai.com/api/docs/guides/voice-webrtc

Cloudflare Docs: https://developers.cloudflare.com/workers/
