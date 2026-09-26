import fs from "node:fs";
import path from "node:path";

import { parse } from "smol-toml";

import { Engine } from "../../src/engine.js";
import {
  collapseMonotonicAsciiRedraws,
  stripRecognizedSgr,
} from "../../src/normalize.js";
import {
  PROTOCOL_V1,
  exited,
  unknownTermination,
  utf8Bytes,
  validateObservationV1,
  type DecisionV1,
  type ObservationV1,
  type PresentationV1,
  type ShellDialectV1,
  type SourceV1,
} from "../../src/types.js";

export type FixtureKind =
  | "core"
  | "normalization"
  | "profile"
  | "integration"
  | "regression";

export type FixtureProperty =
  | "non_expanding"
  | "idempotent"
  | "passthrough_exact"
  | "no_panic"
  | "preserves_required_literals";

export type NormalizationPrimitive =
  | "strip_sgr"
  | "collapse_carriage_redraws";

export interface FixtureCase {
  schema: number;
  id: string;
  kind: FixtureKind;
  observation: {
    source: SourceV1;
    command: string;
    shell_dialect: "unknown" | "posix" | "powershell" | "cmd";
    termination: "unknown" | "exited" | "aborted" | "timed_out";
    exit_code?: number;
    completeness: ObservationV1["completeness"];
    presentation: PresentationV1;
  };
  expect: {
    decision: DecisionV1;
    profile: string;
    golden?: string;
    required_literals: string[];
    forbidden_literals: string[];
    properties: FixtureProperty[];
  };
  preservation: {
    mandatory_signal_ids: string[];
    permitted_removals: string[];
  };
  provenance: {
    kind: "synthetic" | "captured" | "donor" | "regression";
    source_repo: string;
    source_commit: string;
    source_path: string;
    license: string;
    origin_issue: number;
    notes: string;
  };
  normalization?: {
    primitive: NormalizationPrimitive;
  };
}

export interface LoadedFixture {
  root: string;
  case: FixtureCase;
  input: string;
  expected?: string;
}

export function loadFixture(root: string): LoadedFixture {
  const caseText = fs.readFileSync(path.join(root, "case.toml"), "utf8");
  const fixtureCase = parseCaseToml(caseText);
  validateFixtureCase(fixtureCase);

  if (path.basename(root) !== fixtureCase.id) {
    throw new Error(
      `fixture id ${fixtureCase.id} does not match directory ${path.basename(root)}`,
    );
  }

  const input = fs.readFileSync(path.join(root, "input.txt"), "utf8");
  let expected: string | undefined;
  if (fixtureCase.expect.golden !== undefined) {
    const golden = fixtureCase.expect.golden;
    validateRelativeFixturePath(golden);
    expected = fs.readFileSync(path.join(root, golden), "utf8");
  }

  return expected === undefined
    ? { root, case: fixtureCase, input }
    : { root, case: fixtureCase, input, expected };
}

export function fixtureObservation(fixture: LoadedFixture): ObservationV1 {
  const meta = fixture.case.observation;
  const termination =
    meta.termination === "exited"
      ? exited(requireExitCode(meta.exit_code))
      : {
          kind: meta.termination,
          code: meta.exit_code ?? null,
        };

  const observation: ObservationV1 = {
    schema_version: PROTOCOL_V1,
    source: meta.source,
    command: meta.command.length === 0 ? null : meta.command,
    shell_dialect: mapDialect(meta.shell_dialect),
    output: fixture.input,
    termination,
    completeness: meta.completeness,
    presentation: meta.presentation,
  };
  validateObservationV1(observation);
  return observation;
}

export function verifyFixture(engine: Engine, fixture: LoadedFixture): void {
  const observation = fixtureObservation(fixture);
  const result = engine.process(observation);

  if (result.decision !== fixture.case.expect.decision) {
    throw new Error(
      `${fixture.case.id}: expected ${fixture.case.expect.decision}, got ${result.decision}`,
    );
  }

  const expectedProfile =
    fixture.case.expect.profile.length === 0
      ? null
      : fixture.case.expect.profile;
  if (result.profile !== expectedProfile) {
    throw new Error(
      `${fixture.case.id}: expected profile ${String(expectedProfile)}, got ${String(result.profile)}`,
    );
  }

  const effective = result.replacement ?? fixture.input;
  verifyExpectedText(fixture, effective);

  for (const property of fixture.case.expect.properties) {
    if (property === "non_expanding") {
      if (
        utf8Bytes(effective) > utf8Bytes(fixture.input) ||
        result.metrics.output_bytes > result.metrics.input_bytes
      ) {
        throw new Error(`${fixture.case.id}: non_expanding failed`);
      }
    } else if (property === "idempotent") {
      const second = engine.process({ ...observation, output: effective });
      const secondEffective = second.replacement ?? effective;
      if (secondEffective !== effective) {
        throw new Error(`${fixture.case.id}: idempotence failed`);
      }
    } else if (property === "passthrough_exact") {
      if (result.decision !== "passthrough" || effective !== fixture.input) {
        throw new Error(`${fixture.case.id}: passthrough_exact failed`);
      }
    }
  }
}

