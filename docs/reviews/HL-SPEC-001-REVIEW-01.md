# HL-SPEC-001 — Adversarial Review 01

**Reviewed document:** `docs/TECHNICAL_SPEC.md`  
**Reviewed versions:** 0.1 → 0.2 → 1.0  
**Review date:** 2026-09-24  
**Disposition:** Critical/High findings incorporated; no approval blocker remains

## Objective

Attempt to break the Technical Specification before roadmap/implementation work begins.

The review focused on:

- fail-open correctness;
- boundary truthfulness;
- host truncation and incomplete evidence;
- protocol amplification;
- shell-dialect ambiguity;
- fabricated summaries;
- OpenCode integration failure modes;
- raw-store privacy/concurrency;
- donor-code mismatch with HuGR-Lean's post-processing architecture;
- performance assumptions;
- overengineering.

## External evidence reviewed

- RTK `f5e104e117ab5b05c69d448103c28f1155e04417`
  - single Rust binary;
  - reported sub-10ms command overhead;
  - fail-safe/raw fallback;
  - extensive command-specific reducers;
  - many reducers rely on command rewriting/format injection.
- TRS `0175ae73f36709fd4a9242b2e431d026d6f82bb3`
  - independent parser/coverage corpus;
  - hook/plugin integration quirks;
  - OpenCode integration historically uses tool hooks and can fail badly if plugin code throws.
- CX `b7c81334e63ba3c1adaafbd2773ca2b8049ae7ae`
  - explicit passthrough boundary;
  - exact-evidence discipline;
  - failure/raw evidence patterns;
  - honest distinction between estimated token savings and provider billing.
- OpenCode stable `v1.18.32@545f51d26cc39a907d2867492d498d9607ea5fa4`
  - `tool.execute.after` is on the real execution path;
  - hook output is mutable before return;
  - shell tool ID remains `bash` even across multiple underlying shell kinds;
  - shell metadata exposes exit and truncation;
  - default truncation is 50 KiB / 2,000 lines;
  - full truncated output may be stored by the host;
  - Intel macOS release artifact exists.

Licenses verified at pinned donor lines of development:

- RTK: Apache-2.0
- TRS: MIT
- CX: MIT

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| TS-F01 | Critical | Passthrough/failed-open responses echoed the entire original payload back across IPC, doubling memory/serialization for the cases that should be cheapest. | `FilterResultV1.replacement` is now optional; passthrough/failed-open return `None`. Adapter-owned original remains authoritative. |
| TS-F02 | Critical | Treating any shell output as `terminal_text=true` could strip control bytes that are actual payload rather than presentation. | `PresentationV1` is now `Unknown | TerminalRendered`; shell source alone never grants terminal normalization. OpenCode v1 reports `Unknown`. |
| TS-F03 | High | `aborted=false` / `timed_out=false` conflated "known false" with "host did not tell us." | Replaced with `TerminationV1::{Unknown, Exited, Aborted, TimedOut}`. |
| TS-F04 | Critical | Profiles could summarize already-truncated host output as though it were complete. | Added `CompletenessV1::{Unknown, Complete, Truncated}`; aggregate profiles require Complete unless partial semantics are explicitly contracted. |
| TS-F05 | High | The shell parser assumed quoting/escaping semantics while OpenCode's exposed tool ID does not reveal the actual shell dialect. | Added `ShellDialectV1`; unknown dialect accepts only a portable bare-command grammar. |
| TS-F06 | High | A throwing OpenCode hook can turn HuGR-Lean failure into host/tool failure. | Adapter contract now requires top-level no-throw/fail-open behavior and safe plugin initialization. |
| TS-F07 | High | `LeanWriter.signal()` could still be fed fabricated profile prose while claiming signal preservation. | Restricted signals to source spans, host outcome fields, or named mechanical derivations; dynamic writer output must be signal/derived, not arbitrary text. |
| TS-F08 | High | Donor reducers can rely on command rewrites (JSON flags, stream changes) that HuGR-Lean explicitly refuses to perform. | Added donor input-compatibility gate; rewrite-dependent reducers require REIMPLEMENT against native boundary input. |
| TS-F09 | Medium | Raw-store threshold used `saved_bytes` before the pipeline computed metrics. | Measure now precedes OptionalRawStore. |
| TS-F10 | Medium | Raw retention only covered `reduced`, not materially smaller `normalized` output. | Material rule now covers both normalized and reduced decisions. |
| TS-F11 | Medium | Raw-store write semantics could expose partially written artifacts during crashes/concurrency. | Same-directory temporary write + close + atomic rename; temp artifacts are never valid refs. |
| TS-F12 | Medium | "Opaque random ID" had no concrete entropy source in the dependency model. | 128-bit OS randomness via `getrandom`; lowercase hex IDs. |
| TS-F13 | Medium | Adapter design was based on a moving OpenCode `dev` snapshot rather than a concrete released version. | Initial supported target is stable OpenCode v1.18.32 with pinned tag commit. |
| TS-F14 | Medium | Raw references in generic host metadata could leak sensitive local evidence identifiers into model context or persistence. | Raw refs excluded by default; only explicit, integration-tested non-model/debug surfaces may expose them. |
| TS-F15 | Medium | Large JSON input could allocate before the output-size guard applied. | Added 128 MiB protocol-envelope cap plus adapter preflight for hard output maximum. |
| TS-F16 | Medium | Configuration syntax remained unresolved inside a document meant to be a Technical Specification. | v1 config is concretely TOML with explicit lookup order and safe invalid-config behavior. |
| TS-F17 | Low | Character-count metrics added work but no decision value. | Removed; exact byte metrics are mandatory, tokens remain optional and tokenizer-labeled. |
| TS-F18 | Medium | Routing still referred to raw host tool IDs after the protocol moved toward host-independent normalization. | Added `SourceV1` taxonomy; command-specific shell routing uses Source + parsed command identity. |
| TS-F19 | Medium | Raw artifacts could be evicted under store pressure without defined retrieval semantics. | Early eviction is allowed but returns explicit unavailable; refs can never resolve to different content. |
| TS-F20 | Medium | Performance budgets were arbitrary without context. | Kept as explicit initial budgets, justified as guardrails; RTK demonstrates sub-10ms Rust proxy overhead and OpenCode normally caps the first-adapter boundary at 50 KiB. Benchmarks may revise budgets only with evidence. |
| TS-F21 | Medium | OpenCode timeout/abort is not exposed as a dedicated metadata enum, so adapter could falsely infer completion. | Initial adapter maps only integer exit to Exited; otherwise termination is Unknown. Profiles requiring completion fail conservative. |
| TS-F22 | Low | SafeNormalization could return an equal-size replacement and add pointless protocol/mutation work. | Normalization must be non-expanding; byte-identical result remains passthrough. |

## Security/privacy review result

Accepted with the following properties:

- raw retention off by default;
- no secret-redaction promise;
- no network upload;
- local bounded store;
- strict raw-ID grammar;
- user-only Unix permissions target;
- current-user Windows cache ACL retained;
- atomic publication of artifacts;
- raw retrieval explicit;
- raw recovery never required for filtering correctness.

## Performance sanity result

No benchmark exists yet because no implementation exists.

The architecture remains acceptable because:

1. core is a single synchronous Rust process with no async/database/network initialization;
2. RTK provides evidence that a comparable Rust CLI proxy can stay below roughly 10ms command overhead in its own architecture;
3. OpenCode v1.18.32 normally exposes at most 50 KiB of model-facing tool output before HuGR-Lean;
4. the 250ms adapter ceiling guarantees fail-open instead of host stalls;
5. the spec explicitly forbids introducing a daemon/native binding before measurements justify it.

The numeric p95 budgets remain implementation gates, not claims of achieved performance.

## Simplicity review result

No additional subsystem is required before implementation.

Explicitly still rejected:

- daemon;
- database;
- LLM;
- semantic classifier;
- tokenizer dependency;
- N-API;
- WASM;
- command rewrite;
- persistent analytics;
- arbitrary-text deduplication.

## Approval conclusion

All Critical and High findings are closed in the specification.

Remaining uncertainty is intentionally empirical and belongs to roadmap implementation/benchmark work.

HL-SPEC-001 is suitable for approval as the normative Technical Specification and for transition of project state to `TechnicallySpecified`.
