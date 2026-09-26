# HL-WP3.4 — JavaScript / TypeScript Profiles Adversarial Review 01

**Issue:** #32 — JavaScript/TypeScript test and diagnostic profiles  
**Date:** 2026-09-26  
**Disposition:** PASS after findings incorporated

## Review objective

Attempt to invalidate the first JS/TS production profiles before they are merged into the shared WP3 framework.

The review challenged:

- runner identity overreach;
- donor reporter/JSON rewrite contamination;
- summary-count contradictions;
- hidden trailing output loss;
- version drift;
- ANSI/pretty compiler ambiguity;
- incomplete/unknown execution state;
- file/line/code/message preservation;
- UTF-8 evidence offsets;
- donor provenance;
- unsupported ESLint/Biome scope creep.

## Implemented profiles

### Jest

Profile ID: `jest`

Admitted only for explicit Jest identities:

- `jest`
- `npx jest`
- `bunx jest`
- `pnpm exec jest`
- `npm exec jest`

The profile preserves all supported failing-suite blocks plus final suite/test summaries. Passing suite/test rows and timing chatter may be removed only for the fixture-backed native shape.

### Vitest

Profile ID: `vitest`

Admitted only for explicit Vitest identities through the same direct/explicit-runner forms.

The profile preserves supported failing-suite blocks and final `Test Files` / `Tests` summaries.

### TypeScript compiler

Profile ID: `tsc`

Admitted for direct/explicit-runner tsc invocations using the narrow plain-text diagnostic grammar.

Every accepted diagnostic block is a mandatory verbatim Signal.

## Evidence baseline

Final branch CI before merge:

- run `36218916286` — **PASS**
- strict TypeScript typecheck — PASS
- **83 Node tests passed**
- **0 failed**
- declaration/build emit — PASS
- `npm pack --dry-run` — PASS

Profile corpus:

- native Jest pass/failure/skipped donor fixtures;
- native Vitest pass/failure/skipped donor fixtures;
- an internally inconsistent Vitest donor fixture used as version-drift passthrough evidence;
- native textual tsc donor diagnostics;
- synthetic malformed/truncated/unknown/ANSI-pretty negative fixtures.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| JS32-F01 | Critical | RTK's strongest Jest/Vitest reducers obtain structured JSON by injecting reporters/flags. Porting them directly would violate post-processing-only architecture. | Runtime implementation is newly authored against native text; reporter/JSON overrides are excluded and RTK code remains research-only. |
| JS32-F02 | High | `npm test`/generic package scripts could be misclassified as Jest/Vitest by output resemblance alone. | Profiles require explicit runner identity; generic package scripts remain passthrough. |
| JS32-F03 | High | Unknown output before/after known summaries could have been silently discarded. | Shape guards now validate the full admitted native layout; unknown trailing/pre-summary text makes the profile no-match. |
| JS32-F04 | High | Test summaries could be internally contradictory even when regexes individually matched. | Jest/Vitest totals, failed counts, suite/file headers, and failure markers are cross-validated before admission. |
| JS32-F05 | High | TRS `vitest_mixed_skipped.txt` contains totals that do not reconcile. | Fixture is deliberately retained as donor-backed version-drift/passthrough evidence. |
| JS32-F06 | High | tsc summary/table-looking lines could have been accepted out of order and then removed without proven diagnostic context. | Summary/table material is accepted only after at least one parsed diagnostic and no later diagnostics may appear after summary mode begins. |
| JS32-F07 | High | ANSI/pretty tsc output cannot safely reuse plain-text byte offsets when presentation provenance is unknown. | ANSI-bearing/explicit pretty variants remain passthrough. No profile-local ANSI guessing is performed. |
| JS32-F08 | High | Complete aggregate test summaries or compiler failures could be emitted from truncated/unknown execution state. | All three profiles require Complete + Exited; truncated/unknown cases fail open before analysis. |
| JS32-F09 | High | Failure evidence could be reduced to counts while losing test identity or diagnostics. | Supported failing-suite blocks are mandatory verbatim Signals; every tsc diagnostic block is a mandatory verbatim Signal. |
| JS32-F10 | Medium | Skipped-test behavior was implemented by grammar but initially lacked direct fixtures. | Pinned Jest/Vitest skipped fixtures were added and execute through the real engine. |
| JS32-F11 | Medium | Donor fixtures could enter without legal/source traceability. | Every copied input has exact repo/commit/path/license metadata; TRS MIT notice is retained; no donor parser/runtime source is copied. |
| JS32-F12 | High | ESLint/Biome could be claimed by analogy to tsc or donor linter paths without enough native/version evidence. | Explicitly deferred. No support claim or reducer was added. |

## Preservation assessment

### Jest

Mandatory:

- each supported failing-suite block;
- `Test Suites` summary;
- `Tests` summary.

### Vitest

Mandatory:

- each supported failing-suite block;
- `Test Files` summary;
- `Tests` summary.

### tsc

Mandatory:

- every accepted diagnostic block, including file/location/error code/message and supported indented continuation text.

## Conservative boundaries

PASS.

The following stay passthrough/fail-open as appropriate:

- generic `npm test` output;
- JSON/custom reporters;
- watch/UI modes;
- malformed or duplicate summaries;
- internally inconsistent counts;
- unknown post-summary output;
- unsupported version shapes;
- ANSI/pretty tsc;
- tsc help/version/showConfig/init/watch modes;
- unknown termination;
- truncated input;
- exit-status contradictions.

## Provenance assessment

PASS.

Primary fixture donor:

~~~text
dPeluChe/trs
0175ae73f36709fd4a9242b2e431d026d6f82bb3
MIT
~~~

Only selected fixture bytes are copied.

HuGR-Lean profile/parser implementation is newly authored TypeScript.

RTK's Jest/Vitest reporter-forcing implementation was used only as negative architectural evidence.

## Scope containment

WP3.4 did not add:

- reporter injection;
- JSON forcing;
- command rewriting;
- npm-script guessing;
- generic test-output classifier;
- parser DSL;
- ESLint/Biome reducer without evidence;
- host-specific behavior;
- new runtime dependency.

## Final disposition

**PASS**

No unresolved Critical/High finding remains within #32.

The shared WP3 framework can proceed to #33 Go profiles.
