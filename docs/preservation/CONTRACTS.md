# Preservation Contracts v1

**Implements:** WP1.4 / issue #24  
**Normative parent:** `docs/TECHNICAL_SPEC.md` §14

## Purpose

HuGR-Lean must not let a profile claim that evidence survived unless the rendered output actually contains evidence tied to the boundary observation.

```text
evidence construction
        ↓
rendering
        ↓
emitted-signal tracking
        ↓
Preservation Contract validation
```

## Signal

A `Signal` contains a `SignalId`, canonical text, and an explicit `EvidenceRef`. Signals cannot be constructed by arbitrary public field assignment.

Supported constructors are intentionally narrow:

- `Signal::verbatim(...)` — exact validated UTF-8 input span.
- `Signal::canonicalized(...)` — validated span transformed by a closed named rule.
- `Signal::from_outcome(...)` — explicit observation state such as exit/termination/completeness.
- `Signal::derived_count(...)` — mechanically calculated count from validated source spans.

Canonicalization currently exposes only the closed `trim_ascii_whitespace` rule. Empty canonical evidence is rejected.

An exit-code signal is unavailable unless termination is actually `Exited`.

## ByteSpan

Evidence spans are UTF-8 byte ranges over the analysis baseline. Empty, reversed, out-of-range, or code-point-splitting spans are rejected.

## LeanWriter

The writer deliberately has no generic dynamic `text(&str)`/`write(String)` API.

Available operations are:

```text
static_text(&'static str)
signal(&Signal)
derived(&DerivedEvidence)
newline()
```

`static_text` accepts only `&'static str`, so ordinary observation-derived runtime strings cannot flow through that method. A `compile_fail` doctest enforces this in CI.

`signal()` appends the signal's canonical representation and records its `SignalId` as emitted.

`derived()` appends mechanically derived evidence and records the named rule plus source spans.

## Preservation Contract

A contract is a set of mandatory `SignalId` values.

```text
required_signal_ids ⊆ emitted_signal_ids
```

must hold after rendering. Missing required evidence causes:

```text
decision    = failed_open
replacement = null
diagnostic  = preservation_failed
```

The adapter-owned original boundary output remains authoritative.

## Engine integration

```text
identity recognition
  ↓
shape guard
  ↓
requirements
  ↓
analyze -> AnalysisBundle { typed data, PreservationContract }
  ↓
render through LeanWriter
  ↓
RenderedOutput
  ↓
PreservationContract::validate
  ↓
profile-specific validate
  ↓
non-expansion guard
  ↓
result
```

## Derived evidence vs critical signals

Derived evidence may be display-only. If a derived claim is critical, it must be created as a derived `Signal` and its ID must be required by the Preservation Contract.

## Deliberate non-designs

WP1.4 does not introduce a dynamic rule registry, embedded expression language, semantic validator, arbitrary dynamic text escape hatch, database-backed provenance, or LLM verification.

The mechanism is intentionally small, local, deterministic, and auditable.
