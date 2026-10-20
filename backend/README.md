# English+ AI Worker — guarded deployment

Current Cloudflare script: `english-plus-ai` (workers.dev enabled).
Its `OPENAI_API_KEY` binding is verified as `secret_text`; its value has not been read.

## Routes
- `GET /health`: reports setup-required (safe public status; no OpenAI call).
- `POST /api/writing/review`: code for structured formative feedback via Responses API; **returns 503 unless** the server has `ENABLE_WRITING_AI=true`, `ADMIN_TEST_TOKEN` and the OpenAI secret. It also validates origin, bearer token, content type, stage, level and input length. Neither draft nor response is stored by this Worker code.
- No realtime voice connection has been enabled. No voice payloads accepted.

## STOP: Not production-ready
1. Keep `ENABLE_WRITING_AI` absent/off now. Do not make this API public yet.
2. Add real authenticated accounts, backend authorization, atomic per-user / IP rate limits, monetary budget controls, abusive input moderation and a privacy review before setting the flag to true.
3. For an isolated administrator smoke test, generate `ADMIN_TEST_TOKEN` as a strong private secret and add it through Cloudflare's Secret UI. Never commit, transmit in chat, or place it in public frontend JavaScript. A test harness should use a secure local client, not a site-wide public token.
4. Check provider retention policy separately; `store:false` does not establish zero provider retention. No claims of end-to-end zero retention.
5. For speaking, design WebRTC connection with a hard backend 120-second TTL, user consent, topic restrictions and provider-retention verification before public activation.
6. External health URL was not independently confirmed accessible from this environment; Cloudflare API confirmed the deployed Worker exists and the workers.dev binding is enabled.

Do not put the OpenAI key in GitHub Pages. Keep audio recordings and transcripts out of logs and databases.
