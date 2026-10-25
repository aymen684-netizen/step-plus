# English+ — live unauthenticated Access challenge verification
**Date:** 2026-10-25 · **Status:** 12/12 specific anonymous GET requests challenged by Cloudflare Access, including 4 with forged synthetic identity headers. Not full security certification.

## Method
GitHub-hosted runner sent 12 HTTPS GET requests (6 on production, 6 on staging). No cookies, Bearer tokens, body, stored credentials, or trusted Origin. Four additional requests used **synthetic, untrusted** identity claims in request headers, never a real identity. `redirect:'manual'` prevented following login redirects. TLS verification remained enabled. The runner did not read/log response bodies, IP addresses, cookies or redirect query strings. No paid AI calls or data writes.

## Evidence on the reviewed commit
- Source SHA with 12 probes + 14 unit tests: `40b62c6c38e314804ed465ad3df4299878d147d8`
- Successful CI run: https://github.com/aymen684-netizen/step-plus/actions/runs/40224954851
- Offline classifier tests: **14 pass, 0 fail**
- Actual GET results: each returned HTTP **302** with a verified Cloudflare Access challenge:
  - Production: `/health`, `/api/admin/self-test` (GET only), `/api/writing/review` (GET only), `/englishplus-unexpected-route-probe`
  - Staging: `/health`, `/api/auth/status`, `/api/writing/review` (GET only), `/englishplus-unexpected-route-probe`
- Synthetic forged identity headers (`Cf-Access-Authenticated-User-Email`, `X-Forwarded-Email`, `X-Forwarded-User`) on production/staging `/health` and writing GET routes: **4/4 additional HTTP 302 Access challenges**.
- Aggregate exact log text: `HTTP_DENIAL_CHECKS=12/12`.

## Strict attribution rules
- Success **only** for HTTP redirects to `/cdn-cgi/access/*` on the same protected Worker host or to the Cloudflare Access organization hostname retrieved from the connected account: `lingering-bread-cdac.cloudflareaccess.com`.
- Unlike the original classifier, HTTP 401 or 403 is **not accepted as proof that Access ran**: the Worker itself might deny a request if the Access perimeter was bypassed.
- Anonymous HTTP 2xx = security failure; 404 = bypass suspicion (not success); network/DNS/5xx = INCONCLUSIVE. Unknown or unrelated redirects also fail.
- All twelve probes are GET-only. No POST or actual protected business operation executed.

## Why earlier CI attempts failed
Expansion first from four to eight and later eight to twelve probes required matching unit-test expectation updates. Intermediate CI runs failed as expected before the test fixtures were adjusted; only the final **14/14 unit + 12/12 external HTTP** run was accepted. This is a test maintenance issue, not evidence of an Access bypass.

## Controls still unverified
- A genuinely authenticated but **unauthorized** user must be rejected in both environments; the connected account exposed only one registered Access identity (the owner).
- Owner-session endpoint behavior, expiration/revocation, other HTTP methods (especially POST), previews, alternate hostnames, subpaths and policy precedence.
- Live D1 quota concurrency / staging database isolation and financial caps.
- User-data privacy and retention; production readiness for live writing AI.
- Site behavior in Safari iOS / Chrome Android and all session transitions.

## Decision
**Accept this specific anonymous GET perimeter evidence, including synthetic-header spoofing checks. Do not mark full security approval.** Keep staging source mismatch PR #3 open, writing AI disabled and Issue #7's Go/No-Go gate closed for paid calls. No production Worker, Access policy, secret, route, D1 or main branch modification was made by these probes.
