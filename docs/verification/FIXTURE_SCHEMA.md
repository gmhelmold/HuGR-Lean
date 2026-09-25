# HuGR-Lean Fixture Contract v1

**Issue:** #49  
**Status:** E0 seed / normative verification format  
**Goal:** one small fixture format for core, SafeNormalization, profiles, integration, and regressions

## Directory shape

A fixture is a directory:

~~~text
fixtures/<family>/<case-id>/
├── case.toml
├── input.txt
└── expected.txt    # optional; only when exact output is normative
~~~

No profile may invent a private fixture format without a specification change.

## `case.toml`

Minimum shape:

~~~toml
schema = 1
id = "unknown-repeated-lines"
kind = "core" # core | normalization | profile | integration | regression

[observation]
source = "other"           # shell | read | search | lsp | mcp | browser | other
command = ""
shell_dialect = "unknown"  # unknown | posix | powershell | cmd
termination = "unknown"    # unknown | exited | aborted | timed_out
# exit_code = 0            # required only when termination = exited
completeness = "complete"  # unknown | complete | truncated
presentation = "unknown"   # unknown | terminal_rendered

[expect]
decision = "passthrough"   # passthrough | normalized | reduced | failed_open
profile = ""
golden = "expected.txt"    # optional; omit when properties are sufficient
required_literals = []
forbidden_literals = []
properties = ["non_expanding"]

[preservation]
mandatory_signal_ids = []
permitted_removals = []

[provenance]
kind = "synthetic"         # synthetic | captured | donor | regression
source_repo = ""
source_commit = ""
source_path = ""
license = ""
origin_issue = 0
notes = ""

# Required only when kind = "normalization"
[normalization]
primitive = "strip_sgr" # strip_sgr | collapse_carriage_redraws
~~~

The Rust verification harness implements this metadata contract in `tests/support/fixture.rs`.

For `kind = "normalization"`, the `[normalization]` section is mandatory. For every other fixture kind it is forbidden. Normalization fixtures execute one primitive in isolation; engine composition remains a separate verification layer.

Fixture TOML is intentionally distinct from the Protocol V1 JSON wire representation. The loader maps this compact metadata into `ObservationV1`, then runs the real engine.

## Semantics

### Observation

Fixture metadata describes the exact HuGR-Lean boundary observation. It must not pretend to know pre-host bytes that were never captured.

### Normalization primitive

Normalization fixtures currently admit only:

- `strip_sgr`;
- `collapse_carriage_redraws`.

The fixture runner first applies the normal applicability gate. If `presentation != terminal_rendered`, effective output remains exact input even if the selected primitive would otherwise recognize the bytes.

### Exact golden outputs

Use `expected.txt` only when formatting is intentionally normative.

Prefer property assertions when exact whitespace/rendering is not part of the product contract.

### Required literals

`required_literals` are small fixture-level anchors that must survive the emitted effective output.

They complement, not replace, runtime Preservation Contracts.

### Forbidden literals

Use only for deterministic claims such as known progress noise or a regression that must disappear. Do not use them as a semantic relevance oracle.

### Properties

Initial property vocabulary:

- `non_expanding`
- `idempotent`
- `passthrough_exact`
- `no_panic`
- `preserves_required_literals`

New property names require implementation/test support.

Failure-state preservation is intentionally **not** a generic fixture property because a `FilterResultV1` does not carry mutable execution outcome state. Profiles that must preserve failure evidence express that through runtime Preservation Contracts and outcome-backed Signals.

### Permitted removals

This field documents removal classes justified by the fixture/profile contract, for example:

~~~text
progress_frame
passing_test_row
known_compile_chatter
~~~

It is not permission for a generic reducer to drop arbitrary matching text.

## Provenance rules

### Synthetic

Created by HuGR-Lean contributors; `source_repo/source_commit/source_path/license` remain empty.

### Captured

Captured from a real local command. Notes must describe tool/version/platform sufficiently to reproduce where practical.

### Donor

Copied or materially adapted from an upstream fixture.

Required:

- repository;
- pinned commit;
- exact path;
- license;
- adaptation notes.

### Regression

Must include `origin_issue` linking the destructive/incorrect behavior that created the fixture.

## Fixture quality requirements

A supported profile should eventually include, where applicable:

- success;
- failure;
- warning;
- malformed;
- ambiguous;
- truncated/incomplete;
- unknown termination;
- version variant;
- already-lean/idempotence;
- regression cases.

Every destructive false positive discovered in implementation becomes a regression fixture.

## Why this format is deliberately small

The fixture layer is evidence, not a test DSL product.

No embeddings, scripts, arbitrary expressions, or plugin system are allowed in fixture metadata. If a case requires special verification, add a named property/assertion in test code.
