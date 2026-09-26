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

# 9. Validation boundary

`ObservationV1` is an in-memory TypeScript value in the normal runtime path.

The core MUST validate:

- schema version;
- termination/code consistency;
- required bounded enum values supplied by the adapter;
- result invariants before returning a model-visible replacement.

A malformed/invalid observation causes the adapter boundary to preserve the original tool output.

JSON parsing is not part of normal filtering. If a future adapter accepts serialized observations, parsing/validation failures MUST fail open before the core is invoked.

---

# 10. Size guard

The core active-filtering limit remains bounded:

~~~text
default: 4 MiB
minimum configurable: 1 MiB
hard maximum: 16 MiB
~~~

If the boundary output exceeds the active limit:

~~~text
decision = failed_open
replacement = null
diagnostic = input_too_large
~~~

The caller already owns the original output, so no copy/IPC fallback is required.

The previous 128 MiB subprocess-envelope limit is removed because v1 no longer has a serialized process boundary.

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

Artifacts MUST be created with create-new semantics so concurrent callers cannot overwrite each other.

Writes MUST use a same-directory temporary file followed by close and atomic rename to the final random ID. Retrieval recognizes final IDs only; temporary files are never valid raw artifacts.

Temporary files abandoned by crashes are eligible for later cleanup. Partial files MUST NOT be returned as valid raw artifacts.

If the store exceeds its configured maximum, oldest artifacts may be removed first, including before nominal TTL expiry. A later request for an evicted artifact returns explicit `unavailable`; the raw reference is never silently redirected to different content.

Cleanup races may produce "already removed" outcomes but MUST NOT delete outside the raw-store root.

Raw-store failure MUST NOT fail the tool result.

The result MUST carry `raw_store_failed` diagnostics and `raw_ref=None`.

---

# 20. Raw retrieval

Raw recovery is optional and local.

If WP4 enables raw retention, the package SHALL expose a small programmatic retrieval API that returns the exact retained boundary text or an explicit unavailable result.

A human CLI MAY be added later for convenience, but it is not required for filtering correctness or the initial package architecture.

Recovery remains independent from filtering success.

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

Normal use SHOULD require no configuration.

The core exposes a small programmatic `EngineConfig` with safety-bounded values such as active maximum input size.

Host adapters MAY expose enable/disable and exact profile/tool exclusions when real user demand exists.

## 22.2 No mandatory config file

HuGR-Lean v1 does not require TOML, YAML, JSON, or project-local configuration files.

A config file format is introduced only if concrete local-user workflows require persistence beyond host/plugin settings.

## 22.3 No compression level

There is no `aggressive`, `medium`, `level=9`, or similar tuning surface.

Safety remains determined by profile applicability and Preservation Contracts, not user-selected lossy intensity.

---

# 23. OpenCode adapter

## 23.1 Compatibility snapshot

The first supported host remains OpenCode v1.18.32 unless later compatibility evidence widens the range.

OpenCode calls `tool.execute.after` after execution and exposes mutable tool output plus metadata.

## 23.2 Observation mapping

The adapter maps only facts it actually knows into `ObservationV1`.

~~~text
tool.id       -> SourceV1 / command identity inputs
output        -> boundary output
metadata.exit -> Exited(code) when trustworthy
truncated     -> Complete/Truncated when trustworthy
otherwise     -> Unknown
presentation  -> Unknown unless host integration proves TerminalRendered
~~~

Unknown is never upgraded to success/completeness by guesswork.

## 23.3 In-process mutation

The adapter calls the local TypeScript core directly:

~~~ts
const result = engine.process(observation)
~~~

It mutates model-visible output only when a schema-valid result has:

~~~text
decision = normalized | reduced
replacement != null
~~~

For passthrough, failed-open, exceptions, or invalid results, the adapter keeps the original output it already owns.

## 23.4 Adapter metadata

HuGR-Lean diagnostics MAY be attached only to a proven non-model-visible host surface. They are absent by default.

## 23.5 No attachment mutation

Attachments/non-text payloads are outside initial text filtering and remain untouched.

## 23.6 Native host truncation

Metrics and evidence remain relative to the text actually delivered to the adapter. HuGR-Lean does not claim savings on bytes the host truncated before the hook.

## 23.7 Capability verification

Compatibility claims require an integration test proving that hook mutation reaches the model-visible result on the advertised OpenCode release.

---

# 24. Host adapter contract

Every host adapter MUST:

