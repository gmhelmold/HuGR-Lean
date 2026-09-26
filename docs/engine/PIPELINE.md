# Core Engine Pipeline v1

**Implements:** WP1.3 / issue #23  
**Normative parent:** `docs/TECHNICAL_SPEC.md` §§8, 10, 13, 14, 15

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
SafeNormalization
    |
    +-- error ------------> failed_open(safe_normalization_failed)
    |
    v
select validated safe baseline
    |
    v
identify invocation
    |
    v
recognize invocation identity
    |
    v
identity-match profiles
    |
    v
apply optional shape guards only to identity matches
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
analyze -> AnalysisBundle { typed data + PreservationContract }
    |
    +-- error ------------> failed_open(profile_parse_failed)
    |
    v
render through LeanWriter
    |
    +-- error ------------> failed_open(profile_parse_failed)
    |
    v
validate required emitted signals
    |
    +-- missing ----------> failed_open(preservation_failed)
    |
    v
profile-specific validate
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

## Safe baseline

The engine now runs SafeNormalization before invocation/profile routing.

~~~text
presentation != TerminalRendered
  -> safe_baseline = original boundary output

presentation == TerminalRendered
  -> SGR stripping
  -> proven carriage-redraw collapse
  -> non-expansion + idempotence self-check
  -> safe_baseline
~~~

A changed baseline is model-visible as `decision = normalized` when no profile produces a strictly smaller valid result.

## Profile registry

Engine construction first validates the shared `ProfileRegistry`.

The registry rejects invalid/duplicate IDs and any profile that declares a rewrite-dependent boundary assumption. It has no priority or confidence mechanism.

See `docs/profiles/FRAMEWORK.md`.

## Routing

The engine first calls every admitted profile's `recognize` method with **InvocationIdentity only**.

Only profiles that match identity are allowed to inspect the observation through an optional `shape_guard`.

This makes the routing order structural:

~~~text
known identity -> optional output-shape guard
~~~

An output shape cannot create a match when identity recognition returned `NoMatch`.

When identity has matched, the shape guard sees both the original observation and the validated `safe_baseline`; profiles should use the baseline for shape decisions affected by terminal presentation noise.

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

Profiles may have different internal analysis types. The shared `AnalysisBundle` carries profile-owned `unknown` data plus a Preservation Contract; the engine never interprets the profile's typed analysis payload.

This keeps the core from inventing a generic semantic data model.

The sequence remains explicit:

~~~text
recognize -> analyze -> render -> validate
~~~

WP1.4 adds evidence-backed `Signal`, `LeanWriter`, and `PreservationContract` machinery behind this contract. See `docs/preservation/CONTRACTS.md`.

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
- `termination_not_exited`
- `safe_normalization_failed`

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

A larger or equal profile candidate is discarded and the validated safe baseline wins.

If SafeNormalization changed the boundary output, that fallback is emitted as `normalized`. Otherwise it remains passthrough.

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

The current core does not implement:

- real production profiles;

- raw storage;
- host adapters;
- command rewriting;
- semantic relevance.

Test-only profiles exercise the routing contract without creating product coverage prematurely.
