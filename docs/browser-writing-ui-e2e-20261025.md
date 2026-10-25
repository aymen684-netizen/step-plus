# English+ writing preview: real-browser QA evidence (2026-10-25)

**Scope:** only the offline writing preview on the `fix/writing-feedback-validation-20261025` development branch. No production deployment, user draft transfer, Cloudflare credentials or OpenAI calls.

## Verification method
- GitHub-hosted Ubuntu runner; Node.js 22 and pinned `@playwright/test@1.64.1` and `@axe-core/playwright@4.14.0`.
- Headless Chromium **and WebKit 27.2**; app served from checked-out repository over **127.0.0.1** using `python3 -m http.server`. No production site loaded.
- Tests block external network requests and fail if the UI calls third-party hosts.
- Synthetic, non-personal text only.
- Tested viewports: desktop 1280×900; mobile 390×844 and 375×844, in both Chromium and WebKit. These simulate display sizes under Linux; they are **not** physical-device Chrome or iOS Safari tests.

## Verified browser behavior (six tests)
1. Desktop preview rendered a formative writing report and rubric values; the draft entered in the textarea did not appear inside preview.
2. 390px mobile preview was usable; no horizontal overflow; synthetic screenshot captured.
3. 375px mobile preview was usable; no horizontal overflow; synthetic screenshot captured.
4. Keyboard Enter activated the preview button.
5. A deliberately malicious-looking `<img onerror>` / `<script>` string remained text, with no element insertion or script execution.
6. Local word-count check operated without claiming AI correction or sending a network request.

## WCAG accessibility audit (three tests per browser engine)
- Added `tests/browser/writing-accessibility.spec.mjs` using locally installed axe-core, without a remote CDN.
- Scanned with WCAG 2.0/2.1/2.2 A/AA tags: initial desktop 1280px, initial mobile 375px, and expanded offline writing report at 390px.
- **No violations were reported within the three scanned page states.** This is not a full audit of all screens, screen readers or physical devices.
- **Current cross-engine CI: 18 tests passed / 0 failed** (9 Chromium plus 9 WebKit): https://github.com/aymen684-netizen/step-plus/actions/runs/40225682251 .

## Actions evidence
- **Initial CI setup FAILED**, because Playwright's web server default working directory was `tests/` and `/ai-studio.html` returned HTTP 404: https://github.com/aymen684-netizen/step-plus/actions/runs/40221516825 . This was a test infrastructure error, not an application defect.
- Fixed server working directory to checkout root and reran: **6 passed / 0 failed**, https://github.com/aymen684-netizen/step-plus/actions/runs/40221680337 .
- Updated the screenshot-upload action to Node 24-based `actions/upload-artifact@v7` to avoid the older action runtime warning, and reran again: **6 passed / 0 failed**, no workflow warnings, https://github.com/aymen684-netizen/step-plus/actions/runs/40221788224 .
- Synthetic mobile screenshots attached: https://github.com/aymen684-netizen/step-plus/actions/runs/40221788224/artifacts/12609564223 .

## Cross-engine Chromium + WebKit evidence
- Playwright projects now run all six functional cases and all three scoped accessibility checks in **each engine** (18 total).
- **Accepted CI proof:** https://github.com/aymen684-netizen/step-plus/actions/runs/40225682251 at code commit `bef99f8e4bbb146e495450a3502b73416228d370`. **18/18 passed, 0 failed**.
- The screenshot path includes engine name to avoid overwriting results. Four synthetic-only mobile screenshots are attached: https://github.com/aymen684-netizen/step-plus/actions/runs/40225682251/artifacts/12611152433 .
- Both engines passed safe literal display of HTML-like student text, desktop/mobile report rendering, keyboard activation and offline no-provider behavior. axe-core reported no detectable A/AA violations in the three audited page states in each engine.
- All external requests were blocked by the test route handler. The tests do not cover real Safari/iOS device security or a live paid AI response.

## Known limitations / remaining gates
- Browser checks cover only the development-only offline preview. They do **not** prove live model feedback, Cloudflare Access security, quota enforcement or production site availability.
- WebKit engine checks have been completed on Linux; still test Safari on **actual iPhone/iPad** and Chrome on a real Android device before broad public release.
- Automated axe WCAG A/AA audit passed for the three selected states. Additional keyboard interactions, RTL/LTR assistive-technology behavior, actual screen readers and full localization still need testing.
- Do not enable paid AI or include a real user draft in the screenshots or CI.
- A separate security blocker remains in PR #3 / Issue #2: staging source Audience mismatch; do not deploy it.
- This QA branch should be reviewed **against PR #5's source branch**, never merged directly into `main` or deployed.
