# CX Donor Audit

**Issue:** #19  
**Repository:** contextlimit/cx  
**Pinned revision:** `b7c81334e63ba3c1adaafbd2773ca2b8049ae7ae`  
**License:** MIT  
**Role for HuGR-Lean:** safety, evidence, passthrough and validation donor

## Why CX matters

CX is less useful to HuGR-Lean as a giant coverage donor than RTK/TRS, but it is unusually useful as a **truthfulness/safety donor**.

Its documentation and tests emphasize:

- native passthrough when support is not official;
- real exit status;
- evidence retention;
- exact-vs-compact surfaces;
- explicit unsupported-command boundaries;
- fake-binary integration tests;
- recent-call regression shapes;
- output metrics that require both reduction and decision-critical evidence retention;
- failure artifacts;
- installed-binary smoke proof.

This maps directly to HuGR-Lean's fail-open and Preservation Contract philosophy.

## Candidate dispositions

| Surface | Disposition | Reason |
|---|---|---|
| passthrough truth contract | ADOPT concept | directly matches HuGR fail-open |
| exact evidence vs compact review distinction | ADOPT concept | already encoded in HL-SPEC-001 |
| output-metrics + evidence-retention test methodology | ADAPT | ideal verification pattern |
| `recent_calls` regression methodology | ADAPT | valuable real-agent command shapes |
| fake-binary integration-test approach | ADAPT | isolates command/adapter semantics |
| failure artifact tests | ADAPT | useful for WP4/WP5 evidence |
| specific native command parsers | ADAPT/REIMPLEMENT | case-by-case after input compatibility review |
| local raw evidence concept | REIMPLEMENT | HuGR store is smaller, opt-in, and not coupled to failures only |
| SQLite insights ledger | REJECT | persistent analytics non-goal |
| command repair/auto retry/optimizations | REJECT | changes execution semantics |
| antivirus/security scanner | REJECT | unrelated product scope |
| reports/triage/dashboard | REJECT | separate quality-management product |
| opportunity projection/generic head-tail | REJECT | generic arbitrary-output truncation conflicts with HuGR safety |
| persistent response previews/telemetry | REJECT | not required |

## Evidence paths

- `docs/features/passthrough.md`
- `docs/features/validation.md`
- `docs/features/read-like.md`
- `docs/features/git.md`
- `docs/features/pytest.md`
- `src/commands/passthrough.rs`
- `src/commands/`
- `tests/recent_calls.rs`
- `tests/output_metrics.rs`
- `tests/output_expansion_metrics.rs`
- `tests/failure_artifacts.rs`
- `tests/documented_commands.rs`
- `tests/install_script.rs`

## Important negative finding

CX passthrough currently includes optional command-repair/rewrite behavior when command optimizations are enabled. HuGR-Lean must **not** interpret the name "passthrough" as proof that all CX paths are observational-only. Reuse is restricted to explicit output/evidence contracts and pure parser logic.

## License

MIT; preserve the copyright and permission notice for copied/substantial portions.

## Audit conclusion

CX is the **primary safety/test-design donor**. Its most valuable contribution is not code volume but disciplined definitions of exact evidence, unsupported passthrough, failure artifacts, real-call regression tests and honest output metrics.
