# HuGR-Lean - Roadmap / Execution Plan

**Document ID:** HL-ROADMAP-001
**Version:** 0.1
**Status:** Epic baseline
**Normative parents:** HL-PLAN-001 v1.1; HL-SPEC-001 v1.0

## 0. Execution model

The hierarchy is deliberately small:

~~~text
Project
  -> Epic
      -> Work Package issue
          -> independently executable/verifiable sub-issues
          -> evidence
      -> Epic gate
~~~

Epics express execution phases and integration outcomes. Work Packages remain the planning units defined by HL-PLAN-001.

No WP is promoted to an epic merely to make the roadmap look busy.

## 1. Epic map

| Epic | Tracking issue | Name | Primary Work Packages | Outcome |
|---|---|---|---|---|
| E0 | #1 | Evidence & Baseline | WP0 + WP7 seed | Donor knowledge, provenance and verification baseline |
| E1 | #2 | Core Engine | WP1 + WP2 | Correct deterministic fail-open filtering engine |
| E2 | #3 | Profile System & Coverage | WP3 + WP7 growth | Broad safe coverage with Preservation Contracts |
| E3 | #4 | Recovery & Safety | WP4 | Exact optional raw recovery without context infrastructure |
| E4 | #5 | OpenCode Integration & UX | WP5 + WP6 | Installable invisible product in first supported host |
| E5 | #6 | Proof, Packaging & Release | WP8 + WP9 + WP7 maturity | Reproducible benchmarked public release |

## 2. Dependency graph

~~~text
E0 Evidence & Baseline
        |
        v
E1 Core Engine
        |
        +----------------+
        v                v
E2 Coverage       E3 Recovery & Safety
        |                |
        +--------+-------+
                 v
        E4 OpenCode Product
                 |
                 v
        E5 Proof & Release
~~~

WP7 is continuous: seeded in E0, expanded through E1-E4, and release-hardened in E5.

## 3. Release slices

### S1 - Engine Proof

Produced by E0 + E1.

Must prove Protocol V1, conservative unknown handling, Preservation Contracts, fail-open behavior and a complete fixture-driven reducer path. This is not a user release.

### S2 - Useful Engine

Produced by E2 + E3.

Must contain multiple real profiles, regression evidence, consolidated donor knowledge and optional exact raw recovery.

### S3 - Integrated Product

Produced by E4.

Must work in a real OpenCode v1.18.32 session with transparent interception, safe failures, install/disable/uninstall and no command-prefix discipline.

### S4 - Public Release

Produced by E5.

Requires benchmarks, platform artifacts, compatibility statement, provenance/notices and all release gates green.

---

# 4. E0 - Evidence & Baseline

## Mission

Do not rebuild years of edge-case knowledge blindly.

## Includes

- WP0 - Evidence & donor audit
- WP7 - Verification corpus seed

## Scope

- audit RTK, TRS and CX;
- selectively inspect LeanCTX/context-compress only where directly relevant;
- build coverage and overlap matrices;
- classify donor behavior as ADOPT / ADAPT / REIMPLEMENT / REJECT;
- identify rewrite-dependent reducers;
- pin licenses and provenance;
- seed real-output fixtures.

## Critical question

For every donor reducer:

> Does it parse native post-execution output, or does it work only because the donor rewrites the command first?

No reducer is ported before that answer is explicit.

## Exit criteria

- donor revisions and licenses pinned;
- initial coverage matrix exists;
- considered donor capabilities have dispositions;
- rewrite dependencies are explicit;
- fixture taxonomy and initial corpus exist;
- no unknown-provenance implementation enters the repository.

## Gate

**G-E0 - Evidence Ready**

Another engineer can reproduce reuse decisions from repository evidence.

## Non-goals

No production reducer framework, host integration or wholesale donor port.

---

# 5. E1 - Core Engine

## Mission

Build the smallest implementation that enforces HL-SPEC-001.

## Includes

- WP1 - Core engine
- WP2 - Safe normalization

## Scope

- one Rust package, library + binary;
- Protocol V1;
- ObservationV1 and FilterResultV1;
- SourceV1, ShellDialectV1, TerminationV1, CompletenessV1;
- conservative command identity;
- SafeNormalization;
- profile router skeleton;
- evidence-backed Signal model;
- LeanWriter;
- Preservation Contract validation;
- fail-open;
- non-expansion guard;
- byte metrics;
- bounded configuration;
- property/fuzz foundations.

One small proving profile may exist only to exercise the entire pipeline.

## Exit criteria

The following path is proven end-to-end:

