# English+ — anonymous HTTP Access denial verification (2026-10-25)

**Status:** Verified for four specific unauthenticated GET requests. **Not** a full penetration test or authorization certification.

## Why this test exists
The previous execution environment could not resolve the `workers.dev` hostnames, so local requests were blocked at DNS. To obtain independent real HTTP evidence, we ran four GET probes from a GitHub Actions Ubuntu runner with no cookies, tokens, browser session or request body. Redirect following was disabled; TLS validation remained enabled. The script does not read response bodies or print login redirect query strings.

## Immutable evidence
- Current tested source commit: `5e0d052ba167b723b9ef406c931d2aaca596579e`
- Current successful GitHub Actions: https://github.com/aymen684-netizen/step-plus/actions/runs/40221059008
- Initial proof: https://github.com/aymen684-netizen/step-plus/actions/runs/40220690186
- Offline classification tests: **11 passed / 0 failed**
- Live unauthenticated request results from the job logs:
  - `production-health` — `GET /health` → HTTP **302** Cloudflare Access challenge
  - `production-admin-get` — `GET /api/admin/self-test` → HTTP **302** Cloudflare Access challenge
  - `staging-health` — `GET /health` → HTTP **302** Cloudflare Access challenge
  - `staging-auth-status` — `GET /api/auth/status` → HTTP **302** Cloudflare Access challenge
  - Aggregate: **HTTP_DENIAL_CHECKS=4/4**

## Test assertions / no false positives
- 200–299 from an unauthenticated route is a security failure.
- 404 is suspicious / unprotected routing, not a passed Access denial test.
- HTTP 5xx and DNS or transport failures are INCONCLUSIVE, not successful denial.
- 301/302/303/307/308 count only if directed to **this account's verified Access organization hostname** `lingering-bread-cdac.cloudflareaccess.com` on a `/cdn-cgi/access/*` path, or to `/cdn-cgi/access/*` on the exact Worker hostname. The organization hostname was retrieved from Cloudflare's connected account; redirects to other Cloudflare Access tenants are rejected.
- HTTP 401/403 indicates denial but not specific proof that Cloudflare Access was the denying layer.
- In the first attempt to tighten the redirect assertion, CI failed before the updated unit fixture was committed; that intermediate state was not accepted. The later HEAD run passed **11/11 local checks and 4/4 live challenges**.
- Redirect URLs, cookies, Access tokens, IP addresses, user identities, request or response bodies and bearer credentials are never stored in these test logs.

## Remaining tests (NOT verified)
- An actually signed-in but unauthorized user must be denied on both environments. The Cloudflare Access user list currently contains only the owner, so there was no independent unauthorized identity for this test.
- Actual owner authenticated session flows, expiration and strict endpoint authorization.
- Alternate hostnames/routes, other HTTP methods, rate-limits, bypasses and account-wide rulesets.
- Real staging D1 write concurrency, data isolation and monetary caps.
- Protected production/admin POST semantics are **not tested** by these GET probes.
- Browser mobile/desktop CORS and session behavior.

## Release/control recommendation
Keep PR #3 (wrong staging Audience source) **blocked** until source and CI pass. Keep paid writing AI disabled until Issue #7's Go/No-Go gates are met. No change was made to the Workers, secrets, Access policies, D1 data or production branch by this HTTP test.
