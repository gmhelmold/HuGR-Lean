export const PROTOCOL_V1 = 1 as const;
export const MAX_DIAGNOSTICS = 16;

export type SourceV1 =
  | "shell"
  | "read"
  | "search"
  | "lsp"
  | "mcp"
  | "browser"
  | "other";

export type ShellDialectV1 = "unknown" | "posix" | "power_shell" | "cmd";
export type TerminationKindV1 = "unknown" | "exited" | "aborted" | "timed_out";
export type CompletenessV1 = "unknown" | "complete" | "truncated";
export type PresentationV1 = "unknown" | "terminal_rendered";

export interface TerminationV1 {
  kind: TerminationKindV1;
  code: number | null;
}

export interface ObservationV1 {
  schema_version: typeof PROTOCOL_V1;
  source: SourceV1;
  command: string | null;
  shell_dialect: ShellDialectV1;
  output: string;
  termination: TerminationV1;
  completeness: CompletenessV1;
  presentation: PresentationV1;
}

export type DecisionV1 = "passthrough" | "normalized" | "reduced" | "failed_open";

export type DiagnosticCodeV1 =
  | "ambiguous_profile"
  | "profile_parse_failed"
  | "preservation_failed"
  | "input_too_large"
  | "raw_store_failed"
  | "protocol_warning"
  | "incomplete_input"
  | "unknown_termination"
  | "termination_not_exited"
  | "safe_normalization_failed";

export interface MetricsV1 {
  input_bytes: number;
  output_bytes: number;
  saved_bytes: number;
}

export interface FilterResultV1 {
  schema_version: typeof PROTOCOL_V1;
  decision: DecisionV1;
  replacement: string | null;
  profile: string | null;
  metrics: MetricsV1;
  raw_ref: string | null;
  diagnostics: DiagnosticCodeV1[];
}

export class ProtocolError extends Error {
  override readonly name = "ProtocolError";
}

export function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function unknownTermination(): TerminationV1 {
  return { kind: "unknown", code: null };
}

export function exited(code: number): TerminationV1 {
  return { kind: "exited", code };
}

export function validateTermination(value: TerminationV1): void {
  assertPlainRecord(value, "termination");
  assertExactKeys(value, ["kind", "code"], "termination");
  assertEnum(value.kind, ["unknown", "exited", "aborted", "timed_out"], "termination.kind");

  if (value.kind === "exited") {
    if (
      !Number.isSafeInteger(value.code) ||
      value.code < -2147483648 ||
      value.code > 2147483647
    ) {
      throw new ProtocolError("exited termination requires a signed 32-bit exit code");
    }
    return;
  }

  if (value.code !== null) {
    throw new ProtocolError("non-exited termination must not carry an exit code");
  }
}

export function validateObservationV1(observation: ObservationV1): void {
  assertPlainRecord(observation, "observation");
  assertExactKeys(
    observation,
    [
      "schema_version",
      "source",
      "command",
      "shell_dialect",
      "output",
      "termination",
      "completeness",
      "presentation",
    ],
    "observation",
  );

  if (observation.schema_version !== PROTOCOL_V1) {
    throw new ProtocolError(
      `unsupported schema_version ${String(observation.schema_version)}; expected ${PROTOCOL_V1}`,
    );
  }
  assertEnum(
    observation.source,
    ["shell", "read", "search", "lsp", "mcp", "browser", "other"],
    "source",
  );
  if (observation.command !== null && typeof observation.command !== "string") {
    throw new ProtocolError("command must be string or null");
  }
  assertEnum(
    observation.shell_dialect,
    ["unknown", "posix", "power_shell", "cmd"],
    "shell_dialect",
  );
  if (typeof observation.output !== "string") {
    throw new ProtocolError("output must be string");
  }
  assertEnum(
    observation.completeness,
    ["unknown", "complete", "truncated"],
    "completeness",
  );
  assertEnum(
    observation.presentation,
    ["unknown", "terminal_rendered"],
    "presentation",
  );
  validateTermination(observation.termination);
}

