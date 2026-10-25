# English+ — verified external Cloudflare Access perimeter (2026-10-25)

**Evidence scope:** Twelve anonymous GET requests (four include untrusted synthetic spoofed identity headers) **and four anonymous, bodyless POST requests** returned verified HTTP 302 Cloudflare Access login challenges. **Not an authorization certification for real logged-in users.**

## Method and safety limits

A GitHub-hosted Ubuntu runner requested only the exact `workers.dev` hostnames of the known English+ production and staging Workers. All requests used HTTPS/TLS, `redirect: 'manual'`, `credentials: 'omit'`, and an upper time limit. No real credentials, Access cookies, authorization tokens, learner drafts, user identifiers, request bodies or billable AI calls were sent. All POST requests **also omitted Origin and Content-Type**, preventing the current production/staging application handlers from entering a paid writing or admin flow if an Access challenge unexpectedly failed. Never infer security from an application-layer 401/403 alone.

The script logs only a fixed probe ID, HTTP status and classification; it never reads/logs response bodies, authentication redirect query strings, cookies or addresses.

## Verified code and GitHub Actions evidence

- Executable security test SHA: `6f3eb1c3da35bc4f34b8edd4d41b8068f8379bba`
- Successful run: https://github.com/aymen684-netizen/step-plus/actions/runs/40227150532
- **21/21 unit tests pass** (14 GET/classifier tests and seven POST-specific guard tests).
- **GET: 12/12 HTTP 302 challenges** to this Cloudflare account's verified login organization `lingering-bread-cdac.cloudflareaccess.com`.
  - Production: `/health`, `/api/admin/self-test`, `/api/writing/review`, unknown-path GET; two additional GET requests with synthetic identity-spoof headers.
  - Staging: `/health`, `/api/auth/status`, `/api/writing/review`, unknown-path GET; two additional GET requests with synthetic identity-spoof headers.
- **POST: 4/4 HTTP 302 challenges**, no body, no cookies, no Authorization and no Origin:
  - Production: `/api/admin/self-test` and `/api/writing/review`.
  - Staging: `/api/writing/review` and `/api/quota/test`.
- Job log aggregates: `HTTP_DENIAL_CHECKS=12/12`; `ANONYMOUS_POST_ACCESS_CHALLENGES=4/4`.
- Read-only Cloudflare control plane confirmation after these tests: production active Worker version unchanged and `ENABLE_ADMIN_SELF_TEST=false`; staging version unchanged. Read-only D1 query returned **0 usage records / 0 reserved**. The tests did not change Access policies, Worker code/deployments, secrets, D1 records, GitHub main or the production frontend.

## False-positive safeguards

- An accepted redirect must point over HTTPS to `/cdn-cgi/access/*` at **the specific Cloudflare Access organization host** retrieved from the actual account, or at the original protected Worker hostname.
- HTTP 2xx on an anonymous protected path fails the gate.
- HTTP 401/403, 404, unrelated redirects, transport/DNS problems and 5xx **do not pass** an Access-layer verification. These statuses may be application denials, missing paths or network failures.
- A redirected login challenge proves the tested anonymous request was intercepted, **not** that an authenticated-but-unauthorized user is denied or that all hostnames and methods are protected.
- The POST tests send **no request body or credentials**, and therefore cannot prove whether the full authenticated POST workflow is secure.

## Unverified controls / blockers

1. A genuinely signed-in **unauthorized** identity must be denied; the Access user list currently contains only the owner. No test identity was created.
2. A real logged-in owner session and expiration/revocation paths, and authenticated writing POST behavior remain unverified.
3. Alternate hostnames/previews, route precedence and all remaining HTTP methods are not exhaustively covered.
4. Staging source has an incorrect Audience and differs from the currently deployed staging Worker. Draft **PR #3** remains blocked with three failing tests.
5. Live staging Cloudflare D1 concurrent quota reservation and isolation (beyond local SQLite and read-only D1 SQL EXPLAIN), monetary budget controls, privacy retention and provider approval are open.
6. Actual iPhone Safari and Android Chrome are not covered by this perimeter test.

## Decision

**Accept the 16 narrow, explicitly scoped anonymous Access challenges and 21 unit test results.** Preserve **No-Go** for billable AI and public release until remaining gates in [Issue #7](https://github.com/aymen684-netizen/step-plus/issues/7) are verified and signed off. This test and its documentation are on a development branch only.
