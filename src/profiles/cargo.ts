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
    if (parsed === null) {
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
    return cargoBuildDiagnosticSpan(context.safe_baseline) === null
      ? "no_match"
      : "match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const span = cargoBuildDiagnosticSpan(context.safe_baseline);
    if (span === null) {
      throw new Error("unsupported cargo build output shape");
    }

    const diagnostics = context.verbatimSignal(BUILD_DIAGNOSTICS_ID, span);
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
    identity.recognition.identity.args[0] === subcommand
  );
}

interface ParsedCargoTest {
  readonly failures: readonly ByteSpan[];
  readonly summary: ByteSpan;
}

interface LineRecord {
  readonly text: string;
  readonly startByte: number;
  readonly endByte: number;
  readonly endWithNewlineByte: number;
}

function parseCargoTestShape(input: string): ParsedCargoTest | null {
  const lines = lineRecords(input);
  const summaryIndex = findLastIndex(lines, (line) =>
    line.text.startsWith("test result: "),
  );
  if (summaryIndex < 0) {
    return null;
  }

  const summaryLine = lines[summaryIndex];
  if (summaryLine === undefined || !isCargoTestSummary(summaryLine.text)) {
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
        const start = line.startByte;
        let end = line.endByte;
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
            end = next.endByte;
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
  if (failedCount > 0 && failures.length !== failedCount) {
    return null;
  }
  if (failedCount === 0 && failures.length !== 0) {
    return null;
  }

  return {
    failures,
    summary: {
      start_byte: summaryLine.startByte,
      end_byte: summaryLine.endByte,
    },
  };
}

function cargoBuildDiagnosticSpan(input: string): ByteSpan | null {
  const lines = lineRecords(input);
  const firstDiagnostic = lines.find(
    (line) =>
      line.text.startsWith("error[") ||
      line.text.startsWith("error:") ||
      line.text.startsWith("warning:") ||
      line.text.startsWith("warning["),
  );
  if (firstDiagnostic === undefined) {
    return null;
  }

  const last = lines.at(-1);
  if (last === undefined) {
    return null;
  }

  return {
    start_byte: firstDiagnostic.startByte,
    end_byte: last.endWithNewlineByte,
  };
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

function lineRecords(input: string): LineRecord[] {
  const records: LineRecord[] = [];
  let codeUnitOffset = 0;
  let byteOffset = 0;

  while (codeUnitOffset < input.length) {
    const newline = input.indexOf("\n", codeUnitOffset);
    const chunkEnd = newline < 0 ? input.length : newline + 1;
    const chunk = input.slice(codeUnitOffset, chunkEnd);
    const hasLf = chunk.endsWith("\n");
    const withoutLf = hasLf ? chunk.slice(0, -1) : chunk;
    const content = withoutLf.endsWith("\r")
      ? withoutLf.slice(0, -1)
      : withoutLf;

    const contentBytes = Buffer.byteLength(content, "utf8");
    const chunkBytes = Buffer.byteLength(chunk, "utf8");

    records.push({
      text: content,
      startByte: byteOffset,
      endByte: byteOffset + contentBytes,
      endWithNewlineByte: byteOffset + chunkBytes,
    });

    codeUnitOffset = chunkEnd;
    byteOffset += chunkBytes;
  }

  return records;
}

function findLastIndex<T>(
  values: readonly T[],
  predicate: (value: T) => boolean,
): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== undefined && predicate(value)) {
      return index;
    }
  }
  return -1;
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