export function passthroughResult(input: string): FilterResultV1 {
  const bytes = utf8Bytes(input);
  return {
    schema_version: PROTOCOL_V1,
    decision: "passthrough",
    replacement: null,
    profile: null,
    metrics: {
      input_bytes: bytes,
      output_bytes: bytes,
      saved_bytes: 0,
    },
    raw_ref: null,
    diagnostics: [],
  };
}

export function validateFilterResultV1(result: FilterResultV1): void {
  assertPlainRecord(result, "result");
  assertExactKeys(
    result,
    [
      "schema_version",
      "decision",
      "replacement",
      "profile",
      "metrics",
      "raw_ref",
      "diagnostics",
    ],
    "result",
  );

  if (result.schema_version !== PROTOCOL_V1) {
    throw new ProtocolError("unsupported result schema version");
  }

  assertEnum(
    result.decision,
    ["passthrough", "normalized", "reduced", "failed_open"],
    "decision",
  );

  if (
    result.replacement !== null &&
    typeof result.replacement !== "string"
  ) {
    throw new ProtocolError("replacement must be string or null");
  }
  if (result.profile !== null && typeof result.profile !== "string") {
    throw new ProtocolError("profile must be string or null");
  }
  if (result.raw_ref !== null && typeof result.raw_ref !== "string") {
    throw new ProtocolError("raw_ref must be string or null");
  }

  assertPlainRecord(result.metrics, "metrics");
  assertExactKeys(
    result.metrics,
    ["input_bytes", "output_bytes", "saved_bytes"],
    "metrics",
  );
  for (const [name, value] of Object.entries(result.metrics)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ProtocolError(`metrics.${name} must be a non-negative safe integer`);
    }
  }

  if (!Array.isArray(result.diagnostics)) {
    throw new ProtocolError("diagnostics must be an array");
  }
  if (result.diagnostics.length > MAX_DIAGNOSTICS) {
    throw new ProtocolError("diagnostic count exceeds Protocol V1 maximum");
  }
  for (const diagnostic of result.diagnostics) {
    assertEnum(
      diagnostic,
      [
        "ambiguous_profile",
        "profile_parse_failed",
        "preservation_failed",
        "input_too_large",
        "raw_store_failed",
        "protocol_warning",
        "incomplete_input",
        "unknown_termination",
        "termination_not_exited",
        "safe_normalization_failed",
      ],
      "diagnostic",
    );
  }

  if (result.decision === "normalized" || result.decision === "reduced") {
    if (result.replacement === null) {
      throw new ProtocolError("normalized/reduced result requires replacement text");
    }
    if (utf8Bytes(result.replacement) !== result.metrics.output_bytes) {
      throw new ProtocolError("output_bytes does not match replacement byte length");
    }
    if (
      result.decision === "reduced" &&
      (result.profile === null || result.profile.length === 0)
    ) {
      throw new ProtocolError("reduced result requires profile id");
    }
    if (result.decision === "normalized" && result.profile !== null) {
      throw new ProtocolError("normalized result must not carry profile id");
    }
  } else {
    if (result.replacement !== null) {
      throw new ProtocolError("passthrough/failed_open must not carry replacement text");
    }
    if (result.profile !== null) {
      throw new ProtocolError("passthrough/failed_open must not carry profile id");
    }
    if (result.metrics.output_bytes !== result.metrics.input_bytes) {
      throw new ProtocolError("passthrough/failed_open output bytes must equal input bytes");
    }
  }

  if (result.metrics.output_bytes > result.metrics.input_bytes) {
    throw new ProtocolError("result must not expand model-visible output");
  }

  if (
    result.metrics.saved_bytes !==
    result.metrics.input_bytes - result.metrics.output_bytes
  ) {
    throw new ProtocolError("saved_bytes does not match input/output metrics");
  }
}


function assertPlainRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProtocolError(`${label} must be an object`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new ProtocolError(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) {
      throw new ProtocolError(`${label} is missing field ${key}`);
    }
  }
}

function assertEnum(
  value: unknown,
  allowed: readonly string[],
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ProtocolError(`${label} has invalid value`);
  }
}
