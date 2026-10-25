# English+ private writing preflight — security and launch gate
**Date:** 2026-10-25 · **Status:** OFFLINE CANDIDATE ONLY — NOT DEPLOYED

This branch adds `backend/private-writing-preflight.mjs`. It is a **new, standalone dry-run Worker candidate**; it does not replace or patch `backend/worker-staging.js` or any deployed Worker. Its only endpoint is `POST /api/writing/preflight`. It **never calls OpenAI** and **cannot grade writing**.

## What the code enforces
- Explicit activation with `STAGING_DRY_RUN_ENABLED=true`. The default is closed (HTTP 503).
- `ctx.access` must exist, its Audience must match `STAGING_ACCESS_AUD`, and its identity must match `STAGING_OWNER_EMAIL`. These staging values are supplied at deployment time and must be verified against the Cloudflare Access staging application; **not** copied from production.
- The identity must expose an opaque `user_uuid`. Only this ID (not the email) is provided to D1's `usage_daily.owner`.
- Browser `Origin` is restricted to `https://aymen684-netizen.github.io`. **CORS is not authentication**; Access is the primary authorization check. Cross-site preflight is denied.
- JSON content type, a strict 12,000-byte streaming body limit, draft length 30–6,000 characters, and exact stage/CEFR-like level allowlists.
- D1 `QUOTAS` is mandatory. A conditional SQL UPSERT reserves a **10/day writing quota**. Quota failure rejects requests with 429, D1 errors with 503. It does not claim an independent monetary budget.
- Drafts, emails, Access identities and response feedback are not echoed, saved or logged by this code; no provider network requests or audio.
- Responses use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

## CI proof
`node --test tests/private-writing-preflight.test.mjs tests/quota.test.mjs` verifies 26 dry-run guard scenarios plus seven existing quota scenarios. In addition, `python3 tests/quota-sqlite-concurrency.py` executes the **exact SQL extracted from `backend/daily-quotas.js`** against an isolated local SQLite database with concurrent submissions: five checks passed for writing caps, speaking caps, multi-owner isolation, day separation, and schema/SQL fidelity. CI: https://github.com/aymen684-netizen/step-plus/actions/runs/40224033370 at SHA `33ddaa0762d97cb0b765c1e37fc9c32de3291c66` (**33/33 Node + 5/5 SQLite**). An initial Python test scheduled submissions lazily; this was corrected to enqueue every concurrent operation before awaiting completion, and only the later passing evidence is counted. **Neither mock D1 nor local SQLite proves Cloudflare D1 concurrency or Access enforcement at the edge.** The first Node CI run had two test-harness mistakes; they were corrected without modifying Worker behavior.

## Read-only actual Cloudflare D1 SQL compatibility check — 25 October
Using the Cloudflare connection to `english-plus-ai-quotas`, I ran a **read-only** `EXPLAIN` for the exact `INSERT ... ON CONFLICT ... WHERE used < ?4 RETURNING used` quota statement with dummy parameters (no statement execution). The Cloudflare D1 query API returned HTTP **200**, inner `success:true`, and **77 VM instruction rows**. `SELECT COUNT(*), COALESCE(SUM(used),0)` returned **0 rows / 0 used before and after**, so this check did not alter D1 usage records. This proves successful parsing/compilation on actual D1, **not** a successful reservation, transactional isolation, or concurrent Cloudflare D1 quota enforcement. Testing real reservations remains a separate, controlled staging gate.

## Mandatory before ANY staging deployment
- [ ] Independent code review against this document and all 33 CI assertions.
- [ ] Confirm the actual staging application Access Audience and a separate staging hostname; production Audience must not be used.
- [ ] Validate no script routes, secrets, D1 IDs or access policies are changed unintentionally.
- [ ] Confirm the staging D1 database is isolated from any production learner data.
- [ ] Do not enable any dry-run flag until the environment and rollback version are documented.
- [x] Anonymous GET proof on **eight selected protected paths**: HTTP 302 Access challenges from the exact account login host, via [PR #8](https://github.com/aymen684-netizen/step-plus/pull/8) / [CI](https://github.com/aymen684-netizen/step-plus/actions/runs/40223478653).
- [ ] An authenticated but **unauthorized identity** and non-GET methods are still unverified. A successful owner policy test and anonymous GET alone are insufficient.
- [ ] Browser test on mobile and desktop: CORS, Access login flow, handling of 403/413/429/503 and session expiry.
- [ ] Confirm D1 quota reservations atomically under **real concurrent staging requests**, read-only checks first and controlled synthetic writes only with approval.
- [ ] Record version/commit SHA, CI run, logs (excluding request bodies) and rollback plan.

## Separate gates before real OpenAI writing requests
- [ ] Implement user/session-scoped authentication, instead of sharing an administrator bearer token.
- [ ] Verify server-side per-user and IP abuse controls, budgets / spend caps and cost alerts.
- [ ] Verify contract parsing, input safety, privacy notices and provider retention.
- [ ] Obtain a separate explicit approval for a narrowly scoped, budgeted real test; never enable paid AI as a side effect of this dry run.

## Known open issues
- Staging source drift and the incorrect Access Audience in `backend/worker-staging.js`: see [Issue #2](https://github.com/aymen684-netizen/step-plus/issues/2) and [draft PR #3](https://github.com/aymen684-netizen/step-plus/pull/3); this branch does not change either.
- [Draft PR #5](https://github.com/aymen684-netizen/step-plus/pull/5) holds the safer backend feedback validation and offline UI preview; this branch does not enable its features in production.
