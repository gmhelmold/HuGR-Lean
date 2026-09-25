# HL-E1 — Core Correctness Gate Review 01

**Epic:** #2 — E1 Core Engine  
**Reviewed Work Packages:** WP1 #8; WP2 #9  
**Date:** 2026-09-25  
**Disposition:** **G-E1 — PASS**

## Review objective

Determine whether the HuGR-Lean core is stable enough to permit broad production-profile work in E2.

This review is intentionally stricter than either WP review in isolation. It checks the complete chain:

~~~text
Protocol V1
  -> resource guard
  -> SafeNormalization
  -> invocation identity
  -> identity-first routing
  -> shape guard
  -> profile requirements
  -> analysis
  -> evidence-backed rendering
  -> Preservation Contract
  -> profile validation
  -> non-expansion
  -> exact byte metrics
  -> FilterResultV1
~~~

and all fail-open exits from that chain.

## Evidence

### WP1

- #21–#25 complete
- `docs/reviews/HL-WP1-REVIEW-01.md` — **PASS**
- Protocol, identity, router, preservation, fixture harness and proving profile established

### WP2

- #26–#28 complete
- `docs/reviews/HL-WP2-REVIEW-01.md` — **PASS**
- SafeNormalization primitives, adversarial corpus and engine composition established

### Current main verification

CI run `36184040202` — **PASS**

- **107 regular tests**
- **2 compile-fail doctests**
- **0 failures**
- fmt green
- clippy with `-D warnings` green
- locked dependency graph

## Gate findings

| ID | Severity | Finding challenged | Gate result |
|---|---|---|---|
| E1-F01 | Critical | Can unknown/ambiguous input be aggressively reduced? | NO — unknown identity/presentation remain conservative; ambiguous profiles fail open. |
| E1-F02 | Critical | Can a profile route only because output text resembles a known tool? | NO — identity recognition is structurally first; shape guard cannot create identity match. |
| E1-F03 | Critical | Can model-visible evidence be fabricated by arbitrary dynamic strings? | Normal writer path is structurally constrained; source/outcome/derived evidence and compile-fail boundaries are enforced. |
| E1-F04 | High | Can SafeNormalization mutate unknown arbitrary payload? | NO — TerminalRendered capability is required. |
| E1-F05 | High | Can a reducer erase required failure evidence and still succeed? | NO — required Signal IDs must be emitted or preservation fails open. |
| E1-F06 | High | Can normalization/profiles expand model-visible output? | NO — primitives self-check non-expansion; profile candidates must be strictly smaller than the safe baseline; Protocol result validation also rejects expanded metrics. |
| E1-F07 | High | Can incomplete/unknown execution data produce unsupported complete claims? | Profile requirements carry Complete/Exited gates; unknown/truncated cases fail conservative. |
| E1-F08 | High | Can normalized offsets corrupt preservation evidence? | NO — evidence spans are built against ProfileContext safe baseline; integration test covers ANSI-removal offset change. |
| E1-F09 | High | Can a failing transform leave a partial mutation model-visible? | NO — transform/profile/preservation failures return failed_open with no replacement; original remains adapter-owned. |
| E1-F10 | Medium | Can the core require host SDK/network/daemon/database to verify correctness? | NO — all gate evidence is host-independent and local. |
| E1-F11 | Medium | Did E1 accidentally start broad ecosystem profile coverage? | NO — only artificial test proving profiles exist; production families remain E2. |
| E1-F12 | Medium | Are docs/spec artifacts stale relative to shipped core behavior? | Stale pre-WP2 baseline/result wording was corrected before gate approval. |

## Invariant assessment

### No LLM / no semantic guessing

PASS.

No inference or semantic relevance dependency exists.

### Fail open

PASS.

Covered paths include:

- malformed protocol;
- unsupported schema;
- oversized input;
- normalization failure;
- unknown/complex invocation;
- no matching profile;
- profile ambiguity;
- incomplete input;
- unknown/non-exited termination;
- analysis failure;
- render failure;
- missing preservation evidence;
- profile validation failure;
- non-improving candidate.

### Critical-signal preservation

PASS for the framework.

Production critical-signal declarations are profile-specific and therefore belong to E2. The framework mechanically enforces declared required signals.

### Observable determinism

PASS.

Equivalent observation/config/profile state produces equivalent model-visible decisions and output.

### Unknown conservatism

PASS.

Default engine has no production profiles; unknown output is passthrough unless an explicit presentation capability enables the narrowly admitted terminal normalization.

### Workflow/host independence

PASS for core.

No host integration is claimed by E1. All core behavior is executable without OpenCode.

### Complexity containment

PASS.

Runtime dependencies remain small and no context-management subsystem was introduced.

## E1 Success Criteria

| Criterion | Result |
|---|---|
| WP1 and WP2 reach DoD | PASS |
| Full Observation -> result path proven | PASS |
| SafeNormalization gated/deterministic/idempotent/non-expanding | PASS |
| G-E1 Core Correctness | **PASS** |

## E1 Completeness Criteria

| Criterion | Result |
|---|---|
| Protocol evidence | PASS |
| routing/identity evidence | PASS |
| preservation evidence | PASS |
| fail-open evidence | PASS |
| exact byte metrics | PASS |
| normalization evidence | PASS |
| proving-profile evidence | PASS |
| all E1 child work complete | PASS |
| gate evidence archived | PASS |
| unresolved Critical/High defect | **0** |

## Gate decision

**G-E1 — PASS**

E1 may close.

The project may now begin E2 Profile System & Coverage.

The next normative execution lane is:

~~~text
WP3 #10
  #29 profile framework / requirements / shape guards
  then profile families #30–#36
  #37 coverage/provenance closure

WP7 #14 continues in parallel as the verification corpus lane.
~~~

No E1 finding requires reopening the approved Technical Specification.
