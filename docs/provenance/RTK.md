# RTK Donor Audit

**Issue:** #17  
**Repository:** rtk-ai/rtk  
**Pinned revision:** `f5e104e117ab5b05c69d448103c28f1155e04417`  
**License:** Apache-2.0  
**Role for HuGR-Lean:** primary coverage/edge-case donor, not runtime architecture

## Observed architecture

RTK is a Rust command proxy. Command modules execute external tools, often alter arguments or output formats, capture stdout/stderr, filter the result, track savings, preserve exit codes, and optionally retain recovery evidence.

Its command documentation explicitly distinguishes simple filters from modules that need JSON/NDJSON parsing, state machines, flag injection, cross-command routing, or flag-aware filtering.

This matters because HuGR-Lean v1 is **post-processing only**: it sees a host result after execution and deliberately does not rewrite the command.

## High-value assets

- broad command coverage by ecosystem;
- real format-sensitive fixtures;
- reducer-specific edge cases;
- state-machine/block parser patterns;
- argument parsing tests;
- exit-code/failure preservation lessons;
- fail-safe/raw fallback behavior;
- `never_worse` / non-expansion concept;
- ANSI/progress handling candidates;
- tests around version drift and malformed output.

At the pinned revision, `tests/fixtures` contains 79 entries including real/raw test, compiler, Git/GitLab, Go lint, Gradle/Maven, TypeScript and other outputs.

## Rewrite-dependency findings

The following are **not drop-in post-process reducers**:

- Go test paths that consume JSON/NDJSON produced via structured execution;
- Ruff/lint paths that force JSON formats;
- Vitest paths that inject a JSON reporter;
- ESLint paths that force JSON;
- Docker/Kubectl/cloud paths documented as forcing structured output;
- Git status paths that can execute `--porcelain -b`;
- Git diff/log logic that may execute additional probes/alternate commands;
- any reducer whose correctness depends on RTK-specific pseudo-flags or wrapper execution.

These are valuable specifications/fixtures but require native-input **REIMPLEMENT** work in HuGR-Lean.

## Candidate dispositions

| Surface | Disposition | Reason |
|---|---|---|
| Real captured fixtures | ADAPT | high-value regression data; preserve Apache provenance |
| ANSI/control helpers | ADAPT | useful implementation candidate, only under HuGR-Lean applicability gates |
| Block/state-machine parser techniques | ADAPT | implementation pattern, must satisfy Preservation Contracts |
| `never_worse` concept | REIMPLEMENT | trivial and already normative as HuGR-Lean non-expansion guard |
| Pytest native text parser ideas | ADAPT/REIMPLEMENT | native-text compatible candidate; validate against our fixture corpus |
| Cargo native text diagnostics | ADAPT/REIMPLEMENT | donor code mixes execution/filter concerns; isolate pure parser behavior |
| Go test NDJSON reducer | REIMPLEMENT | structured input depends on execution mode not guaranteed by HuGR-Lean |
| Ruff/ESLint/Vitest JSON reducers | REIMPLEMENT | command-format injection dependency |
| Git status/log/diff wrappers | REIMPLEMENT | command mutation/probes and different exact-evidence policy |
| Docker/Kubectl structured reducers | REIMPLEMENT | donor can force output shape |
| ls/tree/find/grep reducers | ADAPT | useful native-output logic after exact-evidence review |
| source-code body/comment stripping | REJECT | outside HuGR-Lean v1 safety/product scope |
| tracking SQLite / analytics | REJECT | explicit non-goal |
| command rewrite hooks/proxy runtime | REJECT | conflicts with post-processing-only architecture |
| tee/retrieval subsystem | REIMPLEMENT | useful concept, but HuGR-Lean raw store is intentionally smaller |

## Specific evidence paths

- `docs/contributing/TECHNICAL.md`
- `docs/contributing/ARCHITECTURE.md`
- `src/cmds/README.md`
- `src/cmds/git/git_cmd.rs`
- `src/cmds/rust/cargo_cmd.rs`
- `src/cmds/python/pytest_cmd.rs`
- `src/cmds/python/ruff_cmd.rs`
- `src/cmds/go/go_cmd.rs`
- `src/cmds/js/vitest_cmd.rs`
- `src/core/arg_tokenizer.rs`
- `src/core/filter.rs`
- `tests/fixtures/`
- `.claude/rules/cli-testing.md`

## Legal/provenance obligations

RTK is Apache-2.0. Directly copied or materially derived code/fixtures require:

- source repository + pinned commit + source path;
- retention of applicable copyright/license notices;
- prominent modification notice where required;
- inclusion of required Apache license/NOTICE material in distributions if applicable.

No RTK material may enter HuGR-Lean as unattributed "inspiration."

## Explicit rejects

HuGR-Lean does not inherit:

- RTK command execution/proxy architecture;
- command rewrite system;
- tracking database/analytics surface;
- source-code compression;
- recovery UX that requires RTK-specific command wrappers;
- a requirement to match RTK's command-count surface.

## Audit conclusion

RTK is the **largest knowledge donor**, but not the closest architectural match. Its strongest value is years of fixtures, quirks, parser logic and failure cases. Pure parsers may be adapted; rewrite-dependent reducers become reimplementation inputs.


## WP3.5 Go profile decision

RTK's pinned Go documentation states that its `go test` path injects `-json` and parses NDJSON.

HuGR-Lean WP3.5 therefore treats the RTK Go reducer as **REIMPLEMENT evidence only**. The TypeScript `go-test-verbose` profile parses only native text already present at the HuGR-Lean boundary and never injects `-json`.
