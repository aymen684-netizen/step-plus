# English+ writing preview: real-browser QA evidence (2026-10-25)

**Scope:** only the offline writing preview on the `fix/writing-feedback-validation-20261025` development branch. No production deployment, user draft transfer, Cloudflare credentials or OpenAI calls.

## Verification method
- GitHub-hosted Ubuntu runner; Node.js 22 and pinned `@playwright/test@1.64.1`.
- Headless Chromium; app served from checked-out repository over **127.0.0.1** using `python3 -m http.server`. No production site loaded.
- Tests block external network requests and fail if the UI calls third-party hosts.
- Synthetic, non-personal text only.
- Tested viewports: desktop 1280×900; mobile 390×844 and 375×844. These simulate dimensions in Chromium; they are **not** physical-device Chrome or iOS Safari tests.

## Verified browser behavior (six tests)
1. Desktop preview rendered a formative writing report and rubric values; the draft entered in the textarea did not appear inside preview.
2. 390px mobile preview was usable; no horizontal overflow; synthetic screenshot captured.
3. 375px mobile preview was usable; no horizontal overflow; synthetic screenshot captured.
4. Keyboard Enter activated the preview button.
5. A deliberately malicious-looking `<img onerror>` / `<script>` string remained text, with no element insertion or script execution.
6. Local word-count check operated without claiming AI correction or sending a network request.

## Actions evidence
- **Initial CI setup FAILED**, because Playwright's web server default working directory was `tests/` and `/ai-studio.html` returned HTTP 404: https://github.com/aymen684-netizen/step-plus/actions/runs/40221516825 . This was a test infrastructure error, not an application defect.
- Fixed server working directory to checkout root and reran: **6 passed / 0 failed**, https://github.com/aymen684-netizen/step-plus/actions/runs/40221680337 .
- Updated the screenshot-upload action to Node 24-based `actions/upload-artifact@v7` to avoid the older action runtime warning, and reran again: **6 passed / 0 failed**, no workflow warnings, https://github.com/aymen684-netizen/step-plus/actions/runs/40221788224 .
- Synthetic mobile screenshots attached: https://github.com/aymen684-netizen/step-plus/actions/runs/40221788224/artifacts/12609564223 .

## Known limitations / remaining gates
- Browser checks cover only the development-only offline preview. They do **not** prove live model feedback, Cloudflare Access security, quota enforcement or production site availability.
- Test iPhone Safari and Android Chrome on actual devices or corresponding browser engines before broad public release.
- Add automated accessibility audit, small-screen keyboard behavior, localization and RTL/LTR text wrapping checks.
- Do not enable paid AI or include a real user draft in the screenshots or CI.
- A separate security blocker remains in PR #3 / Issue #2: staging source Audience mismatch; do not deploy it.
- This QA branch should be reviewed **against PR #5's source branch**, never merged directly into `main` or deployed.
