# E0 Candidate Fixture Inventory

This inventory records **candidate evidence**, not automatically adopted fixtures.

## RTK — Apache-2.0

Pinned: `f5e104e117ab5b05c69d448103c28f1155e04417`

Observed `tests/fixtures`: 79 entries.

High-value candidates for HuGR target families include:

- `bun_test_failures_raw.txt`, `bun_test_green_raw.txt`;
- `golangci_v1_go127_error_stderr.txt`, `golangci_v2_*_raw.json`;
- `tsc_pretty_raw.txt`, `tsc_global_config_error_raw.txt`;
- `uv_run_pytest_failure.txt`;
- `git/`, `diff/`;
- `glab_*_raw.*`;
- `oc_pods.json`.

Adoption requires Apache provenance and input-compatibility review.

## TRS — MIT

Pinned: `0175ae73f36709fd4a9242b2e431d026d6f82bb3`

Observed `tests/fixture_data`: 181 entries.

Priority candidates:

### Rust
- `cargo_test_failures.txt`
- `cargo_test_real_failures.txt`
- `build_cargo_errors.txt`

### Python / pytest
- `pytest_real_default.txt`
- `pytest_real_quiet.txt`
- `pytest_real_verbose.txt`
- `pytest_mixed.txt`
- `pytest_with_error.txt`

### JS/TS tests
- Jest/Vitest/npm/pnpm/Bun passed/failed/mixed/large/skipped/todo variants
- `lint_tsc_errors.txt`

### Git
- broad `git_status_*` corpus including locale, status-code, path and porcelain variants
- broad `git_diff_*` corpus including binary, rename, copy, long paths and large output

### Search/filesystem/logs
- grep context/binary/column/colon/heading variants
- ls symlink/permission/hidden/long path variants
- log format/repetition/exception variants

### Containers
- `docker_ps_real.txt`

TRS is the preferred first fixture donor because many cases reflect native output rather than donor-injected structured formats.

## CX — MIT

Pinned: `b7c81334e63ba3c1adaafbd2773ca2b8049ae7ae`

CX's strongest evidence is test logic rather than a giant raw fixture directory:

- `tests/recent_calls.rs`
- `tests/output_metrics.rs`
- `tests/output_expansion_metrics.rs`
- `tests/failure_artifacts.rs`
- `tests/grep_capture.rs`
- `tests/git_log_truthfulness.rs`
- `tests/documented_commands.rs`
- `tests/install_script.rs`

Use these to derive HuGR regression cases and verification methodology; do not import the insights/report database architecture.

## Rule

A candidate becomes a HuGR fixture only after:

1. input semantics match HuGR's post-execution boundary;
2. license/provenance is recorded;
3. expected preservation behavior is authored under Fixture Contract v1;
4. the fixture adds distinct evidence rather than duplicate volume.