~~~text
Observation
 -> identify
 -> route
 -> analyze
 -> render
 -> validate
 -> non-expansion
 -> FilterResult
~~~

Additionally:

- unknown arbitrary output is passthrough;
- malformed protocol cannot mutate host output;
- missing preservation evidence fails open;
- SafeNormalization is applicability-gated and idempotent;
- complex shell identity is conservative;
- core has no LLM, network, database or daemon requirement.

## Gate

**G-E1 - Core Correctness**

No broad profile expansion before this passes.

---

# 6. E2 - Profile System & Coverage

## Mission

Make HuGR-Lean broadly useful without turning coverage into parser sprawl.

## Includes

- WP3 - Profile framework & coverage
- WP7 - Profile/regression corpus growth

## Target families

- Git / GitHub;
- Rust / Cargo;
- Python / pytest;
- JavaScript / TypeScript tests;
- Go tests;
- compiler/linter diagnostics;
- Docker / kubectl;
- filesystem/search where deterministic reduction is safe.

## Priority order

Profiles are prioritized by:

1. real coding-agent output volume;
2. obvious deterministic waste;
3. quality of donor evidence;
4. safety;
5. implementation simplicity.

Not by command-count marketing.

## Evidence per profile

Where applicable:

- success;
- failure;
- warnings;
- malformed output;
- ambiguity;
- truncated/incomplete input;
- unknown termination;
- version variants;
- already-lean/idempotence;
- Preservation Contract assertions.

## Exit criteria

- target matrix is supported/deferred/rejected;
- one coherent primitive/profile architecture exists;
- rewrite-dependent donor code is never mistaken for native-compatible parsing;
- known destructive false positives = 0 in the corpus;
- every discovered destructive bug becomes a permanent regression fixture.

## Gate

**G-E2 - Coverage Safe**

Coverage breadth is accepted only while evidence quality remains intact.

---

# 7. E3 - Recovery & Safety

## Mission

Provide exact recovery without creating memory infrastructure.

## Includes

- WP4 - Raw preservation & recovery
- raw-store security/privacy obligations from HL-SPEC-001

## Scope

- disabled by default;
- bounded local store;
- exact boundary input;
- 128-bit random IDs;
- atomic publication;
- lazy cleanup;
- TTL and store pressure;
- exact retrieval;
- explicit invalid/expired/unavailable behavior;
- filesystem safety and permissions;
- storage failure non-interference.

## Exit criteria

- enabled recovery is exact;
- disabled recovery writes no persistent raw;
- filtering correctness never depends on recovery;
- concurrent writes cannot overwrite;
- cleanup cannot escape cache root;
- store pressure has defined behavior;
- no secret-redaction promise;
- no daemon/database/index/search.

## Gate

**G-E3 - Recovery Safe**

Raw remains bounded evidence, not a second product.

E3 may run in parallel with later E2 coverage once core result semantics are stable.

---

# 8. E4 - OpenCode Integration & UX

## Mission

Turn the engine into an installable product that the user can forget is running.

## Includes

- WP5 - Host integration
- WP6 - CLI, configuration & UX

## First supported host

OpenCode v1.18.32.

A wider version range is advertised only after compatibility evidence exists.

## Scope

- thin TypeScript plugin;
- post-execution tool hook;
- ObservationV1 mapping;
- direct one-shot Rust subprocess;
- strict response validation;
- top-level no-throw fail-open boundary;
- binary discovery;
- disabled-mode fast path;
- process deadline;
- install/status/doctor;
- enable/disable;
- uninstall;
- platform binary resolution.

## Hard rules

- no pre-execution command rewriting;
- no shell interpolation to invoke HuGR-Lean;
- missing binary, bad config, bad JSON or timeout cannot crash OpenCode;
- attachments are untouched;
- no default model-visible telemetry.

## Exit criteria

A real session proves:

~~~text
ordinary tool call
 -> OpenCode post-execution hook
 -> HuGR-Lean
 -> safe smaller replacement
 -> model receives replacement
~~~

Failure injection must preserve the original tool result.

## Gate

**G-E4 - Integrated Product**

Install, disable and uninstall are part of the evidence.

## Non-goals

No Codex/Claude adapter, daemon or native binding in this epic.

---

# 9. E5 - Proof, Packaging & Release

## Mission

Prove value and publish something another engineer can independently trust.

## Includes

- WP8 - Benchmark & proof
- WP9 - Distribution & release quality
- WP7 - Release corpus maturity

## Scope

