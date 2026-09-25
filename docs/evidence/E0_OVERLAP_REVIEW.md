# E0 Major Donor Overlap Review

**Issue:** #20  
**Purpose:** adversarially compare the major reducer families shared by multiple donors before HuGR-Lean chooses implementation sources.

## Decision rule

When donor implementations differ, HuGR-Lean prefers evidence in this order:

1. native post-execution output compatible with HuGR's boundary;
2. explicit failure/evidence-preservation tests;
3. real captured fixtures;
4. simpler deterministic parser;
5. only then reduction ratio.

A donor that achieves better reduction by changing the executed command is not automatically a better HuGR implementation donor.

## Pytest

### RTK

Strengths:
- state-machine text parser;
- explicit failure blocks and summary handling;
- xfail/xpass handling;
- failure recovery/fallback behavior.

Important incompatibility:
- RTK's runner injects `--tb=short`, `-q`, and `-rxX` unless the user already controls those flags.

Therefore its parser is partially shaped by RTK-controlled execution.

### TRS

Strengths:
- native pytest parser handles verbose, default, and quiet progress;
- large native fixture corpus;
- separate failure attachment logic;
- real-output tests.

### CX

Strengths:
- explicit proof/evidence contract;
- real exit code;
- failure identifiers/assertion/source locations;
- validation methodology.

Important incompatibility:
- CX also injects `--tb=short` and `-q` in its wrapper.

### HuGR disposition

**TRS-first ADAPT/REIMPLEMENT** for native parsing and fixture coverage.  
Use RTK parser cases as secondary edge-case evidence.  
Use CX for Preservation Contract/test methodology.

HuGR must parse the output actually delivered by the host and cannot assume short traceback/quiet mode was injected.

---

## JavaScript / TypeScript test runners

### RTK

RTK's Vitest/Jest implementation strongly prefers structured JSON:
- Jest forces `--json`;
- Vitest has a JSON parser as Tier 1 and its runner builds effective reporter arguments;
- regex/text parsing is a degradation path.

### TRS

TRS has extensive native Jest/Vitest/npm/pnpm/Bun fixture families, including:
- all-pass;
- all-fail;
- mixed;
- large;
- skipped/todo;
- single/multiple suite variants.

### HuGR disposition

**TRS-first fixture/parser donor.**

RTK structured parsers remain useful specifications for fields worth preserving, but JSON-reporter-dependent code is **REIMPLEMENT**, not ADOPT.

---

## Go test

### RTK

Pinned Go documentation states:
- RTK injects `-json`;
- Go test output is then parsed as NDJSON.

This is incompatible with HuGR's post-processing-only rule unless the host itself happened to produce that format.

### TRS

TRS explicitly implements native Go test parsing for:
- verbose `=== RUN` / `--- PASS|FAIL|SKIP`;
- default package-summary mode.

### HuGR disposition

**TRS-first REIMPLEMENT/ADAPT.**

RTK's NDJSON model is valuable only for a future profile whose boundary input is independently proven to be NDJSON. HuGR must never assume it.

---

## Rust / Cargo and compiler diagnostics

### RTK

Strengths:
- rich Cargo/rustc/clippy edge cases;
- block streaming/state-machine logic;
- compiler JSON parsing in some paths;
- large test ecosystem.

Risk:
- command execution behavior can alter message format and stream handling.

### TRS

Strengths:
- native Cargo failure fixtures;
- command classification;
- signal-preservation tests.

### CX

Strengths:
- Cargo official surface;
- output-metric/evidence methodology;
- failure truth.

### HuGR disposition

**Mixed donor strategy:**
- TRS native fixtures first;
- RTK parser/diagnostic edge cases selectively adapted;
- CX validation methodology.

Every Cargo subprofile must declare exactly which native shapes it accepts.

---

## Git status / log

### RTK

RTK may execute compact status with `git status --porcelain -b`; its Git implementation also contains argument-sensitive behavior and helper probes.

### TRS

Strong native Git status/diff fixture corpus:
- status codes;
- locale;
- clean/dirty/staged/untracked/conflict;
- porcelain variants;
- rename/copy/typechange;
- long paths.

