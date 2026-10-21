# English+ protected Worker — validation checklist

Status: staged source exists at backend/worker-staging.js on feature/english-ai-studio. **Not deployed**. Existing english-plus-ai Worker remains unchanged. No paid AI calls enabled.

## Before deployment
1. In Cloudflare dashboard create a **separate** staging Worker; do not overwrite english-plus-ai.
2. Deploy the reviewed module worker-staging.js without embedding API keys or tokens.
3. Protect the staging Worker with Cloudflare Access, restricted to the approved owner email, and use the staging application's actual AUD in the source (the current AUD belongs to the existing app and will not match a distinct staging Access app).
4. Check authenticated identity via ctx.access.getIdentity() and require exact expected email.
5. Test signed-out/incognito request: it must not reveal any paid API capability. Test authenticated owner and a different email. Failed attempts should return 401/403 or an Access login response.
6. Verify GET /api/auth/status reports authenticated only for the owner and confirms paidAiEnabled=false.
7. Verify POST /api/writing/review and /api/speaking/session return 503 for all users while gated.
8. Add per-user quotas and backend rate limiting **before** implementing paid calls.
9. Add a server-side spend control and monitor billable usage; client-side timers alone cannot cap provider spend.
10. Once validated, enable writing for the owner, run one non-sensitive sample test, then add short-lived realtime credentials using OpenAI's current documented session API.

## Important
- GitHub Pages remains public learning content. The AI backend is private.
- Do not put permanent API keys, owner test tokens, or session credentials in public repo files.
- Access policy alone does not mean an unrelated route/hostname is protected.
- Realtime browser client in src/realtime-voice.js is prototype code and has not been tested end-to-end.
