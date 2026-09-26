import { lineRecords } from "../primitive.js";
import type { InvocationIdentity } from "../command.js";
import {
  LeanWriter,
  PreservationContract,
  signalId,
  type ByteSpan,
  type RenderedOutput,
  type Signal,
} from "../preservation.js";
import {
  COMPLETE_EXITED,
  type AnalysisBundle,
  type Profile,
  type ProfileContext,
  type ProfileDescriptor,
  type ProfileMatch,
  type RouteContext,
} from "../profile.js";

const TEST_SUMMARY_ID = signalId("cargo-test-summary");
const BUILD_DIAGNOSTICS_ID = signalId("cargo-build-diagnostics");

interface CargoTestAnalysis {
  readonly failures: readonly Signal[];
  readonly summary: Signal;
}

interface CargoBuildAnalysis {
  readonly diagnostics: Signal;
}

export class CargoTestProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: "cargo-test",
      family: "rust",
      fixture_family: "rust-cargo",
      boundary_assumption: "native_text",
    };
  }

  requirements() {
    return COMPLETE_EXITED;
  }

  recognize(identity: InvocationIdentity): ProfileMatch {
    return matchesCargoSubcommand(identity, "test") ? "match" : "no_match";
  }

  shapeGuard(context: RouteContext): ProfileMatch {
    return parseCargoTestShape(context.safe_baseline) === null
      ? "no_match"
      : "match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const parsed = parseCargoTestShape(context.safe_baseline);
    if (
      parsed === null ||
      !cargoTestOutcomeConsistent(
        parsed.summaryStatus,
        context.observation.termination.code,
      )
    ) {
      throw new Error("unsupported cargo test output shape");
    }

    const summary = context.verbatimSignal(TEST_SUMMARY_ID, parsed.summary);
    const failures = parsed.failures.map((span, index) =>
      context.verbatimSignal(signalId("cargo-test-failure-" + String(index)), span),
    );

    return {
      data: Object.freeze({ failures, summary }) satisfies CargoTestAnalysis,
      preservation: new PreservationContract([
        summary.id,
        ...failures.map((signal) => signal.id),
      ]),
    };
  }

  render(analysis: unknown, writer: LeanWriter): void {
    const parsed = cargoTestAnalysis(analysis);
    parsed.failures.forEach((failure, index) => {
      if (index > 0) {
        writer.newline();
      }
      writer.signalLine(failure);
    });
    if (parsed.failures.length > 0) {
      writer.newline();
    }
    writer.signalLine(parsed.summary);
  }

  validate(analysis: unknown, rendered: RenderedOutput): void {
    const parsed = cargoTestAnalysis(analysis);
    for (const signal of [...parsed.failures, parsed.summary]) {
      if (!rendered.text.includes(signal.canonical_text)) {
        throw new Error("cargo test rendered output lost required evidence");
      }
    }
  }
}

export class CargoBuildProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: "cargo-build",
      family: "rust",
      fixture_family: "rust-cargo",
      boundary_assumption: "native_text",
    };
  }

  requirements() {
    return COMPLETE_EXITED;
  }

  recognize(identity: InvocationIdentity): ProfileMatch {
    return matchesCargoSubcommand(identity, "build") ? "match" : "no_match";
  }

  shapeGuard(context: RouteContext): ProfileMatch {
    return cargoBuildShape(context.safe_baseline) === null
      ? "no_match"
      : "match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const shape = cargoBuildShape(context.safe_baseline);
    if (
      shape === null ||
      !cargoBuildOutcomeConsistent(
        shape.hasError,
        context.observation.termination.code,
      )
    ) {
      throw new Error("unsupported or contradictory cargo build output");
    }

    const diagnostics = context.verbatimSignal(
      BUILD_DIAGNOSTICS_ID,
      shape.span,
    );
    return {
      data: Object.freeze({ diagnostics }) satisfies CargoBuildAnalysis,
      preservation: PreservationContract.require(BUILD_DIAGNOSTICS_ID),
    };
  }

  render(analysis: unknown, writer: LeanWriter): void {
    writer.signal(cargoBuildAnalysis(analysis).diagnostics);
  }

  validate(analysis: unknown, rendered: RenderedOutput): void {
    const diagnostics = cargoBuildAnalysis(analysis).diagnostics;
    if (rendered.text !== diagnostics.canonical_text) {
      throw new Error("cargo build diagnostics changed during rendering");
    }
  }
}

export function cargoProfiles(): Profile[] {
  return [new CargoTestProfile(), new CargoBuildProfile()];
}

function matchesCargoSubcommand(
  identity: InvocationIdentity,
  subcommand: "test" | "build",
): boolean {
  return (
    identity.kind === "shell" &&
    identity.recognition.kind === "direct" &&
    identity.recognition.identity.program === "cargo" &&
    identity.recognition.identity.args[0] === subcommand &&
    !hasMessageFormatOverride(identity.recognition.identity.args)
  );
}

function hasMessageFormatOverride(args: readonly string[]): boolean {
  return args.some(
    (arg, index) =>
      arg === "--message-format" ||
      arg.startsWith("--message-format=") ||
      (index > 0 && args[index - 1] === "--message-format"),
  );
}

interface ParsedCargoTest {
  readonly failures: readonly ByteSpan[];
  readonly summary: ByteSpan;
  readonly summaryStatus: "ok" | "FAILED";
}

