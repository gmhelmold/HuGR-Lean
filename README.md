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

## Runtime direction

HuGR-Lean is a local open-source TypeScript package.

- no cloud service or account;
- no LLM calls;
- no Rust/native filtering binary;
- no subprocess/IPC filtering path;
- zero runtime dependencies targeted for the core;
- installed package exposes compiled JavaScript plus TypeScript declarations.

## Non-goals

HuGR-Lean is not a memory system, RAG layer, vector database, semantic compressor, context orchestrator, or autonomous agent.

## Status

Project plan, Technical Specification, roadmap, and issue decomposition are established. **E0 passed G-E0. E1 is temporarily reopened for #72, which replaces the unreleased Rust/subprocess runtime with a single local TypeScript package. E2 profile-family work is paused until G-E1 re-passes on the TypeScript-only tree.**

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
