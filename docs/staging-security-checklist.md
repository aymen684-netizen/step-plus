# English+ protected staging Worker — QA validation register

**Updated: 2026-10-26.** This page supersedes the earlier "Not deployed" notice. Only `english-plus-ai-staging` was updated. Production `english-plus-ai` remains on its prior deployment. **Paid AI remains disabled**; this staging source has no OpenAI provider call or OpenAI secret.

## Exact staging deployment and rollback

| Item | Verified value |
|---|---|
| GitHub review branch | `fix/staging-access-aud-tests-20261024` (draft PR #3) |
| Deployed source file | `backend/worker-staging.js` |
| Deployed GitHub source blob | `fa940d0444bffd7834cee03e8ee4065bdf2c169b` |
| New Cloudflare version | `a587f5fc-c55e-4802-ae46-6cfa47bec677` (version 6) |
| New staging deployment | `12067d70-1af8-4c1c-a1ce-ec6b86a51367` |
| Previous version for rollback | `5c7d590e-26b4-4b50-b01c-9aac9746988b` (version 5) |
| Previous staging deployment | `f3c78a00-b136-463e-bd9f-3d577d12fad1` |
| Production deployment unchanged | `223df417-640a-4904-a37c-fa5be0b93364` |
| D1 binding | `QUOTAS` → `english-plus-ai-quotas`, unchanged |
| Staging preview URLs | Disabled; no alternate preview route enabled |

Actual deployed script was fetched from Cloudflare and verified to contain the exact reviewed GitHub source. Cloudflare Access staging application Audience and owner-only allow policy were read and unchanged. The staging Worker has **zero secret bindings**; production still has its own separately stored secrets. Production does **not** have the `QUOTAS` D1 binding.

### Evidence accepted on 26 October 2026

- **24/24 local Node tests passed, 0 failed** on PR #3: [CI run 40348826629](https://github.com/aymen684-netizen/step-plus/actions/runs/40348826629). These cover quota mocks, staging identity rejection, known paths and fail-closed routing, and intentionally disabled paid services.
- **Anonymous live HTTP perimeter tested before and after staging deployment:** six bodyless/no-cookie/no-token probes, four GET and two POST, each received HTTP **302** to the expected Cloudflare Access login route. [CI run 40348811739](https://github.com/aymen684-netizen/step-plus/actions/runs/40348811739), initial and rerun attempt 2. Only probe ID, status and classification were logged.
- **Read-only D1 count:** `usage_daily` contained **0 rows and 0 reserved usage** at the verification instant after rollout. No D1 writes were executed by this QA step; a count is not proof of transactional isolation or future guarantees.
- **Cloudflare control plane:** staging deployment version changed only to version 6; production deployment remained unchanged. Staging D1 binding, Access Audience/policy, and preview restrictions remained unchanged.

### Tests still NOT complete

- [ ] Real signed-in owner request to `GET /api/auth/status` must return HTTP 200 with `paidAiEnabled:false`. Offline mocks are not live session proof.
- [ ] Real signed-in but unauthorized identity must be denied by Cloudflare Access and the Worker; do not use a forged email header or a mock to claim this passed.
- [ ] Real authenticated owner `POST /api/writing/review` and `POST /api/speaking/session` must return **503** while paid AI is off. The anonymous POST probes proved a **302 Access challenge**, not this application-level contract.
- [ ] Review any alternate custom host/route and authenticated session expiry or revocation for unauthorized access. The verified probes cover only the exact staging workers.dev host and selected methods.
- [ ] Prove real Cloudflare D1 quota reservation limits and concurrency on isolated, controlled synthetic records; existing Node mocks and read-only SQL checks are insufficient.
- [ ] Review user/session authentication, abuse limits, server-side spend controls/kill switch, privacy/retention and written approval before enabling any paid OpenAI request.
- [ ] Test physical Safari on iPhone, Android Chrome and actual assistive technologies; automated localhost WebKit/Chromium tests are not substitutes.

### Stop and rollback conditions

If unauthorized access is confirmed, a protected route unexpectedly returns HTTP 2xx without login, quota data changes unexpectedly, or privacy/cost controls fail, **disable further staging testing immediately**. Use the Cloudflare staged deployment interface to restore previous **version 5** (`5c7d590e-26b4-4b50-b01c-9aac9746988b`) at 100%, then verify the actual active deployment ID/version, prior D1 binding, Access policies and production version. **Do not use version rollback as a substitute for removing compromised credentials** (none were introduced in this deployment).

## Important security boundaries

- GitHub Pages is public learning material; the AI backend is private.
- A valid CORS Origin alone is **not authentication**. Authentication must be enforced at the edge and in Worker code.
- Permanent keys, owner tokens, user drafts and session credentials must not be added to GitHub or test logs.
- The staging Worker neither grades writing nor invokes OpenAI. Passing its tests does not authorize public release or any paid AI calls.
- `src/realtime-voice.js` remains prototype code, not end-to-end security validated.

**Decision: staging source/deployment parity is verified; broader authenticated Access and launch readiness are still NO-GO.**
