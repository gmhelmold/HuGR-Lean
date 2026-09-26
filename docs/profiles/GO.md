# Go Output Profiles

**Implements:** WP3.5 / issue #33  
**Runtime:** HuGR-Lean TypeScript; Go is a target output family only

## Supported profile

### `go-test-verbose`

Recognizes direct `go test ... -v ...` invocations only when no explicitly unsupported mode is present.

Requirements:

~~~text
completeness = Complete
termination  = Exited
~~~

The initial grammar deliberately supports one proven native verbose package session:

- top-level `=== RUN   TestName` frames;
- matching `--- PASS|FAIL|SKIP: TestName (duration)` terminators;
- optional indented output inside failed/skipped tests;
- final bare `PASS` or `FAIL` marker;
- exactly one package summary line (`ok ... duration|(cached)` or `FAIL ... duration`);
- no non-empty trailing material.

Reduction:

- removes passing test frames only when they contain no test-produced output;
- preserves every failed test block verbatim;
- preserves every skipped test block verbatim;
- preserves the package summary verbatim;
- removes only the duplicate bare PASS/FAIL marker and silent passing frames.

Package summary status, recognized failed-test count, and known host exit code must agree.

## Why passing test logs force passthrough

Official Go `-v` semantics print `Log`/`Logf` output even for passing tests. HuGR-Lean therefore does not treat indented text inside a passing frame as noise. Any such frame makes the current grammar conservative/passthrough.

## Explicit conservative boundaries

The following remain passthrough:

- `go test` without `-v` (default package summaries are already compact);
- `go test -json` or `-json=...`;
- benchmark/fuzz modes;
- subtest names/framing (`TestOuter/child`);
- `=== PAUSE` / `=== CONT` parallel framing;
- unknown non-indented test output;
- multiple package sessions / package-list framing not matching the single-package grammar;
- compile-error/build-failed test output outside the admitted verbose grammar;
- bare trailing carriage-return data;
- truncated input;
- unknown termination;
- package/exit-status contradictions.

Support is shape-based after command identity: a command such as `go test ./... -v` is reduced only when its actual boundary output matches the admitted single-package grammar. The command string alone does not imply multi-package support.

## `-json` is intentionally not reused

Go documents `-json` as conversion to a machine-readable event stream. RTK's Go path injects `-json` and consumes NDJSON. HuGR-Lean does not rewrite execution, so that implementation is REIMPLEMENT evidence only, not a native-output parser donor.

## `go build` / `go vet`

Deferred/passthrough in WP3.5.

The currently evidenced textual failure shape:

~~~text
# example.com/pkg
./file.go:line:col: diagnostic
~~~

is already compact, signal-dense evidence. No deterministic removable class with meaningful reduction has been proven yet. Adding a profile that merely reprints the same diagnostics would add maintenance without value.

Build/vet may receive a profile later if real workloads show material deterministic chatter and fixtures prove a safe reduction.

## Donor and upstream evidence

Primary parser research:

- TRS pin `0175ae73f36709fd4a9242b2e431d026d6f82bb3`
  - `src/router/handlers/parse/go_test.rs`
  - native verbose/default Go parsing behavior examined;
- RTK pin `f5e104e117ab5b05c69d448103c28f1155e04417`
  - `src/cmds/go/README.md`
  - explicitly documents injected `-json`/NDJSON behavior and is therefore not directly reusable.

Official Go command documentation was also checked for:

- package summary forms;
- `-v` behavior, including successful test logs;
- package-list behavior;
- `-json` conversion semantics;
- cached summary marker `(cached)`.

No donor source or fixture bytes are copied for this Go profile. HuGR fixtures are synthetic/adversarial and record their research basis in fixture metadata.

## Preservation Contract

`go-test-verbose` requires:

- every recognized failed-test block Signal;
- every recognized skipped-test block Signal;
- the final package-summary Signal.

All dynamic model-visible Go evidence is span-backed by the actual safe baseline.
