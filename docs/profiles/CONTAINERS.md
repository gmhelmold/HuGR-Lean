# Docker / kubectl Coverage Decision

**Implements:** WP3.7 / issue #35  
**Disposition:** no production profile admitted in v1 at this evidence level

## Decision

HuGR-Lean does not currently reduce Docker or kubectl output.

This is an explicit safety/product decision, not an unimplemented parser backlog.

## Why no Docker profile is admitted

### `docker ps`

The pinned TRS native fixture contains:

- container ID;
- image;
- command;
- creation age;
- status/health;
- ports;
- name.

All columns can be directly relevant to a coding/debugging agent. HuGR-Lean cannot prove that COMMAND, CREATED, ID, PORTS, IMAGE, STATUS, or NAME are noise.

RTK achieves a smaller view by executing Docker again with a custom `--format` template. That is command rewriting/re-execution and is outside HuGR-Lean's post-execution-only boundary.

Therefore native `docker ps` remains passthrough.

### `docker images` / compose inventory

RTK similarly requests alternate formatted output and truncates inventories. HuGR-Lean does not alter the executed command or arbitrarily truncate exact inventories.

Deferred.

### Docker logs

RTK imposes a tail bound and routes logs through dedupe/filtering. Repeated log lines are not inherently noise: repetition rate/count/order can itself be diagnostic evidence.

Generic Docker log deduplication/truncation is REJECTED for v1.

Profile-specific log reduction could be proposed in the future only with a grammar that proves removable presentation chatter and preserves error/count/order semantics.

## Why no kubectl profile is admitted

### `kubectl get pods/services`

At the pinned RTK revision, compact pod/service output is obtained by re-running kubectl with `-o json` and rendering selected fields.

HuGR-Lean does not inject `-o json` or re-run kubectl.

Native human-table reduction is not admitted without a native fixture corpus proving which columns can be removed safely across versions/resources.

### `kubectl logs`

Generic dedupe is rejected for the same reason as Docker logs. Repeated entries may encode frequency, retry loops, health failures, or temporal behavior.

### Other kubectl output

`describe`, YAML/JSON output, events, diff, logs and resource manifests are treated as exact/content-bearing evidence by default.

## Coverage matrix

| Surface | Disposition | Reason |
|---|---|---|
| `docker ps` native table | DEFERRED / passthrough | all default columns may matter; donor compaction re-runs with `--format` |
| `docker ps -a` | DEFERRED / passthrough | inventory/state evidence; donor re-runs formatted command |
| `docker images` | DEFERRED / passthrough | exact inventory; donor forces alternate formatting/truncation |
| `docker logs` | REJECT generic reduction | repetition/order/count can be evidence; donor tails/dedupes |
| `docker compose logs` | REJECT generic reduction | same log-evidence concern |
| `kubectl get pods` | DEFERRED / passthrough | RTK forces JSON; insufficient native-table evidence |
| `kubectl get services` | DEFERRED / passthrough | RTK forces JSON; insufficient native-table evidence |
| `kubectl logs` | REJECT generic reduction | repeated logs are not proven noise |
| `kubectl describe/get -o yaml/json` | passthrough | content-bearing/exact operational evidence |
| `kubectl diff` | passthrough | exact diff evidence |

## Donor evidence

TRS pin `0175ae73f36709fd4a9242b2e431d026d6f82bb3`:

- `tests/fixture_data/docker_ps_real.txt` — native Docker ps table used as evidence that default columns are signal-dense.

RTK pin `f5e104e117ab5b05c69d448103c28f1155e04417`:

- `src/cmds/cloud/container.rs` — Docker ps/images use alternate command formatting; kubectl pods/services force `-o json`; logs apply tail/dedupe behavior.
- `src/cmds/cloud/README.md` — container tooling is wrapper/execution-oriented.

No donor code or container fixture bytes are copied into HuGR-Lean for WP3.7.

## Re-entry conditions

A Docker/kubectl profile may be proposed later only when at least one of these is true:

1. real native boundary fixtures expose a deterministic presentation-only class;
2. a command-specific grammar proves a reduction that preserves every decision-relevant field;
3. real workload measurements show material context waste not already addressed by host-side output selection;
4. destructive/ambiguous variants have permanent regression fixtures.

Until then, exact passthrough is the supported behavior.
