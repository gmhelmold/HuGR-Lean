# SafeNormalization Adversarial Corpus

**Implements:** WP2.2 / issue #27  
**Normative parents:** `docs/TECHNICAL_SPEC.md` §11; `docs/verification/FIXTURE_SCHEMA.md`

## Purpose

This corpus proves where terminal SafeNormalization must **not** mutate content.

It is deliberately adversarial: cases resemble terminal noise, contain control-looking text, repetition, whitespace, Unicode, or carriage returns, but remain outside the admitted grammar or outside the applicability boundary.

## Execution model

Each fixture selects exactly one primitive:

- `strip_sgr`;
- `collapse_carriage_redraws`.

The fixture runner:

1. reconstructs `ObservationV1`;
2. applies the normal `PresentationV1::TerminalRendered` applicability gate;
3. runs exactly one selected primitive when allowed;
4. derives `normalized` vs `passthrough` from byte equality;
5. verifies golden/properties.

This does **not** compose primitives or alter the engine safe baseline. Composition belongs to #28.

## Positive controls

The corpus contains one positive case for each primitive so a false implementation that always passthrough cannot satisfy the suite.

| Fixture | Primitive | Expected |
|---|---|---|
| `sgr-basic-positive` | strip_sgr | normalized |
| `redraw-monotonic-positive` | collapse_carriage_redraws | normalized |

## SGR negative classes

| Fixture | Why it must remain exact |
|---|---|
| `sgr-unknown-presentation` | ANSI-looking bytes without terminal presentation provenance |
| `sgr-source-literal-escape` | source text contains literal escape notation, not ESC bytes |
| `sgr-json-literal-escape` | JSON/data contains escaped control notation |
| `sgr-osc-hyperlink` | OSC is not admitted SGR grammar |
| `sgr-malformed-csi` | incomplete/malformed CSI must not be guessed |
| `sgr-cursor-control` | erase-display CSI changes terminal state and is not admitted |
| `sgr-whitespace-repetition` | blank lines, indentation, and repetition are not generic noise |

## Carriage-redraw negative classes

| Fixture | Why it must remain exact |
|---|---|
| `redraw-unknown-log-cr` | CR-containing log/data without TerminalRendered provenance |
| `redraw-shrinking` | shorter final frame may leave terminal columns behind |
| `redraw-unicode` | display width is not proven by byte length |
| `redraw-tab` | tab display width depends on terminal state |
| `redraw-trailing-cr` | no complete final replacement frame exists |
| `redraw-crlf-plain` | ordinary CRLF is a line ending, not a redraw sequence |
| `redraw-source-literal` | source text contains literal `\r` notation |
| `redraw-repeated-data` | repeated data rows are not inherently noise |

## Required negative properties

Every negative fixture requires:

~~~text
passthrough_exact
non_expanding
idempotent
no_panic
preserves_required_literals
~~~

Therefore any destructive false positive becomes an immediate test failure.

## Scope coverage

The corpus explicitly covers the WP2.2 requested classes:

- source code / literal escapes;
- JSON and repeated data rows;
- whitespace-sensitive text;
- Unicode;
- malformed control text;
- logs containing carriage returns as data;
- unknown presentation provenance.

## Deliberate non-goals

This corpus does not:

- define production profile semantics;
- compose SafeNormalization primitives;
- infer terminal presentation from shell identity;
- test semantic relevance;
- permit generic dedupe/whitespace minification;
- claim invalid UTF-8 support (Protocol V1 payload is UTF-8 `String`).

Invalid UTF-8 belongs below the current Protocol V1 text boundary and is not represented as an `ObservationV1.output`.
