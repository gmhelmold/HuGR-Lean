# HL-ARCH-TS — TypeScript Runtime Migration Adversarial Review 01

**Issue:** #72 — Migrate core runtime from Rust to TypeScript  
**Date:** 2026-09-25  
**Disposition:** PASS for merge candidate; G-E1 revalidation still requires post-merge main CI

## Review objective

Determine whether the unreleased Rust + subprocess implementation can be removed without weakening HuGR-Lean's approved behavioral contracts.

Reviewed areas:

- Observation/FilterResult validation;
- SafeNormalization;
- conservative command identity;
- profile registry/admission;
- Preservation Contracts;
- evidence spans and UTF-8 byte accounting;
- non-expansion/fail-open;
- fixture harness parity;
- arbitrary-input property foundation;
- package exports/runtime dependencies;
- CI/build/package shape;
- normative docs and roadmap;
- removal of Rust/Cargo/IPC artifacts.

## Migration result

The final candidate is one local TypeScript package:

~~~text
src/
  command.ts
  engine.ts
  index.ts
  normalize.ts
  preservation.ts
  primitive.ts
  profile.ts
  types.ts
~~~

The repository root contains no Cargo manifest/lockfile and `src/` contains no `.rs` files.

Normal filtering is an in-process call. No binary lookup, subprocess, stdin/stdout protocol, native binding, daemon, or platform-specific filtering artifact remains.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| TS-F01 | Critical | A language migration could silently weaken unknown/fail-open behavior while preserving names only. | Engine path was ported end-to-end and unknown arbitrary output is covered by the deterministic 4,096-case corpus plus E0 seed fixtures. |
| TS-F02 | High | JavaScript values are structurally mutable and can drift after validation. | Engine validates then snapshots the Observation; termination and profile descriptor snapshots are frozen. Registry result IDs use admitted descriptor snapshots. |
| TS-F03 | High | TypeScript's type system alone cannot protect runtime Protocol values from plain JavaScript callers. | Protocol/descriptor/requirements validation remains runtime-enforced with exact-field/enum checks, not compile-time only. |
| TS-F04 | Critical | Preservation could weaken because TS cannot reproduce Rust module privacy exactly. | Public package surface exports only trusted writer/context types and does not export low-level evidence constructors through the package root. Writer rejects forged Signal/DerivedEvidence objects at runtime. Normal static output uses non-interpolating tagged templates. |
| TS-F05 | Medium | Deliberately malicious code loaded in the same process can always bypass library conventions by importing internal files or fabricating its own behavior. | Explicit threat-model boundary: HuGR-Lean protects the normal engine/profile API against accidental/ordinary misuse; it is not a sandbox for hostile code executing in-process. This is materially the same trust assumption as loading arbitrary reducer code in the prior runtime. |
| TS-F06 | High | UTF-8 byte metrics/spans could accidentally become UTF-16 code-unit metrics. | Metrics use `Buffer.byteLength`; ByteSpan conversion validates UTF-8 boundaries and maps byte offsets to JS code units before slicing. Unicode tests cover multi-byte text. |
| TS-F07 | High | SafeNormalization composition could drift during the port. | Fixed SGR -> carriage-redraw composition, presentation capability gate, non-expansion and idempotence checks are ported and fixture-backed. |
| TS-F08 | High | Rewrite-dependent donor profiles could re-enter after framework port. | ProfileRegistry runtime validation still rejects `rewrite_dependent`; descriptor exact-field validation also rejects JS-only metadata drift such as `priority`. |
| TS-F09 | Medium | Fixture migration could rewrite evidence instead of testing the same corpus. | Existing `fixtures/` tree is retained; TS fixture harness reads the same TOML/input/golden files. E0 seed, proving, and normalization corpus execute unchanged. |
| TS-F10 | Medium | Dev tooling could become a production dependency. | `package.json` has zero runtime dependencies; TypeScript/tsx/TOML parser are devDependencies only. Build includes `src` only. |
| TS-F11 | Medium | Package internals could be exposed as supported subpath APIs. | Published package exports only `.` and ships compiled `dist`; `index.ts` defines the supported surface. |
| TS-F12 | Medium | Roadmap/README retained binary/subprocess language after the architectural pivot. | README now documents local TypeScript usage/development; stale missing-binary/timeout integration wording was removed. |
| TS-F13 | Medium | CI quality could rely only on test execution. | Strict TypeScript includes `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; CI runs typecheck, tests, build, and package-content verification. No extra formatter/linter dependency was added solely for ceremony. |

## Behavioral parity map

| Approved behavior | TypeScript evidence | Result |
|---|---|---|
| Protocol validation / strict result invariants | `src/types.ts`, `tests/types.test.ts` | PASS |
| conservative shell identity | `src/command.ts`, `tests/command.test.ts` | PASS |
| SafeNormalization | `src/normalize.ts`, `tests/normalize.test.ts`, shared fixtures | PASS |
| profile routing / ambiguity | `src/engine.ts`, `tests/engine.test.ts` | PASS |
| requirements before analysis | engine/profile tests | PASS |
| preservation contracts | `src/preservation.ts`, `tests/preservation.test.ts` | PASS |
| registry rewrite gate / metadata snapshot | `src/profile.ts`, `tests/profile.test.ts` | PASS |
| exact mechanical primitives | `src/primitive.ts`, `tests/primitive.test.ts` | PASS |
| fixture harness | `tests/support/fixture.ts`, `tests/fixtures.test.ts` | PASS |
| arbitrary unknown passthrough | `tests/arbitrary.test.ts` (4,096 cases) | PASS |
| static writer type guard | `tests/static-types.ts` via strict `tsc --noEmit` | PASS |

## Current candidate CI

- PR #73
- head `d4e1a6bc31eb83967d57e50167bd7aa0dd564cf9`
- CI run `36207902036` — PASS
- 45 Node test cases — PASS
- strict TypeScript typecheck — PASS
- package build/declaration emit — PASS
- `npm pack --dry-run` — PASS
- package size at reviewed head: ~22.2 kB / 34 files before the final docs-only edits

## Runtime/dependency assessment

- production dependencies: **0**
- Rust toolchain required: **no**
- native binary: **no**
- IPC/subprocess: **no**
- network required for filtering: **no**
- database/daemon: **no**
- platform-specific filtering artifact: **no**

## Scope containment

The migration does not add production profile families, cloud services, accounts, background workers, telemetry services, native bindings, or a second runtime.

Rust is removed rather than retained as a reference implementation, per the user's explicit product direction and #72 invariant against dual-runtime maintenance.

## Final disposition

**MIGRATION REVIEW PASS**

The candidate may be merged once its final head CI is green. G-E1 must then be re-run against the squash commit on `main` before E2 resumes.
