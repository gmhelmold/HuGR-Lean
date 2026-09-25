# Core Engine Pipeline v1

**Implements:** WP1.3 / issue #23  
**Normative parent:** `docs/TECHNICAL_SPEC.md` §§8, 10, 13, 15

## Current pipeline

~~~text
ObservationV1
    |
    v
validate protocol observation
    |
    v
active input size guard
    |
    v
select safe baseline
    |
    v
identify invocation
    |
    v
recognize matching profiles
    |
    +-- none -------------> passthrough
    |
    +-- more than one ----> failed_open(ambiguous_profile)
    |
    v
check profile requirements
    |
    +-- unmet ------------> failed_open
    |
    v
analyze
    |
    +-- error ------------> failed_open(profile_parse_failed)
    |
    v
render
    |
    +-- error ------------> failed_open(profile_parse_failed)
    |
    v
validate
    |
    +-- error ------------> failed_open(preservation_failed)
    |
    v
non-expansion guard
    |
    +-- candidate >= safe baseline --> safe baseline
    |
    v
reduced result + exact byte metrics
~~~

## Safe baseline in WP1.3

SafeNormalization is implemented by WP2, so WP1.3 deliberately defines:

~~~text
safe_baseline = ObservationV1.output
~~~

The baseline selection point is explicit in the engine so WP2 can refine it without changing profile routing or fail-open semantics.

## Routing

The engine calls every registered profile's `recognize` method against one immutable `RouteContext`.

There are no confidence scores or priorities.

~~~text
0 matches  -> passthrough
1 match    -> continue
2+ matches -> failed_open
~~~

Accidental overlap is treated as ambiguity, not silently resolved by registration order.

## Requirements

A matched profile may require:

~~~text
completeness = Any | Complete
termination  = Any | Exited
~~~

Requirements are checked before analysis.

An unmet requirement is not treated as a parser error and never authorizes a different aggressive profile.

## Analysis type erasure

Profiles may have different internal analysis types. The engine carries analysis as `Box<dyn ProfileAnalysis>` and never inspects it.

This keeps the core from inventing a generic semantic data model.

The sequence remains explicit:

~~~text
recognize -> analyze -> render -> validate
~~~

WP1.4 will add evidence-backed Signal/LeanWriter preservation machinery behind this contract.

## Fail-open

Every fail-open result has:

~~~text
decision     = failed_open
replacement  = null
profile      = null
output_bytes = input_bytes
saved_bytes  = 0
~~~

The original model-visible payload remains owned by the adapter and is not echoed over the protocol.

Current structured diagnostics include:

- `ambiguous_profile`
- `profile_parse_failed`
- `preservation_failed`
- `input_too_large`
- `incomplete_input`
- `unknown_termination`

## Size guard

Engine configuration obeys:

~~~text
minimum  1 MiB
default  4 MiB
maximum 16 MiB
~~~

The separate Protocol V1 envelope guard remains 128 MiB.

An observation whose output exceeds the active engine limit fails open before command identity or profile routing.

## Non-expansion

After successful validation, reduced output requires:

~~~text
candidate_bytes < safe_baseline_bytes
~~~

Equal-size output is not considered a reduction.

A larger or equal candidate is discarded and the safe baseline wins.

In WP1.3 the baseline is the original boundary output, so that result is passthrough.

## Metrics

Metrics use exact UTF-8 byte lengths.

For a reduction:

~~~text
input_bytes  = ObservationV1.output byte length
output_bytes = replacement byte length
saved_bytes  = input_bytes - output_bytes
~~~

No token estimator is involved.

## No behavior added here

WP1.3 does not implement:

- real production profiles;
- SafeNormalization;
- Signal construction;
- LeanWriter;
- raw storage;
- host adapters;
- command rewriting;
- semantic relevance.

Test-only profiles exercise the routing contract without creating product coverage prematurely.
