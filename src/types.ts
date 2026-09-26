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
  if (value.kind === "exited") {
    if (!Number.isInteger(value.code)) {
      throw new ProtocolError("exited termination requires an integer exit code");
    }
    return;
  }

  if (value.code !== null) {
    throw new ProtocolError("non-exited termination must not carry an exit code");
  }
}

export function validateObservationV1(observation: ObservationV1): void {
  if (observation.schema_version !== PROTOCOL_V1) {
    throw new ProtocolError(
      `unsupported schema_version ${observation.schema_version}; expected ${PROTOCOL_V1}`,
    );
  }
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
  if (result.schema_version !== PROTOCOL_V1) {
    throw new ProtocolError("unsupported result schema version");
  }

  if (result.diagnostics.length > MAX_DIAGNOSTICS) {
    throw new ProtocolError("diagnostic count exceeds Protocol V1 maximum");
  }

  if (result.decision === "normalized" || result.decision === "reduced") {
    if (result.replacement === null) {
      throw new ProtocolError("normalized/reduced result requires replacement text");
    }
    if (utf8Bytes(result.replacement) !== result.metrics.output_bytes) {
      throw new ProtocolError("output_bytes does not match replacement byte length");
    }
  } else {
    if (result.replacement !== null) {
      throw new ProtocolError("passthrough/failed_open must not carry replacement text");
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
