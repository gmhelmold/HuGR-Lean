# Production Profile Framework v1

**Implements:** WP3.1 / issue #29  
**Normative parents:** HL-SPEC-001 §§13–18; HL-ROADMAP-001 E2

## Extension contract

Every production reducer uses the same framework:

~~~text
ProfileDescriptor
  + ProfileRequirements
  + identity recognition
  + optional shape guard
  + deterministic analysis
  + Preservation Contract
  + LeanWriter rendering
  + fixture evidence
~~~

No family may invent a private router, writer, evidence model, fixture format, priority system, or semantic fallback engine.

## Mandatory descriptor

Every profile declares `id`, `family`, `fixture_family`, and `boundary_assumption` through `ProfileDescriptor`.

Descriptor components use lowercase ASCII letters/digits plus `.`, `_`, and `-`. The registry rejects invalid or duplicate IDs before any observation is processed.

## Boundary assumption

`NativeText` means the parser consumes text that can naturally arrive at the HuGR-Lean post-execution boundary.

`StructuredText` means the parser consumes structured text only when that structure is already present at the HuGR-Lean boundary. It does not authorize format injection.

`RewriteDependent` represents implementations that require command mutation such as `--json`, `-json`, forced reporters, porcelain/probe commands, or other pre-execution rewrites. The registry rejects these profiles.

This declaration is auditable metadata, not proof. Native/structured claims still require fixtures and provenance showing that the shape can arrive naturally at the boundary.

## Registry invariants

``new ProfileRegistry(...)`` rejects:

- invalid profile IDs;
- invalid family names;
- invalid fixture-family names;
- duplicate profile IDs;
- rewrite-dependent profiles.

The registry snapshots the validated descriptor at admission; the engine never re-asks a profile for mutable metadata during routing/result generation.

The registry has no priority, confidence score, best-match heuristic, or registration-order fallback.

Runtime routing remains:

~~~text
identity match
  -> optional shape guard
      -> 0 matches: safe baseline
      -> 1 match: execute profile
      -> 2+ matches: failed_open(ambiguous_profile)
~~~

## Requirements and shape guards

Profiles declare `Any|Complete` completeness and `Any|Exited` termination requirements. Requirements are checked before analysis.

A shape guard may reject an already-known identity when the safe baseline is not a supported grammar. It cannot create identity.

Unknown/truncated/version-drifted input remains conservative unless explicit fixtures and Preservation Contracts prove partial semantics.

## Common writer patterns

The shared writer supports tagged `literal` / `literalLine`, plus `signal`, `signalLine`, `derived`, `derivedLine`, and `newline`. Static tags accept no interpolation; line helpers do not weaken the dynamic/static evidence boundary.

## Common mechanical primitives

WP3 closure found that the initial shared `primitive.ts` abstraction had **zero production consumers**. It was removed rather than retained as speculative framework surface.

Profile-local parsing is allowed when grammar is family-specific. A helper is promoted to shared core only after:

1. at least two concrete production profiles use the same mechanic; or
2. a clearly cross-cutting correctness invariant justifies centralization.

Shared helpers must remain mechanical: no truncation, ranking, semantic relevance, or arbitrary dedupe.

## Fixture and provenance obligation

`fixture_family` identifies the profile's verification family. Before a production profile is supported, its applicable success/failure/malformed/incomplete/version/idempotence/regression evidence must exist under the shared fixture contract.

The runtime registry does not read fixtures from disk. Fixture completeness is a CI/review obligation, not hot-path behavior.

For donor-derived work:

1. pin source revision and path;
2. identify the actual donor input shape;
3. identify any command rewrite used to obtain that shape;
4. record ADOPT / ADAPT / REIMPLEMENT / REJECT;
5. then implement against HuGR-Lean boundary evidence.

Baseline evidence lives in `docs/evidence/E0_DONOR_REGISTER.md`, `docs/evidence/E0_OVERLAP_REVIEW.md`, and `docs/provenance/`.

## Version drift

When executable identity is known but its shape is unsupported, the shape guard returns `NoMatch` and the safe baseline wins. Profiles do not 'do their best' on an unproved version.

## Admission checklist

A production profile is admitted only when:

1. the family creates material context waste;
2. grammar is deterministic enough;
3. removable classes are non-semantic;
4. Preservation Contract is explicit;
5. real/native fixtures exist;
6. SafeNormalization is insufficient;
7. version-drift behavior is explicit;
8. donor input compatibility is known;
9. unsupported input fails conservative;
10. the profile fits the shared framework without a private subsystem.

## Deliberate non-designs

No dynamic plugin loading, profile priorities, confidence scoring, parser DSL, semantic ranking, command rewriting, runtime fixture lookup, database registry, or host-specific reducer framework is introduced by WP3.1.
