# HuGR-Lean — Formal Project Plan

**Document ID:** HL-PLAN-001  
**Version:** 1.0  
**Status:** Normative planning baseline  
**Supersedes:** Project Plan v0.1  
**Scope:** Product definition, project constraints, work decomposition, verification obligations, and completion criteria  
**Next normative documents:** Technical Specification; Roadmap / Execution Plan

---

## 0. Purpose and specification style

This document defines **what HuGR-Lean is required to become**, which properties must always hold, which outcomes constitute completion, and what evidence is required before the project can advance.

It deliberately does **not** define concrete implementation structures such as programming language, modules, structs, profile syntax, storage backend, or host-specific APIs. Those belong to the Technical Specification.

The document follows a Lamport-style discipline:

1. describe the system above the code;
2. distinguish **state**, **actions**, and **properties**;
3. state assumptions explicitly;
4. separate **safety** ("nothing bad happens") from **liveness** ("something good eventually happens");
5. make invariants checkable;
6. treat implementation as a refinement of the specification, not as the specification itself.

Reference material:

- Leslie Lamport, *Thinking Above the Code*: https://www.microsoft.com/en-us/research/video/thinking-above-the-code/
- Leslie Lamport, *Specifying Systems*: https://lamport.org/tla/book.html

This is **not** a decorative TLA+ exercise. A machine-checkable TLA+ module shall be introduced later only if the Technical Specification exposes concurrency or state-transition risks for which model checking provides material value.

---

# Part I — Normative language and system definition

## 1. Normative language

The terms **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

- **MUST / MUST NOT** — project invariant or release-blocking requirement.
- **SHOULD / SHOULD NOT** — default requirement; deviations require written justification and evidence.
- **MAY** — optional behavior that cannot weaken any MUST-level property.

A requirement is not considered satisfied because code exists. It is satisfied only when the required evidence exists.

---

## 2. Product statement

HuGR-Lean is a small, deterministic, installable filtering layer that intercepts tool results **before those results enter a coding agent's model-visible context**.

Its responsibility is narrow:

> Remove output that can be proven to be execution noise while preserving everything that cannot be safely classified as noise.

HuGR-Lean is not responsible for deciding what information is semantically useful to the model.

---

## 3. Problem statement

Coding-agent sessions accumulate large volumes of output whose primary purpose is human terminal presentation or transient execution feedback rather than durable reasoning context.

Representative classes include:

- ANSI and terminal escape sequences;
- spinner frames;
- progress bars;
- carriage-return redraws;
- repeated lines or blocks;
- duplicated diagnostics;
- verbose success listings;
- repeated build/download chatter;
- redundant headers;
- repetitive logs;
- predictable CLI boilerplate.

When emitted directly into model context, this material can:

1. consume tokens without proportional informational value;
2. trigger compaction earlier;
3. increase cost;
4. shorten useful session life;
5. compete with relevant state and instructions;
6. recur across repeated tool executions.

HuGR-Lean addresses this problem at ingestion time rather than attempting to repair an already bloated transcript.

---

## 4. System boundary

### 4.1 In scope

HuGR-Lean includes:

- observation capture at an available tool-result boundary;
- safe generic hygiene;
- recognition of known output families;
- deterministic profile-based reduction;
- conservative passthrough;
- critical-signal preservation;
- optional temporary raw-output preservation;
- exact raw recovery;
- reduction metrics;
- small host adapters;
- CLI/configuration required to install, inspect, enable, disable, and recover;
- verification corpus and reproducible benchmarks;
- third-party provenance required by reused code.

### 4.2 Out of scope

HuGR-Lean MUST NOT become:

- a session summarizer;
- a semantic compressor;
- a memory system;
- RAG;
- a vector database;
- a knowledge graph;
- a BM25/FTS information-retrieval system;
- a prompt optimizer;
- a context orchestrator;
- an autonomous agent;
- an LLM judge;
- a replacement for host compaction;
- a logging platform;
- an observability platform;
- a workflow engine;
- a general terminal emulator.

Adjacent ideas may exist elsewhere, but MUST NOT be smuggled into HuGR-Lean without changing this plan through explicit review.

---

## 5. Abstract entities

The project uses the following implementation-independent concepts.

### 5.1 Observation

An **Observation** is the complete result made available by a tool boundary before HuGR-Lean modifies model-visible content.

Conceptually, an observation may contain:

- payload;
- source/host identity;
- tool identity;
- command identity when applicable;
- stdout/stderr distinction when available;
- exit/failure metadata when available;
- content type or equivalent metadata when available.

The Technical Specification may refine this model but MUST preserve its semantics.

### 5.2 Lean Result

A **Lean Result** is the observation representation emitted toward model-visible context after HuGR-Lean processing.

### 5.3 Critical Signal

A **Critical Signal** is information whose loss could alter the model's understanding of whether an operation succeeded, failed, why it failed, or what concrete object/location is implicated.

Examples may include:

- non-zero exit/failure state;
- explicit error diagnostics;
- panic/fatal markers;
- failed test identity;
- relevant file/line coordinates;
- failure summary;
- other profile-specific mandatory evidence.

Critical-signal definitions MUST be explicit and fixture-tested for every profile.

### 5.4 Known Noise

**Known Noise** is material removable by a rule whose safety can be justified without semantic inference.

Examples include terminal control codes and confidently identified progress frames.

### 5.5 Profile

A **Profile** is a deterministic set of rules for a recognized output family.

### 5.6 Generic Hygiene

**Generic Hygiene** is the subset of transformations considered safe enough to apply without a profile.

### 5.7 Raw Artifact

A **Raw Artifact** is an exact retained representation of an original observation payload created when retention policy requires it.

### 5.8 Host Adapter

A **Host Adapter** connects a specific coding-agent/tool environment to the implementation-independent HuGR-Lean core.

---

# Part II — Abstract behavior

## 6. Abstract state

For specification purposes, processing one observation is modeled by the following abstract state:

