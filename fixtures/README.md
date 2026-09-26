# HuGR-Lean Verification Fixtures

Fixtures are governed by [docs/verification/FIXTURE_SCHEMA.md](../docs/verification/FIXTURE_SCHEMA.md).

The corpus is a product-safety artifact, not sample data.

Rules:

1. one common schema;
2. real/donor/regression provenance when applicable;
3. destructive false positives become permanent fixtures;
4. profiles do not maintain private fixture formats;
5. exact golden output is optional; preservation properties are often more durable.

## E0 seed

The initial seed cases establish conservative defaults before reducers exist:

- `seed/unknown-repeated-lines` — repetition alone is not noise;
- `seed/exact-patch-like` — exact evidence is passthrough by default;
- `seed/incomplete-test-like` — truncated/partial test-looking output cannot support complete aggregate claims.

These are synthetic contract fixtures, not claims about an implemented engine yet.


## WP1 proving fixture

- `proving/engine-path` — test-only artificial command/profile used to exercise the complete real engine path: identity routing, shape guard, requirements, analysis, context-bound Signal creation, Preservation Contract, LeanWriter rendering, profile validation, non-expansion, and metrics.

The proving profile is test support only and is not registered by the production default engine.


## WP2 normalization corpus

`fixtures/normalization/` contains executable positive and adversarial negative cases for the terminal SafeNormalization primitives.

See [docs/verification/NORMALIZATION_CORPUS.md](../docs/verification/NORMALIZATION_CORPUS.md).

Negative cases require exact passthrough; #28 owns primitive composition and engine integration.


## WP3 search corpus

`fixtures/search-rg/` covers the narrow native ripgrep grouping profile plus adversarial passthrough cases for heading, context, columns, binary output, no-line-number output, and non-beneficial result shapes.

Filesystem listing commands remain exact/passthrough in v1 unless future evidence proves a deterministic removable presentation class.
