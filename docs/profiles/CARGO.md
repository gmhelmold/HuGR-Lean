# Cargo / rustc Output Profiles

**Implements:** WP3.2 / issue #30  
**Runtime:** HuGR-Lean TypeScript; Cargo/rustc are target output families only

## Supported profiles

### `cargo-test`

Recognizes a direct `cargo test ...` identity and a deliberately narrow single-suite native libtest-style output shape containing:

- at least one `running N test(s)` marker;
- exactly one canonical final `test result: ...` line;
- failure blocks whose count agrees with the final failed count.

Requirements:

~~~text
completeness = Complete
termination  = Exited
~~~

Reduction:

- removes compile/finished/running chatter;
- removes passing test rows;
- removes the duplicate failure-name list;
- preserves every recognized failure block verbatim;
- preserves the final test-result summary verbatim.

The summary status must agree with both its failed-count field and the known exit code. Contradiction fails open or remains unmatched conservatively.

Compile errors that prevent the native test-result summary from appearing are intentionally unsupported by `cargo-test` in this version and remain conservative. Multiple test-suite summaries (for example workspace/doc-test runs) are also deferred until fixture-backed aggregation semantics are defined.

### `cargo-build`

Recognizes direct `cargo build ...` output only when native textual rustc diagnostics are present.

The profile removes only leading Cargo compilation chatter and preserves one verbatim suffix beginning at the first textual `error[...]`, `error:`, `warning[...]`, or `warning:` diagnostic through the end of the boundary output. Diagnostic class and known exit code must agree: error-bearing output requires non-zero exit, while warning-only output requires zero exit.

Successful build output with no diagnostics remains passthrough.

## Explicitly deferred

### `cargo clippy`

Deferred in WP3.2 because the pinned TRS native fixture corpus contains no clippy fixture. RTK has clippy implementation knowledge, but some paths are format-sensitive and the project has no reason to claim support without native boundary evidence.

Clippy therefore remains passthrough until a dedicated fixture-backed profile is added.

### JSON/rustc structured messages

HuGR-Lean does not inject `--message-format=json`. Structured Cargo/rustc parsing may be added only when the structured text is independently present at the HuGR-Lean boundary and is fixture-backed.

## Donor evidence

Primary native-output fixtures:

- `dPeluChe/trs@0175ae73f36709fd4a9242b2e431d026d6f82bb3`
  - `tests/fixture_data/cargo_test_failures.txt`
  - `tests/fixture_data/cargo_test_real_failures.txt`
  - `tests/fixture_data/build_cargo_errors.txt`

These fixture bytes are copied under `fixtures/rust-cargo/` with per-fixture provenance. TRS is MIT licensed; the retained notice is `docs/provenance/licenses/TRS-MIT.txt`.

RTK `cargo_cmd.rs` at the E0 pin is used only as comparative behavior/edge-case research. No RTK source code is copied into the runtime.

## Conservative boundaries

- truncated Cargo test input fails open before analysis;
- unknown termination fails open before analysis;
- malformed/version-drifted test summaries do not match the profile;
- compile-error `cargo test` output without a final test-result grammar is not guessed;
- command-rewrite-dependent behavior is not admitted;
- profiles are not registered by `Engine` automatically; adapters/products explicitly choose the profile set.

## Preservation contracts

`cargo-test` requires:

- final summary Signal;
- every failure-block Signal detected by the parser.

`cargo-build` requires:

- one verbatim diagnostic-suffix Signal.

All dynamic model-visible Cargo/rustc evidence is therefore span-backed by the actual safe baseline.