~~~text
phase ∈ {
  Captured,
  Classified,
  Reduced,
  Validated,
  Emitted,
  FailedOpen
}

raw             = original observation
classification  ∈ {Known(profile), Unknown}
candidate       = proposed model-visible result
result          = emitted model-visible result
rawRef          ∈ {None} ∪ RawArtifactId
metrics         = reduction evidence
~~~

This state is descriptive, not an implementation prescription.

---

## 7. Initial condition

For every accepted observation:

~~~text
Init ==
  phase = Captured
  ∧ raw = observation
  ∧ result = None
  ∧ classification = Unknown
~~~

No filtering decision exists before capture.

---

## 8. Abstract actions

### A1 — Classify

The system may classify an observation as belonging to a known profile only when profile detection criteria are satisfied.

Otherwise classification remains Unknown.

### A2 — GenericClean

The system may apply generic hygiene only using rules admitted to the universal-safe set.

### A3 — ProfileReduce

If and only if a known profile is selected, the system may apply that profile's deterministic rules.

### A4 — Validate

The candidate result is checked against applicable preservation rules.

Validation MAY be structural and rule-based; it MUST NOT invoke an LLM.

### A5 — FailOpen

If classification, reduction, or validation cannot establish safe behavior, the system emits a conservative representation, up to and including the original payload.

### A6 — PreserveRaw

If retention policy requires preservation after material reduction, an exact Raw Artifact is recorded.

Failure to preserve optional raw data MUST NOT cause destructive filtering to continue under assumptions that recovery exists.

### A7 — Emit

Exactly one model-visible result is produced for an accepted observation, unless the host itself aborts/cancels the tool interaction before delivery.

### A8 — ExpireRaw

Retained Raw Artifacts are deleted according to the configured retention policy.

---

## 9. Abstract next-state relation

Conceptually:

~~~text
Next ==
    Classify
  ∨ GenericClean
  ∨ ProfileReduce
  ∨ Validate
  ∨ FailOpen
  ∨ PreserveRaw
  ∨ Emit
  ∨ ExpireRaw
~~~

Any implementation is acceptable only if its observable behavior refines these semantics and preserves all invariants below.

---

# Part III — Safety properties

## 10. Global invariants

These are project-level hard constraints.

### INV-001 — No LLM dependency

No normal filtering path MUST invoke an LLM, embedding model, semantic classifier, or remote inference service.

### INV-002 — No semantic guessing

A reduction MUST NOT depend on a judgment equivalent to "this content probably will not matter later."

### INV-003 — Fail-open behavior

When the system cannot establish that a transformation is safe, it MUST preserve rather than aggressively reduce.

### INV-004 — Critical-signal preservation

A successful reduction MUST preserve all critical signals defined for the applicable observation/profile.

### INV-005 — Failure-state preservation

If the host exposes failure/exit status, HuGR-Lean MUST NOT transform a failing execution into a representation indistinguishable from success.

### INV-006 — Determinism

For a fixed HuGR-Lean version, configuration, normalized observation, and environment-dependent profile inputs explicitly declared by the Technical Specification:

~~~text
Reduce(x) = Reduce(x)
~~~

Repeated processing MUST produce equivalent Lean Results and metrics.

### INV-007 — Unknown conservatism

Unknown observations MUST receive only universal-safe hygiene plus explicitly bounded generic operations.

### INV-008 — Pre-ingestion placement

For integrations claiming transparent HuGR-Lean filtering, reduction MUST happen before filtered tool content becomes model-visible context.

### INV-009 — Raw fidelity

When a Raw Artifact is retained, retrieval MUST return the exact retained source representation defined by the Technical Specification. No summarization or lossy rewrite may masquerade as raw.

### INV-010 — Workflow transparency

Normal supported workflows MUST NOT require the user or model to remember command prefixes solely to obtain HuGR-Lean filtering when the host exposes an interceptable tool-result boundary.

### INV-011 — Metrics non-interference

Failure of optional metrics collection MUST NOT corrupt tool output or alter success/failure semantics.

### INV-012 — Recovery non-interference

Failure of optional raw retention MUST produce an explicit degraded state or conservative output policy; it MUST NOT silently claim recoverability.

### INV-013 — Profile locality

A profile MUST NOT alter output families outside its declared recognition boundary.

### INV-014 — Scope containment

Features classified as ADJACENT MUST NOT enter the core without formal plan change.

### INV-015 — No hidden network requirement

Core filtering MUST NOT require network connectivity.

### INV-016 — Bounded complexity

The design MUST prefer composition of reusable primitives over bespoke parser proliferation where equivalent correctness is achievable.

### INV-017 — Provenance integrity

Third-party-derived code MUST remain traceable to origin and license.

### INV-018 — Reduction is subordinate

No release decision may trade a known critical-signal regression for a higher reduction ratio.

---

## 11. Safety property summary

Informally, HuGR-Lean must ensure:

> Nothing the filter does may make a known failure look successful, remove required diagnostic evidence, introduce semantic inference, or destroy unknown content merely to improve compression numbers.

---

# Part IV — Liveness and progress properties

## 12. Liveness properties

### LIVE-001 — Eventual emission

For every accepted observation not cancelled by its host, HuGR-Lean MUST eventually either:

- emit a validated Lean Result; or
- fail open and emit a conservative result.

It MUST NOT leave processing indefinitely suspended.

### LIVE-002 — Eventual recovery response

For every valid, non-expired Raw Artifact reference, a recovery request MUST eventually return the artifact or an explicit retrieval failure.

### LIVE-003 — Eventual expiry

Raw Artifacts with finite retention MUST eventually become unavailable after their retention condition is met.

### LIVE-004 — Project progress

A work package may not remain indefinitely "almost complete." It MUST eventually reach one of:

- Complete;
- Explicitly Blocked with named blocker and owner;
- Re-scoped through normative plan change;
- Rejected/Removed through normative plan change.

