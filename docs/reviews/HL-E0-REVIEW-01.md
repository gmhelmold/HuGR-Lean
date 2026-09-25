# HL-E0 — Cold / Adversarial Review 01

**Epic:** #1 — E0 Evidence & Baseline  
**Reviewed work:** #17, #18, #19, #20, #49  
**Date:** 2026-09-24  
**Disposition:** PASS after findings incorporated

## Review objective

Attempt to invalidate the E0 evidence baseline before allowing E1 implementation to begin.

The review challenged:

- provenance accuracy;
- branch/revision pinning;
- license/NOTICE assumptions;
- donor architecture contamination;
- rewrite-dependent reducer classification;
- fixture schema truthfulness;
- hidden dependency on all of WP7;
- whether "major overlapping reducers compared" was actually satisfied;
- whether E0 had begun smuggling production implementation decisions into research.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| E0-F01 | High | Epic #1 tracked the whole continuous WP7 (#14), making E0 impossible to complete until release. | E0 now tracks WP0 #7 plus the WP7 seed deliverable #49. WP7 remains open across later epics. |
| E0-F02 | High | Two synthetic seed manifests declared `exit_code=0` while `termination=unknown`, creating false certainty. | Removed the exit-code field from those fixtures. Unknown now means unknown. |
| E0-F03 | High | GitHub code search can return current default-branch results rather than the pinned donor revision, risking evidence drift. | Search is treated only as discovery. Normative claims about rewrite dependency and architecture were revalidated with direct file reads at pinned commits. |
| E0-F04 | Medium | Apache NOTICE handling was phrased generically enough to imply RTK had a NOTICE file. | Verified RTK has no repository NOTICE at the audited pin; LeanCTX does. THIRD_PARTY baseline now records this distinction and uses "applicable NOTICE" semantics. |
| E0-F05 | High | "Major overlapping reducers compared" was under-evidenced by the first coverage matrix alone. | Added `docs/evidence/E0_OVERLAP_REVIEW.md` covering pytest, JS/TS tests, Go, Rust/Cargo, Git, search, filesystem, diagnostics, containers, and logs. |
| E0-F06 | High | RTK's breadth could tempt direct adoption of reducers whose input exists only because RTK rewrites commands or injects structured formats. | Donor register explicitly marks JSON/NDJSON/porcelain/probe-dependent behavior as REIMPLEMENT unless HuGR independently receives that shape. |
| E0-F07 | Medium | CX "passthrough" terminology could be interpreted as observational-only, while current code can perform repair/rewrite/retry under optimizations. | CX audit restricts reuse to explicit evidence/output contracts and pure parser logic; command repair/optimization is REJECT. |
| E0-F08 | Medium | Adjacent projects contain attractive but scope-expanding systems (FTS/BM25, LLM modes, memory, graphs, MCP context platforms). | ADJACENT audit explicitly classifies these as REJECT; only small deterministic shell-pattern/recovery/integration lessons remain research candidates. |
| E0-F09 | Medium | A fixture schema could become a mini test DSL and violate the simplicity constraint. | Fixture Contract v1 is deliberately data-only: TOML metadata + input + optional golden output; no embedded scripts, plugins, expressions, embeddings, or semantic evaluators. |
| E0-F10 | Medium | Donor fixture volume could encourage bulk copying without distinct evidentiary value. | Candidate inventory requires semantic/input compatibility, provenance, expected preservation behavior, and non-duplicate evidence before adoption. |
| E0-F11 | Low | No implementation exists yet to parse `case.toml`. | Correctly deferred to WP1/WP7 implementation; #49 defines the verification contract, not the loader. This is not an E0 blocker. |
| E0-F12 | Low | Native kubectl, Windows shell variants, and broader localized outputs remain underrepresented. | Recorded explicitly as WP3/WP5 evidence gaps; they are not hidden support claims and do not block the baseline. |

## Donor conclusion

The review confirms the following donor roles:

1. **TRS** — strongest first source for native-output fixtures and parser edge cases.
2. **RTK** — broadest source of coverage knowledge and edge cases, but many paths require REIMPLEMENT because execution is rewritten.
3. **CX** — strongest safety, exact-evidence, passthrough-truth and validation methodology donor.
4. **LeanCTX / context-compress** — selective research donors only; neither is an architecture donor.

## Legal/provenance conclusion

At E0 gate time:

- no donor source code has been copied into HuGR-Lean;
- no donor fixture bytes have been copied into HuGR-Lean;
- current seed fixtures are synthetic HuGR-Lean fixtures;
- donor pins and licenses are recorded;
- future copied/adapted material has an explicit provenance procedure.

Therefore there is no current third-party code/fixture attribution debt.

## Fixture-baseline conclusion

Fixture Contract v1 is sufficient for the next phase because it can represent:

- core cases;
- SafeNormalization cases;
- profile cases;
- integration cases;
- regressions;
- exact-golden assertions;
- property assertions;
- mandatory evidence;
- provenance.

The three seed fixtures deliberately protect foundational safety rules before implementation:

- repetition alone is not noise;
- exact patch-like evidence defaults to passthrough;
- incomplete test-like output cannot justify complete aggregate claims.

## Major-overlap conclusion

`docs/evidence/E0_OVERLAP_REVIEW.md` provides sufficient comparative evidence to satisfy the WP0 criterion that major overlapping reducers be adversarially compared.

It deliberately does not choose final WP3 implementations.

## Gate assessment — G-E0 Evidence Ready

| Gate condition | Result |
|---|---|
| donor revisions pinned | PASS |
| licenses verified | PASS |
| donor roles/dispositions explicit | PASS |
| rewrite dependencies explicit | PASS |
| coverage/overlap matrix exists | PASS |
| major reducer overlaps adversarially reviewed | PASS |
| provenance baseline exists | PASS |
| initial fixture contract exists | PASS |
| initial synthetic fixture corpus exists | PASS |
| explicit non-adoptions documented | PASS |
| unresolved Critical/High E0 finding | **0** |

## Final disposition

**G-E0 — PASS**

E0 is complete for the purpose of beginning E1.

WP7 remains intentionally open because verification is continuous. Only its E0 seed deliverable (#49) is complete.

## Next executable lane

~~~text
E1 Core Engine
  #21 Protocol V1 / Rust package
  #22 Invocation identity
  #23 Engine pipeline
  #24 Preservation machinery
  #25 Verification harness/proving profile

WP2 follows the WP1 contracts:
  #26-#28 SafeNormalization
~~~
