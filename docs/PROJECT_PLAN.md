# HuGR-Lean — Project Plan v0.1

**Status:** Planning baseline  
**Type:** Plugin / middleware engine for coding agents

## 1. Vision

HuGR-Lean is a small, deterministic, installable layer that intercepts tool results before they are presented to the model.

Its job is not to summarize, interpret, or make semantic judgments.

Its job is to recognize and remove provable execution noise.

```text
TOOL
 │
 ▼
RAW OUTPUT
 │
 ▼
HuGR-Lean
 │
 ├── remove presentation noise
 ├── collapse repetition
 ├── apply known safe reducers
 └── preserve critical execution signals
 │
 ▼
LEAN OUTPUT
 │
 ▼
MODEL CONTEXT
```

North star:

> Remove everything we can prove is noise. Preserve everything we cannot prove is noise.

## 2. Problem

Long coding-agent sessions accumulate large amounts of progress bars, spinners, ANSI sequences, terminal redraws, repeated lines, success chatter, duplicated warnings, verbose test passes, redundant headers, repeated logs, and other CLI boilerplate.

This consumes context, accelerates compaction, increases token usage, and competes with information that actually matters.

A large part of this problem does not require sophisticated context management. It can be prevented at ingestion time.

## 3. Product value

HuGR-Lean must provide all four properties simultaneously:

1. **Less wasted context** — large reductions on known noisy outputs.
2. **Zero additional LLM calls** — filtering is deterministic parsing/transformation.
3. **Predictable behavior** — same input + config + version yields the same output.
4. **Low risk** — unknown or ambiguous outputs fail open toward preservation.

## 4. Product invariants

### I1 — No LLM
No normal filtering path depends on model inference.

### I2 — No semantic guessing
HuGR-Lean removes explicitly known noise; it does not infer that arbitrary content is probably irrelevant.

### I3 — Fail open
Unknown or ambiguous input tends to passthrough.

### I4 — Failure signals survive
Exit status, errors, failures, panics, and equivalent signals must not disappear.

### I5 — Filter before model ingestion
The purpose is to prevent noise from entering model context, not clean transcripts later.

### I6 — Raw can be recovered
When materially reduced, original output may be retained temporarily and retrieved exactly.

### I7 — Invisible by default
Normal user commands and workflows should not change.

### I8 — Deterministic
Transformations are reproducible and testable.

### I9 — Correctness over reduction
A safe 40% reduction is better than a destructive 95% reduction.

### I10 — Small system
HuGR-Lean must not evolve into a memory framework, RAG system, agent framework, or context OS.

## 5. Explicit non-goals

HuGR-Lean is not:

- a session summarizer
- a semantic compressor
- a memory system
- RAG
- a vector database
- a knowledge graph
- a BM25 / FTS search engine
- a prompt optimizer
- a context orchestrator
- an autonomous agent
- an LLM judge
- a replacement for compaction
- a replacement for logging
- an observability platform

## 6. Final functional scope

### A. Universal hygiene

High-confidence transformations that can apply broadly:

- ANSI removal
- terminal escape cleanup
- carriage-return normalization
- spinner removal
- progress normalization
- blank-line collapse
- exact repetition collapse
- repeated-block handling
- terminal rendering artifact cleanup

### B. Tool-aware profiles

Target command families:

- Git / GitHub
- Rust: Cargo, rustc, Clippy
- JavaScript / TypeScript: npm, pnpm, yarn, Bun, tsc, ESLint, Biome, Jest, Vitest
- Python: pytest, pip, uv, Ruff, mypy, Pylint
- Go: go build, go test, golangci-lint
- Infrastructure: Docker, Docker Compose, kubectl, Helm, Terraform
- Unix / shell: ls, tree, find, grep, rg, curl, wget

Profiles should compose a small set of reusable primitives rather than become independent mini-frameworks.

### C. Universal tool-result boundary

The engine should be capable of receiving observations from:

- Shell
- Read
- Search / Grep
- LSP
- MCP
- Browser
- Subagents
- Custom tools

Universal integration does not imply aggressive filtering. Content-bearing tools may intentionally passthrough.

### D. Raw recovery

Materially modified outputs may keep a temporary exact raw copy.

Recovery stays intentionally simple: fetch the raw output by ID. No embeddings, indexing, or semantic search.

### E. Metrics

Measure:

- raw bytes / tokens
- emitted bytes / tokens
- tokens avoided
- reduction percentage
- reducer / profile responsible

Metrics exist to prove value and detect regressions, not to become an analytics product.

### F. Host adapters

Keep the core independent from specific harnesses.

Adapters should connect the engine to hosts such as OpenCode, Codex, Claude, and others where a reliable tool-result boundary is available.

## 7. Open-source reuse strategy

Existing projects are donors, not mandatory architectures.

### RTK — primary donor
Use as the main baseline for command coverage, reducers, regexes, edge cases, fixtures, and tests.

### TRS — comparative donor
Mine alternative reducers, generic fallback behavior, fixtures, and coverage gaps. Do not embed RTK and TRS as parallel engines.

### CX — safety-contract donor
Study failure preservation, exact evidence, passthrough behavior, raw recovery, and metrics.

### LeanCTX / context-compress — selective research only
Take only directly useful patterns, integration techniques, edge cases, and recovery ideas. Do not import their broader context-management scope.

## 8. Provenance and legal hygiene

Any directly derived code must preserve provenance:

- source project
- source repository
- source commit
- source file
- original license
- modifications made

Required third-party notices and licenses must remain traceable.

## 9. Complexity model

Aim for a small set of reusable primitives, conceptually including:

- strip ANSI
- strip progress
- collapse repetition
- collapse blocks
- drop known lines
- collapse known lines
- dedupe diagnostics
- keep matching
- keep neighborhood
- group
- head
- tail
- cap
- preserve failure
- preserve summary
- preserve exit status