### LIVE-005 — Defect closure

A release-blocking invariant violation MUST eventually be resolved, reverted, or explicitly block release. It cannot be waived by silence.

---

## 13. Fairness assumptions

The liveness properties above assume:

- the host delivers the tool result to HuGR-Lean;
- the process receives CPU time;
- required local I/O is eventually serviced;
- the host does not permanently suspend the integration;
- external commands themselves are outside HuGR-Lean's progress guarantee.

HuGR-Lean does not promise liveness for systems it does not control.

---

# Part V — Assumptions and environmental model

## 14. Assumptions

### ASM-001
At least one supported host exposes a usable interception or wrapper boundary before tool output becomes model-visible.

### ASM-002
A meaningful portion of coding-agent tool output contains syntactically recognizable execution noise.

### ASM-003
Common CLI output families are stable enough to support conservative deterministic profiles.

### ASM-004
The system can identify unknown/unrecognized output and choose not to reduce it aggressively.

### ASM-005
Token savings are valuable only if signal preservation remains intact.

### ASM-006
The full output may contain secrets or sensitive data; therefore raw retention must be local/default-safe and explicitly bounded by policy in the Technical Specification.

### ASM-007
Different hosts expose different metadata. The core must tolerate partial metadata rather than require every host to expose an identical observation model.

---

## 15. Failure model

HuGR-Lean MUST define behavior for at least these classes:

| Failure class | Required behavior |
|---|---|
| Unknown command/tool | Conservative generic hygiene or passthrough |
| Profile detector ambiguity | Prefer unknown/passthrough |
| Malformed output | Preserve rather than reinterpret |
| Invalid/partial encoding | Preserve bytes/text according to Technical Specification; no silent destructive normalization |
| Very large output | Apply only bounded, specified behavior; no unbounded memory assumption |
| Mixed stdout/stderr | Preserve ordering/semantics to the extent exposed by host |
| Reducer exception/panic | Fail open where recoverable; never emit fabricated success |
| Metrics failure | Continue filtering safely; mark metrics unavailable |
| Raw-store failure | Do not claim recoverability; use conservative policy |
| Disk pressure | Follow explicit retention/degradation policy |
| Unsupported host capability | Report limitation; do not claim transparent filtering |
| Version drift in CLI output | Detector/profile must fail conservative until fixture-backed support is restored |
| Corrupt configuration | Reject invalid config or fall back to documented safe defaults |
| Adapter failure | Avoid mutating tool semantics; surface integration failure clearly |

The Technical Specification MUST refine this table into exact behavior.

---

# Part VI — Requirements

## 16. Functional requirements

### FR-001 — Capture
HuGR-Lean MUST accept a host/tool observation at a boundary before model ingestion where the host allows it.

### FR-002 — Universal hygiene
HuGR-Lean MUST support a minimal universal-safe hygiene layer.

### FR-003 — Profile recognition
HuGR-Lean MUST support deterministic detection of known output families.

### FR-004 — Profile reduction
Known profiles MUST support deterministic, fixture-backed reductions.

### FR-005 — Conservative unknown handling
Unknown observations MUST remain conservatively represented.

### FR-006 — Critical-signal policy
Every profile MUST define the signals that are mandatory to preserve.

### FR-007 — Raw preservation
HuGR-Lean MUST support optional bounded raw preservation for materially reduced output.

### FR-008 — Raw retrieval
A valid raw reference MUST be retrievable while retained.

### FR-009 — Metrics
HuGR-Lean MUST measure raw versus emitted size and identify the responsible reduction path.

### FR-010 — Enable/disable
Users MUST be able to disable HuGR-Lean without uninstalling it.

### FR-011 — Exclusion
Users MUST be able to exclude problematic tools/commands through minimal configuration.

### FR-012 — Install/uninstall
Supported adapters MUST have a documented clean installation and removal path.

### FR-013 — Host independence
The core MUST remain free of unnecessary host-specific behavior.

### FR-014 — Profile admission
A new profile MUST satisfy the admission policy in §26.

### FR-015 — Exact-mode escape hatch
The product MUST provide a straightforward path to the unfiltered/raw representation where retention/host capabilities permit it.

---

## 17. Non-functional requirements

### NFR-001 — Deterministic
Filtering MUST be reproducible.

### NFR-002 — Local-first
Core filtering MUST operate locally and offline.

### NFR-003 — Low overhead
Filtering MUST remain small relative to tool execution and model inference costs. Numeric release thresholds will be fixed by the Technical Specification and benchmark baseline.

### NFR-004 — Auditable
A maintainer MUST be able to determine why a known reducer removed or retained a class of output.

### NFR-005 — Testable
Core behavior MUST be exercisable without launching a coding-agent host.

### NFR-006 — Portable core
Host integration MUST be separable from core filtering behavior.

### NFR-007 — Small dependency surface
Dependencies MUST be justified by direct reduction in complexity, correctness risk, or maintenance burden.

### NFR-008 — Minimal configuration
Useful default behavior MUST require no tuning.

### NFR-009 — Safe upgrades
Profile changes MUST be regression-tested against the accumulated verification corpus.

### NFR-010 — Legal cleanliness
Third-party licensing obligations MUST be satisfied continuously, not retrofitted at release time.

---

# Part VII — Coverage and profile policy

## 18. Target coverage families

Initial mature-product coverage target:

### Git / GitHub
- git
- gh

### Rust
- cargo
- rustc
- clippy

### JavaScript / TypeScript
- npm
- pnpm
- yarn
- bun
- tsc
- eslint
- biome
- jest
- vitest

### Python
- pytest
- pip
- uv
- ruff
- mypy
- pylint

### Go
- go build
- go test
- golangci-lint

### Infrastructure
- docker
- docker compose
- kubectl
- helm
- terraform

### Unix / shell
- ls
- tree
- find
- grep
- rg
- curl
- wget