- benchmark methodology;
- exact boundary byte measurements;
- latency distribution;
- per-profile/workload reduction;
- favorable and unfavorable cases;
- realistic OpenCode session benchmark;
- release artifacts;
- platform matrix and checksums;
- install/upgrade/uninstall;
- compatibility matrix;
- third-party notices;
- release checklist and docs.

## Initial platform target

- macOS x86_64;
- macOS arm64;
- Linux x86_64;
- Linux arm64;
- Windows x86_64.

A platform is not advertised until actually tested.

## Benchmark honesty

Published results distinguish:

- HuGR-Lean boundary input;
- HuGR-Lean replacement;
- host-side upstream truncation;
- exact bytes;
- optional tokenizer-specific estimates;
- tool-output savings versus whole-session impact.

## Exit criteria

- all MUST invariants green;
- no known critical-signal loss;
- reproducible benchmark;
- performance budget met or formally amended by evidence;
- installation and removal verified;
- provenance/notices complete;
- artifacts verified;
- compatibility claims test-backed;
- release checklist complete.

## Gate

**G-E5 - Release**

Passing this gate produces the first public release.

---

# 10. Continuous verification lane

~~~text
E0 donor + real fixtures
 |
 v
E1 core/property fixtures
 |
 v
E2 profile + regression corpus
 |
 v
E3 raw/security fixtures
 |
 v
E4 host integration fixtures
 |
 v
E5 release corpus + benchmarks
~~~

Any destructive false positive becomes permanent regression evidence.

# 11. Epic completion rule

An epic is complete only when:

1. included WPs satisfy their Definitions of Done;
2. epic exit criteria are met;
3. required evidence exists in-repo;
4. the epic gate passes;
5. no Critical/High defect is hidden under a later epic.

Merged code alone is not completion.

# 12. Parallelization policy

Allowed:

- E0 donor audits in parallel;
- E1 protocol, SafeNormalization fixtures and test infrastructure after contracts stabilize;
- E2 profile families in parallel after the profile framework stabilizes;
- E3 alongside later E2;
- E4 packaging/test harness alongside final coverage after protocol stability;
- E5 benchmark/package harness may start early, but claims wait for integrated evidence.

Disallowed:

- profiles before core contracts stabilize;
- competing profile frameworks;
- adapters reimplementing reducers;
- release packaging before provenance is understood.

# 13. GitHub work-item hierarchy

## 13.1 Mandatory work-item axioms

Every GitHub work item in HuGR-Lean — Epic, Work Package, child issue, or any future independently tracked implementation/review issue — MUST explicitly contain:

1. **Invariants**
2. **Success Criteria**
3. **Quality Standards**
4. **Completeness Criteria**
5. **Definition of Done**

These sections are mandatory even when the issue is primarily research, documentation, verification, packaging, or review work.

A child issue MUST preserve the invariants of its parent WP. A WP MUST preserve the invariants of its parent Epic and the normative plan/specification. An Epic MUST preserve the project-level invariants.

An issue is not planning-complete if any of the five sections is absent.

The execution hierarchy has been created.

~~~text
Epic #1-#6
  -> WP #7-#16
      -> child work items #17-#62
~~~

WP tracking issues carry the HL-PLAN-001 axioms:

- Success Criteria;
- Quality Standards;
- Completeness Criteria;
- Definition of Done;
- Invariants.

Child issues exist only for work that is independently executable or independently verifiable. Parent tasklists provide navigable progress tracking and each child links back to its WP.

# 14. Epic-to-WP issue mapping

| Epic | WP tracking issue(s) | Child issues |
|---|---|---|
| E0 #1 Evidence & Baseline | WP0 #7; WP7 #14 (seed) | WP0: #17-#20; WP7: #49-#53 |
| E1 #2 Core Engine | WP1 #8; WP2 #9 | WP1: #21-#25; WP2: #26-#28 |
| E2 #3 Profile System & Coverage | WP3 #10; WP7 #14 (growth) | WP3: #29-#37; WP7: #49-#53 |
| E3 #4 Recovery & Safety | WP4 #11 | #38-#41 |
| E4 #5 OpenCode Integration & UX | WP5 #12; WP6 #13 | WP5: #42-#44; WP6: #45-#48 |
| E5 #6 Proof, Packaging & Release | WP8 #15; WP9 #16; WP7 #14 (maturity) | WP8: #54-#57; WP9: #58-#62; WP7: #49-#53 |

# 15. Current state

~~~text
HL-PLAN-001 v1.1   Approved
HL-SPEC-001 v1.0   Approved
HL-ROADMAP-001     Epic baseline

Project state:
Roadmapped
~~~

Execution tree is fully decomposed. The first executable lane is E0: WP0 #7 and the WP7 corpus seed #14.
