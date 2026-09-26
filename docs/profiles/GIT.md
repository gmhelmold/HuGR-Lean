# Git / GitHub Output Profiles

**Implements:** WP3.6 / issue #34

## Supported profile

### `git-status`

Recognizes only the plain human-facing command:

~~~text
git status
~~~

Requirements:

~~~text
completeness = Complete
termination  = Exited
~~~

The admitted grammar is fixture-backed English human output with:

- `On branch ...` or `HEAD detached at ...` identity line;
- optional recognized branch tracking line;
- optional `You have unmerged paths.` state;
- known section headers:
  - `Changes to be committed:`
  - `Changes not staged for commit:`
  - `Untracked files:`
  - `Unmerged paths:`
- indented file/status entries;
- recognized clean/no-changes final status line.

Reduction removes only:

- blank presentation lines;
- exact human help-hint lines shaped like indented `(use "git ...")` guidance.

Everything retained is emitted as verbatim span-backed Signals.

## Exact-evidence operations

The following are deliberately not reduced by this family:

- `git diff`;
- `git show`;
- `git show <rev>:<path>` blob/file content;
- `git format-patch`;
- `git log`;
- patch/diff-like outputs generally.

These commands produce exact source/history evidence. HuGR-Lean does not summarize hunks, commit messages, blobs, or patches by default.

## Machine-oriented status formats

The following remain exact passthrough:

- `git status --short` / `-s`;
- `git status --porcelain`;
- `git status --porcelain=v2`;
- `git status -z`;
- other status flags/pathspec variants not fixture-backed by the plain-human profile.

Porcelain/short outputs are already compact and may be consumed programmatically, so rewriting them offers little value and creates unnecessary risk.

## Localization/version drift

The initial profile recognizes only the fixture-backed English human grammar. Localized Git status text, unknown sections, unknown branch-state text, or unexpected non-empty lines cause the shape guard to return `NoMatch` and preserve the safe baseline.

## GitHub CLI (`gh`)

No `gh` reduction is claimed in WP3.6.

The pinned donor evidence shows useful possibilities, but GitHub CLI commands expose many command-specific and often exact/structured surfaces. Without a narrow high-value grammar and dedicated fixtures, `gh` remains passthrough.

## Donor evidence

Primary native Git status fixtures:

- `dPeluChe/trs@0175ae73f36709fd4a9242b2e431d026d6f82bb3`
  - `tests/fixture_data/git_status_clean.txt`
  - `tests/fixture_data/git_status_staged.txt`
  - `tests/fixture_data/git_status_mixed.txt`
  - `tests/fixture_data/git_status_conflict.txt`

Fixture bytes are copied under `fixtures/git-status/` with per-fixture provenance. TRS is MIT licensed and the retained notice already lives at `docs/provenance/licenses/TRS-MIT.txt`.

TRS/CX/RTK Git wrappers/parsers that run porcelain/probe/additional commands are not copied into the runtime. HuGR-Lean's TypeScript profile operates only on the boundary output it actually receives.

## Preservation Contract

`git-status` requires every retained branch/tracking/state/section/file/final-status line as a Signal. If any required line is not emitted, preservation validation fails open.

## Conservative boundaries

- truncated status input fails open;
- unknown termination fails open;
- unknown grammar/version/localization passes through;
- standalone trailing CR remains data, not presentation;
- Unicode filenames are span-preserved;
- profile does not run Git, inspect the working tree, or probe additional state.
