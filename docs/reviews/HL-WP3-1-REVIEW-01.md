# HL-WP3.1 — Profile Framework Adversarial Review 01

**Issue:** #29 — Finalize profile framework, requirements and shape guards  
**Date:** 2026-09-25  
**Disposition:** PASS after findings incorporated

## Review objective

Attempt to break the shared profile framework before production ecosystem families are allowed to build on it.

The review challenged:

- admission metadata truthfulness;
- command-rewrite donor contamination;
- duplicate/invalid registry state;
- priority/confidence backdoors;
- mutable metadata after admission;
- shape-guard routing order;
- requirements behavior;
- common primitive exactness;
- writer helper safety;
- fixture/provenance ownership;
- framework creep.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| P31-F01 | High | A donor-derived parser could be registered even when it only works after command rewrite. | Every profile declares `BoundaryAssumption`; `RewriteDependent` is rejected by `ProfileRegistry` before execution. |
| P31-F02 | High | Descriptor metadata was initially re-readable from the profile after admission, allowing a stateful implementation to return different metadata later. | Registry now snapshots the validated `ProfileDescriptor`; engine result IDs come only from the snapshot. Regression uses a deliberately mutating descriptor. |
| P31-F03 | High | Duplicate profile IDs could make support/provenance ownership ambiguous even when runtime shape guards happened to be exclusive. | Registry rejects duplicate IDs at construction. |
| P31-F04 | Medium | Invalid IDs/family/fixture-family strings could create path/naming ambiguity. | Descriptor components are restricted to non-empty lowercase ASCII identifiers using letters/digits plus `.`, `_`, `-`. |
| P31-F05 | High | A future family could reintroduce priority/confidence to resolve overlaps. | Shared registry has no priority/confidence/best-match field; runtime 2+ match behavior remains fail-open. |
| P31-F06 | Medium | Shared text primitives could silently treat a bare trailing carriage return as a line terminator. | Line primitives strip CR only as part of CRLF; standalone trailing CR remains source content. |
| P31-F07 | Medium | Generic helpers could drift toward semantic truncation/dedupe. | Initial primitive vocabulary is exact-span/prefix/line matching only; no truncate/rank/arbitrary dedupe helper was added. |
| P31-F08 | Medium | Common writer helpers could accidentally weaken the static/dynamic evidence boundary. | `static_line`, `signal_line`, and `derived_line` are composition helpers over existing safe operations; dynamic evidence still requires Signal/DerivedEvidence. |
| P31-F09 | Medium | `fixture_family` metadata could be mistaken for runtime proof that fixtures actually exist. | Framework explicitly defines fixture completeness as CI/review evidence, not runtime filesystem lookup. |
| P31-F10 | High | BoundaryAssumption metadata alone could be treated as proof that a donor parser is native-compatible. | Framework documentation states the declaration is auditable metadata only; native/structured claims still require pinned donor analysis + real boundary fixtures. |
| P31-F11 | Medium | Independent profile families could start private routers/writers/fixture formats. | Framework contract explicitly forbids family-private routing, evidence, writer, confidence, and fixture subsystems. |

## Framework result

The stable production extension path is:

~~~text
ProfileDescriptor
  -> ProfileRegistry admission
  -> identity recognition
  -> optional shape guard
  -> requirements
  -> analysis + Preservation Contract
  -> LeanWriter
  -> preservation/profile validation
  -> non-expansion
~~~

## Admission gate result

- invalid descriptors rejected — PASS
- duplicate IDs rejected — PASS
- rewrite-dependent profiles rejected — PASS
- structured boundary profiles allowed without authorizing rewrite — PASS
- validated descriptor snapshot immutable to engine — PASS
- no priority/confidence mechanism — PASS
- requirements still enforced before analysis — PASS
- ambiguity remains fail-open — PASS
- shared primitives preserve UTF-8/source offsets — PASS
- bare CR preserved as content — PASS
- writer helpers preserve evidence tracking — PASS

## Scope containment

WP3.1 did not add:

- production ecosystem profiles;
- parser DSL;
- dynamic plugin loading;
- command rewriting;
- confidence scoring;
- priority lists;
- semantic relevance;
- runtime fixture lookup;
- database registry;
- host-specific reducer logic.

## Final disposition

**PASS**

The framework is suitable for #30–#36. Production profiles still require their own native fixtures, Preservation Contracts, donor provenance, version-drift tests, and cold review evidence.
