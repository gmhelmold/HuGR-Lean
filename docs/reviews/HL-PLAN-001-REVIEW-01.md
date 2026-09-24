# HL-PLAN-001 — Adversarial Review 01

**Reviewed document:** `docs/PROJECT_PLAN.md`  
**Reviewed version:** 1.0 → 1.1  
**Disposition:** Findings incorporated  
**Scope:** correctness, formal coherence, safety, simplicity, verifiability

## Review objective

Attempt to break the project plan before Technical Specification work begins.

The review looked specifically for:

- pseudo-formalism that does not constrain implementation;
- requirements that cannot be verified;
- unsafe assumptions hidden behind "generic" filtering;
- contradictions between simplicity and lifecycle requirements;
- metrics that could overstate product value;
- places where recovery could accidentally justify lossy behavior;
- category mistakes between runtime properties and project governance.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| F01 | High | The abstract `Next` relation allowed actions in arbitrary order; emission could not be proven to occur after validation. | Replaced with explicit allowed processing transitions and a refinement obligation. |
| F02 | High | Raw-artifact expiry was mixed into the per-observation processing state machine. | Split processing lifecycle from raw-artifact lifecycle. |
| F03 | Critical | Exact repetition, repeated blocks, and blank-line collapse were implicitly treated as generic-safe even though legitimate payloads may contain them. | Unknown payload now defaults to passthrough. SafeNormalization requires an explicit applicability predicate. Those reductions are no longer universal-safe by default. |
| F04 | High | Determinism required identical metrics/results despite random raw IDs, timestamps, and storage paths. | Defined an observable deterministic projection; incidental IDs/timestamps are excluded unless explicitly specified. |
| F05 | High | "Raw" could be misread as process-level raw even when a host had already truncated or transformed output before interception. | Defined raw/metrics relative to the actual HuGR-Lean interception boundary. |
| F06 | Medium | Project-management completion rules were incorrectly expressed as system liveness properties. | Runtime liveness now contains only system progress. Work-package progress moved to governance. |
| F07 | Medium | Eventual physical raw deletion could imply a required daemon, conflicting with the product's simplicity constraint. | Distinguished logical expiry from lazy physical cleanup; no daemon required solely for retention. |
| F08 | High | Raw recovery could become a hidden excuse for unsafe filtering ("the model can fetch it later"). | Added Recovery Independence: every reduction must satisfy its Preservation Contract without relying on later raw retrieval. |
| F09 | High | "Critical signal" was under-specified and risked runtime semantic judgment. | Added explicit fixture-backed Preservation Contracts and a `Preserves(raw, lean, contract)` obligation. |
| F10 | High | Deterministic reducers could fabricate misleading summaries unless derived-output constraints were explicit. | Added No Fabricated Evidence invariant; derived summaries must be mechanically derivable and auditable. |
| F11 | Medium | Token savings could be overstated when tokenizers differ or hosts already truncated output. | Exact boundary-size measurements are primary; token counts are optional and must name their tokenizer basis. Upstream savings cannot be credited to HuGR-Lean. |
| F12 | Medium | A universal reduction target could incentivize benchmark gaming. | Benchmarking now requires distributions, favorable and unfavorable cases, and evidence-based workload thresholds before release. |
| F13 | Medium | Performance overhead ranked below reduction, allowing a large latency regression to be rationalized by token savings. | Performance overhead moved above reduction ratio in the metric hierarchy. |
| F14 | Medium | Streaming/chunked hosts were not represented by the single-result model. | Defined one logical observation/result that may refine to multiple physical chunks. |
| F15 | Low | Formal section numbering and old Generic Hygiene terminology became inconsistent during revision. | Numbering and SafeNormalization terminology normalized. |
| F16 | Medium | Host-side transformation before interception was not explicitly represented as an integration risk. | Added R13 and boundary-relative measurement/recovery semantics. |

## Resulting hard principles

The review sharpened the plan to the following constraints:

1. **Unknown payload is passthrough by default.**
2. **Pattern resemblance is not proof of noise.**
3. **Reduction requires an explicit preservation argument.**
4. **Raw recovery is defense in depth, not permission to lose information.**
5. **Metrics start at the actual interception boundary.**
6. **No background service is introduced merely to satisfy bookkeeping.**
7. **Formal notation must constrain behavior or be removed.**

## Remaining deliberate unknowns

The following are intentionally deferred to the Technical Specification:

- concrete Observation representation;
- exact SafeNormalization applicability predicates;
- primitive API / profile format;
- validation implementation;
- raw-store layout and default retention policy;
- streaming implementation strategy;
- concurrency model;
- exact performance budgets;
- host-specific interception capabilities;
- packaging/language choices.

These are not plan gaps unless they weaken a plan invariant.

## Review conclusion

No unresolved finding from this review requires reopening product scope.

The plan is suitable to serve as the normative input to the Technical Specification, subject to future amendments through its own change-control rules.