This list is a coverage objective, not permission to create a bespoke subsystem for each command.

---

## 19. Generic-hygiene candidate classes

Candidate universal transformations include:

- ANSI removal;
- terminal escape cleanup;
- carriage-return redraw normalization;
- spinner/progress rendering cleanup;
- blank-line collapse;
- exact repeated-line collapse;
- exact repeated-block collapse;
- safe terminal-artifact cleanup.

Each candidate MUST be admitted only after adversarial fixtures establish the boundaries under which it is safe.

"Looks harmless" is not evidence.

---

## 20. Primitive-first design constraint

The intended structural bias is:

~~~text
small reusable primitive set
        +
thin declarative/profile composition
        =
broad coverage
~~~

rather than:

~~~text
one bespoke parser architecture per command
~~~

A mature implementation SHOULD remain near a small set of general primitives unless evidence proves that command-specific parsing is required for correctness.

---

# Part VIII — Donor strategy and provenance

## 21. Donor policy

Existing projects are evidence and implementation donors, not architectural authorities.

### RTK — primary donor

Priority extraction:

- command coverage;
- reducers;
- patterns;
- fixtures;
- edge cases;
- regression knowledge.

### TRS — comparative donor

Priority extraction:

- alternative reducers;
- generic fallback behavior;
- fixtures absent from RTK;
- divergent treatment worth adversarial comparison.

RTK and TRS MUST NOT be embedded as parallel runtime engines merely because both exist.

### CX — safety-contract donor

Priority extraction:

- passthrough discipline;
- failure preservation;
- exact evidence;
- raw recovery;
- measurement concepts.

### LeanCTX / context-compress — selective research only

Potentially useful:

- output patterns;
- integration techniques;
- edge cases;
- recovery concepts.

Their broader memory/search/semantic systems are outside HuGR-Lean scope.

---

## 22. Adopt/adapt/reimplement/reject classification

Every donor capability considered for HuGR-Lean MUST receive one of:

- **ADOPT** — use substantially as-is, preserving license/provenance;
- **ADAPT** — derive with explicit modifications;
- **REIMPLEMENT** — reproduce required behavior from documented requirements/tests rather than copied implementation;
- **REJECT** — intentionally exclude.

The decision MUST record rationale.

---

## 23. Provenance record

For copied or materially derived code, provenance MUST include:

- source project;
- repository URL;
- source commit;
- source file/path;
- original license;
- copied/derived scope;
- modifications;
- required notices.

Unknown provenance is a defect.

---

# Part IX — Evidence model

## 24. Evidence classes

Project claims MUST be supported by one or more of:

### E1 — Fixture evidence
Raw input plus expected preservation/reduction behavior.

### E2 — Unit evidence
Automated proof that a primitive/profile satisfies its local contract.

### E3 — Regression evidence
A historical bug or edge case that remains permanently encoded.

### E4 — Integration evidence
Proof that a host adapter filters before model ingestion and preserves host semantics.

### E5 — Benchmark evidence
Reproducible measurement of raw vs emitted volume and overhead.

### E6 — Recovery evidence
Proof that retained raw output can be recovered exactly.

### E7 — Legal/provenance evidence
Traceable third-party origin and license compliance.

### E8 — Adversarial review
A deliberately hostile review seeking false positives, silent signal loss, ambiguous detector behavior, and feature creep.

No major work package is complete based solely on prose review.

---

## 25. Required fixture shape

Every profile-relevant fixture SHOULD encode:

~~~text
raw input
host/tool metadata required for recognition
expected classification
mandatory signals
permitted removals
forbidden removals
expected output or output properties
expected raw-retention behavior
~~~

Exact golden-output fixtures MAY be used where appropriate. Property-based assertions SHOULD be preferred where exact formatting is intentionally non-normative.

---

# Part X — Admission and rejection policies

## 26. Profile admission policy

A new profile may enter the core only if all are satisfied:

1. meaningful repeated waste exists;
2. the output family is sufficiently recognizable;
3. reduction can be deterministic;
4. mandatory signals can be defined;
5. real fixtures exist;
6. generic hygiene is insufficient;
7. the maintenance cost is justified;
8. failure can remain conservative under version drift.

If generic hygiene solves the problem adequately, the profile SHOULD NOT exist.

---

## 27. Feature classification

Every proposal MUST be classified:

- **CORE** — directly removes proven tool-output noise;
- **COVERAGE** — extends safe recognized output families;
- **INTEGRATION** — connects HuGR-Lean to another host/boundary;
- **ADJACENT** — solves a different problem.

ADJACENT features are rejected by default from this repository.

---

## 28. Presumptive feature rejection

A proposal is presumptively outside scope if it introduces:

- embeddings;
- vector databases;
- semantic relevance scoring;
- background agents;
- LLM invocation;
- autonomous decision-making;
- persistent knowledge graphs;
- complex search/query languages;
- semantic context reconstruction;
- dynamic LLM-selected compression strategies;
- heavy infrastructure for simple text transformation;
- extensive tuning culture.

The burden of proof is on inclusion.

---

# Part XI — Complexity budget

## 29. Size budget

Planning target for mature product:

| Category | Expected range |
|---|---:|
| Production code | ~10k–20k LOC |
| Tests + fixtures | ~15k–25k+ LOC/data-equivalent |
| Repository total | ~25k–45k+ |

**Soft production-code ceiling:** ~25k LOC.

LOC is not a quality KPI. Here it is an architectural smoke alarm.

Crossing the soft ceiling requires an explicit complexity review answering:

1. Which invariant or requirement requires the added complexity?
2. Why can it not be expressed through existing primitives?
3. Which simpler alternative was rejected?
4. What maintenance burden is introduced?
5. What evidence demonstrates material user value?

---

## 30. Dependency budget

Every new production dependency MUST justify at least one of:

- materially safer parsing;
- materially lower implementation complexity;
- significant cross-platform correctness;
- significant maintenance reduction.

