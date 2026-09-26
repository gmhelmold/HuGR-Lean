# HuGR-Lean — Technical Specification

**Document ID:** HL-SPEC-001  
**Version:** 1.1  
**Status:** Approved Technical Specification  
**Review state:** TypeScript runtime amendment #72; G-E1 revalidation pending  
**Normative parent:** HL-PLAN-001 v1.1  
**Date:** 2026-09-25  
**Scope:** Concrete architecture and technical mechanisms required to refine the Formal Project Plan

---

# 0. Purpose

This specification defines the concrete implementation architecture for HuGR-Lean.

It refines the obligations in `docs/PROJECT_PLAN.md` without weakening them.

The design is intentionally small:

~~~text
host tool result
      │
      ▼
thin host adapter
      │ normalized ObservationV1
      ▼
HuGR-Lean core
      │
      ├─ SafeNormalization
      ├─ deterministic profile routing
      ├─ profile reduction
      ├─ Preservation Contract validation
      └─ fail-open
      │
      ▼
FilterResultV1
      │
      ▼
host adapter replaces model-visible text
~~~

HuGR-Lean does not execute an LLM, run a context database, maintain semantic memory, or require a resident service.

---

# 1. Research snapshot and pinned external references

The initial design was checked against the following upstream snapshots.

These pins are research references, not runtime dependencies.

| Project | Pinned revision | Relevant evidence |
|---|---|---|
| RTK | `rtk-ai/rtk@f5e104e117ab5b05c69d448103c28f1155e04417` | broad Rust reducer coverage, fail-safe behavior, command-specific parsers |
| TRS | `dPeluChe/trs@0175ae73f36709fd4a9242b2e431d026d6f82bb3` | alternative Rust parsers, classifier patterns, agent-integration research |
| CX | `contextlimit/cx@b7c81334e63ba3c1adaafbd2773ca2b8049ae7ae` | passthrough discipline, exact evidence, failure preservation, truthful metrics |
| OpenCode | `anomalyco/opencode v1.18.32@545f51d26cc39a907d2867492d498d9607ea5fa4` | stable-release `tool.execute.after` boundary, shell metadata, native truncation behavior |

Important observations from this snapshot:

1. RTK and TRS prove that broad deterministic CLI-output reduction is practical without LLM calls.
2. CX demonstrates useful safety patterns around exact evidence and explicit passthrough.
3. OpenCode v1.18.32 invokes `tool.execute.after` after tool execution and provides mutable tool output.
4. OpenCode v1.18.32 shell execution may truncate before that hook, and exposes metadata including exit status, truncation state, and a full-output path when available.
5. OpenCode v1.18.32 defaults tool truncation to 2,000 lines or 50 KiB, so the primary adapter normally receives already-bounded text.
6. Therefore HuGR-Lean metrics and raw semantics are defined relative to the actual adapter boundary, not imaginary pre-host bytes.

All copied or materially derived donor code remains subject to HL-PLAN-001 provenance requirements.

---

# 2. Architecture decisions

## ADR-T01 — TypeScript local core

The filtering engine MUST be implemented as a local TypeScript module.

Rationale:

- HuGR-Lean is deterministic text processing, not a compute-heavy service;
- the initial supported host is already JavaScript/TypeScript-native;
- in-process filtering removes process startup, IPC, binary discovery, and cross-compilation;
- a single package is easier to install, audit, contribute to, and publish as free open source;
- the safety model depends on contracts/fixtures, not on native-code memory safety;
- no platform-specific runtime artifact is needed.

The runtime architecture MUST NOT depend on Rust, a native binary, a daemon, or a subprocess.

## ADR-T02 — Single package

The repository SHALL remain one TypeScript package until a concrete release or dependency boundary justifies a split.

Core, profiles, fixtures, and the first host integration may coexist in the same package. Empty workspace/package decomposition is prohibited.

## ADR-T03 — Thin host adapters

Host-specific integration MUST remain outside reducer logic.

Adapters normalize host data into `ObservationV1`, call the local core function, and apply `FilterResultV1`.

An adapter MUST NOT reimplement reducers.

## ADR-T04 — In-process host boundary

The initial OpenCode integration SHALL call HuGR-Lean in-process.

~~~text
tool result
  -> adapter maps ObservationV1
  -> filter(observation)
  -> FilterResultV1
  -> adapter applies replacement when valid
~~~

No subprocess, stdin/stdout IPC, binary lookup, daemon, socket server, N-API, WASM bridge, or dynamic library is part of v1.

`Protocol V1` remains the versioned semantic data contract between adapter and core. JSON serialization is optional interoperability/debug tooling, not the normal runtime transport.

## ADR-T05 — Post-processing only

HuGR-Lean v1 MUST NOT rewrite commands before execution in order to make them easier to parse.

It filters results that already exist.

This intentionally rejects a large part of RTK/TRS command-rewrite architecture while retaining their reducer knowledge.

## ADR-T06 — No database

HuGR-Lean v1 MUST NOT require SQLite or any other database.

Per-result metrics are returned in `FilterResultV1`.

Optional aggregate persistence, if ever added, requires a separate scope decision.

## ADR-T07 — No model-visible telemetry

Savings messages, reducer names, debug markers, raw IDs, and HuGR-Lean branding MUST NOT be appended to model-visible tool text by default.

Telemetry belongs in adapter metadata/logging, not model context.

---

# 3. High-level component model

~~~text
Host tool result
      │
      ▼
Host adapter
  maps trusted host facts
      │ ObservationV1
      ▼
HuGR-Lean TypeScript core (in-process)
      │
      ├─ SafeNormalization
      ├─ command/tool identity
      ├─ profile registry + routing
      ├─ deterministic analysis/render
      ├─ Preservation Contract validation
      ├─ non-expansion guard
      └─ fail-open
      │ FilterResultV1
      ▼
Host adapter
  mutates model-visible text only for valid normalized/reduced results
~~~

---

# 4. Repository layout

Initial target:

~~~text
HuGR-Lean/
├── package.json
├── package-lock.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── engine.ts
│   ├── command.ts
│   ├── normalize.ts
│   ├── preservation.ts
│   ├── primitive.ts
│   ├── profile.ts
│   └── profiles/
├── fixtures/
├── docs/
│   ├── PROJECT_PLAN.md
│   ├── TECHNICAL_SPEC.md
│   ├── decisions/
│   ├── reviews/
│   └── provenance/
└── tests/
~~~

This is a target shape, not permission to create empty directories prematurely.

