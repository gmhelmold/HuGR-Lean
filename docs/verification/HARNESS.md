# Core Verification Harness

**Implements:** WP1.5 / issue #25  
**Normative parents:** `docs/TECHNICAL_SPEC.md` §33; `docs/verification/FIXTURE_SCHEMA.md`

## Purpose

The verification harness executes repository fixtures through the real HuGR-Lean core without starting OpenCode or any other host.

It proves the engine can be evaluated from a normalized `ObservationV1` boundary alone.

## Components

~~~text
fixture directory
  ├── case.toml
  ├── input.txt
  └── expected.txt?
       |
       v
tests/support/fixture.ts
       |
       v
ObservationV1
       |
       v
Engine
       |
       v
FilterResultV1
       |
       v
fixture assertions
~~~

## Fixture loader

The loader:

- parses Fixture Contract v1 TOML;
- rejects unknown metadata fields;
- validates schema version and fixture ID;
- maps compact fixture termination metadata into strict `TerminationV1`;
- validates provenance requirements;
- prevents golden paths from escaping the fixture directory;
- reads exact UTF-8 boundary input;
- loads optional exact golden output.

`smol-toml` is a dev-dependency only. No TOML parser enters the runtime filtering dependency surface through WP1.5.

## Generic assertions

The harness verifies:

- expected decision;
- expected profile;
- optional exact golden output;
- required literals;
- forbidden literals;
- non-expansion;
- idempotence;
- exact passthrough;
- no-panic execution;
- required-literal preservation.

Any thrown core error fails the Node test case; fixture execution itself is therefore part of the no-crash evidence.

## E0 seed execution

The E0 synthetic fixtures now execute against the real default engine:

- `seed/unknown-repeated-lines`;
- `seed/exact-patch-like`;
- `seed/incomplete-test-like`.

They verify the conservative core remains passthrough before profile coverage is introduced.

## Proving profile

`tests/support/proving-profile.ts` implements one intentionally artificial profile for the command:

~~~text
hugr-lean-prove
~~~

It is never registered by the production default engine.

The profile exists only to prove the complete profile path:

~~~text
known command identity
  -> shape guard
  -> Complete + Exited requirements
  -> analysis
  -> ProfileContext-bound Signal
  -> mandatory Preservation Contract
  -> LeanWriter rendering
  -> profile-specific validate
  -> non-expansion
  -> reduced result
~~~

This historically avoided beginning Cargo/pytest/etc. production coverage before E2. E2 is now active; the proving profile remains test-only.

## Deterministic generative corpus

`tests/arbitrary.test.ts` generates thousands of deterministic strings containing:

- Unicode;
- NUL;
- ESC / DEL;
- CR/LF/tab;
- shell control characters;
- quotes/backticks/backslashes;
- ordinary text.

Cases are fed directly through the in-process TypeScript boundary:

~~~text
ObservationV1
 -> runtime validation
 -> invocation identity
 -> default engine
~~~

The property is:

~~~text
no panic
AND decision == passthrough
AND replacement == null
AND exact byte metrics
~~~

This is the initial fuzz/property foundation. It deliberately avoids introducing a persistent fuzzing framework before parser surface area justifies one.

## Failure-state verification

`preserves_failure_state` is not a generic fixture property.

Execution outcome is immutable input metadata, not a field that `FilterResultV1` rewrites. Profiles that must surface failure evidence use outcome-backed Signals and Preservation Contracts.

## Non-goals

WP1.5 does not add:

- host integration;
- production command profiles;
- SafeNormalization;
- benchmark claims;
- persistent fuzz infrastructure;
- arbitrary fixture scripting;
- a fixture DSL beyond declarative metadata.
