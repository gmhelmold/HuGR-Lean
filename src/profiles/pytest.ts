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

const PYTEST_EVIDENCE_ID = signalId("pytest-evidence");
const PYTEST_SUMMARY_ID = signalId("pytest-summary");

interface PytestAnalysis {
  readonly evidence: Signal | null;
  readonly summary: Signal;
}

interface LineRecord {
  readonly text: string;
  readonly startByte: number;
  readonly endByte: number;
}

interface PytestShape {
  readonly evidence: ByteSpan | null;
  readonly summary: ByteSpan;
  readonly failed: number;
  readonly errors: number;
  readonly shortFailureLines: number;
}

export class PytestProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: "pytest",
      family: "python",
      fixture_family: "python-pytest",
      boundary_assumption: "native_text",
    };
  }

  requirements() {
    return COMPLETE_EXITED;
  }

  recognize(identity: InvocationIdentity): ProfileMatch {
    return matchesPytestInvocation(identity) ? "match" : "no_match";
  }

  shapeGuard(context: RouteContext): ProfileMatch {
    return parsePytestShape(context.safe_baseline) === null ? "no_match" : "match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const parsed = parsePytestShape(context.safe_baseline);
    if (
      parsed === null ||
      !pytestOutcomeConsistent(
        parsed.failed,
        parsed.errors,
        context.observation.termination.code,
      )
    ) {
      throw new Error("unsupported or contradictory pytest output");
    }

    const summary = context.verbatimSignal(PYTEST_SUMMARY_ID, parsed.summary);
    const evidence =
      parsed.evidence === null
        ? null
        : context.verbatimSignal(PYTEST_EVIDENCE_ID, parsed.evidence);

    return {
      data: Object.freeze({ evidence, summary }) satisfies PytestAnalysis,
      preservation: new PreservationContract(
        evidence === null ? [summary.id] : [evidence.id, summary.id],
      ),
    };
  }

  render(analysis: unknown, writer: LeanWriter): void {
    const parsed = pytestAnalysis(analysis);
    if (parsed.evidence !== null) {
      writer.signal(parsed.evidence);
    }
    writer.signalLine(parsed.summary);
  }

  validate(analysis: unknown, rendered: RenderedOutput): void {
    const parsed = pytestAnalysis(analysis);
    if (!rendered.text.includes(parsed.summary.canonical_text)) {
      throw new Error("pytest rendered output lost final summary");
    }
    if (
      parsed.evidence !== null &&
      !rendered.text.includes(parsed.evidence.canonical_text)
    ) {
      throw new Error("pytest rendered output lost failure/error evidence");
    }
  }
}

export function pythonPytestProfiles(): Profile[] {
  return [new PytestProfile()];
}

function matchesPytestInvocation(identity: InvocationIdentity): boolean {
  if (
    identity.kind !== "shell" ||
    identity.recognition.kind !== "direct"
  ) {
    return false;
  }

  const command = identity.recognition.identity;
  if (command.program === "pytest") {
    return true;
  }

  return (
    (command.program === "python" || command.program === "python3") &&
    command.args[0] === "-m" &&
    command.args[1] === "pytest"
  );
}

