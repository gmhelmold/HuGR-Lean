# HL-WP3.6 — Git/GitHub Profile Adversarial Review 01

**Issue:** #34 — Implement Git/GitHub profile family  
**Date:** 2026-09-26  
**Disposition:** PASS after conservative scope resolution

## Review objective

Challenge Git filtering where exact evidence and human presentation are easy to confuse.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| GIT-F01 | Critical | Diff/show/blob/patch output is exact evidence and semantic summarization would destroy source/history data. | No profile matches diff/show/format-patch/log; exact output remains passthrough. |
| GIT-F02 | High | Porcelain/short status may be consumed programmatically and is already compact. | Any status arguments/format flags remain passthrough; profile recognizes only exact `git status`. |
| GIT-F03 | High | Generic removal of parenthesized lines could erase a legitimate filename/content line. | Help removal is restricted to an exact allowlist of known Git hint lines, and each exact hint is dropped at most once; duplicate hint-like content is preserved. |
| GIT-F04 | High | Unknown/localized status grammar could be partially reduced. | Any unexpected non-empty line or localized first/state line makes shape guard return NoMatch. |
| GIT-F05 | High | Truncated or unknown execution state could make the status incomplete. | Profile requires Complete + Exited before analysis. |
| GIT-F06 | Medium | Branch ahead/behind state could be lost while removing push/pull guidance. | Tracking line is a mandatory verbatim Signal; only exact guidance hint is removed. |
| GIT-F07 | High | Conflict state/hints are sensitive. | `You have unmerged paths.`, `Unmerged paths:` and every conflict file entry are mandatory verbatim Signals; only known resolution/abort help hints are removable. |
| GIT-F08 | Medium | UTF-8 filenames could be corrupted by code-unit/byte offset confusion. | Parser computes UTF-8 byte offsets and regression covers Unicode filename preservation. |
| GIT-F09 | Medium | A bare trailing carriage return could be treated as formatting. | Bare trailing CR prevents grammar match and remains passthrough. |
| GIT-F10 | Medium | `gh` support could be claimed broadly from donor evidence without a stable grammar. | No GitHub CLI reducer is admitted in WP3.6; all `gh` output remains passthrough. |
| GIT-F11 | High | Donor Git reducers often execute porcelain/probes/additional Git commands. | HuGR profile is newly authored TypeScript against received native output only; donor fixture bytes are used with provenance, donor runtime logic is not copied. |

## Supported contract

`git-status` supports only fixture-backed English human output from exact command identity `git status`.

Reduction removes only blank presentation lines and exact one-time known Git help hints. Every retained branch/tracking/state/section/file/final-status line is a mandatory Signal.

## Explicit deferrals

- status flags/pathspec variants;
- short/porcelain/v2/NUL modes;
- localized status grammars;
- diverged multi-line branch grammar not fixture-backed here;
- git diff/show/log/format-patch compression;
- GitHub CLI reductions.

## Donor provenance

Selected native Git status fixture bytes come from TRS pin `0175ae73f36709fd4a9242b2e431d026d6f82bb3`; MIT notice is retained. HuGR parser/profile code is newly authored TypeScript.

## Final disposition

**PASS**

The Git family may claim only conservative human `git status` support documented in `docs/profiles/GIT.md`. Exact-evidence and machine-oriented Git surfaces remain passthrough.