export function verifyNormalizationFixture(fixture: LoadedFixture): void {
  if (fixture.case.kind !== "normalization" || fixture.case.normalization === undefined) {
    throw new Error("normalization metadata required");
  }

  const observation = fixtureObservation(fixture);
  const input = fixture.input;
  let effective = input;

  if (observation.presentation === "terminal_rendered") {
    effective =
      fixture.case.normalization.primitive === "strip_sgr"
        ? stripRecognizedSgr(input)
        : collapseMonotonicAsciiRedraws(input);
  }

  const decision: DecisionV1 =
    effective === input ? "passthrough" : "normalized";

  if (decision !== fixture.case.expect.decision) {
    throw new Error(
      `${fixture.case.id}: expected ${fixture.case.expect.decision}, got ${decision}`,
    );
  }

  if (fixture.case.expect.profile.length !== 0) {
    throw new Error("normalization fixture cannot declare profile");
  }

  verifyExpectedText(fixture, effective);

  for (const property of fixture.case.expect.properties) {
    if (property === "non_expanding" && utf8Bytes(effective) > utf8Bytes(input)) {
      throw new Error(`${fixture.case.id}: non_expanding failed`);
    }
    if (property === "idempotent") {
      const second =
        observation.presentation === "terminal_rendered"
          ? fixture.case.normalization.primitive === "strip_sgr"
            ? stripRecognizedSgr(effective)
            : collapseMonotonicAsciiRedraws(effective)
          : effective;
      if (second !== effective) {
        throw new Error(`${fixture.case.id}: idempotence failed`);
      }
    }
    if (
      property === "passthrough_exact" &&
      (decision !== "passthrough" || effective !== input)
    ) {
      throw new Error(`${fixture.case.id}: passthrough_exact failed`);
    }
  }
}

export function parseCaseToml(input: string): FixtureCase {
  return decodeFixtureCase(parse(input, { unsafeKeyBehaviour: "throw" }));
}

export function loadFixtureDirectories(parent: string): LoadedFixture[] {
  return fs
    .readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadFixture(path.join(parent, entry.name)))
    .sort((left, right) => left.case.id.localeCompare(right.case.id));
}

function decodeFixtureCase(value: unknown): FixtureCase {
  const root = record(value, "fixture");
  exactKeys(root, [
    "schema",
    "id",
    "kind",
    "observation",
    "expect",
    "preservation",
    "provenance",
    "normalization",
  ]);

  const observation = record(root.observation, "observation");
  exactKeys(observation, [
    "source",
    "command",
    "shell_dialect",
    "termination",
    "exit_code",
    "completeness",
    "presentation",
  ]);

  const expect = record(root.expect, "expect");
  exactKeys(expect, [
    "decision",
    "profile",
    "golden",
    "required_literals",
    "forbidden_literals",
    "properties",
  ]);

  const preservation = record(root.preservation, "preservation");
  exactKeys(preservation, ["mandatory_signal_ids", "permitted_removals"]);

  const provenance = record(root.provenance, "provenance");
  exactKeys(provenance, [
    "kind",
    "source_repo",
    "source_commit",
    "source_path",
    "license",
    "origin_issue",
    "notes",
  ]);

  const normalization =
    root.normalization === undefined
      ? undefined
      : decodeNormalization(root.normalization);

  const fixture: FixtureCase = {
    schema: integer(root.schema, "schema"),
    id: text(root.id, "id"),
    kind: enumeration(root.kind, ["core", "normalization", "profile", "integration", "regression"], "kind"),
    observation: {
      source: enumeration(observation.source, ["shell", "read", "search", "lsp", "mcp", "browser", "other"], "source"),
      command: text(observation.command, "command"),
      shell_dialect: enumeration(observation.shell_dialect, ["unknown", "posix", "powershell", "cmd"], "shell_dialect"),
      termination: enumeration(observation.termination, ["unknown", "exited", "aborted", "timed_out"], "termination"),
      completeness: enumeration(observation.completeness, ["unknown", "complete", "truncated"], "completeness"),
      presentation: enumeration(observation.presentation, ["unknown", "terminal_rendered"], "presentation"),
      ...(observation.exit_code === undefined
        ? {}
        : { exit_code: integer(observation.exit_code, "exit_code") }),
    },
    expect: {
      decision: enumeration(expect.decision, ["passthrough", "normalized", "reduced", "failed_open"], "decision"),
      profile: text(expect.profile, "profile"),
      ...(expect.golden === undefined ? {} : { golden: text(expect.golden, "golden") }),
      required_literals: stringArray(expect.required_literals, "required_literals"),
      forbidden_literals: stringArray(expect.forbidden_literals, "forbidden_literals"),
      properties: enumArray(
        expect.properties,
        ["non_expanding", "idempotent", "passthrough_exact", "no_panic", "preserves_required_literals"],
        "properties",
      ),
    },
    preservation: {
      mandatory_signal_ids: stringArray(preservation.mandatory_signal_ids, "mandatory_signal_ids"),
      permitted_removals: stringArray(preservation.permitted_removals, "permitted_removals"),
    },
    provenance: {
      kind: enumeration(provenance.kind, ["synthetic", "captured", "donor", "regression"], "provenance.kind"),
      source_repo: text(provenance.source_repo, "source_repo"),
      source_commit: text(provenance.source_commit, "source_commit"),
      source_path: text(provenance.source_path, "source_path"),
      license: text(provenance.license, "license"),
      origin_issue: integer(provenance.origin_issue, "origin_issue"),
      notes: text(provenance.notes, "notes"),
    },
    ...(normalization === undefined ? {} : { normalization }),
  };

  return fixture;
}

