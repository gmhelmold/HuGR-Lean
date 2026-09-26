# HL-WP3 — Coverage Closure / Adversarial Review 01

**Work Package:** #10 — Profile framework & coverage  
**Closure issue:** #37  
**Date:** 2026-09-26  
**Disposition:** **WP3 PASS**

## Review objective

Determine whether HuGR-Lean v1 profile coverage is one coherent, conservative system rather than a set of unrelated parsers.

The review challenged:

- cross-profile overlap;
- version-drift fallback;
- exact-evidence preservation;
- deferred/rejected coverage honesty;
- parser ownership;
- common abstraction sprawl;
- donor provenance completeness;
- stale public usage documentation.

## Evidence baseline

Completed family work:

- #29 — shared profile framework/admission contract;
- #30 — Cargo/rustc;
- #31 — Python/pytest;
- #32 — JavaScript/TypeScript;
- #33 — Go;
- #34 — Git;
- #35 — Docker/kubectl conservative defer/reject decision;
- #36 — filesystem/search;
- #37 — combined coverage closure.

Authoritative production registry:

~~~text
v1Profiles()
  cargo-test
  cargo-build
  pytest
  jest
  vitest
  tsc
  go-test-verbose
  git-status
  ripgrep-grouped
~~~

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| WP3-F01 | High | Production profiles had only been exercised mostly in family-specific engines; accidental cross-family overlap could remain hidden. | `tests/cross_profile.test.ts` now runs every production fixture through one `Engine(undefined, v1Profiles())`. |
| WP3-F02 | High | Wrong-family output resemblance could accidentally create a reducer match despite identity-first design. | Cross-family mismatch regressions prove known command identities with another family's output remain passthrough. |
| WP3-F03 | High | Exact/deferred operations could accidentally be claimed by another installed production profile. | Combined-registry tests lock passthrough for git diff/show, grep, ls/tree/find, Docker logs, and kubectl inventory. |
| WP3-F04 | Medium | The shared `primitive.ts` abstraction had zero production consumers at closure. | Deleted the module and tests; parser-local mechanics remain local until at least two production consumers justify extraction. |
| WP3-F05 | Medium | The test-only proving profile still imported the deleted primitive abstraction. | Replaced with a local test-support span helper; no production/shared abstraction was reintroduced. |
| WP3-F06 | High | Third-party register did not yet list search fixture incorporation. | `THIRD_PARTY.md` updated; TRS audit already records exact search fixture paths and pinned MIT provenance. |
| WP3-F07 | Medium | README still showed `new Engine()` as the production example even though profiles are opt-in. | Public usage now explicitly constructs `new Engine(undefined, v1Profiles())`; bare Engine is documented as core/SafeNormalization-only. |
| WP3-F08 | Medium | Coverage decisions were distributed across family docs and issues. | `docs/profiles/COVERAGE.md` is now the authoritative supported/deferred/rejected matrix. |
| WP3-F09 | High | Version drift could be safe family-by-family but unsafe when all profiles coexist. | Combined-registry version-drift regressions prove known identities with unrecognized shapes remain conservative. |
| WP3-F10 | Medium | Parser ownership could become unclear as families grow. | All production reducer code is owned under `src/profiles/`; `index.ts` only composes the v1 registry. No production parser exists elsewhere. |

## Coverage result

### Supported

- Cargo test/build;
- pytest;
- Jest;
- Vitest;
- textual tsc diagnostics;
- native verbose Go test;
- human `git status`;
- narrow grouped native ripgrep output.

### Deferred / rejected

- Cargo clippy/message-format modes;
- unittest/generic Python tooling;
- ESLint/Biome;
- Go build/vet and structured `-json` mode;
- Git diff/show/log/gh/porcelain/localized grammars;
- Docker/kubectl generic reduction;
- grep;
- ls/tree/find;
- generic read/source reduction.

These are explicit product decisions, not hidden support gaps.

## Cross-profile result

- production registry IDs unique — PASS;
- all production fixtures run through combined engine — PASS;
- wrong-family resemblance remains passthrough — PASS;
- exact/deferred operations remain passthrough — PASS;
- version-drifted known identities remain conservative — PASS;
- ambiguous registration still rejected/fail-open — PASS.

## Common abstraction audit

The only shared profile framework retained is used by production profiles:

- ProfileRegistry / ProfileDescriptor;
- requirements;
- identity-first routing;
- shape guards;
- ProfileContext evidence constructors;
- PreservationContract;
- LeanWriter.

The speculative shared parsing primitive module was removed.

## Provenance result

- copied third-party material remains fixture bytes only;
- exact source paths/pins are recorded in fixture metadata/TRS audit;
- TRS MIT notice is retained;
- RTK/CX/adjacent projects remain research unless explicitly recorded otherwise;
- no donor runtime/parser source is shipped.

## Destructive-regression status

Known destructive false positives in the committed WP3 corpus: **0**.

Future destructive false positives must become permanent WP7 regression fixtures.

## Final disposition

**WP3 — PASS**

WP3 may close once the final PR and post-merge CI are green.

E2 itself remains gated on the corresponding WP7 corpus/regression closure work; closing WP3 is not by itself G-E2.