1. retain the original tool output until filtering returns a valid replacement;
2. map only trusted host facts into `ObservationV1`;
3. call the local core directly, without shell/process indirection;
4. catch all HuGR-Lean exceptions at the adapter boundary;
5. apply only validated `normalized/reduced + replacement` results;
6. leave passthrough/failed-open output unchanged;
7. avoid forwarding arbitrary host secrets/metadata into the core;
8. keep attachments/non-text payloads unchanged unless separately specified;
9. support a disabled fast path that does not invoke filtering;
10. never turn a successful host tool call into a failed host tool call because HuGR-Lean failed.

Adapters MAY bypass text filtering for non-text payloads or boundary output beyond the active hard limit.

---

# 25. Adapter execution budget

There is no subprocess timeout in the TypeScript runtime.

The adapter/core call is synchronous and local for v1.

Performance is enforced through benchmark budgets and input bounds rather than process-kill mechanics.

If future profile work introduces asynchronous I/O, that is a specification change; the current core performs no network/filesystem work during filtering.

---

# 26. Public package API

The initial product surface is deliberately small.

Conceptually:

~~~ts
const engine = new Engine(config?, profiles?)
const result = engine.process(observation)
~~~

The package MAY expose supporting types/helpers for adapters and profile authors.

No CLI is required for normal filtering, installation, or host integration.

Future convenience commands such as diagnostics or raw retrieval require concrete user need; they are not part of core correctness.

---

# 27. Failure semantics

## 27.1 Core reducer failure

Analysis/render failure returns `failed_open` with no replacement.

## 27.2 Preservation failure

Missing mandatory evidence or profile validation failure returns `failed_open` with no replacement.

## 27.3 Core exception

The adapter catches an unexpected core exception and preserves the original host output.

## 27.4 Invalid observation/result

Schema/invariant validation failure preserves the original host output. No serialized process-protocol recovery path exists in v1.

## 27.5 Unsupported profile version/shape

Known identity plus unsupported/unrecognized shape resolves conservatively to the SafeNormalization baseline or passthrough.

## 27.6 Raw-store failure

Raw storage failure MUST NOT change filtering correctness. Recovery remains optional defense-in-depth.

## 27.7 Metrics failure

Metrics are calculated mechanically from UTF-8 byte lengths. If internal result validation detects inconsistent metrics, the adapter preserves the original output.

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

Regexes over untrusted tool output MUST avoid catastrophic-backtracking patterns. Prefer anchored/simple expressions or explicit linear scans when input size is attacker-controlled.

---

# 30. Performance budget

Performance budgets now measure the in-process TypeScript path.

Initial guardrails:

### Core in-process

~~~text
<= 256 KiB: p95 <= 5 ms
<=   1 MiB: p95 <= 25 ms
~~~

### OpenCode adapter end-to-end

~~~text
<= 256 KiB: p95 <= 10 ms
<=   1 MiB: p95 <= 35 ms
~~~

These remain engineering budgets, not published claims, until benchmark evidence exists.

If budgets fail, optimization order is:

1. profile/primitive algorithmic review;
2. remove avoidable copies/regex work;
3. benchmark V8/Node hot paths;
4. only then consider a different runtime mechanism backed by evidence.

A native addon, worker process, daemon, or alternate implementation language requires a new ADR.

---

# 31. Concurrency

The filtering core is stateless per call.

Profiles are registered at engine construction and treated as read-only during processing.

Therefore normal filtering requires no shared mutable runtime state, locks, daemon coordination, or worker lifecycle.

Optional raw-store concurrency is specified separately under the raw-store section.

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

## 32.2 Command string handling

Command recognition parses command text as data and never executes or expands it.

HuGR-Lean v1 spawns no filtering subprocess. The observed command string is passed only as an in-memory value and is never interpolated into a shell command.

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

## 33.1 Typecheck

Strict TypeScript typechecking is a release gate.

Core safety boundaries such as static-only writer text use compile-time negative assertions where practical.

## 33.2 Unit tests

Unit tests cover protocol/result invariants, command identity, SafeNormalization, UTF-8 evidence spans, Preservation Contracts, registry admission, primitives, and engine fail-open paths.

## 33.3 Fixture tests

All profile/normalization evidence uses the shared fixture contract. The existing TOML corpus is executed unchanged against the TypeScript engine during migration.

Each production profile requires applicable success/failure/warning/malformed/incomplete/version/idempotence/regression evidence.

## 33.4 Negative fixtures

