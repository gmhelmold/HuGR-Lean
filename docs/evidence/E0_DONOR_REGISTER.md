# E0 Donor Coverage, Overlap & Disposition Register

**Issue:** #20  
**Pinned evidence date:** 2026-09-24

## Pinned donors

| Donor | Revision | License | Primary role |
|---|---|---|---|
| RTK | `f5e104e117ab5b05c69d448103c28f1155e04417` | Apache-2.0 | breadth, edge cases, fixtures |
| TRS | `0175ae73f36709fd4a9242b2e431d026d6f82bb3` | MIT | native parsers, fixtures, quality harness |
| CX | `b7c81334e63ba3c1adaafbd2773ca2b8049ae7ae` | MIT | safety, exact evidence, validation |
| LeanCTX | `edd9c55650de4622e3a0cc8696bcf4e9abba1a6a` | Apache-2.0 | selective shell-pattern/recovery research |
| context-compress | `59fae35a7b383876a34f84090f6da978e230795a` | MIT | selective filter/integration edge cases |

## Disposition vocabulary

- **ADOPT** — concept or small implementation may be used substantially as-is after provenance/test review.
- **ADAPT** — donor material is directly useful but must be changed to satisfy HuGR contracts.
- **REIMPLEMENT** — donor behavior/fixtures specify the problem, but runtime code depends on a different execution architecture.
- **REJECT** — outside HuGR scope or violates its invariants.
- **RESEARCH** — useful reference only; no current implementation intent.

## Capability matrix

| HuGR capability | RTK | TRS | CX | Adjacent | E0 disposition |
|---|---|---|---|---|---|
| ANSI / terminal normalization | strong helper coverage | strong helper/tests | incidental | LeanCTX + CC patterns | **ADAPT** implementation candidates; enforce HuGR PresentationV1 gates |
| Unknown-output generic compression | generic fallback exists | ANSI/whitespace fallback | passthrough/opportunity paths | CC generic modes | **REJECT** generic semantic/whitespace reduction; HuGR unknown defaults passthrough |
| Non-expansion / never-worse | explicit guard concepts | explicit never-worse tests | expansion/reduction accounting | CC floor pattern | **REIMPLEMENT** tiny HuGR guard |
| Preservation/signal testing | failure preservation | quality harness + signal tests | output metrics + evidence tests | mixed | **ADAPT** methodology; HuGR Preservation Contract remains authoritative |
| Raw/recovery | tee/retrieval | some tracking/recovery surfaces | failure artifacts | LeanCTX reversible recovery | **REIMPLEMENT** minimal opt-in local raw store |
| Persistent analytics | SQLite/history | tracking/history | insights SQLite | stats/store systems | **REJECT** |
| Command rewrite/proxy | core architecture | major integration path | wrappers/repair paths | hooks/wrappers | **REJECT** in HuGR v1 |
| Host post-result adapter | limited/not primary | before-hook rewrite knowledge | wrapper oriented | hook integration lessons | **REIMPLEMENT** against OpenCode direct evidence |

## Target profile coverage matrix

