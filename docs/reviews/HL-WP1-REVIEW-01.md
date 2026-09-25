# HL-WP1 — Cold / Adversarial Review 01

**Work Package:** #8 — WP1 Core engine  
**Reviewed child work:** #21–#25  
**Date:** 2026-09-25  
**Disposition:** **WP1 PASS**  
**Epic gate:** **G-E1 PENDING** — WP2 Safe normalization remains open

## Review objective

Determine whether the core engine is actually ready to serve as the stable foundation for SafeNormalization and later profile coverage.

The review challenged:

- protocol truthfulness;
- unknown/ambiguous fail-open behavior;
- shell identity overreach;
- profile-routing ambiguity;
- preservation-evidence fabrication;
- non-expansion;
- deterministic behavior;
- resource bounds;
- test harness independence from OpenCode;
- dependency creep;
- whether the proving profile accidentally became production coverage;
- whether WP1 completion was being confused with E1 gate completion.

## Evidence baseline

Completed child issues:

- #21 — Protocol V1 / Rust package
- #22 — conservative invocation identity
- #23 — fail-open engine routing pipeline
- #24 — evidence-backed preservation contracts
- #25 — verification harness and proving profile

Latest post-WP1 `main` CI:

- run `36158168267` — **PASS**
- `cargo fmt --all -- --check`
- `cargo test --locked --all-targets`
- `cargo test --locked --doc`
- `cargo clippy --locked --all-targets --all-features -- -D warnings`
- **75 regular tests passed**
- **2 compile-fail doctests passed**
- **0 failures**

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| WP1-F01 | High | Protocol termination originally risked conflating unknown and success. | Protocol V1 has explicit Unknown/Exited/Aborted/TimedOut semantics and contradictory code/state pairs are rejected. |
| WP1-F02 | High | Profile routing could have been driven by output resemblance alone. | Routing was structurally hardened to identity match first, optional shape guard second. |
| WP1-F03 | High | Registration order could have silently selected among overlapping profiles. | 2+ matching profiles fail open as `ambiguous_profile`; no priority/confidence mechanism exists. |
| WP1-F04 | Critical | Public evidence constructors could have accepted fabricated caller-provided “source” text. | Low-level Signal constructors are module-private; profiles create evidence only through `ProfileContext` bound to the real baseline/Observation. |
| WP1-F05 | High | Dynamic model-visible text could have escaped through a generic writer method. | LeanWriter exposes no generic dynamic write; `static_text` accepts only `&'static str`. Compile-fail doctest enforces the boundary. |
| WP1-F06 | High | Derived counts could have double-counted duplicate/overlapping spans. | Count evidence requires ordered, distinct, non-overlapping validated spans. |
| WP1-F07 | Medium | Empty SignalId initially could panic via assertion. | Invalid IDs fail as normal EvidenceError; fail-open philosophy is preserved. |
| WP1-F08 | High | Fixture metadata could remain aspirational documentation rather than executable evidence. | Fixture Contract v1 now has a Rust loader/runner; all E0 seed fixtures execute through the real core. |
| WP1-F09 | Medium | Fixture provenance/path metadata could be accepted without structural checks. | Harness validates IDs, schema, golden path confinement, provenance class, regression consistency, termination mapping, and preservation annotation hygiene. |
| WP1-F10 | High | A proving profile using a real ecosystem command would prematurely start profile coverage before E2. | Proving profile uses artificial `hugr-lean-prove`, exists only under tests, and is not registered by the default engine. |
| WP1-F11 | Medium | “Fuzz foundation” could trigger premature cargo-fuzz/proptest infrastructure. | WP1 uses a deterministic 4,096-case UTF-8/control/shell-like generative corpus. Persistent fuzz tooling remains a later SHOULD, not a runtime subsystem. |
| WP1-F12 | Medium | Adding TOML for fixture parsing could expand runtime dependencies. | `toml` is dev-dependency only; runtime dependency surface remains serde + serde_json. |
| WP1-F13 | Medium | “raw-decision” wording could be misread as requiring WP1 to implement raw storage/policy. | WP1's core outcome explicitly leaves `raw_ref=None`; decision + exact saved-byte metrics provide the later WP4 input. Storage/retention policy remains normatively owned by WP4. No empty hook framework is introduced. |
| WP1-F14 | High | Completing WP1 could be incorrectly treated as passing G-E1. | Corrected: E1 contains both WP1 and WP2. G-E1 remains blocked until WP2 #9 / #26–#28 completes. |

## Invariant assessment

### Determinism

PASS.

- Protocol serialization contracts are explicit.
- command identity tests are deterministic;
- engine results repeat identically for equivalent observations;
- fixture idempotence is executable;
- generative corpus uses deterministic seed/state.

### Unknown conservatism

PASS for the WP1 baseline.

- default engine has no production profiles;
- unknown output is passthrough;
- complex shell syntax becomes ComplexOrUnknown;
- E0 conservative fixtures execute against the core;
- arbitrary UTF-8/shell-like corpus remains exact passthrough.

SafeNormalization itself is intentionally **not assessed here**; that is WP2.

### Fail-open

PASS.

Evidence covers:

- malformed protocol;
- unsupported schema;
- ambiguous profiles;
- unmet completeness/termination requirements;
- analysis failure;
- render failure;
- preservation failure;
- oversized active input;
- non-expanding candidate rejection.

### Preservation

PASS.

- dynamic evidence is source/outcome/derived backed;
- required signal emission is mechanically tracked;
- missing signal fails open;
- derived evidence has named rule + exact source spans;
- fake-source and dynamic-static writer escape paths are compile-fail protected.

### Non-expansion

PASS.

- result validation rejects expanded metrics;
- engine discards equal/larger profile candidates;
- fixture harness checks non-expansion;
- default/unknown generated corpus remains byte-exact.

### Host independence

PASS.

All WP1 correctness tests execute without OpenCode or any host SDK.

## WP1 Success Criteria

| Criterion | Result |
|---|---|
| Fixtures traverse complete core without host | PASS — proving fixture |
| Unknown input safely passes through | PASS — E0 fixtures + 4,096 generated cases |
| Known input can be deterministically reduced | PASS — test-only proving profile |
| Preservation failure reliably fails open | PASS — engine + preservation tests |

## WP1 Completeness

| Area | Result |
|---|---|
| Protocol success/malformed/version paths | PASS |
| Unknown classification | PASS |
| Profile route/ambiguity | PASS |
| Analyze/render/validate fail-open | PASS |
| Exact byte metrics | PASS |
| Non-expansion | PASS |
| Resource bounds | PASS |
| Preservation evidence | PASS |
| Raw retention boundary | PASS as explicit no-retention baseline; WP4 owns storage |
| Verification harness | PASS |
| All children #21–#25 | PASS |

## Dependency review

Runtime dependencies remain intentionally small:

- serde
- serde_json

Test-only:

- toml

No:

- async runtime;
- network client;
- database;
- tokenizer;
- LLM SDK;
- host SDK;
- parser framework;
- daemon/service dependency.

## Final disposition

**WP1 — PASS**

WP1 is complete and may close.

However:

> **G-E1 Core Correctness does not pass yet.**

Per HL-ROADMAP-001, E1 includes:

- WP1 Core engine — **COMPLETE**
- WP2 Safe normalization — **OPEN**

Therefore the next execution lane is:

~~~text
WP2 #9
  #26 terminal SafeNormalization primitives
  #27 SafeNormalization adversarial negative corpus
  #28 composition + fallback semantics

then:
  E1 cold review
  G-E1 Core Correctness
~~~

No production profile-family work (#29+) should begin before G-E1 passes.
