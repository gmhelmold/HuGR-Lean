# HL-WP2 — Cold / Adversarial Review 01

**Work Package:** #9 — WP2 Safe normalization  
**Reviewed child work:** #26–#28  
**Date:** 2026-09-25  
**Disposition:** **WP2 PASS**  
**Epic gate:** candidate for G-E1 review

## Review objective

Determine whether generic SafeNormalization is narrow enough to operate before profile routing without violating HuGR-Lean's fail-open and unknown-conservatism invariants.

The review challenged:

- applicability provenance;
- SGR overreach;
- carriage-return semantics;
- Unicode/display-width assumptions;
- primitive composition order;
- idempotence;
- non-expansion;
- fallback behavior;
- interaction with profile routing;
- preservation evidence after normalization;
- whether generic cleanup had quietly become arbitrary text compression.

## Evidence baseline

Completed child issues:

- #26 — terminal SafeNormalization primitives
- #27 — adversarial negative corpus
- #28 — composition and fallback semantics

Latest aligned `main` CI:

- run `36184040202` — **PASS**
- `cargo fmt --all -- --check`
- `cargo test --locked --all-targets`
- `cargo test --locked --doc`
- `cargo clippy --locked --all-targets --all-features -- -D warnings`
- **107 regular tests passed**
- **2 compile-fail doctests passed**
- **0 failures**

Adversarial normalization corpus:

- 21 executable normalization fixtures
- 2 positive controls
- 19 negative/exact-passthrough cases

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| WP2-F01 | Critical | Shell/tool identity could have been mistaken for proof that terminal control bytes are presentation-only. | Generic normalization is gated exclusively by `PresentationV1::TerminalRendered`; source/tool identity is irrelevant to applicability. |
| WP2-F02 | High | Broad ANSI stripping could destroy cursor/erase/OSC/private controls whose visible semantics are not equivalent to deletion. | SGR removal is restricted to `ESC [ [0-9;:]* m`. Cursor movement, erase, OSC, malformed and private sequences remain exact. |
| WP2-F03 | High | Generic carriage-return collapse could corrupt shrinking frames, Unicode-width text, tabs, logs, or CR-as-data. | Collapse is admitted only for non-empty printable ASCII frames with monotonically non-decreasing width. Unsafe shapes remain byte-exact. |
| WP2-F04 | High | Primitive safety did not by itself prove safe composition; ANSI styling inside redraw frames changes the bytes examined by the redraw proof. | Composition order is fixed as SGR removal first, then redraw proof. End-to-end tests cover styled progress frames. |
| WP2-F05 | High | A composition bug could emit an expanded or non-idempotent baseline. | `safe_normalize` self-validates `bytes(candidate) <= bytes(input)` and `N(candidate) == candidate` before returning Changed. |
| WP2-F06 | High | A normalization/profile failure after partial cleanup could leak the partial baseline rather than fail open to original evidence. | Any SafeNormalization/profile/preservation failure returns `failed_open`, `replacement=None`; adapter-owned original remains authoritative. |
| WP2-F07 | Medium | A profile candidate equal to or larger than the normalized baseline could replace a safer/smaller generic baseline. | Candidate must be strictly smaller than the safe baseline. Otherwise the normalized baseline wins. |
| WP2-F08 | High | Profile evidence spans could accidentally be interpreted against original ANSI-bearing output after normalization changed offsets. | Shape guards and analysis receive `safe_baseline`; end-to-end test proves `ProfileContext::verbatim_signal` binds evidence spans to the normalized baseline. |
| WP2-F09 | Medium | Unknown arbitrary payload could still be mutated by pattern resemblance through the fixture runner. | Normalization fixtures apply the same presentation capability gate; negative corpus requires exact passthrough/idempotence/non-expansion/no-panic. |
| WP2-F10 | Medium | Generic cleanup could drift into blank-line/repetition/whitespace/log dedupe because those look compressible. | Such transforms remain explicitly absent; code and corpus preserve them byte-exact. |
| WP2-F11 | Medium | Documentation retained pre-WP2 wording after composition shipped. | Engine and Protocol docs were updated on `main` to reflect normalized/reduced result semantics and safe-baseline fallback. |

## Invariant assessment

### Applicability provenance

PASS.

The only generic capability is:

~~~text
presentation == TerminalRendered
~~~

A shell observation with unknown presentation is not normalized.

### Unknown conservatism

PASS.

- unknown presentation => NotApplicable;
- arbitrary repeated/whitespace text => unchanged;
- malformed control grammars => unchanged;
- unsupported terminal controls => unchanged;
- log/data CR cases without proven presentation semantics => unchanged.

### Determinism

PASS.

Both primitives and their fixed composition are deterministic.

### Idempotence

PASS.

Primitive tests, corpus properties, composition runtime validation, and end-to-end engine tests establish:

~~~text
N(N(x)) == N(x)
~~~

for admitted domains.

### Non-expansion

PASS.

Every primitive is non-expanding and composed normalization validates the property before returning Changed.

### Fail-open

PASS.

SafeNormalization internal failure, profile failure, and preservation failure all return original adapter-owned evidence through `failed_open`.

### Preservation interaction

PASS.

Profile routing and evidence operate on the validated safe baseline. Required signals are still enforced before a reduced result is accepted.

## WP2 Success Criteria

| Criterion | Result |
|---|---|
| Eligible presentation artifacts are reduced | PASS |
| Arbitrary content unchanged without applicability proof | PASS |
| Composition deterministic/idempotent/non-expanding | PASS |

## WP2 Completeness

| Area | Result |
|---|---|
| SGR primitive | PASS |
| carriage-redraw primitive | PASS |
| applicability gate | PASS |
| positive fixtures | PASS |
| adversarial negative corpus | PASS |
| composition order | PASS |
| engine safe-baseline integration | PASS |
| profile fallback semantics | PASS |
| original-output fail-open | PASS |
| preservation spans after normalization | PASS |
| all children #26–#28 | PASS |
| known critical-signal regression | **0** |

## Complexity review

WP2 added no:

- semantic classifier;
- regex-heavy generic minifier;
- terminal emulator;
- tokenizer;
- database;
- daemon;
- LLM;
- background worker;
- configuration surface.

The generic normalization layer remains two narrow deterministic primitives plus a small composition function.

## Final disposition

**WP2 — PASS**

No unresolved Critical/High finding remains.

WP2 may close and proceed to the E1 gate review.