function parsePytestShape(input: string): PytestShape | null {
  const lines = lineRecords(input);
  const nonEmptyIndexes = lines
    .map((line, index) => (line.text.length > 0 ? index : -1))
    .filter((index) => index >= 0);

  const finalNonEmptyIndex = nonEmptyIndexes.at(-1);
  if (finalNonEmptyIndex === undefined) {
    return null;
  }

  const summaryIndexes = lines
    .map((line, index) => (parsePytestSummary(line.text) === null ? -1 : index))
    .filter((index) => index >= 0);
  if (
    summaryIndexes.length !== 1 ||
    summaryIndexes[0] !== finalNonEmptyIndex
  ) {
    return null;
  }

  const summaryIndex = summaryIndexes[0];
  const summaryLine = lines[summaryIndex];
  if (summaryLine === undefined) {
    return null;
  }

  const counts = parsePytestSummary(summaryLine.text);
  if (counts === null) {
    return null;
  }

  const failureCount = counts.failed + counts.errors;
  const shortSummaryStart = lines.findIndex((line) =>
    /^=+\s+short test summary info\s+=+$/u.test(line.text),
  );

  let shortFailureLines = 0;
  if (shortSummaryStart >= 0 && shortSummaryStart < summaryIndex) {
    shortFailureLines = lines
      .slice(shortSummaryStart + 1, summaryIndex)
      .filter(
        (line) =>
          line.text.startsWith("FAILED ") || line.text.startsWith("ERROR "),
      ).length;
  }

  let evidence: ByteSpan | null = null;
  if (failureCount > 0) {
    const firstEvidenceIndex = lines.findIndex(
      (line, index) =>
        index < summaryIndex &&
        /^=+\s+(?:FAILURES|ERRORS)\s+=+$/u.test(line.text),
    );
    if (
      firstEvidenceIndex < 0 ||
      shortSummaryStart < 0 ||
      shortFailureLines !== failureCount
    ) {
      return null;
    }

    const start = lines[firstEvidenceIndex]?.startByte;
    if (start === undefined) {
      return null;
    }

    evidence = {
      start_byte: start,
      end_byte: summaryLine.startByte,
    };
    if (evidence.end_byte <= evidence.start_byte) {
      return null;
    }
  } else if (shortFailureLines !== 0) {
    return null;
  }

  return {
    evidence,
    summary: {
      start_byte: summaryLine.startByte,
      end_byte: summaryLine.endByte,
    },
    failed: counts.failed,
    errors: counts.errors,
    shortFailureLines,
  };
}

function parsePytestSummary(
  line: string,
): { readonly failed: number; readonly errors: number } | null {
  const core = line.replace(/^=+\s*/u, "").replace(/\s*=+$/u, "").trim();
  const match = /^(?<counts>.+?)\s+in\s+.+$/u.exec(core);
  const countsText = match?.groups?.["counts"];
  if (countsText === undefined) {
    return null;
  }

  const parts = countsText.split(",").map((part) => part.trim());
  if (parts.length === 0) {
    return null;
  }

  let failed = 0;
  let errors = 0;
  const seen = new Set<string>();

  for (const part of parts) {
    const countMatch =
      /^(\d+)\s+(passed|failed|skipped|xfailed|xpassed|error|errors|warning|warnings|deselected)$/u.exec(
        part,
      );
    if (countMatch === null) {
      return null;
    }

    const count = Number(countMatch[1]);
    const label = countMatch[2];
    if (
      !Number.isSafeInteger(count) ||
      label === undefined ||
      seen.has(label)
    ) {
      return null;
    }
    seen.add(label);

    if (label === "failed") {
      failed = count;
    } else if (label === "error" || label === "errors") {
      if (seen.has(label === "error" ? "errors" : "error")) {
        return null;
      }
      errors = count;
    }
  }

  return { failed, errors };
}

function pytestOutcomeConsistent(
  failed: number,
  errors: number,
  exitCode: number | null,
): boolean {
  if (exitCode === null) {
    return false;
  }

  return failed + errors === 0 ? exitCode === 0 : exitCode === 1;
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
    const content =
      hasLf && withoutLf.endsWith("\r")
        ? withoutLf.slice(0, -1)
        : withoutLf;

    const contentBytes = Buffer.byteLength(content, "utf8");
    const chunkBytes = Buffer.byteLength(chunk, "utf8");

    records.push({
      text: content,
      startByte: byteOffset,
      endByte: byteOffset + contentBytes,
    });

    codeUnitOffset = chunkEnd;
    byteOffset += chunkBytes;
  }

  return records;
}

function pytestAnalysis(value: unknown): PytestAnalysis {
  if (
    typeof value !== "object" ||
    value === null ||
    !("evidence" in value) ||
    !("summary" in value)
  ) {
    throw new Error("invalid pytest analysis");
  }

  return value as PytestAnalysis;
}
