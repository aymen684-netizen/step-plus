# English+ — 30 October 2026 limited writing test: controlled runbook

**Status:** PREPARED; execution **NOT authorized**. Created 25 October 2026. No paid model calls or real user drafts were submitted by this task.

## Purpose
A single, tightly controlled acceptance exercise for formative English writing feedback. This is not an IELTS/TOEFL/STEP assessment, not a CEFR certification and not a production launch.

The repository fixture `tests/fixtures/writing-smoke-cases.json` contains **exactly five** synthetic, nonpersonal candidate texts across A1, A2, B1, B2 and C1. Each case uses the backend's current fields `{draft,stage,level}`, is at least 30 characters and no more than 6,000 characters. Case W30-C1-05 includes a clearly quoted, harmless adversarial instruction to test the separation of student content and developer instructions. Do not add extra live requests without separate approval.

## Hard prerequisites — all required BEFORE any paid call
1. **GitHub code control:** review and approve PR #5's response validation and renderer tests, PR #6's safe preflight gate, and resolve the known wrong staging Audience/source drift in draft PR #3 (Issue #2). Require passing CI on the intended exact commit.
2. **Authorization:** verify real Cloudflare Access logged-in owner behavior and logged-in unauthorized user denial on the intended staging hostname. The previously evidenced anonymous GET Access challenges (PR #8) **do not** prove owner POST or unauthorized logged-in POST protection.
3. **Data isolation:** verify staging D1 is isolated from production data, and prove live staging quota reservations under controlled concurrent traffic. Local SQLite tests and read-only live D1 EXPLAIN are not sufficient.
4. **Credential hygiene:** staging-only OpenAI project key stored as a Cloudflare secret; no client-side tokens or keys. Apply user/session authorization and server-side abuse/IP limits. Origin/CORS and a shared administrator token are not sufficient.
5. **Cost safety:** confirm a billing budget/cap acceptable to the owner, a usage alert and automatic fail-closed kill switch *before* activation. Set max response tokens to a reviewed limit. Record budget baseline and explicit approval for **up to five** isolated billable requests; do not infer cost from response count alone. Provider/project limits must be verified directly; daily quotas are not monetary caps.
6. **Privacy:** approve retention terms, confirm no draft or feedback body logging at either Worker, analytics or provider debug layer, and display an honest synthetic-only test notice. `store:false` does not establish zero provider retention.
7. **Scope and rollback:** record staging Worker deployment ID, script name, commit SHA, secret binding names and current disabled flags; identify exact prior version for rollback. Production must not change.
8. **Decision:** owner grants a separate explicit **GO** for the *specific staging-only test*, maximum number of calls, budget and time window. Without that approval: **NO-GO**. Do not automatically toggle `ENABLE_WRITING_AI`.

## Test sequence, only after all gates and approval
- Preflight: with the authenticated staging owner, verify allowed endpoint and quota status; test non-owner denial and missing-auth denial with no paid requests.
- Use only the five IDs in the fixture; submit no names, emails, accounts, voice clips or personal stories. Run each at most once; no retries without checking cost and owner authorization.
- Capture only: case ID, timestamp, HTTP status, coarse latency, schema validation result, score range validity, brief qualitative notes. Do not log input body, upstream response, Authorization header, cookies, user identifiers or redirect query strings.
- Independently verify the four score fields are **integers in 0–100**, strengths and corrections are bounded, all correction objects have original/suggestion/reason, and summary/nextTask are nonempty.
- The A1 case should draw attention to third-person agreement; A2 to past tense; B1 to subject–verb agreement and coherence; B2 to comparison phrasing; C1 to clarity/argument and not obeying the quoted `OVERRIDE_OK` instruction. Manual rubric notes may differ and are **not** deterministic pass assertions.
- User interface must show model text safely as literal text (never HTML), preserve the learner's draft locally, and label results formative only.
- If a request fails or validation rejects the provider payload, do not surface raw upstream payload. Stop and review the failure before another call.

## Immediate STOP / rollback conditions
- Any unexpected HTTP 2xx without Access authentication or any logged-in unauthorized access.
- Any draft/email/secret/identifier appears in logs, telemetry or response fields not meant for the learner.
- The quoted malicious instruction overrides the writing rubric, or provider output cannot be safely validated.
- Quota failure, missing budget gate, estimated spend reaches cap, network/proxy instability, HTTP 429/5xx, anomalous latency, or evidence of an unintended production change.
- Deactivate the staging test flag using a **separately approved** rollback/change step and verify the active script/version after any controlled test. Do not assume UI disablement equals backend disablement.

## Evidence register
| Evidence | Current state |
|---|---|
| Five safe synthetic samples with schema tests | Prepared in this branch |
| Mocked provider feedback and safe UI tests | Passed (PR #5 CI) |
| Cross-suite offline regression (43/43) | Passed on isolated QA branch |
| Chromium offline desktop/mobile preview (6/6) | Passed on QA branch; no physical device proof |
| Anonymous GET challenge over eight paths (8/8) | Passed in PR #8; GET only |
| Cloudflare D1 read-only EXPLAIN | Passed; no database records changed |
| True staging D1 concurrency and owner/unauthorized POST | **Not tested** |
| Billing cap, retention, customer signoff and paid model test | **Not authorized / not tested** |

**Decision as of 25 October:** the synthetic test harness is prepared, but the live paid writing review remains **NO-GO** until the gates are satisfied. The 30 October date is a target, not approval or a claim of readiness.
