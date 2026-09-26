# TRS Donor Audit

**Issue:** #18  
**Repository:** dPeluChe/trs  
**Pinned revision:** `0175ae73f36709fd4a9242b2e431d026d6f82bb3`  
**License:** MIT  
**Role for HuGR-Lean:** primary native-parser and fixture donor

## Observed architecture

TRS separates classification/routing, parser handlers, reducer support, rewriting/integration, tracking, and a large test corpus.

The classifier routes many native command outputs directly to parsers: Git, ls/tree, grep/find, logs, Docker, pytest/Jest/Vitest, package managers, Go, linters and more.

TRS also has rewrite/integration behavior and a generic ANSI/whitespace fallback; those surfaces must be separated from its parsers before reuse.

## Strongest assets

The pinned tree has a particularly valuable verification corpus:

- 181 files under `tests/fixture_data`;
- real pytest outputs (`pytest_real_default`, `pytest_real_quiet`, `pytest_real_verbose`);
- real/representative Cargo failures;
- Jest/Vitest/npm/pnpm/Bun runner variants;
- Git status/diff variants including locale/status-code/path edge cases;
- grep variants including binary/context/colon/column/heading shapes;
- log formats and repeated lines;
- ls/symlink/permissions/long paths;
- Docker output;
- lint/tsc cases.

TRS also includes `tests/quality_harness.rs`, which explicitly checks signal survival rather than reduction alone. That is strongly aligned with HuGR-Lean Preservation Contracts.

## Useful implementation patterns

- native text parsers for pytest and Go test;
- Git/status/diff parser edge cases;
- native ls/grep/log parser fixtures;
- command classification by executable/subcommand;
- never-worse guard;
- malformed-input tests;
- signal-preservation tests;
- failure-truth tests;
- independent compact formatting functions.

## Candidate dispositions

| Surface | Disposition | Reason |
|---|---|---|
| `tests/fixture_data` relevant target-family fixtures | ADAPT | high-value MIT fixture donor |
| quality-harness signal-survival methodology | ADAPT | directly aligned with Preservation Contracts |
| pytest native parser/fixtures | ADAPT/REIMPLEMENT | strong post-process fit |
| Go native test parser | ADAPT/REIMPLEMENT | preferable to JSON-injection-only donor paths |
| Git status/diff fixtures/parsers | ADAPT/REIMPLEMENT | strong edge-case corpus; HuGR exact-evidence rules still govern |
| grep/find/ls/log fixtures | ADAPT | native-output shapes useful to our profiles |
| classifier command-family map | REIMPLEMENT | useful knowledge; HuGR routing protocol is different and more conservative |
| generic ANSI helper | ADAPT | only under explicit PresentationV1 applicability |
| generic whitespace compression | REJECT | unsafe for arbitrary unknown payload under HuGR plan |
| reducer registry/framework | REJECT/REIMPLEMENT | more general than required; HuGR already specifies Profile + Preservation Contract |
| command rewrite system | REJECT | conflicts with v1 post-processing-only rule |
| output-saver prompt/rules injection | REJECT | not part of HuGR product |
| source read/comment stripping | REJECT | exact-evidence/content-bearing non-goal |
| tracking/history product | REJECT | persistent analytics non-goal |

## Key evidence paths

- `src/classifier.rs`
- `src/reducer/mod.rs`
- `src/reducer/registry.rs`
- `src/router/handlers/parse/`
- `src/router/handlers/search.rs`
- `src/rewrite*.rs`
- `tests/fixture_data/`
- `tests/quality_harness.rs`
- `tests/cli_failure_truth.rs`
- `tests/cli_parsers_keep_signal.rs`
- `tests/cli_pytest_real_output.rs`
- `docs/development/agent-integrations.md`

## License

MIT. Copied/substantial portions require preservation of the copyright and permission notice.

## Audit conclusion

TRS is the **best first fixture donor** for HuGR-Lean's target families and likely the best source for native-output parser edge cases. Its parser knowledge should be mined aggressively; its rewrite, generic-whitespace, prompt-injection and tracking surfaces should not be inherited.


## Incorporated material

WP3.2 incorporates **fixture bytes only**, not TRS runtime/parser source code.

HuGR-Lean destinations:

- `fixtures/rust-cargo/cargo-test-failure-donor/input.txt`
  ← `tests/fixture_data/cargo_test_failures.txt`
- `fixtures/rust-cargo/cargo-test-real-failures-donor/input.txt`
  ← `tests/fixture_data/cargo_test_real_failures.txt`
- `fixtures/rust-cargo/cargo-build-errors-donor/input.txt`
  ← `tests/fixture_data/build_cargo_errors.txt`

Source pin for all three:
`0175ae73f36709fd4a9242b2e431d026d6f82bb3`.

License: MIT. Notice retained at `docs/provenance/licenses/TRS-MIT.txt`.

The HuGR-Lean Cargo profiles are newly authored TypeScript implementations under HuGR-Lean's own preservation and routing contracts.


### Pytest fixtures incorporated by WP3.3

Fixture bytes copied under `fixtures/pytest/` from the same pinned TRS revision:

- `tests/fixture_data/pytest_real_default.txt`
- `tests/fixture_data/pytest_real_quiet.txt`
- `tests/fixture_data/pytest_real_verbose.txt`
- `tests/fixture_data/pytest_single_failed.txt`
- `tests/fixture_data/pytest_with_error.txt`
- `tests/fixture_data/pytest_with_xfail.txt`
- `tests/fixture_data/pytest_all_passed.txt`

Each destination fixture records its exact source path, pin and MIT license in `case.toml`.

No TRS pytest parser/runtime source code is copied; the HuGR-Lean profile is newly authored TypeScript.
