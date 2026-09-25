# Invocation Identity v1

**Implements:** WP1.2 / issue #22  
**Normative parent:** `docs/TECHNICAL_SPEC.md` §12

HuGR-Lean routes profiles from known execution identity, never from vague output resemblance.

## Routing boundary

~~~text
ObservationV1
  source != shell -> Source(source)
  source == shell -> conservative command recognizer
~~~

Non-shell observations are identified only by their normalized `SourceV1` in WP1.2.

## Unknown shell dialect

When `shell_dialect = unknown`, HuGR-Lean recognizes only portable bare commands.

A leading assignment-looking token is **not** treated as an executable. Because the dialect is unknown, HuGR-Lean cannot safely decide whether it is shell environment syntax, so the whole command remains `ComplexOrUnknown`.

Examples accepted:

~~~text
cargo test
git status --short
pytest -q
npm test
/usr/bin/cargo test foo::bar --features=a,b
./node_modules/.bin/eslint src/lib.rs
~~~

Tokens are separated only by ASCII space or tab. Newline, carriage return, vertical tab, form feed, and other control whitespace are rejected rather than reinterpreted.

Argument tokens use a deliberately narrow ASCII allowlist:

~~~text
A-Z a-z 0-9 _ - . / : = @ + ,
~~~

Executable tokens use the same grammar but additionally reject `=` and a trailing path separator.

This is a routing grammar, not a general shell grammar.

## Rejected as ComplexOrUnknown

The recognizer does not interpret:

- single or double quotes;
- backslash escaping;
- variable expansion;
- `$(...)` or backticks;
- tilde, glob, bracket or brace expansion;
- pipes / boolean chaining;
- redirection;
- background execution;
- grouping;
- multi-command newlines/carriage returns.

Representative rejected shapes:

~~~text
cargo test "foo bar"
echo $HOME
echo $(pwd)
cargo test | tee out.txt
cargo test && echo done
cargo test > out.txt
echo *.rs
~~~

Rejecting means only that HuGR-Lean does not establish a command-specific identity. It does not declare the command invalid.

## POSIX dialect

When `shell_dialect = posix`, WP1.2 adds one narrowly specified behavior: skip leading, unambiguous POSIX-style environment assignments.

~~~text
FOO=bar RUSTFLAGS=-Dwarnings cargo test
                               ^ identity begins here
~~~

Assignment names must match:

~~~text
[A-Za-z_][A-Za-z0-9_]*
~~~

Values must themselves satisfy the portable bare-token grammar or be empty.

Therefore these remain conservative:

~~~text
FOO=$BAR cargo test
PATH=~/bin cargo test
~~~

The recognizer never evaluates or expands assignment values.

## PowerShell / Cmd

WP1.2 does not implement quoting or escaping semantics for PowerShell or Cmd.

Bare commands may still be recognized, but quoted/expanded/control syntax remains `ComplexOrUnknown`.

Future dialect-specific extensions require their own fixtures and issue scope.

## CommandIdentity

A direct identity contains:

- `executable`: exact admitted executable token;
- `program`: lexical basename used for family routing;
- `args`: exact admitted remaining tokens.

Program extraction is lexical only.

No:

- filesystem lookup;
- `PATH` resolution;
- alias/function lookup;
- shell invocation;
- variable expansion;
- command execution.

Example:

~~~text
./node_modules/.bin/eslint src/lib.rs

executable = ./node_modules/.bin/eslint
program    = eslint
args       = [src/lib.rs]
~~~

## Safety principle

> If recognizing a command would require understanding shell semantics, WP1.2 does not recognize it.

Later profile routing may only build on identities established by this boundary.
