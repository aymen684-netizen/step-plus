# English+ — live unauthenticated Access challenge verification
**Date:** 2026-10-25 · **Status:** 8/8 specific anonymous GET requests challenged by Cloudflare Access. Not full security certification.

## Method
GitHub-hosted runner sent 8 HTTPS GET requests (4 on production, 4 on staging). No cookies, Bearer tokens, body, stored credentials, or trusted Origin. `redirect:'manual'` prevented following login redirects. TLS verification remained enabled. The runner did not read/log response bodies, IP addresses, cookies or redirect query strings. No paid AI calls or data writes.

## Evidence on the reviewed commit
- Source SHA with 8 probes + 12 unit tests: `75cd7ed9d909d41869ca6a78fbf83c311583d359`
- Successful CI run: https://github.com/aymen684-netizen/step-plus/actions/runs/40223478653
- Offline classifier tests: **12 pass, 0 fail**
- Actual GET results: each returned HTTP **302** with a verified Cloudflare Access challenge:
  - Production: `/health`, `/api/admin/self-test` (GET only), `/api/writing/review` (GET only), `/englishplus-unexpected-route-probe`
  - Staging: `/health`, `/api/auth/status`, `/api/writing/review` (GET only), `/englishplus-unexpected-route-probe`
- Aggregate exact log text: `HTTP_DENIAL_CHECKS=8/8`.

## Strict attribution rules
- Success **only** for HTTP redirects to `/cdn-cgi/access/*` on the same protected Worker host or to the Cloudflare Access organization hostname retrieved from the connected account: `lingering-bread-cdac.cloudflareaccess.com`.
- Unlike the original classifier, HTTP 401 or 403 is **not accepted as proof that Access ran**: the Worker itself might deny a request if the Access perimeter was bypassed.
- Anonymous HTTP 2xx = security failure; 404 = bypass suspicion (not success); network/DNS/5xx = INCONCLUSIVE. Unknown or unrelated redirects also fail.
- All eight probes are GET-only. No POST or actual protected business operation executed.

## Why earlier CI attempts failed
The expanded probe list initially broke existing unit assertions expecting exactly four probes. CI failed, the test fixture was corrected to expect eight distinct IDs, and only the later **12/12 unit + 8/8 external HTTP** run was accepted. This is a test maintenance issue, not evidence of an Access bypass.

## Controls still unverified
- A genuinely authenticated but **unauthorized** user must be rejected in both environments; the connected account exposed only one registered Access identity (the owner).
- Owner-session endpoint behavior, expiration/revocation, other HTTP methods (especially POST), previews, alternate hostnames, subpaths and policy precedence.
- Live D1 quota concurrency / staging database isolation and financial caps.
- User-data privacy and retention; production readiness for live writing AI.
- Site behavior in Safari iOS / Chrome Android and all session transitions.

## Decision
**Accept this specific anonymous GET perimeter evidence. Do not mark full security approval.** Keep staging source mismatch PR #3 open, writing AI disabled and Issue #7's Go/No-Go gate closed for paid calls. No production Worker, Access policy, secret, route, D1 or main branch modification was made by these probes.