Every destructive primitive/profile behavior requires cases proving when it MUST NOT activate.

## 33.5 Property/generative tests

High-value properties include:

- SafeNormalization idempotence;
- no mutation of unknown arbitrary UTF-8;
- fail-open preservation;
- required-signal survival;
- non-expansion;
- conservative shell recognition.

The deterministic arbitrary-input corpus is part of normal CI. Additional fuzz/property tooling MAY be added as development-only tooling when it provides distinct evidence.

## 33.6 OpenCode integration tests

Adapter tests require:

- hook mutation reaches returned model-visible output on supported versions;
- core/adapter exceptions preserve original output;
- malformed/inconsistent mapped observations/results fail open;
- exit/truncation state mapping is truthful;
- truncated input cannot produce unsupported complete claims;
- shell source does not imply `TerminalRendered`;
- complex shell commands remain conservative;
- attachments remain unchanged;
- disabled mode bypasses filtering.

## 33.7 Regression rule

Every real destructive false positive becomes permanent regression evidence.

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

## 36.1 Single package

HuGR-Lean SHALL ship as a normal JavaScript/TypeScript package.

The package contains the core and may contain the initial OpenCode integration while the project remains small.

No OS/architecture-specific binary package is required.

## 36.2 Installation

Installation should be ordinary package-manager/local-plugin installation. Users do not compile Rust or download a platform binary.

## 36.3 Runtime dependencies

The filtering core targets zero production dependencies. Development/build/test dependencies do not become runtime requirements.

## 36.4 Offline behavior

Once installed, filtering MUST work without network access.

The package MUST NOT require an account, hosted service, license server, or telemetry endpoint.

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
| INV-001 No LLM | no inference dependency; deterministic local TypeScript core |
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
| FR-008 Raw retrieval | optional local retrieval API when WP4 enables retention |
| FR-009 Metrics | MetricsV1 |
| FR-010 Enable/disable | adapter/core config |
| FR-011 Exclusion | tool/command exclusions |
| FR-012 Install/uninstall | normal package/plugin lifecycle |
| FR-013 Host independence | ObservationV1 / FilterResultV1 semantic boundary |
| FR-014 Profile admission | fixture-backed profile registration |
| FR-015 Exact escape | raw retrieval where enabled; passthrough exact classes |

---

# 44. Deliberate non-designs

The following are deliberately absent from HL-SPEC-001 v1 scope:

- LLM summarization;
- semantic relevance model;
- vector store / FTS / BM25;
- SQLite/database;
- resident daemon;
- socket protocol;
- filtering subprocess;
- Rust/native core;
- N-API/native addon;
- WASM bridge;
- generic arbitrary-text deduplication;
- source-code summarization;
- command auto-rewrite;
- browser UI;
- telemetry service;
- remote API/account/service;
- dynamic compression levels;
- probabilistic profile routing;
- dual-runtime/reference implementation maintenance.

Their absence is a design result, not missing work.

---

# 45. Technical Definition of Done

HL-SPEC-001 v1.1 is implemented when all of the following are demonstrably true:

1. one local TypeScript package provides the core filtering API;
2. core filtering requires no Rust toolchain, native binary, subprocess, daemon, network, LLM, or database;
3. ObservationV1 / FilterResultV1 semantic invariants are typechecked and runtime-validated;
4. SafeNormalization obeys explicit applicability, idempotence, and non-expansion;
5. unknown arbitrary text defaults to passthrough;
6. simple command recognition never treats complex shell syntax as direct identity;
7. production profiles reduce only fixture-backed native/already-structured boundary shapes;
8. data-bearing rendered claims are source-backed/outcome-backed or mechanically derived;
9. missing required signals cause fail-open;
10. non-expansion prevents larger model output;
11. the first supported OpenCode adapter invokes the core in-process and mutates only validated replacements;
12. adapter/core exceptions preserve original host output;
13. exit/truncation/unknown states are mapped without false certainty;
14. truncated input cannot yield unsupported complete summaries;
15. shell source alone never enables terminal SafeNormalization;
16. attachments/non-text payloads are untouched unless separately specified;
17. raw retention remains off by default and independent from filtering correctness;
18. metrics are UTF-8-byte and boundary-honest;
19. performance targets are benchmarked before publication;
20. donor provenance is recorded for reused material;
21. the shared fixture corpus and deterministic arbitrary-input corpus pass in CI;
22. all mapped HL-PLAN-001 invariants have automated or auditable verification.

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
