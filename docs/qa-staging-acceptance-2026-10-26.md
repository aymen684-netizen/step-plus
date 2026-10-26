# English+ — Staging operational QA acceptance register

**Date:** 2026-10-26 (Asia/Riyadh)  
**Scope:** `english-plus-ai-staging` only, draft [PR #3](https://github.com/aymen684-netizen/step-plus/pull/3).  
**Decision:** The staging source parity and anonymous perimeter gates passed. **End-to-end authentication and public/paid release remain NO-GO.**  
**Statuses:** `ناجح` / `فاشل` / `لم يُختبر` / `معطل`. Only evidence-backed passes are marked successful.

| ID | Date | Inputs / procedure | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| QA-026-18 | 2026-10-26 | GitHub staging Worker Audience vs staging Access application | Staging-specific Audience, never production Audience | Matching staging Audience in reviewed source and live Access app | ناجح | [PR #3](https://github.com/aymen684-netizen/step-plus/pull/3); source blob `fa940d0444bffd7834cee03e8ee4065bdf2c169b` |
| QA-026-19 | 2026-10-26 | Synthetic quota, authenticated/unauthenticated, disabled API and CORS Node tests | All pass on reviewed source | 24/24 pass, 0 fail | ناجح | [CI 40348826629](https://github.com/aymen684-netizen/step-plus/actions/runs/40348826629) |
| QA-026-20 | 2026-10-26 | Before rollout: four anonymous GET requests on exact staging host, no cookies or tokens | Four Access login challenges, HTTP 302 | 4/4 HTTP 302, verified login destination | ناجح | [CI 40348811739, attempt 1](https://github.com/aymen684-netizen/step-plus/actions/runs/40348811739/attempts/1) |
| QA-026-21 | 2026-10-26 | Before rollout: two anonymous bodyless POST requests | Two Access login challenges, HTTP 302 | 2/2 HTTP 302 | ناجح | [CI 40348811739, attempt 1](https://github.com/aymen684-netizen/step-plus/actions/runs/40348811739/attempts/1) |
| QA-026-22 | 2026-10-26 | Upload reviewed code as inactive version 6, check D1, then deploy to staging only | Exact source active, D1 binding unchanged, no paid secrets | Cloudflare API readback includes exact reviewed source; staging version 6 active; D1 binding unchanged, no staging secrets | ناجح | Cloudflare GET Worker source/version/settings; version `a587f5fc-c55e-4802-ae46-6cfa47bec677`; deployment `12067d70-1af8-4c1c-a1ce-ec6b86a51367` |
| QA-026-23 | 2026-10-26 | After rollout: same four anonymous GET requests | Four Access login challenges, HTTP 302 | 4/4 HTTP 302 | ناجح | [CI 40348811739, attempt 2](https://github.com/aymen684-netizen/step-plus/actions/runs/40348811739/attempts/2) |
| QA-026-24 | 2026-10-26 | After rollout: same two bodyless POST requests | Two Access login challenges, HTTP 302 | 2/2 HTTP 302 | ناجح | [CI 40348811739, attempt 2](https://github.com/aymen684-netizen/step-plus/actions/runs/40348811739/attempts/2) |
| QA-026-25 | 2026-10-26 | Compare production deployment and bindings before/after staging rollout | Production completely unchanged | Production deployment `223df417-640a-4904-a37c-fa5be0b93364` unchanged; no production D1 quota binding | ناجح | Cloudflare GET production deployments/settings |
| QA-026-26 | 2026-10-26 | Read-only D1 `SELECT COUNT(*), SUM(used)` on `usage_daily` | No synthetic reservations from these tests | 0 rows, 0 used at verification time | ناجح | Cloudflare D1 read-only query API HTTP 200 |
| QA-026-27 | 2026-10-26 | **Real signed-in owner** `GET /api/auth/status` | HTTP 200 with `authenticated:true`, `owner:true`, `paidAiEnabled:false` | No signed-in live request performed | لم يُختبر | None |
| QA-026-28 | 2026-10-26 | **Real signed-in unauthorized account** accesses protected host | Access or Worker denies; no protected data | Not executed; no alternate signed-in identity available via this QA connection | معطل | None |
| QA-026-29 | 2026-10-26 | **Real signed-in owner**, bodyless POST to `/api/writing/review` and `/api/speaking/session` | Worker HTTP 503; no paid provider call | Only mocked Worker responses and anonymous edge challenges verified | لم يُختبر | None for signed-in live result |
| QA-026-30 | 2026-10-26 | Controlled synthetic concurrent writes to actual staging D1 | Atomic per-user quota; production data unaffected | No live writes permitted or executed; tests limited to mock/SQLite/read-only D1 | معطل | Requires scoped synthetic-write approval |
| QA-026-31 | 2026-10-26 | Live paid AI writing request to a budgeted staging endpoint | Correct feedback within hard cost/usage limits | Paid AI intentionally disabled and not authorized | معطل | No provider request attempted |
| QA-026-32 | 2026-10-26 | Real iPhone Safari and Android Chrome including accessibility | Full controls usable and accessible | Only emulated Chromium/WebKit tested in [PR #10](https://github.com/aymen684-netizen/step-plus/pull/10) | لم يُختبر | None for physical devices |

## Authorized operator steps for remaining read-only/auth checks

1. In the actual browser, visit `https://english-plus-ai-staging.aymen684.workers.dev/api/auth/status`, complete Cloudflare Access login as the approved owner, and confirm the JSON output. Record timestamp, HTTP status, the three Boolean fields and a redacted screenshot. **Never copy a JWT, authentication cookie, OTP or redirected login query string into GitHub or chat.**
2. From the same first-party staging origin and approved owner session, send **bodyless** POST to `/api/writing/review` and `/api/speaking/session`. Expected application-level HTTP 503 with `ai_disabled_pending_usage_limits`; **do not** submit any draft, tokens or personal data. Any 2xx must halt testing immediately.
3. Using an *independently signed-in but unauthorized* test identity in a fresh browser profile, attempt `/api/auth/status`. It must be denied by Access or Worker and reveal no authenticated owner payload. If no such identity is available, keep QA-026-28 `معطل`; **never fabricate this test using an email header**.
4. Before testing expiration/revocation or adding controlled D1 writes, separately approve the scope, rate, synthetic identifiers, rollback and data cleanup. No paid AI or production writes are authorized here.

## Stop criteria / rollback

Stop and rollback staging if anonymous or unauthorized callers receive protected HTTP 2xx, if paid AI becomes enabled, or if unexpected D1 changes/secret exposure appear. The prior staging version is `5c7d590e-26b4-4b50-b01c-9aac9746988b`; rollback requires a separately verified deployment at 100% and a follow-up anonymous perimeter test. The production Worker was not part of this rollout.

**No-Go remains in force for public launch or paid provider integration until the owner/non-owner live-session, quota-isolation, cost and privacy gates are complete.**
