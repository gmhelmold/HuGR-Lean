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

Project plan formalized. Technical Specification is the next normative step.

See [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).