Convenience alone is insufficient for a heavy dependency.

---

# Part XII — Work packages

## 31. WP0 — Evidence & donor audit

### Purpose
Map existing open-source knowledge before duplicating it.

### Inputs
- RTK;
- TRS;
- CX;
- selectively LeanCTX/context-compress;
- HuGR-Lean invariants and scope.

### Deliverables
- donor inventory;
- coverage matrix;
- overlap matrix;
- adopt/adapt/reimplement/reject register;
- provenance baseline;
- explicit rejected-scope list;
- candidate fixture corpus.

### Invariants
- WP0 MUST NOT commit HuGR-Lean to a donor's architecture merely because code exists.
- Reused code MUST have known license/provenance.
- Semantic/LLM systems MUST NOT enter by inheritance.

### Success criteria
- Every baseline capability considered has a disposition.
- Major overlapping reducers have been adversarially compared.
- Coverage gaps are explicit.

### Quality standards
- Source commit pinned.
- Claims traceable to code/tests/docs.
- No vague "inspired by" provenance for copied implementation.

### Completeness criteria
- All named donors reviewed.
- Initial target coverage mapped.
- License obligations recorded.
- Explicit non-adoptions documented.

### Definition of Done
WP0 is Complete only when another engineer can answer what is being reused, why, from where, under which license, and what is intentionally not being reused.

### Dependencies
None.

---

## 32. WP1 — Core engine

### Purpose
Define and implement the smallest implementation-independent transformation engine.

### Inputs
- formal plan;
- Technical Specification;
- WP0 donor findings.

### Deliverables
- observation intake;
- classification boundary;
- generic/profile execution boundary;
- validation/fail-open path;
- emission result;
- metrics hooks;
- test harness independent of coding-agent hosts.

### Invariants
- INV-001 through INV-018 apply.
- Core MUST NOT require any host SDK to execute tests.
- Core MUST NOT require network connectivity.

### Success criteria
- A fixture can traverse the complete core without launching OpenCode/Codex/Claude/etc.
- Unknown input safely reaches output.
- Known input can be reduced by a deterministic profile.

### Quality standards
- Small public surface.
- Explicit error semantics.
- No hidden global state required for correctness.
- Deterministic tests.

### Completeness criteria
- success path;
- fail-open path;
- malformed input path;
- metrics-failure path;
- raw-retention decision hook;
- unknown classification path.

### Definition of Done
The core can process representative observations end-to-end and prove all applicable invariants via automated tests.

### Dependencies
WP0 substantially complete; Technical Specification approved.

---

## 33. WP2 — Generic hygiene

### Purpose
Provide safe value for outputs with no dedicated profile.

### Deliverables
- admitted universal-safe primitives;
- adversarial fixture suite;
- unknown-output behavior tests;
- false-positive regression corpus.

### Invariants
- Generic hygiene MUST NOT require semantic interpretation.
- Unknown input MUST remain conservative.
- A generic transform is not admitted until its safety boundary is documented.

### Success criteria
- Common terminal-rendering noise is reduced.
- Arbitrary content remains unchanged outside admitted transformation boundaries.

### Quality standards
- Every generic primitive has positive and negative fixtures.
- Edge cases include code, JSON, logs, Unicode, escape sequences, and malformed text where relevant.

### Completeness criteria
- all admitted generic transforms individually tested;
- composition tested;
- malformed/unknown corpus tested;
- no known critical-signal regression.

### Definition of Done
Generic hygiene can be enabled for unknown tools with defensible confidence that it removes only classes explicitly admitted as safe.

### Dependencies
WP1.

---

## 34. WP3 — Profile framework & coverage

### Purpose
Deliver broad tool coverage without architectural sprawl.

### Deliverables
- profile contract;
- detection rules;
- mandatory-signal declarations;
- coverage profiles for target command families;
- fixtures for supported variants;
- version-drift fallback behavior.

### Invariants
- Profile detection ambiguity MUST fail conservative.
- Every profile MUST declare mandatory signals.
- Profiles MUST reuse primitives where reasonable.
- No profile may claim support without fixtures.

### Success criteria
- Dominant coding-agent command families receive safe, measurable reduction.
- Profile behavior survives known CLI version variants or fails open.

### Quality standards
For every profile:
- success fixtures;
- failure fixtures;
- warning fixtures;
- malformed fixtures;
- ambiguous detection fixtures;
- version-variant fixtures where relevant;
- reduction and preservation assertions.

### Completeness criteria
- target coverage matrix resolved as supported/deferred/rejected;
- all supported profiles regression-tested;
- no unowned bespoke parser islands;
- donor provenance complete.

### Definition of Done
Broad coverage exists as one coherent reducer system, not a collection of unrelated command hacks.

### Dependencies
WP0, WP1, WP2.

---

## 35. WP4 — Raw preservation & recovery

### Purpose
Provide exact recoverability without becoming a memory/search system.

### Deliverables
- retention policy;
- raw artifact creation;
- exact retrieval;
- expiry;
- cleanup;
- degraded behavior for storage failure;
- privacy/security behavior.

### Invariants
- Raw means exact retained source representation.
- Recovery MUST NOT require an LLM.
- Raw storage MUST NOT become a semantic index.
- Retention failure MUST NOT be hidden.

### Success criteria
- valid references recover exact retained content;
- expired references fail explicitly;
- cleanup is bounded and reliable;
- storage failure produces safe degradation.

### Quality standards
- exactness verified byte-for-byte or by formally defined canonical representation;
- path/ID handling resistant to accidental collision/traversal;
- retention defaults conservative.

### Completeness criteria
- create;
- retrieve;
- expire;
- cleanup;
- missing artifact;
- corrupt artifact;
- disk/storage failure;
- disabled retention.

### Definition of Done
Recoverability is simple, bounded, exact, and independently testable.

### Dependencies
WP1; relevant security decisions from Technical Specification.

---

## 36. WP5 — Host integration

