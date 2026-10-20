# English+ — AI integration handoff (20 Oct 2026)

## Current verified state
- GitHub Pages frontend in `index.html`, with STEP course in `academy.html`.
- Cloudflare Worker `english-plus-ai` exists.
- Worker has `OPENAI_API_KEY` and `ADMIN_TEST_TOKEN` secret bindings; do not reveal or commit their values.
- `/api/writing/review` exists but returns 503 unless `ENABLE_WRITING_AI=true`; that flag was not among visible Worker bindings.
- `/api/admin/self-test` is also separately gated.
- No realtime audio/session route in the inspected Worker.
- The health response is currently hard-coded setup-required; it is not an actual upstream health check.

## Target — private use first
1. Keep public learning content on GitHub Pages.
2. Authenticate the single owner with secure server-validated access before any paid AI request. An origin check alone is NOT authentication.
3. Writing: subject/task, level, submitted draft -> compact Arabic feedback, rubric, specific corrections, improved version, retry suggestion. Implement request limits, safe output parsing, and clear AI-approximate scoring.
4. Speaking: 2, 3, or 5 minute real-time **voice-to-voice** sessions over WebRTC. Topics selected from an allowlist; system instructions must constrain discussion to the selected safe educational topic and learning level. Create a short-lived Realtime client credential **only** after owner authentication, server-side rate limits and budget checks. Never return the permanent API key to the browser.
5. Browser should prompt for microphone permission; stop microphone tracks and close peer connection at timer expiry or manual end. Don't record or store audio by default. Show consent notice.
6. End-of-session feedback on fluency, grammar and vocabulary; only score pronunciation if valid audio evidence can support it. Inform learner this is formative, not an official CEFR score.
7. Add budget guardrails and audit metadata without recording student voice/drafts; staged enablement and end-to-end checks before public release.

## Safety / deployment gates
- Do NOT turn on writing or realtime AI just because an API key exists.
- Do NOT expose `ADMIN_TEST_TOKEN` or `OPENAI_API_KEY` in public HTML, GitHub Pages, repository history, client storage, query strings or URLs.
- Do NOT use GitHub Actions Secrets as a live frontend API backend.
- Keep existing Worker stable until a staged replacement has been tested.
- Before publishing to everyone: user accounts, per-user quotas, moderation, abuse controls, billing caps, privacy notice, data retention decisions.

## Next implementation sequence
A. Set up private authenticated endpoint with a small quota.
B. Enable and test writing with a non-sensitive sample after billing approval.
C. Add `POST /api/speaking/session` returning an ephemeral credential, configured for an allowlisted topic and level, max session length 5 minutes.
D. Implement microphone/WebRTC frontend with explicit mic consent, reliable cleanup and visible countdown.
E. Verify on mobile (Safari + Chrome), and only then enable wider access.
