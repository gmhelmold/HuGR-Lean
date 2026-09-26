# HL-WP3.2 — Cargo/rustc Profiles Adversarial Review 01

**Issue:** #30 — Cargo/rustc output profiles (TypeScript)  
**Date:** 2026-09-25  
**Disposition:** PASS after findings incorporated

## Review objective

Attempt to make the first production profile family lose diagnostics, misread version drift, inherit donor rewrite assumptions, or overclaim coverage.

Reviewed surfaces:

- native `cargo test` parsing;
- native `cargo build` / rustc diagnostic preservation;
- Complete/Exited requirements;
- summary/exit consistency;
- multi-suite behavior;
- compile-error-before-tests behavior;
- message-format overrides;
- UTF-8 byte spans;
- donor fixture provenance/licensing;
- clippy support boundary.

## Supported behavior

### cargo-test

Supported only for one complete native libtest-style suite with exactly one final canonical `test result:` summary.

On failure the profile preserves every recognized `---- ... stdout ----` failure block verbatim plus the final summary. On success it preserves the final summary. Passing rows and harness chatter may be removed.

### cargo-build

Supported only for complete native text output with rustc-style textual diagnostics. The reducer preserves one verbatim suffix from the first error/warning diagnostic through the boundary end, removing only earlier Cargo compile chatter.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| CARGO-F01 | Critical | Donor implementations could tempt HuGR-Lean to rely on JSON/message-format rewrites. | Profiles declare `native_text`; any `--message-format` override is rejected from these profiles. No command rewrite/injection exists. |
| CARGO-F02 | High | A final summary line alone was too weak a native-shape proof. | `cargo-test` additionally requires a `running N test(s)` marker and exactly one canonical final summary. |
| CARGO-F03 | Critical | Multiple Cargo/libtest suites could be collapsed to only the last summary, losing earlier suite evidence. | v1 rejects multiple `test result:` summaries entirely; workspace/doc-test aggregation is deferred until fixture-backed. |
| CARGO-F04 | High | A syntactically valid summary could contradict its own failed count. | `ok` requires failed-count 0; `FAILED` requires failed-count >0. Contradictory summaries do not match. |
| CARGO-F05 | Critical | Text summary and host exit code could disagree, making failure state ambiguous. | After requirements, `cargo-test` analysis verifies summary status against exit code; contradiction fails open. |
| CARGO-F06 | High | Reported failed-count could differ from recognized failure blocks. | Failed count must exactly equal preserved failure-block count or the profile does not match. |
| CARGO-F07 | High | Cargo test compilation failure can occur before libtest emits a summary. | Such output is explicitly unsupported by `cargo-test` and remains exact passthrough; no tail guessing is used. |
| CARGO-F08 | High | `cargo-build` could reduce warning-only text even when the host exit was non-zero, obscuring failure. | Diagnostic class is checked against exit status: error-bearing output requires non-zero exit; warning-only output requires zero exit. Contradiction fails open. |
| CARGO-F09 | High | Truncated/unknown execution metadata could still produce complete claims. | Both profiles use `COMPLETE_EXITED`; truncated and unknown-termination cases fail open before analysis. |
| CARGO-F10 | Medium | JavaScript UTF-16 indexing could corrupt evidence spans after Unicode prefix paths. | Profile line records track UTF-8 byte offsets with `Buffer.byteLength`; Unicode-prefix regression verifies exact diagnostic capture. |
| CARGO-F11 | Medium | A bare trailing CR could be silently treated as CRLF/presentation. | CR is stripped from line content only when it immediately precedes LF; standalone trailing CR makes the test summary unsupported. |
| CARGO-F12 | Medium | Clippy could be advertised by analogy to Cargo build without fixture evidence. | Clippy is explicitly deferred; `cargo clippy` is passthrough in this issue. |
| CARGO-F13 | Medium | First donor-byte incorporation could leave E0's no-donor-bytes assertion stale or omit license notice. | Third-party register updated; exact per-fixture donor paths/pin/license recorded; TRS MIT notice retained. |
| CARGO-F14 | Medium | Cargo build success could be compacted without real evidence/value. | No-diagnostic successful build currently remains passthrough. |

## Donor provenance

Copied fixture bytes only from:

~~~text
dPeluChe/trs@0175ae73f36709fd4a9242b2e431d026d6f82bb3
~~~

Paths:

- `tests/fixture_data/cargo_test_failures.txt`;
- `tests/fixture_data/cargo_test_real_failures.txt`;
- `tests/fixture_data/build_cargo_errors.txt`.

License: MIT. Notice preserved at `docs/provenance/licenses/TRS-MIT.txt`.

No TRS runtime/parser source code is copied. RTK Cargo code remains comparative research only.

## Verification evidence

Profile fixtures include:

- donor single-failure cargo test;
- donor real two-failure cargo test;
- donor cargo build diagnostics;
- synthetic cargo test success;
- truncated cargo test;
- unknown-termination cargo test;
- malformed/version-drift cargo test.

Direct adversarial tests additionally cover:

- clippy passthrough;
- cargo test compile error with no test summary;
- summary/exit contradiction;
- multiple suites;
- internally contradictory summary;
- build warning/exit contradiction;
- build truncated input;
- build unknown termination;
- build success with no diagnostics;
- message-format overrides;
- bare trailing carriage return;
- Unicode prefix byte offsets.

Final reviewed branch CI before this review:

- run `36208840776` — PASS;
- strict typecheck — PASS;
- **60 Node tests passed, 0 failed**;
- build/declaration emit — PASS;
- package dry-run — PASS;
- package size ~27.0 kB / 38 files.

## Scope resolution

- `cargo test` — SUPPORTED for documented single-suite native shape;
- `cargo build` / textual rustc diagnostics — SUPPORTED for documented diagnostic shape;
- cargo-test compile failures before libtest — DEFERRED / passthrough;
- multi-suite/workspace/doc-test aggregation — DEFERRED / passthrough;
- `cargo clippy` — DEFERRED pending native fixtures;
- structured JSON Cargo/rustc output — DEFERRED unless naturally present and fixture-backed.

## Final disposition

**PASS**

No unresolved Critical/High finding remains in #30 scope. The family is safe to merge with the documented narrow support boundary.