A directory SHOULD be created only when its first real file exists.

---

# 5. Dependency policy

## 5.1 Production dependencies

The core SHOULD have zero production dependencies.

Use platform/runtime primitives for strings, UTF-8 byte accounting, collections, filesystem, and JSON.

A production dependency requires concrete justification under the HL-PLAN-001 dependency budget.

## 5.2 Explicitly rejected initial dependencies

The core MUST NOT initially require:

- async runtime/framework;
- database client;
- HTTP client;
- tokenizer;
- parser DSL/framework;
- embedding library;
- native addon;
- subprocess wrapper;
- plugin framework.

## 5.3 Development-only dependencies

TypeScript compiler, test runner, fixture TOML parser, property/fuzz tooling, and benchmark tooling MAY be development-only dependencies.

Development tooling MUST NOT become a runtime requirement for installed filtering.

---

# 6. Protocol

## 6.1 In-process contract

`Protocol V1` is a semantic contract, not a required wire protocol.

The normal v1 call path is:

~~~ts
const result = filter(observation)
~~~

The caller already owns the original tool output. Core exceptions or invalid results MUST cause the adapter to preserve that original output.

JSON encoding MAY be used in tests, debugging, or future cross-process adapters, but the local OpenCode path MUST NOT serialize/deserialize merely to call the core.

## 6.2 Versioning

`schema_version = 1` remains the compatibility marker for `ObservationV1` and `FilterResultV1`.

The semantic schema is stable within major version 1. No CLI/process command is required for normal filtering.

## 6.3 ObservationV1

Protocol V1 carries only facts the core can use safely.

Conceptual schema:

~~~rust
struct ObservationV1 {
    schema_version: u16,          // MUST be 1
    source: SourceV1,
    command: Option<String>,     // shell command when applicable; bounded
    shell_dialect: ShellDialectV1,
    output: String,              // exact UTF-8 boundary text
    termination: TerminationV1,
    completeness: CompletenessV1,
    presentation: PresentationV1,
}
~~~

Host names, call IDs, session IDs, arbitrary metadata, authentication data, attachments, and full host objects are deliberately excluded from the core protocol.

### SourceV1

~~~text
Shell
Read
Search
Lsp
Mcp
Browser
Other
~~~

Adapters map host-specific tool IDs to this small source taxonomy.

### ShellDialectV1

~~~text
Unknown
Posix
PowerShell
Cmd
~~~

Unknown is the correct value when the adapter cannot prove the shell dialect.

### TerminationV1

~~~text
Unknown
Exited(code: i32)
Aborted
TimedOut
~~~

The protocol MUST distinguish **unknown** from **known false**.

HuGR-Lean MUST NOT infer success from missing exit status.

Profiles that claim complete success/failure summaries SHOULD require `Exited(code)` unless their Preservation Contract explicitly supports another termination state.

### CompletenessV1

~~~text
Unknown
Complete
Truncated
~~~

A profile MUST NOT claim complete aggregate results from `Truncated` or `Unknown` input unless that exact partial-input behavior is explicitly part of its Preservation Contract.

### PresentationV1

~~~text
Unknown
TerminalRendered
~~~

`TerminalRendered` is a capability assertion.

It may be set only when the adapter/host contract proves that terminal control bytes are presentation semantics rather than arbitrary payload data.

A shell-like tool by itself is **not** sufficient evidence.

## 6.4 FilterResultV1

~~~rust
struct FilterResultV1 {
    schema_version: u16,
    decision: DecisionV1,
    replacement: Option<String>,
    profile: Option<String>,
    metrics: MetricsV1,
    raw_ref: Option<String>,
    diagnostics: Vec<DiagnosticCodeV1>,
}
~~~

### DecisionV1

~~~text
passthrough
normalized
reduced
failed_open
~~~

Response consistency is strict:

| Decision | replacement |
|---|---|
| `normalized` | MUST be `Some(text)` |
| `reduced` | MUST be `Some(text)` |
| `passthrough` | MUST be `None` |
| `failed_open` | MUST be `None` |

The adapter already owns the original output. Echoing it back for passthrough/fail-open would waste memory, IPC, and serialization.

### Diagnostics

Diagnostics are bounded machine/adapter-facing enum codes, not arbitrary free-form text.

Initial maximum:

~~~text
16 diagnostic codes per result
~~~

They MUST NOT automatically enter model-visible output.

Examples:

~~~text
ambiguous_profile
profile_parse_failed
preservation_failed
input_too_large
raw_store_failed
protocol_warning
incomplete_input
unknown_termination
~~~


---

# 7. Boundary semantics

## 7.1 Boundary-relative raw

`ObservationV1.output` is the raw payload **available to HuGR-Lean at the adapter boundary**.

If the host already truncated or transformed data, HuGR-Lean does not claim to possess the unavailable earlier representation.

## 7.2 Optional host augmentation

A host adapter MAY have access to a host-owned exact overflow artifact.

For example, the researched OpenCode shell implementation can expose a full-output path after native truncation.

Using such an artifact is an adapter capability, not a core assumption.

If an adapter augments the observation from such a source, it MUST:

1. prove the source is host-provided for that exact tool call;
2. apply an explicit size bound;
3. avoid arbitrary user-controlled path traversal;
4. record that the input source was augmented for metrics;
5. fall back to the normal boundary output on any uncertainty.

Initial OpenCode v1 integration MAY omit augmentation.

---

# 8. Engine pipeline

The engine executes the following logical pipeline.

~~~text
1. Decode
2. SizeGuard
3. SafeNormalize
4. IdentifyInvocation
5. RouteProfile
6. Analyze
7. Render
8. ValidatePreservation
9. NonExpansionGuard
10. Measure
11. OptionalRawStore
12. Return
~~~

No phase may call an LLM.

---

# 9. Decode

Malformed protocol JSON produces a protocol error and non-zero binary exit status.

The host adapter MUST treat protocol failure as passthrough and retain the original tool output.

Protocol errors MUST NOT fabricate a `FilterResultV1`.

---

# 10. Size guard

Default maximum input for active filtering:

~~~text
4 MiB UTF-8 boundary output
~~~

Hard configurable maximum:

~~~text
16 MiB
~~~

For larger input:

- the core returns `failed_open`;
- `replacement=None`;
- logical output remains the adapter-owned boundary input;
- diagnostic `input_too_large` is emitted;
- no truncation is introduced by HuGR-Lean.