### Purpose
Place HuGR-Lean at the best available tool-result → model-context boundary for supported hosts.

### Deliverables
- host capability matrix;
- adapter(s);
- installation integration;
- transparent interception where supported;
- explicit degraded mode where transparent interception is impossible.

### Invariants
- Adapter claims MUST reflect actual host capability.
- No adapter may claim pre-ingestion filtering if it only wraps optional user commands.
- Host-specific logic MUST remain out of core unless semantically universal.

### Success criteria
- normal supported tool workflows are filtered without model/user prefix discipline;
- disabling/uninstalling restores host behavior;
- host semantics remain intact.

### Quality standards
- integration tests exercise real host boundary where practical;
- version compatibility documented;
- failure mode explicit.

### Completeness criteria
For each supported host:
- capability confirmed;
- install path;
- active path;
- disable path;
- uninstall path;
- compatibility scope;
- regression evidence.

### Definition of Done
At least one primary host demonstrates transparent end-to-end filtering, and every advertised host has verified capability boundaries.

### Dependencies
WP1–WP4 as needed.

---

## 37. WP6 — CLI, configuration & UX

### Purpose
Make HuGR-Lean installable and forgettable.

### Required conceptual capabilities
- install;
- status;
- stats;
- enable;
- disable;
- raw retrieval;
- minimal exclusions;
- retention configuration where applicable.

Exact command syntax belongs to the Technical Specification.

### Invariants
- Default configuration SHOULD be the correct choice for most users.
- Normal use MUST NOT require tuning.
- Configuration complexity MUST NOT become a product surface of its own.

### Success criteria
- fresh user can install and obtain value without reading configuration documentation;
- disable/uninstall paths are obvious and safe.

### Quality standards
- actionable errors;
- idempotent operations where appropriate;
- no silent partial installation;
- configuration validation.

### Completeness criteria
- clean install;
- re-install/upgrade behavior;
- status;
- enable/disable;
- invalid config;
- exclusion;
- raw retrieval;
- uninstall.

### Definition of Done
The product can be installed, inspected, disabled, and removed without manual repository surgery.

### Dependencies
WP1, WP4, WP5.

---

## 38. WP7 — Verification corpus

### Purpose
Make safety claims durable.

### Deliverables
- corpus structure;
- real-output fixtures;
- adversarial fixtures;
- regression fixtures;
- mandatory-signal annotations;
- corpus provenance where required.

### Invariants
- Every discovered destructive false positive becomes a permanent regression fixture.
- Coverage growth MUST increase evidence, not only code.
- Critical-signal fixtures are release blocking.

### Success criteria
- reducer changes are judged against historical behavior automatically;
- corpus represents both common and pathological outputs.

### Quality standards
Include:
- success;
- failure;
- warnings;
- large output;
- repeated output;
- ANSI/TTY;
- mixed streams where available;
- malformed data;
- CLI version variants;
- real bugs found during development.

### Completeness criteria
- fixture taxonomy documented;
- all supported profiles represented;
- generic hygiene adversarial corpus present;
- regression policy enforced.

### Definition of Done
The corpus is sufficient to make reducer evolution safer over time rather than riskier.

### Dependencies
Begins in WP0 and remains continuous.

---

## 39. WP8 — Benchmark & proof

### Purpose
Prove user value without compromising correctness.

### Deliverables
- benchmark methodology;
- reference workloads;
- raw/emitted measurements;
- overhead measurements;
- per-profile results;
- realistic coding-agent session evidence;
- reproducibility instructions.

### Metrics

For a result with raw token count R and emitted token count E:

~~~text
saved_tokens = max(R - E, 0)
reduction_ratio = saved_tokens / R    when R > 0
~~~

Metrics MUST distinguish bytes from tokenizer-specific token estimates.

### Invariants
- Reduction ratio MUST NOT be optimized at the expense of INV-004.
- Benchmark corpus MUST NOT contain only hand-picked favorable cases.
- Published claims MUST identify methodology.

### Success criteria
- substantial reduction demonstrated on noisy real workloads;
- negligible/acceptable processing overhead demonstrated against the Technical Specification's release threshold;
- critical-signal preservation remains intact.

### Quality standards
- reproducible;
- versioned;
- raw data retained where legally/safely possible;
- favorable and unfavorable cases reported.

### Completeness criteria
- generic path measured;
- major profiles measured;
- end-to-end session measured;
- overhead measured;
- zero-additional-LLM-call claim demonstrated.

### Definition of Done
A skeptical engineer can reproduce the headline claims.

### Dependencies
WP2, WP3, WP5, WP7.

---

## 40. WP9 — Distribution & release quality

### Purpose
Turn the implementation into a product another engineer can safely adopt.

### Deliverables
- packaging;
- versioning;
- release artifacts;
- installation docs;
- upgrade path;
- uninstall path;
- compatibility matrix;
- third-party notices;
- release checklist.

### Invariants
- Releases MUST satisfy all release-blocking safety invariants.
- License/provenance defects block release.
- Install/uninstall breakage blocks release.

### Success criteria
- clean machine can install;
- supported host can use;
- upgrade works;
- uninstall restores original behavior;
- provenance/license package complete.

### Quality standards
- reproducible build/release procedure where practical;
- minimal manual release steps;
- versioned compatibility statement.

### Completeness criteria
- packaging tested;
- artifacts verified;
- docs verified;
- install/upgrade/uninstall tested;
- notices complete;
- release evidence archived.

### Definition of Done
A release candidate can be independently installed and verified without developer-only knowledge.

### Dependencies
WP1–WP8.

---

# Part XIII — Work-package dependency graph

## 41. Dependency model

~~~text
WP0  Evidence & donor audit
 │
 ├──────────────┐
 ▼              ▼
WP1 Core       WP7 Verification corpus (starts early, continues)
 │
 ▼
WP2 Generic hygiene
 │
 ├──────────────┐
 ▼              ▼