function parseCargoTestShape(input: string): ParsedCargoTest | null {
  const lines = lineRecords(input);
  const summaryIndexes = lines
    .map((line, index) => (line.text.startsWith("test result: ") ? index : -1))
    .filter((index) => index >= 0);
  if (summaryIndexes.length !== 1) {
    return null;
  }

  const summaryIndex = summaryIndexes[0];
  if (summaryIndex === undefined || summaryIndex !== lines.length - 1) {
    return null;
  }

  const summaryLine = lines[summaryIndex];
  if (summaryLine === undefined || !isCargoTestSummary(summaryLine.text)) {
    return null;
  }

  const hasRunningMarker = lines
    .slice(0, summaryIndex)
    .some((line) => /^running \d+ tests?$/u.test(line.text));
  if (!hasRunningMarker) {
    return null;
  }

  const firstFailuresHeader = lines.findIndex((line) => line.text === "failures:");
  const failures: ByteSpan[] = [];

  if (firstFailuresHeader >= 0 && firstFailuresHeader < summaryIndex) {
    let index = firstFailuresHeader + 1;
    while (index < summaryIndex) {
      const line = lines[index];
      if (line === undefined) {
        return null;
      }

      if (line.text === "failures:") {
        break;
      }

      if (line.text.startsWith("---- ") && line.text.endsWith(" stdout ----")) {
        const start = line.start_byte;
        let end = line.end_byte;
        index += 1;

        while (index < summaryIndex) {
          const next = lines[index];
          if (next === undefined) {
            return null;
          }
          if (
            next.text === "failures:" ||
            (next.text.startsWith("---- ") && next.text.endsWith(" stdout ----"))
          ) {
            break;
          }
          if (next.text.length > 0) {
            end = next.end_byte;
          }
          index += 1;
        }

        if (end <= start) {
          return null;
        }
        failures.push({ start_byte: start, end_byte: end });
        continue;
      }

      index += 1;
    }
  }

  const failedCount = parseSummaryFailedCount(summaryLine.text);
  if (failedCount === null) {
    return null;
  }

  const summaryStatus = summaryLine.text.startsWith("test result: ok.")
    ? "ok"
    : "FAILED";
  if (
    (summaryStatus === "ok" && failedCount !== 0) ||
    (summaryStatus === "FAILED" && failedCount === 0)
  ) {
    return null;
  }

  if (failedCount > 0 && failures.length !== failedCount) {
    return null;
  }
  if (failedCount === 0 && failures.length !== 0) {
    return null;
  }

  return {
    failures,
    summary: {
      start_byte: summaryLine.start_byte,
      end_byte: summaryLine.end_byte,
    },
    summaryStatus,
  };
}

function cargoTestOutcomeConsistent(
  status: "ok" | "FAILED",
  exitCode: number | null,
): boolean {
  if (exitCode === null) {
    return false;
  }
  return status === "ok" ? exitCode === 0 : exitCode !== 0;
}

interface CargoBuildShape {
  readonly span: ByteSpan;
  readonly hasError: boolean;
}

function cargoBuildShape(input: string): CargoBuildShape | null {
  const lines = lineRecords(input);
  const firstDiagnosticIndex = lines.findIndex(
    (line) =>
      line.text.startsWith("error[") ||
      line.text.startsWith("error:") ||
      line.text.startsWith("warning:") ||
      line.text.startsWith("warning["),
  );
  if (firstDiagnosticIndex < 0) {
    return null;
  }

  const firstDiagnostic = lines[firstDiagnosticIndex];
  const last = lines.at(-1);
  if (firstDiagnostic === undefined || last === undefined) {
    return null;
  }

  const hasError = lines
    .slice(firstDiagnosticIndex)
    .some(
      (line) =>
        line.text.startsWith("error[") || line.text.startsWith("error:"),
    );

  return {
    span: {
      start_byte: firstDiagnostic.start_byte,
      end_byte: last.end_with_newline_byte,
    },
    hasError,
  };
}

function cargoBuildOutcomeConsistent(
  hasError: boolean,
  exitCode: number | null,
): boolean {
  if (exitCode === null) {
    return false;
  }
  return hasError ? exitCode !== 0 : exitCode === 0;
}

function isCargoTestSummary(line: string): boolean {
  return /^test result: (?:ok|FAILED)\. \d+ passed; \d+ failed; \d+ ignored; \d+ measured; \d+ filtered out; finished in .+$/u.test(
    line,
  );
}

function parseSummaryFailedCount(line: string): number | null {
  const match = /^test result: (?:ok|FAILED)\. \d+ passed; (\d+) failed;/u.exec(
    line,
  );
  if (match === null) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

function cargoTestAnalysis(value: unknown): CargoTestAnalysis {
  if (
    typeof value !== "object" ||
    value === null ||
    !("failures" in value) ||
    !("summary" in value)
  ) {
    throw new Error("invalid cargo test analysis");
  }
  return value as CargoTestAnalysis;
}

function cargoBuildAnalysis(value: unknown): CargoBuildAnalysis {
  if (
    typeof value !== "object" ||
    value === null ||
    !("diagnostics" in value)
  ) {
    throw new Error("invalid cargo build analysis");
  }
  return value as CargoBuildAnalysis;
}