The adapter SHOULD bypass subprocess invocation entirely when it already knows the boundary input exceeds the hard maximum.

The binary MUST also bound protocol-envelope input before unbounded JSON allocation. Protocol V1 hard envelope limit:

~~~text
128 MiB
~~~

The host's own limits may be much lower; OpenCode v1.18.32 defaults shell/tool truncation to 50 KiB or 2,000 lines.

---

# 11. SafeNormalization

## 11.1 Rule

SafeNormalization is not a generic text minifier.

Unknown arbitrary text is passthrough unless an applicability predicate is true.

## 11.2 Initial admitted applicability

For Protocol V1, the primary applicability fact is:

~~~text
presentation == TerminalRendered
~~~

This permits a narrow terminal-normalization set.

`SourceV1::Shell` does **not** imply `TerminalRendered`.

For the initial OpenCode adapter, presentation SHALL be `Unknown` because the hook exposes captured textual process output, not a host guarantee that every control sequence is presentation-only. Therefore unknown OpenCode shell output receives no generic terminal normalization unless a known profile authorizes it.

## 11.3 Initial terminal-safe transformations

The initial candidate set is:

1. ANSI/ECMA-48 presentation escape removal for recognized styling/control sequences;
2. carriage-return redraw collapse where `\r` is acting as terminal line replacement;
3. removal of incomplete spinner/progress frames created solely by carriage-return redraw.

## 11.4 Explicitly not SafeNormalization

The following MUST NOT be applied to unknown arbitrary output merely because it looks compressible:

- blank-line collapse;
- repeated-line deduplication;
- repeated-block deduplication;
- warning deduplication;
- log deduplication;
- head/tail truncation;
- long-line truncation;
- whitespace normalization;
- JSON minification;
- source-code stripping.

These require a known profile or exact-input-specific contract.

## 11.5 Idempotence

Every SafeNormalization primitive MUST satisfy:

~~~text
N(N(x)) == N(x)
bytes(N(x)) <= bytes(x)
~~~

for its admitted input domain.

If normalization produces byte-identical output, the decision remains `passthrough`.

---

# 12. Invocation identity

## 12.1 Goal

Profiles route from known execution identity, not from vague output resemblance.

## 12.2 Primary identity

Routing priority:

1. normalized `SourceV1`;
2. for `SourceV1::Shell`, confidently parsed command identity;
3. profile-specific shape guard after identity.

`SourceV1::Other` is not sufficient identity for a command-specific reducer.

Output-only profile recognition is prohibited for shell output in v1.

## 12.3 Simple shell parser

HuGR-Lean v1 SHALL implement a deliberately conservative command recognizer.

When `shell_dialect == Unknown`, only a **portable bare-command grammar** may be recognized:

~~~text
executable arg1 arg2 ...
~~~

where tokens contain no quoting, variable expansion, shell escapes, command substitution, or control operators.

This deliberately still recognizes common shapes such as:

~~~text
cargo test
git status --short
pytest -q
npm test
~~~

When a dialect is explicitly known, a dialect-specific recognizer MAY support additional quoting/escaping only with fixtures.

The recognizer MUST return `ComplexOrUnknown` when shell control semantics are present, including at least:

~~~text
|
||
&&
;
>
>>
<
<<
backticks
$(
multi-command newline
~~~

A complex command is passthrough/SafeNormalization unless a future explicit profile safely supports it.

## 12.4 Environment assignments

Leading POSIX-style environment assignments MAY be skipped only when:

~~~text
shell_dialect == Posix
~~~

and the assignment grammar is unambiguous:

~~~text
FOO=bar cargo test
~~~

With `shell_dialect == Unknown`, leading assignments are not stripped.

The parser MUST NOT evaluate expansions.

## 12.5 No shell execution

The recognizer never executes shell syntax, expands variables, reads aliases, invokes a shell, or resolves functions.

---

# 13. Profile routing

## 13.1 Profile trait

Conceptually:

~~~rust
trait Profile {
    fn id(&self) -> &'static str;
    fn recognize(&self, ctx: &RouteContext) -> Match;
    fn analyze(&self, ctx: &ProfileContext) -> Result<Analysis, ProfileError>;
    fn render(&self, analysis: &Analysis, out: &mut LeanWriter) -> Result<(), ProfileError>;
}
~~~

Concrete Rust types may refine this API but MUST preserve the separation:

~~~text
recognize → analyze → render
~~~

Every profile MUST also declare input requirements equivalent to:

~~~rust
struct ProfileRequirements {
    completeness: CompletenessRequirement, // Any | Complete
    termination: TerminationRequirement,   // Any | Exited
}
~~~

Requirements are checked before analysis. An unmet requirement is a conservative non-match/fail-open path, not a parser error.

A profile that produces complete aggregate claims SHOULD require:

~~~text
completeness = Complete
termination = Exited
~~~

unless its fixture-backed Preservation Contract explicitly proves safe partial/unknown behavior.

## 13.2 Match

No floating confidence scores.

~~~text
NoMatch
Match
~~~

If more than one profile matches the same observation after routing constraints:

~~~text
ambiguous → fail-open
~~~

Priority lists MUST NOT silently resolve accidental overlap.

Subprofiles intentionally grouped under one router are allowed when exclusivity is structurally explicit.

## 13.3 Shape guards

A profile MAY reject a command identity if its observed output shape is not one of the fixture-backed formats it supports.

Failure of a shape guard means fail-open, not "try to compress anyway."

---

# 14. Preservation Contracts

## 14.1 Analysis output

Profile analysis produces:

1. structured facts needed for rendering;
2. a set of required `Signal` objects;
3. profile-specific validation facts.

Conceptually, signal construction is restricted:

~~~rust
struct Signal {
    id: SignalId,
    canonical_text: String,
    evidence: EvidenceRef,
}

enum EvidenceRef {
    InputSpan { start_byte: usize, end_byte: usize },
    OutcomeField,
    Derived { rule_id: &'static str, source_spans: Vec<ByteSpan> },
}
~~~

Input spans are UTF-8 byte ranges over the analysis baseline and MUST end on valid character boundaries.

Profiles do not receive a public "arbitrary Signal fields" constructor.

The implementation SHOULD expose constructors equivalent to:

~~~text
Signal::verbatim(span)
Signal::canonicalized(span, rule_id)
Signal::from_outcome(field)
Signal::derived(rule_id, source_spans, mechanically_computed_text)
~~~

A signal MUST NOT be created from unconstrained profile-authored prose.

Canonicalization/derivation rules are named code paths with fixtures; the rule ID is diagnostic provenance, not a semantic confidence score.

## 14.2 LeanWriter

Profiles MUST render through a small writer abstraction.

Conceptual operations:

~~~rust
out.static_text(...)   // compile-time/static labels and punctuation only
out.signal(&signal)    // data-bearing preserved evidence
out.derived(...)       // mechanically derived data with rule provenance
out.newline()
~~~

Dynamic observation-derived text MUST NOT be emitted through `static_text`.

`signal()`:

1. writes the signal's canonical text;
2. records that the signal was emitted.

`derived()` requires a named derivation rule and source evidence.

A profile MUST NOT mark a signal as preserved without emitting its canonical representation.

## 14.3 Runtime validation

After render:

~~~text
required_signal_ids ⊆ emitted_signal_ids
~~~

MUST hold.

Otherwise:

~~~text
decision = failed_open
replacement = None
adapter-owned original output remains authoritative
~~~

## 14.4 Derived evidence

Deterministic derived claims such as:

~~~text
184 passed
73 identical warnings
12 files changed
~~~

are allowed only when calculated mechanically from parsed input.

Derived evidence MUST NOT be described as a critical signal unless its derivation is part of the Preservation Contract.

## 14.5 Raw recovery independence

A successful Preservation Contract does not depend on raw storage being enabled.

---

# 15. Non-expansion guard

Define the **safe baseline** as:

~~~text
SafeNormalization replacement when SafeNormalization was valid
otherwise original boundary input
~~~

After successful profile reduction:

~~~text
if bytes(candidate) >= bytes(safe_baseline):
    if safe_baseline differs from boundary input:
        decision = normalized
        replacement = Some(safe_baseline)
    else:
        decision = passthrough
        replacement = None
~~~

HuGR-Lean does not expand model context merely to advertise that it filtered something.

Exceptions require an explicit future specification amendment.

---

# 16. Reducer primitives

The core SHOULD keep a small primitive vocabulary.

Initial expected primitives:

- `strip_ansi`;
- `normalize_carriage_redraw`;
- `drop_exact_known_prefix`;
- `drop_exact_known_suffix`;
- `collect_failure_block`;
- `collapse_known_success_rows`;
- `dedupe_by_exact_key`;
- `group_count_by_key`;
- `group_by_file`;
- `extract_summary_line`;
- `preserve_neighborhood`;
- `render_count`;
- `render_signal`.

The list is not a required API.

The architectural constraint is that profiles SHOULD compose a small common vocabulary rather than invent unrelated mini-frameworks.

Generic `head()`, `tail()`, and arbitrary `truncate()` are not safe reducer primitives unless their use is profile-specific and contract-backed.

---

# 17. Initial profile families

The mature coverage objective remains defined by HL-PLAN-001.

The initial technical architecture SHALL support profile modules for:

~~~text
git
rust/cargo
python/pytest
js-ts/test
go/test
lint/diagnostics
docker/kubectl
filesystem/search
~~~

Exact implementation order belongs to the roadmap.

Profiles for content-bearing reads are conservative by default.

Source-code stripping from RTK is explicitly rejected from HuGR-Lean v1.

---

# 18. Profile behavior principles

## 18.1 Tests

For test runners:

- complete pass/fail totals MUST NOT be emitted unless input completeness is `Complete`, except where a contract explicitly defines partial semantics;
- profiles that depend on final process state SHOULD require `TerminationV1::Exited`;
- passing test rows MAY be summarized when fixture-backed;
- failing test identity MUST survive;
- failure diagnostic blocks required by the profile MUST survive;
- final exit/failure state MUST survive when supplied by host;
- parse uncertainty, truncated input, or unknown termination fails open unless explicitly supported.

## 18.2 Compilers and linters

- error code/file/line/message signals required by the contract MUST survive;
- repeated diagnostics MAY be grouped only by exact deterministic key;
- warning removal requires explicit profile policy;
- a non-zero host exit state MUST remain distinguishable.

## 18.3 Git

Git profiles may reduce presentation boilerplate but MUST distinguish:

- exact-evidence operations;
- review-summary operations.

A command whose exact patch/text is the requested product SHOULD default to passthrough.

In particular, aggressive semantic diff summarization is not assumed safe merely because RTK/CX implement it.

## 18.4 Search

Search result reduction requires explicit command identity and output grammar.

Arbitrary grep-like text from unknown tools is not deduplicated.

## 18.5 Logs

Log deduplication requires a known log profile or explicit user/tool identity.

Repeated arbitrary text is not inherently noise.

---

# 19. Raw store

## 19.1 Default

Persistent raw retention is:

~~~text
disabled by default
~~~

This is the privacy-safe default.

Filtering correctness MUST NOT depend on raw retention.

## 19.2 Optional file store

Default cache root:

~~~text
Unix/macOS: ${XDG_CACHE_HOME:-$HOME/.cache}/hugr-lean/raw
Windows:    %LOCALAPPDATA%\\HuGR-Lean\\cache\\raw
~~~

`HUGR_LEAN_CACHE` MAY override the root.

When explicitly enabled:

- storage is local only;
- files contain the exact boundary input used by HuGR-Lean;
- references use 128 bits of OS randomness encoded as lowercase hex;
- IDs are mapped only within the configured cache directory;
- path traversal is impossible through the public raw ID;
- Unix directory mode target: `0700`;
- Unix artifact mode target: `0600`;
- Windows storage relies on the current-user profile/cache ACL and MUST NOT deliberately broaden it;
- no remote upload occurs.

## 19.3 Retention

Default when enabled:

~~~text
retention: 6 hours
max store: 128 MiB
~~~

Cleanup is lazy.

A raw operation or new raw write may perform cleanup.

No background daemon is required.

## 19.4 Material reduction rule

A raw artifact is written only when all are true:

~~~text
raw.enabled
AND decision ∈ {normalized, reduced}
AND saved_bytes >= 1024
~~~

This avoids writing raw copies for trivial changes.

## 19.5 Store pressure and atomicity

Artifacts MUST be created with create-new semantics so concurrent one-shot processes cannot overwrite each other.

Writes MUST use a same-directory temporary file followed by close and atomic rename to the final random ID. Retrieval recognizes final IDs only; temporary files are never valid raw artifacts.

Temporary files abandoned by crashes are eligible for later cleanup. Partial files MUST NOT be returned as valid raw artifacts.

If the store exceeds its configured maximum, oldest artifacts may be removed first, including before nominal TTL expiry. A later request for an evicted artifact returns explicit `unavailable`; the raw reference is never silently redirected to different content.

Cleanup races may produce "already removed" outcomes but MUST NOT delete outside the raw-store root.

Raw-store failure MUST NOT fail the tool result.

The result MUST carry `raw_store_failed` diagnostics and `raw_ref=None`.

---

# 20. Raw retrieval CLI

Initial interface:

~~~text
hugr-lean raw <opaque-id>
~~~

Behavior:

- valid + retained → exact boundary input to stdout;
- expired/missing → explicit non-zero exit;
- invalid ID → rejected without filesystem lookup outside store.

The command does not search.

---

# 21. Metrics

## 21.1 Mandatory per-result metrics

~~~rust
struct MetricsV1 {
    input_bytes: u64,
    output_bytes: u64,
    saved_bytes: u64,
}
~~~

Derived:

~~~text
saved_bytes = max(input_bytes - output_bytes, 0)
~~~

## 21.2 Optional token metrics

Token counts are not required for filtering.

If later reported, they MUST include a tokenizer identifier.

Approximate `chars / 4` values MUST NOT be labeled exact tokens.

## 21.3 No persistent ledger in v1

The core does not persist metrics.

Adapters MAY aggregate returned metrics in process memory.

Persistent analytics require a future explicit design.

## 21.4 Boundary honesty

Metrics compare:

~~~text
ObservationV1.output
vs
effective model-visible output
~~~

where effective model-visible output is:

~~~text
replacement        for normalized/reduced
ObservationV1.output for passthrough/failed_open
~~~

They do not credit HuGR-Lean for upstream host truncation.

---

# 22. Configuration

## 22.1 Philosophy

Default-first.

Configuration exists to disable behavior, bound resources, or enable raw retention.

## 22.2 Core configuration

Protocol/config v1 uses TOML:

~~~toml
enabled = true
max_input_bytes = 4194304

[raw]
enabled = false
retention_hours = 6
max_bytes = 134217728

[exclude]
profiles = []
commands = []
~~~

Config lookup order:

1. `HUGR_LEAN_CONFIG` when set;
2. Unix/macOS: ${XDG_CONFIG_HOME:-$HOME/.config}/hugr-lean/config.toml;
3. Windows: `%APPDATA%\\HuGR-Lean\\config.toml`;
4. built-in defaults when no file exists.

Invalid existing config is an explicit configuration error. The adapter fails open for that tool result; it MUST NOT silently reinterpret invalid values as defaults.

`exclude.profiles` is an exact list of profile IDs.

`exclude.commands` uses exact normalized executable/subcommand roots, not arbitrary regex.

When `enabled=false`, the core returns `passthrough` with `replacement=None`.

Environment switch:

~~~text
HUGR_LEAN_DISABLED=1
~~~

allows adapters to bypass the engine without spawning it.

## 22.3 No compression level

There is no:

~~~text
aggressiveness
semantic threshold
confidence threshold
compression level
~~~

A reducer is either valid for its recognized contract or not.

---

# 23. OpenCode adapter

## 23.1 Compatibility snapshot

Initial verified release:

~~~text
OpenCode v1.18.32
tag commit 545f51d26cc39a907d2867492d498d9607ea5fa4
published 2026-09-21
~~~

At that release, the execution path invokes:

~~~text
tool.execute.before
tool execute
tool.execute.after
return output
~~~

and `tool.execute.after` receives mutable:

~~~text
title
output
metadata
~~~

The OpenCode adapter SHALL use `tool.execute.after`.

## 23.2 Observation mapping

For OpenCode v1.18.32, the exposed shell tool ID remains `"bash"` even when the configured underlying shell may be PowerShell or cmd.

For each eligible invocation:

~~~text
source        = Shell             when input.tool == "bash"
source        = Other             otherwise in initial adapter
command       = input.args.command only when it is a string and source == Shell
shell_dialect = Unknown           in initial adapter
output        = output.output

termination   = Exited(code)      when metadata.exit is an integer
termination   = Unknown           otherwise

completeness  = Truncated         when metadata.truncated === true
completeness  = Complete          when metadata.truncated === false
completeness  = Unknown           when the field is absent/untrusted

presentation  = Unknown
~~~

The initial adapter deliberately does not infer timeout/abort from prose, does not infer shell dialect from the exposed tool ID, and does not mark captured shell text as `TerminalRendered`.

Arbitrary metadata is not forwarded.

## 23.3 Mutation

If HuGR-Lean returns:

~~~text
reduced
normalized
~~~

the adapter requires `result.replacement` to be present and sets:

~~~text
output.output = result.replacement
~~~

For:

~~~text
passthrough
failed_open
protocol/process failure
timeout
unsupported schema
~~~

the adapter preserves the original output. Passthrough and failed-open responses do not echo the original payload across the subprocess boundary.

## 23.4 Adapter metadata

The initial adapter MUST NOT attach HuGR-Lean metadata until an integration test proves that the chosen metadata path is not model-visible and does not alter host persistence semantics.

After that proof, it MAY attach:

~~~text
hugrLean:
  decision
  profile
  inputBytes
  outputBytes
  savedBytes
  engineVersion
~~~

`rawRef` remains excluded by default because it can identify sensitive local evidence.

When raw retention is enabled, an adapter may claim raw-recovery support only if it has an explicit non-model-visible way to surface the reference, such as:

- host metadata proven by integration test to be non-model-visible; or
- explicit local debug/log output requested by the user.

Otherwise that adapter MUST treat raw recovery as unavailable even though the core capability exists.

## 23.5 No attachment mutation

The v1 adapter MUST NOT modify tool attachments.

## 23.6 Native host truncation

OpenCode may truncate shell output before `tool.execute.after`.

v1 MAY filter only the exposed `output.output`.

Reading a host-provided full-output path is a separate adapter capability and MUST be independently tested before enabling.

## 23.7 Capability verification

The initial supported OpenCode release is exactly `v1.18.32`.

A wider compatibility range may be advertised only after integration tests cover the additional releases.

Installation or startup SHOULD expose a `doctor` check that verifies:

- supported OpenCode release/range;
- HuGR-Lean binary availability;
- protocol compatibility.

The adapter MUST NOT infer that a hook is functional solely because its TypeScript type exists.

---

# 24. Host adapter contract

Every adapter MUST implement these obligations:

1. preserve original output in memory until HuGR-Lean successfully returns;
2. normalize only facts it actually knows;
3. set presentation hints conservatively;
4. enforce a subprocess timeout;
5. fail open on process/protocol errors;
6. avoid forwarding arbitrary secrets/metadata;
7. apply only a schema-valid `normalized/reduced + replacement` result;
8. expose truthful capability/compatibility information;
9. keep host-specific logic outside reducers;
10. invoke the HuGR-Lean executable directly, never through a shell;
11. wrap the entire hook body in a no-throw fail-open boundary;
12. avoid top-level/plugin-load failure when the binary is missing or invalid;
13. strictly validate response schema/version/decision consistency before mutation;
14. bypass the subprocess when `HUGR_LEAN_DISABLED=1`;
15. bypass filtering for boundary output above the protocol hard input maximum.

A HuGR-Lean adapter failure MUST NOT turn a successful host tool call into a failed host tool call.

Adapters MAY bypass HuGR-Lean for non-text/binary results.

---

# 25. Adapter process timeout

Default one-shot engine deadline:

~~~text
250 ms
~~~

This is a fail-open ceiling, not the acceptable performance target.

If exceeded:

1. terminate/abandon the filter process;
2. preserve original host output;
3. record adapter-side timeout diagnostics;
4. do not retry inside the same tool result.

Valid future config range SHOULD remain bounded.

---

# 26. Human CLI

Initial human-facing commands:

~~~text
hugr-lean filter --protocol 1
hugr-lean raw <id>
hugr-lean doctor
hugr-lean version
~~~

A broad interactive CLI is not required.

`stats` may be provided by adapters using ephemeral aggregates; a persistent analytics subsystem is explicitly not part of v1.

---

# 27. Failure semantics

## 27.1 Core reducer failure

~~~text
profile error
→ failed_open
→ replacement = None
→ adapter retains its original boundary output
~~~

## 27.2 Preservation failure

Same as reducer failure.

A preservation failure is release-significant and SHOULD be observable in non-model diagnostics.

## 27.3 Binary crash

Adapter preserves original output.

## 27.4 Protocol mismatch

Adapter preserves original output.

## 27.5 Unsupported profile version/shape

Core returns no replacement unless a previously validated SafeNormalization result independently qualifies as `normalized`; otherwise the adapter-owned input remains authoritative.

## 27.6 Raw-store failure

Filtering may still succeed because raw is not a correctness dependency.

## 27.7 Metrics failure

Filtering correctness wins; metrics may be unavailable.

---

# 28. Idempotence

For fixed version/config and equivalent normalized Observation facts:

~~~text
effective_output(filter(effective_output(filter(x)))) == effective_output(filter(x))
~~~

where the second pass is supplied the same source, command, dialect, termination, completeness, and presentation facts.

This property is required for SafeNormalization and SHOULD hold for every shipped profile.

Any profile that cannot satisfy idempotence requires an explicit exception and fixtures.

---

# 29. Resource bounds

## 29.1 Input

Active filter bound:

~~~text
4 MiB default
16 MiB hard configurable maximum
128 MiB hard protocol-envelope maximum
~~~

## 29.2 Output

HuGR-Lean MUST NOT emit more bytes than the SafeNormalized/passthrough baseline because of the non-expansion guard.

## 29.3 Memory

Reducers SHOULD operate in approximately linear memory in input size.

A profile MUST NOT build an unbounded cross-session cache.

## 29.4 CPU complexity

Normal reducers SHOULD be O(n) or O(n log n) in boundary-input size.

Quadratic scans on untrusted tool output are prohibited.

Regexes MUST be compatible with Rust's linear-time regex engine semantics.

---

# 30. Performance budget

Reference benchmark hardware will be recorded by WP8.

The following are **initial performance budgets**, chosen to prevent architecture from normalizing large overhead before measurements exist. They are reviewable by evidence, not aspirational marketing claims.

Release targets:

### Core in-process

| Input size | p95 target |
|---|---:|
| ≤ 256 KiB | ≤ 5 ms |
| ≤ 1 MiB | ≤ 25 ms |

### OpenCode adapter end-to-end including process startup

| Input size | p95 target |
|---|---:|
| ≤ 256 KiB | ≤ 25 ms |
| ≤ 1 MiB | ≤ 60 ms |

The adapter hard deadline remains 250 ms.

Because OpenCode v1.18.32 normally bounds tool output to 50 KiB, the ≤256 KiB row is the primary first-adapter budget.

A release may revise these numbers only with recorded benchmark evidence and explicit spec change.

If process startup is the dominant violation, optimization order is:

1. build/profile Rust binary;
2. reduce protocol overhead;
3. investigate host-native process APIs;
4. only then consider a persistent worker or embedding technology.

No daemon/N-API/WASM optimization is permitted preemptively.

---

# 31. Concurrency

The one-shot binary is stateless for filtering.

Therefore v1 core filtering requires no shared mutable runtime state.

Optional raw storage is cross-process state and MUST use collision-resistant artifact IDs plus create-new semantics.

Cleanup races are acceptable if they result only in:

- artifact already removed;
- artifact unavailable.

They MUST NOT cause arbitrary file deletion or corrupt another artifact.

A global database lock is not introduced.

---

# 32. Security and privacy

## 32.1 Trust model

Tool output is untrusted input.

Reducers MUST NOT:

- execute output;
- interpret output as shell commands;
- load referenced files merely because output names them;
- follow URLs;
- invoke network services.

## 32.2 Command string and subprocess invocation

Command recognition parses command text but never executes or expands it.

Adapters MUST spawn the fixed HuGR-Lean binary path directly with argv. The observed tool command is transferred only as JSON data on stdin; it is never interpolated into a shell command.

## 32.3 Raw data

Persistent raw is opt-in.

## 32.4 Secrets

HuGR-Lean does not attempt to solve secret redaction in v1.

Pretending to guarantee complete redaction would be unsafe.

The safer default is no persistent raw retention.

## 32.5 Paths

Only adapter- or config-derived trusted roots may be used for HuGR-Lean storage.

Raw IDs cannot contain path separators.

---

# 33. Testing architecture

## 33.1 Unit tests

Required for:

- protocol parsing;
- SafeNormalization primitives;
- simple shell parser;
- profile recognition;
- profile analysis;
- restricted Signal constructors/evidence spans;
- LeanWriter static/dynamic separation;
- preservation validation;
- metrics;
- raw ID validation;
- config bounds.

## 33.2 Fixture tests

Each profile requires:

~~~text
success
failure
warnings
malformed
ambiguous
version variants
already-lean/idempotence
~~~

where relevant.

## 33.3 Negative fixtures

Every destructive primitive requires fixtures proving when it MUST NOT activate.

## 33.4 Property tests

High-value properties:

- SafeNormalization idempotence;
- no panic on arbitrary UTF-8;
- fail-open output equals safe baseline;
- required signals survive;
- output does not expand after non-expansion guard;
- shell parser never upgrades complex syntax to simple identity.

## 33.5 Fuzzing

Fuzz targets SHOULD cover:

- protocol decoder;
- simple shell recognizer;
- terminal normalization;
- high-risk profile parsers.

Fuzzing is development verification, not a runtime subsystem.

## 33.6 Integration tests

OpenCode adapter tests require:

- hook mutation reaches returned model-visible output on supported versions;
- original output survives binary missing/crash/nonzero protocol failure;
- malformed or inconsistent response schema fails open;
- metadata mapping of exit/truncation state is correct;
- missing exit maps to `TerminationV1::Unknown`, not success;
- truncated input cannot produce unsupported complete aggregate claims;
- shell source does not imply `TerminalRendered`;
- portable bare-command routing works with unknown shell dialect;
- quoted/complex unknown-dialect commands fail conservative;
- binary timeout fails open;
- adapter hook never throws into OpenCode;
- attachments remain unchanged;
- disabled mode performs no subprocess invocation.

## 33.7 Regression rule

Every real destructive false positive becomes a permanent fixture.

---

# 34. Donor reuse policy

## 34.1 RTK

High-value donor material:

- Rust parsers;
- command coverage;
- fixtures;
- exact formatting quirks;
- failure cases;
- ANSI/progress handling;
- ecosystem-specific diagnostics.

Explicitly rejected unless separately justified:

- command auto-rewrite;
- source-code body stripping;
- persistent analytics architecture;
- unrelated memory/retrieval features;
- aggressive transformations that violate HuGR-Lean Preservation Contracts.

## 34.2 TRS

High-value donor material:

- alternate parsers;
- fixtures;
- classifier edge cases;
- agent integration research.

Explicitly rejected from core:

- unrelated input rewrite systems;
- documentation ingestion;
- output-saver prompt instructions;
- broader repo-digest product features.

## 34.3 CX

High-value donor material:

- passthrough policy;
- exact evidence concepts;
- failure preservation;
- parser validation cases;
- honest savings accounting.

Explicitly rejected from v1:

- SQLite insights ledger;
- antivirus;
- command repair/optimization;
- analytics UI;
- persistent reporting system.

## 34.4 Donor input-compatibility gate

Before adopting/adapting a donor reducer, WP0/WP3 MUST classify what input the donor reducer assumes.

A donor implementation is **rewrite-dependent** if it relies on behavior such as:

- injecting JSON/NDJSON flags;
- changing command arguments;
- forcing color/format modes;
- separating streams differently from the host boundary;
- executing a donor-specific wrapper rather than parsing native host output.

Rewrite-dependent reducers MUST NOT be copied into HuGR-Lean as though they parse native post-execution output. Their algorithms/fixtures may inform a REIMPLEMENT decision only after native-input behavior is specified and tested.

This is especially important because RTK/TRS frequently gain determinism by rewriting commands, while HuGR-Lean v1 explicitly does not.

## 34.5 Clean consolidation rule

HuGR-Lean MUST NOT run donor engines side by side.

The target is:

~~~text
donor behavior/fixtures
        ↓
compare
        ↓
one HuGR-Lean profile/primitive
~~~

---

# 35. Provenance implementation

Repository target:

~~~text
docs/provenance/
├── RTK.md
├── TRS.md
├── CX.md
└── THIRD_PARTY.md
~~~

Every directly copied or materially translated file/function/fixture MUST record:

- donor repository;
- pinned commit;
- source path;
- original license;
- HuGR-Lean destination;
- adaptation description.

Required license/NOTICE text MUST ship with distributions where applicable.

---

# 36. Packaging strategy

## 36.1 Core binary

Release matrix SHOULD include at minimum:

~~~text
macOS x86_64
macOS arm64
Linux x86_64
Linux arm64
Windows x86_64
~~~

Additional targets require demand/evidence.

## 36.2 OpenCode plugin

The plugin package SHALL resolve a matching HuGR-Lean binary without asking the user to compile Rust.

Preferred packaging pattern:

- thin JavaScript/TypeScript adapter package;
- platform-specific binary packages as optional dependencies;
- runtime selects the package matching OS/arch.

Exact registry package names are non-normative until publication.

## 36.3 Standalone releases

GitHub Releases SHOULD publish checksum-verifiable standalone binaries.

## 36.4 No runtime network

Once installed, filtering MUST work without network access.

---

# 37. OpenCode-specific exactness notes

At the pinned stable release `v1.18.32@545f51d...`:

- `tool.execute.after` is called after tool execution;
- the hook receives mutable `output`;
- the exposed shell tool ID is still `"bash"` for compatibility even when the actual shell kind may be pwsh/powershell/cmd;
- shell metadata includes integer/null exit and a truncation boolean;
- timeout/abort are represented in host-produced output prose rather than a dedicated metadata enum;
- native shell truncation can happen before the hook;
- default host truncation is 50 KiB or 2,000 lines;
- the host may save full truncated shell output to a path;
- OpenCode publishes a `darwin-x64-baseline` artifact, so Intel macOS is a concrete supported deployment target.

Therefore:

1. OpenCode is a suitable primary adapter target.
2. HuGR-Lean MUST benchmark itself against **OpenCode's already-bounded boundary output**, not the process's hypothetical unbounded stream.
3. The initial adapter reports unknown shell dialect and unknown presentation semantics.
4. A truncated observation is explicitly incomplete and cannot silently feed complete-result summaries.
5. A future OpenCode-enhanced mode may consume host overflow files, but that is not required for v1 correctness.
6. Compatibility tests must use actual supported OpenCode releases, not type declarations alone.

---

# 38. Configuration precedence

Recommended precedence:

~~~text
hard safety bounds
  > explicit environment override
  > user config
  > built-in defaults
~~~

Environment overrides are intended for CI/debug use.

No project-local config is required for normal use.

A future project-local config MAY exist only if there is a concrete use case for repository-specific exclusions.

---

# 39. Logging

Default core behavior is quiet.

Diagnostics go to stderr only when:

- requested by human CLI;
- adapter enables explicit debug mode;
- protocol failure prevents a structured result.

When raw retention is explicitly enabled, debug mode MAY print the opaque raw reference locally. It MUST NOT print raw content unless the user explicitly invokes `hugr-lean raw <id>`.

Normal filtering MUST NOT generate context-visible chatter.

---

# 40. Exact evidence classes

HuGR-Lean distinguishes two categories.

## 40.1 Presentation/review output

Safe candidate for profile reduction when contract-backed.

Examples:

- test runner progress;
- compilation chatter;
- known repetitive lint presentation.

## 40.2 Exact evidence output

Default passthrough unless the exact command profile explicitly proves lossless normalization.

Examples:

- requested source ranges;
- patches/diffs used as machine evidence;
- arbitrary document content;
- binary/text payload inspection;
- cryptographic/checksum output.

This distinction prevents the product from optimizing away the object the user actually requested.

---

# 41. No hidden command mutation

The OpenCode adapter MUST NOT use `tool.execute.before` to rewrite commands in v1.

Reasons:

- changes execution semantics;
- moves HuGR-Lean away from its narrow proposition;
- duplicates RTK/TRS proxy behavior;
- increases failure surface;
- complicates provenance and blame.

If future evidence proves command mutation is necessary for a specific host, it requires an explicit spec amendment.

---

# 42. Traceability to HL-PLAN-001

| Plan property | Technical mechanism |
|---|---|
| INV-001 No LLM | no inference dependency; one-shot deterministic Rust core |
| INV-002 No semantic guessing | identity-based routing + fixture-backed profiles |
| INV-003 Fail open | adapter retains original; core failed_open path |
| INV-004 Critical preservation | Signal + LeanWriter + Preservation Contract |
| INV-005 Failure state | TerminationV1 + profile contract |
| INV-006 Determinism | pure core path; incidental metadata excluded |
| INV-007 Unknown conservatism | passthrough default; narrow SafeNormalization |
| INV-008 Pre-ingestion | host `tool.execute.after` mutation before returned tool result |
| INV-009 Raw fidelity | optional exact local boundary artifact |
| INV-010 Workflow transparency | plugin hook, no command prefix |
| INV-011 Metrics non-interference | metrics returned side-band |
| INV-012 Recovery non-interference | raw disabled by default; failure diagnostic only |
| INV-013 Profile locality | SourceV1/command router + ambiguity fail-open |
| INV-014 Scope containment | no database/agent/RAG subsystems |
| INV-015 No network | core has no network dependency |
| INV-016 Bounded complexity | single package + primitive-first profiles |
| INV-017 Provenance | docs/provenance records |
| INV-018 Reduction subordinate | preservation before metrics/non-expansion |
| INV-019 Recovery independence | raw not part of successful contract |
| INV-020 Normalization provenance | PresentationV1 capability + profile contract |
| INV-021 No fabricated evidence | mechanically derived output only |

---

# 43. Requirements traceability

| Requirement | Mechanism |
|---|---|
| FR-001 Capture | host adapter |
| FR-002 Safe normalization | SafeNormalization stage |
| FR-003 Recognition | identity router |
| FR-004 Profile reduction | Profile trait |
| FR-005 Unknown handling | passthrough default |
| FR-006 Preservation Contract | Signal/LeanWriter validation |
| FR-007 Raw preservation | opt-in file store |
| FR-008 Raw retrieval | `hugr-lean raw` |
| FR-009 Metrics | MetricsV1 |
| FR-010 Enable/disable | adapter/core config |
| FR-011 Exclusion | tool/command exclusions |
| FR-012 Install/uninstall | adapter packaging |
| FR-013 Host independence | protocol boundary |
| FR-014 Profile admission | fixture-backed profile registration |
| FR-015 Exact escape | raw retrieval where enabled; passthrough exact classes |

---

# 44. Deliberate non-designs

The following are deliberately absent from HL-SPEC-001 v1 scope:

- LLM summarization;
- semantic relevance model;
- vector store;
- FTS/BM25;
- SQLite;
- resident daemon;
- socket protocol;
- N-API;
- WASM;
- generic arbitrary-text deduplication;
- source code summarization;
- command auto-rewrite;
- browser UI;
- telemetry service;
- remote API;
- plugin marketplace service;
- dynamic compression levels;
- probabilistic profile routing.

Their absence is a design result, not missing work.

---

# 45. Technical Definition of Done

HL-SPEC-001 is implemented when all of the following are demonstrably true:

1. one Rust package builds library + binary;
2. Protocol V1 round-trips valid observations/results;
3. malformed protocol fails without mutating host output;
4. SafeNormalization obeys explicit applicability and idempotence;
5. unknown arbitrary text defaults to passthrough;
6. simple command recognition never treats complex shell syntax as a direct simple command;
7. at least one real profile performs reduction through analyze/render/validate;
8. data-bearing rendered claims are source-backed or mechanically derived;
9. missing required signals cause fail-open;
10. non-expansion guard prevents larger model output;
11. OpenCode adapter successfully mutates supported hook output;
12. OpenCode adapter preserves original output on missing binary/crash/timeout/protocol/schema failure;
13. exit/truncation/unknown states are mapped without false certainty;
14. truncated input cannot yield unsupported complete summaries;
15. shell source alone never enables terminal SafeNormalization;
16. adapter hook never throws HuGR-Lean failures into the host;
17. attachments are untouched;
18. raw retention is off by default;
19. enabled raw retention is local, bounded, exact, and lazily cleaned;
20. metrics are boundary-honest;
21. core requires no network, LLM, database, or daemon;
22. performance targets are benchmarked;
23. donor provenance is recorded for reused material;
24. all mapped HL-PLAN-001 invariants have automated or auditable verification.

---

# 46. Specification gate

Approval gate result:

1. adversarial technical review — **PASS**;
2. donor architecture review against pinned revisions — **PASS**;
3. OpenCode adapter feasibility against stable v1.18.32 — **PASS**;
4. performance-budget sanity review — **PASS, benchmark verification deferred to implementation**;
5. security/privacy review of raw storage — **PASS**;
6. consistency check against HL-PLAN-001 v1.1 — **PASS**;
7. unresolved Critical/High findings — **0**.

Review record:

~~~text
docs/reviews/HL-SPEC-001-REVIEW-01.md
~~~

Current state:

~~~text
project state = TechnicallySpecified
technical spec = Approved v1.0
next artifact = Roadmap / Execution Plan
~~~
