# JavaScript / TypeScript Profiles v1

**Implements:** WP3.4 / issue #32  
**Runtime:** TypeScript, local/in-process  
**Fixture family:** `js-ts`

## Supported profiles

### Jest

Profile ID: `jest`

Supported invocation identities:

- `jest ...`
- `npx jest ...`
- `bunx jest ...`
- `pnpm exec jest ...`
- `npm exec jest ...`

Supported shape is the fixture-backed native text reporter with:

- explicit `PASS` / `FAIL` suite headers;
- final `Test Suites:` summary;
- final `Tests:` summary;
- failure-detail markers consistent with failed-test counts.

On success, HuGR-Lean preserves the two final summary lines.

On failure, HuGR-Lean preserves:

- every supported failing-suite block verbatim;
- the final suite summary;
- the final test summary.

Unknown text before/after the admitted shape causes passthrough rather than partial reduction.

Explicit JSON/reporting/watch overrides are not admitted.

`npm test` is deliberately **not** treated as Jest merely because its output resembles Jest. The runner identity must be explicit.

### Vitest

Profile ID: `vitest`

Supported invocation identities:

- `vitest ...`
- `npx vitest ...`
- `bunx vitest ...`
- `pnpm exec vitest ...`
- `npm exec vitest ...`

Supported native text requires:

- fixture-backed file-suite headers;
- exactly one `Test Files` summary;
- exactly one `Tests` summary;
- internally consistent totals;
- failure markers consistent with failed-test counts.

On success, only the two final count summaries are emitted.

On failure, supported failing-suite blocks plus the two summaries are preserved.

Unknown trailing output, inconsistent totals, unsupported reporter shapes, and version drift remain passthrough.

### TypeScript compiler (`tsc`)

Profile ID: `tsc`

Supported invocation identities include direct `tsc` and explicit `npx` / `bunx` / `pnpm exec` / `npm exec` wrappers.

The admitted native text grammar is intentionally narrow:

~~~text
path/file.ts(line,column): error TS1234: message
error TS1234: global message
  continuation lines
~~~

Optional standard `Found N errors ...` / `Errors  Files` summary material is validated and removed as redundant.

Every retained diagnostic block is a mandatory verbatim Signal.

The parser requires a non-zero host exit code when error diagnostics are present.

## Explicitly unsupported / deferred

### Reporter injection

HuGR-Lean does not add or rely on:

- Jest `--json`;
- Vitest JSON reporters;
- custom reporter flags;
- output-file injection.

RTK's strongest Jest/Vitest paths use reporter/JSON forcing and are therefore REIMPLEMENT evidence only, not native-compatible runtime code.

### Generic npm/pnpm test scripts

`npm test` / `pnpm test` do not identify the actual test framework. Output resemblance alone is not enough to route a profile.

### Pretty/ANSI tsc

ANSI/pretty compiler output is not parsed by the `tsc` profile while presentation provenance is unknown.

Explicit `--pretty`, watch/help/version/showConfig/init modes are outside this profile.

### ESLint / Biome

Deferred in WP3.4.

The pinned evidence baseline does not yet provide enough native-output/version coverage to make a support claim without format assumptions. They remain candidates for later coverage if real fixtures justify deterministic contracts.

## Requirements

All three profiles require:

~~~text
completeness = Complete
termination = Exited
~~~

Truncated input and unknown termination fail open before analysis when the supported shape otherwise matches.

## Preservation contracts

### Jest

Mandatory signals:

- all supported failing-suite blocks;
- suite summary;
- test summary.

### Vitest

Mandatory signals:

- all supported failing-suite blocks;
- test-file summary;
- test summary.

### tsc

Mandatory signals:

- every admitted diagnostic block.

## Donor evidence

Primary fixture donor:

~~~text
dPeluChe/trs
0175ae73f36709fd4a9242b2e431d026d6f82bb3
MIT
~~~

Copied fixture bytes are recorded individually in `fixtures/js-ts/*/case.toml`.

No TRS parser/runtime code was copied.

RTK was used as comparative research. In particular, the audited Jest/Vitest implementation demonstrates why reporter-forcing behavior must not be transplanted into HuGR-Lean's post-processing-only architecture.

## Version drift rule

A known executable with a shape outside these admitted fixtures is not partially parsed.

~~~text
identity match
shape guard -> no_match
safe baseline wins
~~~

This includes internally inconsistent count summaries, unknown post-summary output, unsupported ANSI/pretty compiler output, and unrecognized runner variants.
