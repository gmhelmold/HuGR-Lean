# Python / pytest Output Profile

**Implements:** WP3.3 / issue #31  
**Runtime:** HuGR-Lean TypeScript; pytest/Python are target output families only

## Supported invocation identities

- `pytest ...`
- `py.test ...`
- `python -m pytest ...`
- versioned Python executables such as `python3` and `python3.11` with `-m pytest`

No wrapper command is rewritten or prefixed.

## Supported native output shapes

The profile requires:

- exactly one parseable final pytest summary;
- Complete input;
- Exited termination;
- summary failure/error state consistent with the host exit code.

Supported final summary counters:

- passed;
- failed;
- error/errors;
- skipped;
- xfailed;
- xpassed;
- deselected.

Warnings are deliberately not supported yet because warning details require their own Preservation Contract.

## Preserved evidence

For failed/error runs:

- verbose non-pass node rows when present;
- full `FAILURES`/`ERRORS` diagnostic section when present;
- full `short test summary info` section when present;
- final summary.

For XFAIL/XPASS/SKIPPED runs, node-ID status rows are preserved when present.

For all-pass runs, the final summary is sufficient and ordinary PASSED rows are removable.

Every dynamic preserved section is emitted through span-backed Signals.

## Conservative boundaries

- truncated input -> failed open;
- unknown termination -> failed open;
- summary/exit contradiction -> failed open;
- failed/error summary with no diagnostic identity -> passthrough;
- warning summary -> passthrough;
- multiple final summaries -> passthrough;
- `no tests ran` / exit-5 shape -> passthrough;
- unknown summary counters/version drift -> passthrough.

## Donor evidence

Primary fixtures are copied verbatim from:

~~~text
dPeluChe/trs@0175ae73f36709fd4a9242b2e431d026d6f82bb3
~~~

Paths:

- `tests/fixture_data/pytest_real_default.txt`;
- `tests/fixture_data/pytest_real_quiet.txt`;
- `tests/fixture_data/pytest_real_verbose.txt`;
- `tests/fixture_data/pytest_single_failed.txt`;
- `tests/fixture_data/pytest_with_error.txt`;
- `tests/fixture_data/pytest_with_xfail.txt`;
- `tests/fixture_data/pytest_all_passed.txt`.

TRS is MIT licensed; notice is retained at `docs/provenance/licenses/TRS-MIT.txt`.

The HuGR-Lean pytest parser is newly authored TypeScript. Donor parser/runtime source is not copied.

## Donor rewrite boundary

RTK/CX may inject pytest flags such as quiet mode or short traceback in their wrapper execution. HuGR-Lean does not.

The default/quiet/verbose donor corpus proves this profile consumes already-produced native text across multiple verbosity shapes rather than depending on HuGR-Lean command rewriting.

## Shared mechanics

pytest and Cargo both use the shared UTF-8 `lineRecords` primitive for evidence offsets. No family-private byte-indexing subsystem is introduced.
