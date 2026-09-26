# HL-WP3.5 — Go Profile Adversarial Review 01

**Issue:** #33 — Implement Go test/build diagnostic profiles  
**Date:** 2026-09-26  
**Disposition:** PASS after conservative scope resolution

## Review objective

Challenge the initial Go family before it is allowed to claim support.

The review focused on:

- native text vs injected JSON;
- Go verbose logging semantics;
- package-list/multi-package framing;
- subtests and parallel tests;
- benchmark/fuzz modes;
- cached package summaries;
- package/exit-status contradictions;
- compile/build failures;
- UTF-8/CR handling;
- whether go build/vet reduction is actually valuable.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| GO-F01 | Critical | RTK's Go test reducer depends on injected `-json`, which HuGR-Lean does not perform. | `go-test-verbose` is newly authored native-text TypeScript; explicit `-json` remains passthrough. |
| GO-F02 | High | Go `-v` prints Log/Logf output even for tests that pass, so dropping all passing frames would destroy user evidence. | Passing frames are removable only when they contain no test-produced output. A permanent regression fixture locks chatty passing tests to exact passthrough. |
| GO-F03 | High | Subtests change framing and names (`Test/child`) and can nest. | Subtests are outside the initial grammar and remain passthrough. |
| GO-F04 | High | Parallel tests add `=== PAUSE` / `=== CONT` and can reorder output. | Parallel framing is explicitly unsupported/passthrough. |
| GO-F05 | High | Package-list commands such as `./...` may produce multiple package sessions and final aggregate FAIL framing. | Support is based on actual single-package output shape, not command syntax. Multi-package framing remains passthrough. |
| GO-F06 | Medium | Cached successful package results use `(cached)` rather than a duration. | `(cached)` is explicitly fixture-backed and accepted for the final `ok` package summary. |
| GO-F07 | High | A package summary that disagrees with known host exit state would fabricate success/failure semantics. | Analyze phase checks package failure state against exit code and fails open on contradiction. |
| GO-F08 | High | Bare non-indented output inside a test frame may be meaningful package/process output. | Unknown non-indented material invalidates the shape and remains passthrough. |
| GO-F09 | Medium | Bench/fuzz output shares `go test` identity but has different semantics. | `-bench` and `-fuzz` modes are rejected before shape parsing. |
| GO-F10 | Medium | `-args` passes remaining flags to the test binary and could make a later `-v` look like Go verbose mode. | Only Go-command arguments before `-args` can authorize `-v`. |
| GO-F11 | Medium | Standalone trailing CR could be confused with CRLF/presentation. | Bare CR shape is unsupported and remains exact passthrough. |
| GO-F12 | Medium | `go build`/`go vet` scope could encourage a zero-value reducer that merely copies already dense diagnostics. | Build/vet are explicitly deferred until material deterministic chatter is evidenced. Current diagnostics remain exact passthrough. |

## Supported contract

`go-test-verbose` supports only fixture-backed native verbose single-package shapes with:

- top-level RUN frames;
- matching PASS/FAIL/SKIP terminators;
- no output inside passing frames;
- failure/skip blocks preserved verbatim;
- one final package summary;
- Complete input;
- Exited termination;
- package status consistent with host exit state.

## Donor disposition

### TRS

Pinned native parser research: `src/router/handlers/parse/go_test.rs`.

Disposition: REIMPLEMENT / behavior research. No parser source or fixture bytes copied.

### RTK

Pinned Go implementation relies on `-json` injection and NDJSON.

Disposition: REIMPLEMENT evidence only; no runtime/source reuse.

## Build/vet resolution

Deferred, not forgotten.

The currently evidenced build/vet error output is already short, exact diagnostic evidence. No safe removable class with meaningful value was established in WP3.5, so adding a reducer would increase maintenance without improving context materially.

## Verification obligations

- native verbose success fixture;
- native verbose failure fixture;
- native verbose skip fixture;
- cached summary fixture;
- explicit JSON override passthrough;
- passing-log regression passthrough;
- subtest/version-drift passthrough;
- truncated and unknown-termination fail-open;
- build deferred passthrough;
- unit tests for flags/args/bench/fuzz/exit contradiction/CR behavior.

## Final disposition

**PASS**

The Go family may claim only the narrow `go-test-verbose` support documented in `docs/profiles/GO.md`. Build/vet, default package-only output, multi-package framing, JSON, subtests, parallel, benchmarks and fuzz remain conservative.
