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

Project plan formalized and Technical Specification v1.0 approved. The next normative artifact is the Roadmap / Execution Plan.

- [Formal Project Plan](docs/PROJECT_PLAN.md)
- [Approved Technical Specification](docs/TECHNICAL_SPEC.md)
- [Technical Specification review](docs/reviews/HL-SPEC-001-REVIEW-01.md)
