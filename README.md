# HuGR-Lean

**Deterministic tool-output filtering for coding agents.**

HuGR-Lean removes obvious execution noise from tool results **before it reaches the model context**.

No LLM calls. No semantic summarization. No guessing.

## Core idea

```text
tool result
    ↓
HuGR-Lean
    ↓
remove known noise
    ↓
model-visible result
```

## Principles

- deterministic by default
- conservative on unknown outputs
- preserve failures and critical execution signals
- zero extra model calls
- invisible to normal agent workflows
- raw output recoverable when reduction is material
- small, auditable, testable core

## Non-goals

HuGR-Lean is not a memory system, RAG layer, vector database, semantic compressor, context orchestrator, or autonomous agent.

## Status

Project plan, Technical Specification, roadmap, and issue decomposition are established. **E0 Evidence & Baseline passed G-E0 and E1 Core Engine passed G-E1 Core Correctness.** The active execution lane is E2 Profile System & Coverage.

- [Formal Project Plan](docs/PROJECT_PLAN.md)
- [Approved Technical Specification](docs/TECHNICAL_SPEC.md)
- [Epic Roadmap / Execution Plan](docs/ROADMAP.md)
- [Technical Specification review](docs/reviews/HL-SPEC-001-REVIEW-01.md)
- [E0 cold review / gate evidence](docs/reviews/HL-E0-REVIEW-01.md)
- [WP1 cold review](docs/reviews/HL-WP1-REVIEW-01.md)
- [WP2 cold review](docs/reviews/HL-WP2-REVIEW-01.md)
- [E1 core correctness gate](docs/reviews/HL-E1-REVIEW-01.md)

### Epic tracking issues

- #1 — E0 Evidence & Baseline
- #2 — E1 Core Engine
- #3 — E2 Profile System & Coverage
- #4 — E3 Recovery & Safety
- #5 — E4 OpenCode Integration & UX
- #6 — E5 Proof, Packaging & Release
