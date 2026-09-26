# HuGR-Lean v1 Profile Coverage Matrix

**Owner:** WP3 / issue #37  
**Runtime:** TypeScript-only local package

## Production profile set

`v1Profiles()` is the authoritative v1 production registry.

| Family | Profile(s) | Status | Boundary | Main conservative fallback |
|---|---|---|---|---|
| Rust/Cargo | `cargo-test`, `cargo-build` | SUPPORTED | native text | clippy/message-format/multi-suite/version drift passthrough |
| Python/pytest | `pytest` | SUPPORTED | native text | unittest/generic Python/unknown pytest shape passthrough |
| JS/TS | `jest`, `vitest`, `tsc` | SUPPORTED | native text | npm-script guessing, custom/JSON reporters, ESLint/Biome deferred |
| Go | `go-test-verbose` | SUPPORTED | native text | default non-verbose, `-json`, subtests/parallel, build/vet deferred |
| Git | `git-status` | SUPPORTED | native human text | diff/show/log/gh/porcelain/localized output passthrough |
| Search | `ripgrep-grouped` | SUPPORTED | native non-heading text | grep/heading/context/JSON/ambiguous paths passthrough |
| Docker/kubectl | none | DEFERRED / REJECTED | — | exact operational evidence passthrough |
| Filesystem listing | none | DEFERRED | — | ls/tree/find exact inventory passthrough |
| Reads/source content | none | REJECTED GENERIC REDUCTION | exact content | passthrough |

## Support rule

A row is `SUPPORTED` only when:

1. a production profile exists in `src/profiles/`;
2. it is registered by `v1Profiles()`;
3. fixture-backed positive and conservative cases exist;
4. Preservation Contracts protect critical evidence;
5. donor compatibility/provenance is explicit;
6. unsupported/version-drift shapes fail conservative.

Deferred/rejected families are not hidden failures. They are explicit decisions where current evidence does not prove a material safe removable class.

## Production profile ownership

All production reducer code lives under `src/profiles/`:

- `cargo.ts` — Rust/Cargo;
- `pytest.ts` — Python/pytest;
- `js_ts.ts` — Jest/Vitest/tsc;
- `go.ts` — native verbose Go test;
- `git.ts` — human `git status`;
- `search.ts` — grouped native ripgrep;
- `index.ts` — combined v1 registry only.

No production reducer/parser exists outside this ownership tree.

## Cross-profile safety

`tests/cross_profile.test.ts` executes every production profile fixture through one `Engine(undefined, v1Profiles())`.

This proves:

- registry IDs are unique;
- fixture families do not accidentally overlap at runtime;
- wrong-family output resemblance cannot create identity;
- version drift falls back conservatively;
- exact-evidence/deferred commands remain passthrough even when every production profile is installed.

## Common primitive audit

WP3.1 introduced `primitive.ts` before production families existed. At WP3 closure it had **zero production consumers**.

The module and its tests were deleted in #37.

Profile-local parsing remains acceptable when grammars are genuinely family-specific. A shared primitive will be reintroduced only after two real production consumers or a cross-cutting correctness requirement exist.

This avoids keeping abstraction surface solely because the roadmap once predicted it.

## Version-drift policy

Known command identity is insufficient for reduction.

~~~text
identity match
  + unsupported/unknown shape
  -> shape guard NoMatch
  -> SafeNormalization baseline or passthrough
~~~

Truncated/unknown execution state additionally fails open when a matched profile requires Complete/Exited.

## Donor compatibility summary

- TRS supplies selected native fixture bytes and parser research;
- RTK supplies coverage/edge-case research, but rewrite-dependent structured modes are not treated as native-compatible;
- CX supplies safety/truthfulness methodology;
- no donor runtime/parser implementation is copied into HuGR-Lean;
- copied fixture bytes carry exact pinned source paths and license metadata.

## Known destructive false positives

**0 known in the committed corpus at WP3 closure.**

Any future destructive false positive becomes a permanent regression fixture under WP7 policy.