| Family | RTK evidence | TRS evidence | CX evidence | HuGR decision | Main gap/risk |
|---|---|---|---|---|---|
| Rust/Cargo | strong; some structured execution/build logic | cargo/test/build/lint routing + fixtures | official cargo support | **ADAPT fixtures + REIMPLEMENT parser contract** | separate native host output from donor execution modifications |
| Python/pytest | text state-machine parser; fixtures limited | extensive native pytest fixtures/parser | official pytest + validation tests | **ADAPT/REIMPLEMENT**, high confidence | version/verbosity/traceback variants |
| JS/TS tests | broad; Vitest and others may inject JSON reporters | broad native Jest/Vitest/npm/pnpm/Bun fixture corpus | node/tsc evidence | **TRS-first ADAPT/REIMPLEMENT** | donor-specific reporter/format injection |
| TypeScript/lint diagnostics | strong tsc/lint cases, often structured formats | lint/tsc parser + fixtures | official tsc | **ADAPT/REIMPLEMENT** | preserve file/line/rule and incomplete output semantics |
| Go test/build | strong but go test uses NDJSON structured mode | native verbose/default Go parser documented | official Go surface | **TRS-first REIMPLEMENT** | never assume injected `-json` |
| Git status/log | extensive, but status/probes may change execution | broad native status/diff fixtures | strong exact/review truthfulness | **ADAPT fixtures; REIMPLEMENT profiles** | exact evidence vs review summary; locale/format |
| Git diff/show | complex donor logic/probes | broad diff fixtures | exact evidence focus | **REIMPLEMENT conservative** | do not destroy requested patch/blob evidence |
| GitHub/gh | structured JSON support | gh routes/tests | limited/varied | **REIMPLEMENT selectively** | many donor paths rely on JSON flags |
| Docker | structured/container reducers | native docker fixture/routing | official container support | **ADAPT fixtures; REIMPLEMENT profiles** | table/log variants |
| kubectl | structured reducers | limited relative coverage | container support | **REIMPLEMENT, evidence gap** | needs native-output fixture collection |
| ls/tree/find | broad filters | extensive native fixtures | official ls/find | **ADAPT** with exact-evidence rules | long paths, permissions, exact listing requests |
| grep/rg/search | broad grouping | extensive native fixtures | deep grep capture tests | **ADAPT/REIMPLEMENT** | colon/context/binary/stdin/exact match fidelity |
| logs | dedupe/filter support | extensive log fixtures | container log cases | **REIMPLEMENT narrowly** | repetition is not inherently noise |
| compiler diagnostics | Cargo/tsc/etc | cargo/tsc/lint fixtures | cargo/tsc/node | **ADAPT/REIMPLEMENT** | failure anchors and stderr/combined-stream semantics |

## Donor overlap conclusions

### Areas with strongest independent agreement

The following have evidence from at least two independent donors and should be low-risk to prioritize after core contracts stabilize:

1. pytest/test-runner failure-focused reduction;
2. compiler/linter diagnostics;
3. Git status/log presentation reduction;
4. ls/find/search presentation compaction;
5. failure truth / passthrough behavior;
6. non-expansion/never-worse behavior.

### Areas where donor agreement is misleading

Multiple projects support these, but often by changing execution:

- JSON/NDJSON test/lint modes;
- Git probes/porcelain output;
- container JSON/table forcing;
- hook-level command rewriting.

HuGR treats these as **reimplementation evidence**, not direct compatibility.

## Fixture donor priority

1. **TRS** — first source for native-output target-family fixtures.
2. **RTK** — second source for edge cases and large format-sensitive fixtures.
3. **CX** — first source for truthfulness/recent-call/failure-artifact test methodology.
4. Adjacent donors — only when they expose a distinct edge case not already represented.

See `docs/evidence/E0_FIXTURE_INVENTORY.md`.

## Explicit E0 non-adoptions

Not carried into HuGR-Lean v1:

- LLM-driven compression selection;
- compression aggressiveness modes;
- generic whitespace/repetition minification of unknown payload;
- source-code body/comment stripping;
- RAG, FTS, BM25, indexing;
- memory/graphs/context OS;
- persistent analytics DB;
- command repair/auto retry;
- antivirus;
- pre-execution command rewrite;
- broad MCP execution platform;
- prompt/rules systems that ask the model to voluntarily prefix commands.

## Provenance baseline

All current E0 output is research/documentation authored for HuGR-Lean. No donor source code or fixture bytes have yet been copied into the repository.

When adoption begins:

- RTK/LeanCTX derived material follows Apache-2.0 requirements;
- TRS/CX/context-compress substantial copied material retains MIT notices;
- each copied/adapted artifact receives repository + commit + path + license + modification record.

## E0 coverage gaps to carry forward

Not blockers to E0, but explicit inputs to WP3:

- native kubectl fixtures need expansion;
- native Go test variants need deliberate collection beyond donor assumptions;
- OpenCode-specific boundary outputs should be captured during WP5;
- Windows/pwsh/cmd native output variants are not represented sufficiently yet;
- localized outputs beyond Git need future evidence.

## Decision

The donor audit supports the planned architecture:

> Reuse **knowledge, fixtures, parsers and edge cases** aggressively; do not reuse donor execution architecture.

This register is the authoritative E0 disposition map until amended by evidence.
