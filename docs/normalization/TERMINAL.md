# Terminal SafeNormalization v1

**Implements:** WP2.1 / issue #26  
**Normative parent:** `docs/TECHNICAL_SPEC.md` §11

## Applicability

Generic terminal SafeNormalization is available only when:

~~~text
ObservationV1.presentation == TerminalRendered
~~~

`SourceV1::Shell` alone is insufficient.

The public entry point is:

~~~text
terminal_safe_text(&ObservationV1) -> Option<TerminalSafeText>
~~~

If presentation provenance is unknown, the result is `None`; callers do not receive the generic terminal primitives.

## Primitive 1 — recognized SGR styling removal

The admitted grammar is deliberately narrow:

~~~text
ESC [ [0-9;:]* m
~~~

Examples:

~~~text
ESC[31m
ESC[0m
ESC[m
ESC[38;2;255;0;128m
ESC[38:5:42m
~~~

Only these SGR styling controls are removed.

The primitive deliberately leaves untouched:

- cursor movement;
- erase display/line controls;
- cursor visibility controls;
- OSC hyperlinks/titles;
- malformed/incomplete escape sequences;
- unknown/private CSI grammars.

Those controls can alter visible terminal state and require separate proof before admission.

## Primitive 2 — proven carriage-return redraw collapse

A physical terminal line containing carriage-return frames may collapse to its final frame only when all frames are:

1. non-empty;
2. printable ASCII bytes `0x20..=0x7e`;
3. monotonically non-decreasing in byte/display width.

For admitted ASCII, one byte is one terminal column.

Therefore, when:

~~~text
len(frame[n+1]) >= len(frame[n])
~~~

every subsequent frame provably overwrites every column written by its predecessor.

Examples admitted:

~~~text
9%\r10%\r100%\n
|\r/\r-\rDone\n
abc\rdef\rghi
~~~

Examples rejected/preserved:

~~~text
100%\r9%\n       # shrinking frame could leave trailing characters
Done\r|\n         # shrinking spinner frame
éé\rabc\n         # non-ASCII display width not proven here
abc\r<TAB>def\n   # tab width depends on terminal state
abc\r              # trailing CR has no final replacement frame
~~~

CRLF is preserved as a line ending. A preceding safe redraw body may still collapse:

~~~text
10%\r20%\r\n -> 20%\r\n
~~~

This single width rule covers common progress and spinner redraws without recognizing semantic words such as "loading" or guessing relevance.

## Required primitive properties

Each primitive is required to satisfy:

~~~text
N(N(x)) == N(x)
bytes(N(x)) <= bytes(x)
~~~

Unit tests cover both properties across admitted and rejected cases.

## Explicit non-behavior

WP2.1 does not:

- collapse blank lines;
- deduplicate repeated lines or blocks;
- trim ordinary whitespace;
- truncate;
- deduplicate logs/warnings;
- minify JSON;
- strip source code;
- interpret progress semantically;
- infer TerminalRendered from shell/tool identity.

## Engine integration

WP2.1 defines primitives and the applicability capability.

It does **not** yet compose the primitives into the engine's safe baseline.

That work belongs to:

- #27 — expanded adversarial negative fixture corpus;
- #28 — composition, fallback semantics, and engine integration.

Until #28 completes, `Engine::process` continues to use the original boundary output as its safe baseline.
