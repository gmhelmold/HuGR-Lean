# HL-WP3.3 — Python/pytest Profiles Adversarial Review 01

**Issue:** #31 — Python/pytest profile family  
**Date:** 2026-09-26  
**Disposition:** PASS after findings incorporated

## Review objective

Attempt to make the pytest reducer overmatch unsupported versions, lose failure/error evidence, emit unsupported complete totals, or inherit donor rewrite assumptions.

## Supported behavior

v1 supports native text from:

- `pytest ...`;
- `python -m pytest ...`;
- `python3 -m pytest ...`.

The profile requires complete input and an exited process.

For a successful session, the reducer preserves the single final pytest summary.

For sessions with failed tests or setup/collection errors, the reducer preserves one verbatim suffix from the first `FAILURES`/`ERRORS` section through the final summary. This keeps traceback bodies, test IDs, short-summary FAILED/ERROR rows, and final counts without reconstructing diagnostic text.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| PYTEST-F01 | Critical | Donor tooling could tempt HuGR-Lean to inject `-q`, `--tb=short`, JSON/reporting flags, or otherwise rewrite execution. | Profile is `native_text`; no pytest flags are injected or required by HuGR-Lean. Fixtures cover naturally occurring default/quiet shapes. |
| PYTEST-F02 | High | A summary-like line anywhere in traceback text could be mistaken for the final session result. | Parser requires exactly one recognized pytest summary and requires it to be the final non-empty line. Multiple/concatenated sessions are passthrough. |
| PYTEST-F03 | Critical | Failure totals could be emitted while losing test IDs or traceback bodies. | For fail/error sessions, preservation starts at the first FAILURES/ERRORS section and continues verbatim through short-summary evidence; summary is a separate required signal. |
| PYTEST-F04 | High | Reported failed/error counts could disagree with preserved short-summary FAILED/ERROR rows. | Shape guard requires exact equality between failed+error totals and recognized short-summary failure/error rows. |
| PYTEST-F05 | Critical | Host exit status could contradict the pytest summary. | Success summaries require exit code 0; supported failed/error summaries require exit code 1. Contradiction fails open during analysis. |
| PYTEST-F06 | High | Complete totals could be emitted from truncated or unknown-termination input. | Profile uses COMPLETE_EXITED. Truncated and unknown termination fixtures fail open before analysis. |
| PYTEST-F07 | High | Version drift could be compressed by optimistic parsing. | Unrecognized final summary grammar is passthrough; concatenated sessions are passthrough. Real pytest 7.4.3 and synthetic pytest 8.x fixtures prove supported version shapes. |
| PYTEST-F08 | Medium | Bare trailing CR could be treated as a line ending and accidentally admitted. | CR is stripped only as part of CRLF. A bare CR in the final summary fails shape recognition and remains passthrough. |
| PYTEST-F09 | Medium | `python -m unittest` or generic Python diagnostics could be absorbed into pytest by executable similarity. | Recognition is structurally limited to `pytest` or Python executable with exact `-m pytest`; unittest is passthrough. |
| PYTEST-F10 | Medium | Already-minimal pytest output could be expanded or rewritten merely to claim filtering. | Existing non-expansion guard wins; already-minimal summary-only output remains passthrough. |
| PYTEST-F11 | Medium | Version evidence could rely only on an inferred donor version. | Added real default-output donor fixture with explicit `pytest-7.4.3` header plus a synthetic pytest 8.x version fixture. |
| PYTEST-F12 | Medium | Donor fixture reuse could leave provenance ambiguous. | Exact TRS paths, pin, MIT license, and HuGR destinations are recorded; no TRS parser/runtime code is copied. |

## Donor provenance

Fixture bytes are copied from:

~~~text
dPeluChe/trs@0175ae73f36709fd4a9242b2e431d026d6f82bb3
~~~

Paths:

- `tests/fixture_data/pytest_real_quiet.txt`;
- `tests/fixture_data/pytest_with_error.txt`;
- `tests/fixture_data/pytest_with_xfail.txt`;
- `tests/fixture_data/pytest_real_default.txt`.

License: MIT. Existing notice is retained at `docs/provenance/licenses/TRS-MIT.txt`.

The HuGR-Lean pytest profile is newly authored TypeScript.

## Verification evidence

Fixture corpus includes:

- pytest 7.4.3 real default failure output;
- real quiet failure output;
- real setup-error output;
- real xfail/xpass/skipped success output;
- synthetic pytest 8.x success output;
- truncated input;
- unknown termination;
- malformed/version-drift summary.

Direct adversarial tests additionally cover:

- `pytest`, `pytest -q`, `python -m pytest`, `python3 -m pytest` recognition;
- unittest exclusion;
- summary/exit contradiction;
- failed-count/short-summary mismatch;
- concatenated sessions;
- bare trailing carriage return;
- already-minimal non-expansion behavior.

Final reviewed branch CI before this review:

- run `36217859583` — PASS;
- strict typecheck — PASS;
- **67 Node tests passed, 0 failed**;
- build/declaration emit — PASS;
- package dry-run — PASS;
- package size ~30.6 kB.

## Scope resolution

- native pytest success summary — SUPPORTED;
- native pytest fail/error sessions with standard sections + short summary — SUPPORTED;
- pytest 7.4.3 default/quiet shapes — SUPPORTED by donor fixtures;
- pytest 8.x documented shape — SUPPORTED by synthetic version fixture;
- xfail/xpass/skipped complete success summary — SUPPORTED;
- truncated/unknown termination — FAIL OPEN;
- multiple concatenated sessions — DEFERRED / passthrough;
- unknown summary/version shapes — DEFERRED / passthrough;
- `unittest` — OUT OF SCOPE / passthrough;
- generic Python diagnostics/tooling — DEFERRED until independently justified.

## Final disposition

**PASS**

No unresolved Critical/High finding remains in #31 scope.