function decodeNormalization(value: unknown): { primitive: NormalizationPrimitive } {
  const normalization = record(value, "normalization");
  exactKeys(normalization, ["primitive"]);
  return {
    primitive: enumeration(
      normalization.primitive,
      ["strip_sgr", "collapse_carriage_redraws"],
      "normalization.primitive",
    ),
  };
}

function validateFixtureCase(fixture: FixtureCase): void {
  if (fixture.schema !== 1 || fixture.id.length === 0) {
    throw new Error("invalid fixture schema/id");
  }

  if (
    (fixture.kind === "normalization") !==
    (fixture.normalization !== undefined)
  ) {
    throw new Error("normalization metadata/kind mismatch");
  }

  if (
    (fixture.kind === "regression") !==
    (fixture.provenance.kind === "regression")
  ) {
    throw new Error("regression kind/provenance mismatch");
  }

  if (
    fixture.preservation.mandatory_signal_ids.some((value) => value.length === 0) ||
    fixture.preservation.permitted_removals.some((value) => value.length === 0)
  ) {
    throw new Error("empty preservation metadata");
  }

  if (fixture.provenance.kind === "captured" && fixture.provenance.notes.length === 0) {
    throw new Error("captured provenance needs notes");
  }
  if (
    fixture.provenance.kind === "donor" &&
    [
      fixture.provenance.source_repo,
      fixture.provenance.source_commit,
      fixture.provenance.source_path,
      fixture.provenance.license,
    ].some((value) => value.length === 0)
  ) {
    throw new Error("donor provenance incomplete");
  }
  if (
    fixture.provenance.kind === "regression" &&
    fixture.provenance.origin_issue === 0
  ) {
    throw new Error("regression provenance needs origin_issue");
  }
}

function verifyExpectedText(fixture: LoadedFixture, effective: string): void {
  if (fixture.expected !== undefined && effective !== fixture.expected) {
    throw new Error(`${fixture.case.id}: golden mismatch`);
  }
  for (const literal of fixture.case.expect.required_literals) {
    if (!effective.includes(literal)) {
      throw new Error(`${fixture.case.id}: lost required literal ${literal}`);
    }
  }
  for (const literal of fixture.case.expect.forbidden_literals) {
    if (effective.includes(literal)) {
      throw new Error(`${fixture.case.id}: retained forbidden literal ${literal}`);
    }
  }
}

function validateRelativeFixturePath(value: string): void {
  if (path.isAbsolute(value) || value.split(/[\\/]/u).includes("..")) {
    throw new Error("fixture golden path escapes fixture directory");
  }
}

function mapDialect(
  value: FixtureCase["observation"]["shell_dialect"],
): ShellDialectV1 {
  return value === "powershell" ? "power_shell" : value;
}

function requireExitCode(value: number | undefined): number {
  if (value === undefined) {
    throw new Error("exited termination requires exit_code");
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a table`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new Error(`unknown fixture field: ${key}`);
    }
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be string`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be integer`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be string array`);
  }
  return [...value] as string[];
}

function enumeration<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${label} has invalid value`);
  }
  return value as T[number];
}

function enumArray<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number][] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be array`);
  }
  return value.map((item) => enumeration(item, allowed, label));
}
