# Selective Adjacent Donor Audit

**Issue:** #19  
**Scope:** LeanCTX and context-compress only where directly relevant to HuGR-Lean

## LeanCTX

**Repository:** yvgude/lean-ctx  
**Pinned revision:** `edd9c55650de4622e3a0cc8696bcf4e9abba1a6a`  
**License:** Apache-2.0

### Useful research surfaces

- Rust shell-output compression engine and pattern organization;
- central shell output classification;
- recovery/tee policy;
- compression safety tests;
- deterministic/reversible output concepts;
- large set of shell pattern implementations;
- integration/client edge cases.

Evidence includes `rust/src/shell/compress/engine.rs`, `rust/src/core/patterns/`, `rust/src/shell/output_policy.rs`, `rust/src/shell/tee_policy.rs`, and recovery modules.

### Disposition

- shell pattern ideas/fixtures: **RESEARCH / selective ADAPT**
- central output-classification concept: **ADAPT concept**
- reversible evidence concept: **ADAPT concept**, reimplemented using HuGR raw semantics

### Explicit reject

HuGR-Lean does not inherit LeanCTX's:

- context proxy/request rewriting;
- read/search replacement framework;
- MCP surface;
- context/session memory;
- property/knowledge graphs;
- SDK/agent context platform;
- persistent context management;
- multi-mode context compression.

Those solve a broader problem and would destroy HuGR-Lean's narrow product boundary.

## context-compress

**Repository:** Open330/context-compress  
**Pinned revision:** `59fae35a7b383876a34f84090f6da978e230795a`  
**License:** MIT

### Useful research surfaces

- command-specific filter edge cases;
- explicit non-empty-output floor;
- progress/noise filtering cases;
- hook/plugin setup lessons;
- benchmark-vs-RTK cases;
- tests around format-aware filtering.

### Disposition

- selected filter edge cases: **RESEARCH / selective ADAPT**
- "never empty for non-empty input" safety idea: **ADOPT concept**, already stronger in HuGR fail-open/non-expansion
- hook setup cases: **RESEARCH**

### Explicit reject

HuGR-Lean does not inherit:

- compression modes/aggressiveness tuning;
- LLM-selected auto mode;
- FTS5/BM25 indexing;
- MCP execution/index/search tools;
- intent-conditioned retrieval;
- self-tuning regret system;
- generic JSON/log semantic compression;
- remote fetch/index;
- persistent store/stats product.

These are intentionally outside HL-PLAN-001.

## Conclusion

Adjacent projects validate the problem and provide useful edge cases, but **none is an architecture donor**. HuGR-Lean should copy only small, traceable deterministic pieces that survive its stricter safety contract.
