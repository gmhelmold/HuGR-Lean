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


### WP3.3 Python/pytest fixture incorporation

WP3.3 adds fixture bytes only from the same pinned TRS revision:

- `fixtures/python-pytest/pytest-quiet-failure-donor/input.txt`
  ← `tests/fixture_data/pytest_real_quiet.txt`
- `fixtures/python-pytest/pytest-setup-error-donor/input.txt`
  ← `tests/fixture_data/pytest_with_error.txt`
- `fixtures/python-pytest/pytest-xfail-donor/input.txt`
  ← `tests/fixture_data/pytest_with_xfail.txt`
- `fixtures/python-pytest/pytest-v7-default-donor/input.txt`
  ← `tests/fixture_data/pytest_real_default.txt`

Source pin:
`0175ae73f36709fd4a9242b2e431d026d6f82bb3`.

License: MIT. Existing notice remains at `docs/provenance/licenses/TRS-MIT.txt`.

The HuGR-Lean pytest parser/profile is newly authored TypeScript. No TRS parser, reducer, router, rewrite, or integration source code is copied.


### WP3.4 JavaScript/TypeScript fixture incorporation

WP3.4 adds fixture bytes only from the same pinned TRS revision:

- `fixtures/js-ts/jest-pass-donor/input.txt`
  ← `tests/fixture_data/jest_all_passed.txt`
- `fixtures/js-ts/jest-failure-donor/input.txt`
  ← `tests/fixture_data/jest_mixed.txt`
- `fixtures/js-ts/jest-skipped-donor/input.txt`
  ← `tests/fixture_data/jest_with_skipped.txt`
- `fixtures/js-ts/vitest-pass-donor/input.txt`
  ← `tests/fixture_data/vitest_all_passed.txt`
- `fixtures/js-ts/vitest-failure-donor/input.txt`
  ← `tests/fixture_data/vitest_mixed.txt`
- `fixtures/js-ts/vitest-skipped-donor/input.txt`
  ← `tests/fixture_data/vitest_with_skipped.txt`
- `fixtures/js-ts/vitest-version-drift-donor/input.txt`
  ← `tests/fixture_data/vitest_mixed_skipped.txt`
- `fixtures/js-ts/tsc-errors-donor/input.txt`
  ← `tests/fixture_data/lint_tsc_errors.txt`

Source pin:
`0175ae73f36709fd4a9242b2e431d026d6f82bb3`.

License: MIT. Existing notice remains at `docs/provenance/licenses/TRS-MIT.txt`.

The HuGR-Lean Jest/Vitest/tsc profiles are newly authored TypeScript. No TRS parser, router, reducer, rewrite, or integration source code is copied.


### WP3.5 Go parser research

WP3.5 inspected the pinned native Go parser at:

- `src/router/handlers/parse/go_test.rs`

Source pin:
`0175ae73f36709fd4a9242b2e431d026d6f82bb3`.

Disposition: **REIMPLEMENT / research only**.

The HuGR-Lean Go profile is newly authored TypeScript with a narrower grammar and stronger fail-open boundaries. No TRS Go parser source code or fixture bytes are copied for WP3.5.


### WP3.6 Git status fixture incorporation

WP3.6 copies selected native human `git status` fixture bytes from the pinned TRS revision:

- `fixtures/git-status/git-status-clean-donor/input.txt`
  ← `tests/fixture_data/git_status_clean.txt`
- `fixtures/git-status/git-status-staged-donor/input.txt`
  ← `tests/fixture_data/git_status_staged.txt`
- `fixtures/git-status/git-status-mixed-donor/input.txt`
  ← `tests/fixture_data/git_status_mixed.txt`
- `fixtures/git-status/git-status-conflict-donor/input.txt`
  ← `tests/fixture_data/git_status_conflict.txt`

Source pin: `0175ae73f36709fd4a9242b2e431d026d6f82bb3`.

License: MIT. Existing notice remains at `docs/provenance/licenses/TRS-MIT.txt`.

The HuGR-Lean Git parser/profile is newly authored TypeScript. No TRS parser, router, rewrite, probe, or integration source code is copied.


### WP3.7 Docker native-output evidence

WP3.7 inspected `tests/fixture_data/docker_ps_real.txt` at the pinned TRS revision to assess whether native Docker ps output contains a provably removable class.

No fixture bytes are copied for WP3.7.

Conclusion: the default native columns are all potentially decision-relevant, so no Docker ps profile is admitted at this stage.


### WP3.8 Search fixture incorporation

WP3.8 copies selected native grep/ripgrep-style fixture bytes from the pinned TRS revision:

- `fixtures/search-rg/rg-single-file-multiple-donor/input.txt`
  ← `tests/fixture_data/grep_single_file_multiple_matches.txt`
- `fixtures/search-rg/rg-colon-content-donor/input.txt`
  ← `tests/fixture_data/grep_with_colon_in_content.txt`
- `fixtures/search-rg/rg-heading-donor/input.txt`
  ← `tests/fixture_data/grep_ripgrep_heading.txt`
- `fixtures/search-rg/rg-context-donor/input.txt`
  ← `tests/fixture_data/grep_context_lines.txt`
- `fixtures/search-rg/rg-column-donor/input.txt`
  ← `tests/fixture_data/grep_with_column.txt`
- `fixtures/search-rg/rg-binary-donor/input.txt`
  ← `tests/fixture_data/grep_binary_file.txt`
- `fixtures/search-rg/rg-single-match-donor/input.txt`
  ← `tests/fixture_data/grep_simple.txt`
- `fixtures/search-rg/rg-multiple-files-single-each-donor/input.txt`
  ← `tests/fixture_data/grep_multiple_files.txt`
- `fixtures/search-rg/rg-without-line-numbers-donor/input.txt`
  ← `tests/fixture_data/grep_without_line_numbers.txt`

Source pin: `0175ae73f36709fd4a9242b2e431d026d6f82bb3`.

License: MIT. Existing notice remains at `docs/provenance/licenses/TRS-MIT.txt`.

The HuGR-Lean ripgrep grouping profile is newly authored TypeScript. No TRS grep parser, truncation, router, rewrite, or runtime source code is copied.