The target shape is closer to:

```text
~15 primitives
+ declarative profiles
= broad command coverage
```

than:

```text
100 commands
= 100 bespoke parsers
```

## 10. Work packages

### WP0 — Evidence & donor audit
Inventory RTK, TRS, CX, relevant LeanCTX/context-compress material, coverage overlap, reusable parts, and explicit rejects.

**Success:** every important baseline feature is classified as adopt, adapt, reimplement, or reject.

### WP1 — Core engine
Build the smallest raw-observation → model-observation pipeline.

Responsibilities: normalization, detection, generic hygiene, profile execution, safe fallback, metrics, output.

**Success:** fully testable without launching any coding harness.

### WP2 — Generic hygiene
Deliver value for unknown tools using only high-confidence transformations.

**Success:** arbitrary-output regression corpus demonstrates conservative passthrough outside safe cleanup.

### WP3 — Profile framework & coverage
Distill existing open-source coverage into one coherent profile system.

**Success:** major coding-agent command families have tested behavior across success, failure, malformed, and version-variant fixtures.

### WP4 — Raw preservation & recovery
Provide exact temporary recovery without building a memory system.

**Success:** storage, retrieval, expiry, and cleanup are defined and tested.

### WP5 — Host integration
Connect as close as possible to the tool-result → model-context boundary.

**Success:** supported hosts require no command-prefix discipline from the user or model.

### WP6 — CLI, config & UX
Keep UX tiny: install, status, stats, on/off, raw recovery, and minimal exclusions/retention config.

**Success:** defaults are sufficient for normal use.

### WP7 — Verification corpus
Build the regression evidence base from real outputs, failures, ANSI/TTY cases, mixed stdout/stderr, huge outputs, version variants, and bugs found in production.

**Success:** reducer changes are continuously checked against known signal-preservation expectations.

### WP8 — Benchmark & proof
Measure raw vs emitted tokens, reduction, execution overhead, and signal preservation on realistic coding-agent workloads.

**Success:** value is reproducible and auditable rather than anecdotal.

### WP9 — Distribution & release quality
Packaging, versioning, installation, update path, uninstall, docs, compatibility matrix, and third-party notices.

**Success:** clean install and clean uninstall are release-tested behaviors.

## 11. Quality gates

- **Correctness:** no known regression removes critical failure signal.
- **Unknown safety:** unknown outputs receive only universally safe hygiene.
- **Failure safety:** failure state and exit status survive.
- **Determinism:** identical fixtures produce identical results.
- **Recoverability:** retained raw content is exact.
- **Performance:** filtering overhead remains operationally negligible.
- **Simplicity:** every subsystem directly serves the core mission.

## 12. Product success metrics

Track, but do not optimize reduction in isolation:

- output reduction
- critical signal preservation
- unknown-output safety
- added LLM calls: **0**
- added normal user actions: **0**
- filtering overhead
- raw recovery reliability

Critical signal preservation is the hard constraint.

## 13. Complexity budget

Healthy mature target:

- production code: roughly 10k–20k LOC
- tests + fixtures: roughly 15k–25k+
- repository total: roughly 25k–45k+

Soft ceiling: about 25k production LOC.

Crossing it materially should trigger architectural review for overengineering.

## 14. Feature rejection policy

Features are presumptively rejected if they require:

- embeddings
- vector databases
- semantic classification
- background agents
- LLM invocation
- autonomous decision-making
- persistent knowledge graphs
- complex query languages
- dynamic semantic compression strategies
- heavy infrastructure for simple text transformation
- extensive tuning

## 15. Configuration policy

Default-first.

Configuration should mostly cover:

- enable / disable
- exclusions
- raw retention
- stats visibility
- unavoidable host-specific settings

There should be no tuning culture.

## 16. Profile admission policy

A new profile must answer yes to all of:

1. Is there meaningful waste?
2. Is the output structure sufficiently predictable?
3. Can the waste be removed deterministically?
4. Do we have real fixtures?
5. Does generic hygiene fail to solve it adequately?

If generic hygiene is enough, do not add a profile.

## 17. Feature-creep classification

Every proposal is classified as:

- **CORE** — directly removes tool-output noise
- **COVERAGE** — expands recognized tools
- **INTEGRATION** — reaches another host
- **ADJACENT** — solves another problem

ADJACENT functionality presumptively belongs elsewhere.

## 18. Mature-state definition

HuGR-Lean is mature when it:

1. installs trivially
2. operates without active user participation
3. adds zero LLM calls
4. covers the dominant command families in coding-agent workflows
5. has a safe generic fallback
6. materially reduces noisy outputs
7. preserves critical failures and diagnostics
8. supports raw recovery where appropriate
9. has a broad regression corpus
10. publishes reproducible benchmarks
11. keeps integrations separate from core
12. maintains third-party provenance
13. remains understandable without learning a context-management framework

## 19. Project Definition of Done

The project is complete when we can demonstrate end to end:

```text
install HuGR-Lean

run a real coding-agent workload

tool outputs are automatically intercepted

known noise is removed deterministically

unknown data remains conservative

failures remain diagnosable

raw evidence remains recoverable

token reduction is measured

agent workflow remains unchanged

uninstall restores original behavior
```

with reproducible tests and evidence.

## 20. Next documents

This plan defines product boundaries and completion criteria.

Next:

1. **Technical Specification** — concrete architecture, data model, pipeline, primitives, profile format, detection, raw store, safety mechanisms, host interfaces, packaging, and test architecture.
2. **Roadmap / Execution Plan** — dependencies, sequencing, milestones, parallelization, gates, releases, and implementation order.