Classifier includes a valuable exact-evidence guard: `git show rev:path` is file content and must not be routed as a diff.

### CX

Strong truthfulness distinction, but:
- default status converts to porcelain;
- compact diff performs a stat command plus full diff;
- CX-specific `--no-compact` and exact surfaces alter wrapper semantics.

### HuGR disposition

**TRS fixture-first; HuGR-native parser reimplementation.**

Adopt the *idea* of exact-evidence classification from TRS/CX, but do not copy wrapper behaviors that run additional Git commands.

---

## Git diff / show exact evidence

All three donors demonstrate that Git output is especially easy to corrupt by over-generalization.

HuGR rule:

- if the command's product is the patch/blob/exact output, passthrough by default;
- no probe commands;
- no semantic hunk summarization;
- only a fixture-backed, lossless/preservation-contract transformation may touch exact evidence.

This is deliberately more conservative than major donor defaults.

---

## Search: grep / rg

### RTK

Provides grouping/filtering and command-specific handling.

### TRS

Large native fixture corpus covers:
- multiple files;
- context before/after;
- binary files;
- colons in content;
- columns;
- ripgrep heading;
- long paths;
- no line numbers.

### CX

Best donor for dialect/exactness lessons:
- grep vs rg semantics remain distinct;
- native-only flags can force passthrough;
- document/tabular search can remain exact;
- no-match and context modes need different handling.

Some CX paths may rerun through fallback backends, which HuGR will not do.

### HuGR disposition

**TRS fixtures + CX dialect safety + HuGR post-process reimplementation.**

No backend rerun and no generic arbitrary-text grouping.

---

## Filesystem listing

RTK/TRS/CX all compact ls/find/tree-like output.

TRS offers the broadest native fixture diversity; CX contributes exact/bounded behavior lessons.

HuGR disposition:

**ADAPT fixture/parsing ideas**, but profile admission must prove that the requested output is presentation/review rather than exact evidence.

---

## Linters / structured diagnostics

### RTK

Several high-reduction paths force structured output:
- Ruff JSON;
- ESLint JSON;
- golangci JSON;
- cloud/container structured formats.

### TRS

Provides native lint/tsc fixtures and routing, though some commands also support structured modes.

### CX

Useful TSC/Node validation/failure evidence patterns.

### HuGR disposition

**Native-output reimplementation first.**

Structured donor reducers become directly eligible only when the HuGR boundary itself proves the input is structured.

---

## Docker / kubectl

RTK has broad container handling but can rely on structured/output-control behavior.  
TRS has useful Docker native evidence including `docker_ps_real.txt`.  
CX has container command/evidence tests.

HuGR disposition:

- Docker: **ADAPT fixtures + REIMPLEMENT native profiles**.
- kubectl: **DEFER broad claim until more native fixtures are collected**.

This is a declared evidence gap, not hidden scope.

---

## Logs

Donors commonly deduplicate or truncate logs.

HuGR is stricter:

> repeated text is not inherently noise.

Log reduction requires known command identity plus a profile-specific grammar/contract. Generic log dedupe remains rejected.

---

## Cross-donor conclusions

### Strong transplant candidates

- fixture corpora;
- ANSI/control parsing helpers under explicit applicability;
- native pytest/test parsing;
- native Git/search/filesystem edge cases;
- never-worse/non-expansion tests;
- failure-truth tests;
- fake-binary/integration-test methodology.

### Strong reimplementation candidates

- structured test/lint parsers whose input format was injected;
- Git wrapper summaries/probes;
- container JSON/table forcing;
- recovery systems coupled to donor runners.

### Strong rejects

- generic unknown-output semantic compression;
- source-code stripping;
- command rewrite;
- persistent analytics;
- search/index/memory systems;
- LLM mode selection;
- command repair/retry.

## Review conclusion

The major overlapping families have been compared sufficiently for E0.

The result does **not** select final parser implementations. It establishes which donor evidence is safe to carry into WP3 and which runtime assumptions must be discarded.
