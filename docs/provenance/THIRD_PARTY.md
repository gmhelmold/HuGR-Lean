# Third-Party Provenance Baseline

**Phase:** E0  
**Status:** active provenance register; TRS fixture bytes incorporated for WP3 profile verification

This file is the top-level index for third-party material considered by HuGR-Lean.

| Project | Pin | License | Current repository status | Detailed audit |
|---|---|---|---|---|
| RTK | `f5e104e117ab5b05c69d448103c28f1155e04417` | Apache-2.0 | research only; no source bytes copied yet; no repository `NOTICE` file at this pin | [RTK.md](RTK.md) |
| TRS | `0175ae73f36709fd4a9242b2e431d026d6f82bb3` | MIT | selected native Cargo, pytest, Jest/Vitest, tsc, and Git status fixture bytes copied for WP3 verification; MIT notice retained in `docs/provenance/licenses/TRS-MIT.txt` | [TRS.md](TRS.md) |
| CX | `b7c81334e63ba3c1adaafbd2773ca2b8049ae7ae` | MIT | research only; no source bytes copied yet | [CX.md](CX.md) |
| LeanCTX | `edd9c55650de4622e3a0cc8696bcf4e9abba1a6a` | Apache-2.0 | selective research only; repository `NOTICE` exists at this pin | [ADJACENT.md](ADJACENT.md) |
| context-compress | `59fae35a7b383876a34f84090f6da978e230795a` | MIT | selective research only | [ADJACENT.md](ADJACENT.md) |

## Rule for future incorporation

Before third-party code or fixture content is committed, its provenance record must include:

1. source project;
2. repository URL;
3. pinned source commit;
4. exact source path;
5. original license;
6. HuGR-Lean destination path;
7. whether the material is copied, translated, adapted, or fixture-derived;
8. material modifications;
9. required distribution notices.

Apache-2.0 material must additionally preserve applicable attribution notices and mark modified files as required by the license. A donor `NOTICE` is reproduced only when one exists and its notices pertain to incorporated material.

MIT material must preserve the copyright and permission notice for substantial copied portions.

## Incorporation status

At E0 completion, no donor code or fixture bytes had been copied.

WP3 uses selected fixture bytes from dPeluChe/trs at pin
`0175ae73f36709fd4a9242b2e431d026d6f82bb3`.

Current incorporated families:

- Cargo/rustc;
- Python/pytest;
- Jest/Vitest;
- textual tsc diagnostics;
- Git human status.

Only fixture bytes are copied. HuGR-Lean runtime/profile code is newly authored TypeScript.

License notice: `docs/provenance/licenses/TRS-MIT.txt`.

Each donor fixture carries its exact source path and adaptation note in Fixture Contract provenance metadata.
