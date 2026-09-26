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

Profiles do not call low-level `Signal` constructors directly. They create evidence through the `ProfileContext` bound to the engine's actual baseline/observation:

- `context.verbatim_signal(...)` — exact validated UTF-8 baseline span.
- `context.canonicalized_signal(...)` — baseline span transformed by a closed named rule.
- `context.outcome_signal(...)` — explicit bound observation state such as exit/termination/completeness.
- `context.derived_count_signal(...)` — mechanically calculated count from validated, source-ordered, non-overlapping baseline spans.
- `context.derived_count(...)` — display-only derived evidence with the same provenance rules.

Low-level evidence construction is not exported from the package root. Production profiles create evidence through `ProfileContext`, which binds spans to the engine's actual safe baseline and outcomes to the actual observation. Canonicalization currently exposes only the closed `trim_ascii_whitespace` rule. Empty canonical evidence is rejected.

An exit-code signal is unavailable unless termination is actually `Exited`.

## ByteSpan

Evidence spans are UTF-8 byte ranges over the analysis baseline. Empty, reversed, out-of-range, or code-point-splitting spans are rejected.

## LeanWriter

The writer deliberately has no generic dynamic `text(&str)`/`write(String)` API.

Available operations are:

```text
staticText(literal)
signal(&Signal)
derived(&DerivedEvidence)
newline()
```

`staticText` / `staticLine` use a TypeScript literal-only generic. Ordinary runtime `string` values fail typechecking on that path; CI contains `@ts-expect-error` assertions proving the boundary.

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

Derived evidence may be display-only. Count derivations reject duplicate, overlapping, or out-of-order spans so one piece of evidence cannot be counted multiple times. If a derived claim is critical, it must be created as a derived `Signal` and its ID must be required by the Preservation Contract.

## Deliberate non-designs

WP1.4 does not introduce a dynamic rule registry, embedded expression language, semantic validator, arbitrary dynamic text escape hatch, database-backed provenance, or LLM verification.

The mechanism is intentionally small, local, deterministic, and auditable.
