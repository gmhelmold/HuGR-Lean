# HL-E1 — Core Correctness Gate Review 02 (TypeScript Runtime)

**Epic:** #2 — E1 Core Engine  
**Runtime amendment:** #72  
**Date:** 2026-09-25  
**Disposition:** **G-E1 — PASS**

## Why this review exists

E1 previously passed on an unreleased Rust + subprocess implementation. Issue #72 replaced that runtime with a single local TypeScript package.

This review re-runs the gate on the final TypeScript-only tree. Historical Rust gate evidence remains useful as design provenance but is no longer the release/runtime implementation.

## Reviewed runtime

Squash commit:

~~~text
816e102bc9942598fa27e9b0bf7be1df986ef2a6
~~~

Post-merge main CI:

~~~text
36208038423 — PASS
~~~

Verification at that commit:

- strict TypeScript typecheck — PASS;
- 45 Node tests — PASS;
- 0 test failures;
- package build/declaration emit — PASS;
- npm package dry-run — PASS;
- package size ~22.6 kB / 34 files;
- runtime production dependencies — 0.

## Final runtime architecture

~~~text
host adapter
  -> ObservationV1
  -> Engine.process(observation)
      -> validate
      -> size guard
      -> SafeNormalization
      -> invocation identity
      -> profile registry / routing
      -> requirements
      -> analysis
      -> LeanWriter
      -> Preservation Contract
      -> profile validation
      -> non-expansion
      -> FilterResultV1
  -> adapter applies valid replacement or preserves original
~~~

No subprocess, JSON IPC, native binary, Rust toolchain, daemon, database, or network service participates in normal filtering.

## Gate findings

| ID | Severity | Gate challenge | Result |
|---|---|---|---|
| E1TS-F01 | Critical | Did unknown/ambiguous input become more aggressive in the port? | NO — default unknown output remains passthrough; ambiguity remains fail-open. |
| E1TS-F02 | Critical | Did preservation become type-only and bypassable by ordinary JS callers? | NO — runtime Signal/DerivedEvidence provenance checks and PreservationContract validation remain active; static writer path rejects interpolation/forged ordinary calls. |
| E1TS-F03 | High | Did JS UTF-16 semantics corrupt byte metrics/evidence offsets? | NO — UTF-8 byte accounting uses Buffer.byteLength and ByteSpan conversion validates byte boundaries. |
| E1TS-F04 | High | Did SafeNormalization widen during migration? | NO — TerminalRendered applicability, SGR grammar, carriage-redraw proof, idempotence and non-expansion remain fixture-backed. |
| E1TS-F05 | High | Could rewrite-dependent donor profiles be admitted accidentally? | NO — registry runtime validation rejects rewrite_dependent descriptors. |
| E1TS-F06 | High | Can mutable JS objects change admitted metadata/result identity after validation? | Engine snapshots observations and registry snapshots/freeze descriptors; tests cover descriptor drift. |
| E1TS-F07 | High | Can a partial failure leak mutated output? | NO — normalization/profile/preservation failures produce failed_open and adapter-owned original remains authoritative. |
| E1TS-F08 | Medium | Did migration replace evidence by rewriting fixtures? | NO — the existing fixture tree is retained and executed by the TS harness. |
| E1TS-F09 | Medium | Did the new package introduce runtime dependency/packaging complexity? | NO — zero production dependencies, single package, normal ESM build. |
| E1TS-F10 | Medium | Does TypeScript provide a hostile-code sandbox equivalent to language/module privacy? | Not claimed. Reducer/profile code loaded in-process is trusted code. The safety contract protects the normal engine/profile API, not malicious arbitrary code execution. |

## Evidence parity

- E0 seed fixtures execute unchanged;
- proving profile traverses the full TypeScript engine path;
- full normalization corpus executes unchanged;
- 4,096 deterministic arbitrary UTF-8/shell-like cases preserve unknown output;
- protocol/result validation is runtime-enforced for plain JavaScript callers;
- profile requirements fail conservative before analysis;
- missing mandatory signals fail open;
- dynamic writer interpolation is rejected by typecheck and runtime normal-path guards;
- package root exports only the supported public surface.

## Simplicity assessment

The TypeScript runtime is materially simpler for the stated product:

- one package;
- eight source modules;
- zero runtime dependencies;
- no platform matrix for filtering binaries;
- no process startup or IPC;
- no dual runtime.

This aligns with the product's local/free/open-source direction and the project simplicity constitution.

## E1 gate criteria

| Criterion | Result |
|---|---|
| WP1 behavioral contracts preserved | PASS |
| WP2 SafeNormalization contracts preserved | PASS |
| Observation -> result path proven | PASS |
| unknown conservatism | PASS |
| fail-open | PASS |
| preservation framework | PASS |
| non-expansion / exact UTF-8 metrics | PASS |
| host-independent fixture verification | PASS |
| no LLM/network/database/daemon dependency | PASS |
| unresolved Critical/High migration defect | **0** |

## Gate decision

**G-E1 — PASS on TypeScript-only runtime**

Issue #72 may close. E1 may return to Complete and E2 profile-family implementation may resume.