WP3 Profiles   WP4 Raw recovery
 │              │
 └──────┬───────┘
        ▼
      WP5 Host integration
        │
        ▼
      WP6 CLI / UX
        │
        ├──────────────┐
        ▼              ▼
      WP8 Benchmark   WP7 Corpus maturity
        │              │
        └──────┬───────┘
               ▼
             WP9 Release
~~~

The roadmap may parallelize work but MUST respect semantic dependencies.

---

# Part XIV — Project state and gates

## 42. Project lifecycle states

~~~text
Draft
  ↓
Formalized
  ↓
TechnicallySpecified
  ↓
Roadmapped
  ↓
Implementing
  ↓
Verifying
  ↓
ReleaseCandidate
  ↓
Released
~~~

Current state after approval of this document:

~~~text
Formalized
~~~

Transition to **TechnicallySpecified** requires approved Technical Specification.

Transition to **Roadmapped** requires an execution roadmap consistent with both this plan and the Technical Specification.

Implementation may prototype earlier only when prototype code is explicitly non-normative and cannot silently decide unresolved specification questions.

---

## 43. Gate G0 — Plan formalization

Pass conditions:

- scope defined;
- invariants defined;
- safety/liveness defined;
- failure model defined;
- work packages formalized;
- completion semantics defined;
- complexity constraints defined.

This document satisfies G0 when approved.

---

## 44. Gate G1 — Technical specification

Required before normative implementation:

- concrete architecture;
- observation data model;
- reducer pipeline;
- primitive contracts;
- profile format;
- detection strategy;
- validation strategy;
- raw-store semantics;
- configuration model;
- host adapter interface;
- security/privacy behavior;
- performance budgets;
- testing architecture;
- packaging strategy.

No unresolved technical decision may be silently delegated to implementation if it can affect a global invariant.

---

## 45. Gate G2 — Roadmap

Required:

- ordered milestones;
- dependencies;
- parallelizable work;
- issue/work-package mapping;
- entry/exit gates;
- integration sequence;
- release slices;
- ownership;
- evidence expected per milestone.

---

## 46. Gate G3 — Core correctness

Before broad profile expansion:

- core tests pass;
- unknown fail-open proven;
- generic hygiene safety corpus green;
- deterministic behavior demonstrated;
- critical-signal checks operational.

---

## 47. Gate G4 — Coverage maturity

Before release-candidate work:

- target coverage disposition complete;
- supported profiles fixture-backed;
- version drift behavior defined;
- known destructive false positives = 0;
- provenance complete.

---

## 48. Gate G5 — Integration maturity

Before release candidate:

- primary host end-to-end verified;
- advertised adapters verified;
- install/disable/uninstall verified;
- no false claim about interception boundary.

---

## 49. Gate G6 — Release candidate

Required:

- all MUST-level invariants green;
- benchmark evidence reproducible;
- raw recovery verified;
- critical-signal corpus green;
- no unresolved release-blocking defect;
- license/notices complete;
- compatibility matrix current;
- complexity review passed.

---

# Part XV — Acceptance criteria and metrics

## 50. Hard acceptance criteria

HuGR-Lean v1-class maturity MUST demonstrate:

1. zero additional LLM calls in filtering;
2. deterministic output for equivalent normalized inputs;
3. conservative unknown handling;
4. no known critical-signal loss in supported corpus;
5. correct failure-state preservation;
6. transparent pre-ingestion integration in at least one primary host;
7. exact bounded raw recovery when enabled;
8. measurable reduction on real noisy workloads;
9. clean install and uninstall;
10. traceable third-party provenance;
11. no mandatory network service for core filtering;
12. documented compatibility and unsupported boundaries.

---

## 51. Metric hierarchy

Metrics are ordered by importance:

1. **Critical-signal preservation**
2. **Correct success/failure semantics**
3. **Unknown-output safety**
4. **Determinism**
5. **Integration correctness**
6. **Reduction ratio**
7. **Performance overhead**
8. **Coverage breadth**

A lower-ranked metric may not justify regression in a higher-ranked metric.

---

## 52. Critical-signal target

For the release corpus:

~~~text
known critical-signal losses = 0
~~~

Any known reproducible loss is release blocking until fixed, reverted, or support for the affected profile/version is withdrawn.

---

## 53. Reduction target policy

The project MUST publish observed reduction rather than fabricate a universal target before the corpus exists.

WP8 will establish realistic distributions by tool family and workload.

A profile that safely saves little may still be valid; a profile that saves much but loses required evidence is invalid.

---

# Part XVI — Security, privacy, and data handling

## 54. Data minimization

HuGR-Lean SHOULD retain less data, not create a new durable data lake.

### RAW-001
Raw retention MUST be bounded.

### RAW-002
Raw retention defaults MUST consider that tool output may contain credentials, source code, paths, customer data, or secrets.

### RAW-003
Raw content MUST NOT be uploaded remotely by core filtering.

### RAW-004
Metrics SHOULD avoid storing full content when aggregate measurements suffice.

### RAW-005
Recovery identifiers MUST NOT expose arbitrary filesystem access.

Detailed permissions and storage layout belong to the Technical Specification.

---

# Part XVII — Change control

## 55. Normative change rule

A change to this plan that affects any of the following requires explicit review:

- global invariant;
- scope/non-goal;
- hard acceptance criterion;
- work-package Definition of Done;
- complexity ceiling;
- donor/provenance policy;
- safety/liveness property.

The change description MUST state:

1. property changed;
2. reason;
3. risk introduced;
4. alternatives considered;
5. evidence supporting the change;
6. whether Technical Specification or roadmap must also change.

---

## 56. Specification/implementation conflict rule

If implementation behavior conflicts with this document:

~~~text
the implementation is wrong
~~~

unless this document is intentionally amended first.

Tests that merely encode conflicting implementation behavior do not override the specification.

---

# Part XVIII — Risk register

## 57. Primary risks

