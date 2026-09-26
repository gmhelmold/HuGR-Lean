# Filesystem & Search Coverage v1

**Implements:** WP3.8 / issue #36

## Supported profile

### ripgrep grouped native text

Profile: `ripgrep-grouped`

The profile admits direct `rg` output only when every line has the native non-heading shape:

~~~text
path:line:content
~~~

and at least one contiguous file group repeats the exact same path.

HuGR-Lean renders:

~~~text
path
  line:content
  line:content
~~~

The transformation removes only repeated exact path prefixes. It preserves:

- first path occurrence as a verbatim Signal;
- every line-number/content suffix as a verbatim Signal;
- file-group order;
- match order within each group.

Interleaved paths are rejected so grouping never reorders search results.

## Requirements

The profile requires `Complete + Exited` input. Match-shaped output additionally requires exit code 0.

Truncated input and unknown termination fail open before analysis. A non-zero exit code with admitted match-shaped output fails open as contradictory/unsupported.

## Command/output exclusions

The profile does not admit output-shape-changing modes such as:

- heading;
- context before/after;
- JSON;
- vimgrep;
- column mode;
- null-delimited modes;
- files/count-only modes;
- no-line-number/no-filename modes;
- only-matching/replace;
- explicit color/pretty output.

Unsupported flags or output grammars remain passthrough.

Standalone carriage-return bytes are not treated as presentation. Paths containing `:` are conservatively rejected because the native `path:line:content` grammar is ambiguous for such paths.

## Explicit deferred/passthrough families

### grep

Deferred for v1. GNU/BSD grep dialects, context separators, binary notices, optional filename/line/column fields, and platform differences make a broad grouping profile too easy to misclassify. No grep command rewrite or backend rerun is allowed.

### ls / tree / find

Deferred/passthrough. Their normal output is generally the exact inventory or hierarchy requested. Donor reducers that classify generated directories or shorten listing detail make semantic/product choices HuGR-Lean cannot prove are noise generically.

`ls -l` permissions/owners/sizes/timestamps, tree hierarchy, and find result paths remain exact evidence by default.

### read/source ranges

Always outside this reducer family. Content-bearing reads remain exact by default.

## Donor evidence

Primary fixture donor: TRS pin `0175ae73f36709fd4a9242b2e431d026d6f82bb3`.

Copied fixture bytes:

- `grep_single_file_multiple_matches.txt`
- `grep_with_colon_in_content.txt`
- `grep_ripgrep_heading.txt`
- `grep_context_lines.txt`
- `grep_with_column.txt`
- `grep_binary_file.txt`
- `grep_simple.txt`
- `grep_multiple_files.txt`
- `grep_without_line_numbers.txt`

HuGR-Lean parser/profile code is newly authored TypeScript. No donor parser/router/truncation code is copied.

## Safety boundary

The profile is presentation compaction, not search-result summarization. It does not:

- truncate matches;
- deduplicate match content;
- reorder files;
- rank relevance;
- drop context lines;
- infer generated/vendor paths;
- rerun searches;
- inject output flags.
