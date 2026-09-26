# HL-WP3.7 — Docker / kubectl Adversarial Review 01

**Issue:** #35  
**Date:** 2026-09-26  
**Disposition:** PASS — explicit no-profile admission

## Review objective

Determine whether Docker/kubectl have a fixture-backed, materially useful deterministic reduction that satisfies HuGR-Lean's evidence standard without re-running commands, semantic ranking, generic truncation, or log deduplication.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| CTR-F01 | Critical | RTK Docker ps compaction is based on a second `docker ps --format ...` execution, not post-processing the original boundary table. | Classified rewrite/re-execution-dependent; not transplantable. Native table remains passthrough. |
| CTR-F02 | Critical | RTK kubectl pod/service compaction forces `-o json`. | Classified rewrite-dependent; no native HuGR profile admitted. |
| CTR-F03 | High | Generic log deduplication can erase frequency/order/retry evidence. | Docker/kubectl generic log dedupe rejected. |
| CTR-F04 | High | Generic tail limits can erase earlier root-cause/errors. | HuGR does not inject `--tail` or arbitrary truncation. |
| CTR-F05 | High | Dropping Docker ps COMMAND/CREATED/ID/PORTS or other columns cannot be proven safe for arbitrary debugging intent. | No Docker ps reducer admitted. |
| CTR-F06 | Medium | A coverage checklist could pressure the project into a zero-value or unsafe reducer solely to claim support. | Issue explicitly permits a DEFERRED/REJECTED family disposition backed by evidence. |
| CTR-F07 | Medium | kubectl native table formats vary by resource/version/flags and the E0 audit recorded a native-fixture gap. | Broad kubectl claim remains deferred until native fixture evidence exists. |
| CTR-F08 | High | YAML/JSON/describe/diff outputs are content-bearing exact evidence. | Passthrough by default. |

## Success-criterion resolution

The original wording 'Known profile reduction is fixture-backed' assumed a safe profile would be admitted.

Adversarial review found no such reduction at the current evidence level. Forcing one would weaken higher-ranked safety invariants.

The criterion is therefore resolved as:

> Any admitted reduction MUST be fixture-backed; when no material safe removable class is proven, the family MUST be explicitly deferred/rejected rather than receive a speculative reducer.

This is a safety-preserving clarification, not a weakening of the parent WP.

## Result

- arbitrary repeated logs are not generically deduped — PASS;
- no unsafe/unproven container profile is registered — PASS;
- error/fatal/operational evidence survives by exact passthrough — PASS;
- donor rewrite dependencies are explicitly documented — PASS;
- no hidden backlog/support claim — PASS.

## Final disposition

**PASS**

WP3.7 is complete as a coverage decision. Docker/kubectl remain deferred/rejected in v1 until re-entry evidence satisfies `docs/profiles/CONTAINERS.md`.