| ID | Risk | Consequence | Primary mitigation |
|---|---|---|---|
| R1 | False-positive filtering | Critical information loss | Fail open, mandatory-signal fixtures, regression corpus |
| R2 | CLI output version drift | Incorrect profile behavior | Conservative detection, version fixtures, passthrough on ambiguity |
| R3 | Overengineering | Product becomes another context framework | Scope invariants, feature classification, LOC/dependency budgets |
| R4 | Donor-code licensing mistakes | Legal/release risk | Provenance register from WP0 |
| R5 | Host boundary not interceptable | Product requires workflow changes | Capability matrix, honest degraded mode |
| R6 | Raw store leaks sensitive output | Security/privacy risk | Local bounded retention, no remote dependency |
| R7 | Profile proliferation | Maintenance explosion | Primitive-first design, profile admission policy |
| R8 | Benchmark gaming | Misleading product claims | Real workloads, unfavorable cases, reproducibility |
| R9 | Filtering overhead | Tool latency regression | Explicit benchmark budget in Technical Specification |
| R10 | Metrics token estimator mismatch | Misleading savings claims | Distinguish bytes and tokenizer-specific estimates |
| R11 | Mixed-stream semantic damage | Misdiagnosed failures | Preserve host ordering metadata where available |
| R12 | Silent degraded recovery | User/model assumes raw exists | Explicit degraded state, INV-012 |

Risk status and ownership belong to the roadmap/project-tracking layer.

---

# Part XIX — Simplicity constitution

## 58. Simplicity test

Before adding a subsystem, ask:

1. Does it directly remove proven tool-output noise?
2. Can the same result be achieved through an existing primitive?
3. Does it require semantic interpretation?
4. Does it create persistent state that is not required for recovery?
5. Does it add configuration users must understand?
6. Does it require a service/daemon/network dependency?
7. Does it expand HuGR-Lean into context management rather than output hygiene?

If answers indicate adjacency or avoidable complexity, reject the subsystem.

---

## 59. Product constitution

The following statements are intentionally repetitive because they define the identity of the project:

> No LLMs.

> No semantic guessing.

> Unknown means conservative.

> Failures survive.

> Raw, when promised, is exact.

> Reduction is measured but never worshipped.

> The plugin should be installed, forgotten, and useful.

> HuGR-Lean removes proven noise; it does not decide what the model should think.

---

# Part XX — Project completion

## 60. Mature-state definition

HuGR-Lean is considered mature when:

1. installation is trivial;
2. normal operation is invisible;
3. filtering adds zero LLM calls;
4. dominant coding-agent output families are safely covered;
5. generic unknown handling is conservative;
6. noisy output is materially reduced where evidence supports reduction;
7. errors/failures remain diagnosable;
8. raw recovery is exact when enabled;
9. the regression corpus is broad and continuously enforced;
10. benchmarks are reproducible;
11. adapters remain separated from core;
12. third-party provenance is complete;
13. a new engineer can understand the system without learning a context-management framework;
14. install, upgrade, disable, and uninstall are verified;
15. no known global invariant violation remains open.

---

## 61. Project Definition of Done

The project reaches its planned end-state only when the following scenario is demonstrated with reproducible evidence:

~~~text
Given:
  a supported coding-agent host
  a representative real workload
  HuGR-Lean installed with default configuration

When:
  tools execute normally

Then:
  results are intercepted before model ingestion where the host supports it
  known execution noise is removed deterministically
  unknown content remains conservative
  critical failure signals survive
  no LLM call is added
  raw evidence is recoverable when promised
  savings are measured honestly
  workflow behavior remains normal

And when:
  HuGR-Lean is disabled or uninstalled

Then:
  the host returns to its documented original behavior
~~~

All MUST-level requirements, invariants, release gates, provenance obligations, and verification evidence must be satisfied.

---

# Part XXI — Refinement obligations for the next documents

## 62. Technical Specification obligations

The Technical Specification MUST refine, without weakening:

- Observation and Lean Result;
- critical-signal model;
- classification;
- generic-hygiene admission;
- profile contract;
- detector ambiguity handling;
- validation;
- fail-open mechanics;
- raw retention/recovery;
- metrics;
- configuration;
- host adapter contract;
- error model;
- security/privacy;
- concurrency/thread-safety if applicable;
- resource bounds;
- performance budgets;
- test architecture;
- package/distribution architecture.

Every global invariant in this document MUST map to one or more technical mechanisms and verification obligations.

---

## 63. Roadmap obligations

The Roadmap / Execution Plan MUST map:

~~~text
requirement
  → technical component
  → work package
  → issue/task
  → evidence
  → gate
~~~

No roadmap item may be considered complete solely because code was merged.

---

## 64. Traceability requirement

Before implementation scales beyond the core, the project SHOULD maintain a lightweight traceability matrix:

| Plan property | Technical mechanism | Verification | Work package |
|---|---|---|---|
| INV-003 Fail open | TBD in Technical Spec | fixture/integration evidence | WP1/WP2 |
| INV-004 Critical preservation | TBD | mandatory-signal corpus | WP3/WP7 |
| INV-006 Determinism | TBD | repeated fixture runs | WP1/WP7 |
| INV-009 Raw fidelity | TBD | exact recovery test | WP4 |
| INV-010 Workflow transparency | TBD | host integration test | WP5 |
| INV-017 Provenance | provenance register | audit | WP0/WP9 |

"TBD" here is deliberate: this plan defines obligations; the next specification defines mechanisms.

---

# Part XXII — Current decision

## 65. Formal baseline

Upon approval, this document becomes the normative project baseline.

The project state becomes:

~~~text
Formalized
~~~

The next activity is:

~~~text
Technical Specification
~~~

followed by:

~~~text
Roadmap / Execution Plan
~~~

No production architecture is considered settled until the Technical Specification is approved.

---

## 66. North Star

> **Remove everything we can prove is noise. Preserve everything we cannot prove is noise.**
