import type { InvocationIdentity } from "../command.js";
import {
  LeanWriter,
  PreservationContract,
  signalId,
  type ByteSpan,
  type RenderedOutput,
  type Signal,
} from "../preservation.js";
import { lineRecords, type LineRecord } from "../primitive.js";
import {
  COMPLETE_EXITED,
  type AnalysisBundle,
  type Profile,
  type ProfileContext,
  type ProfileDescriptor,
  type ProfileMatch,
  type RouteContext,
} from "../profile.js";

const SUMMARY_ID = signalId("pytest-summary");
const DIAGNOSTICS_ID = signalId("pytest-diagnostics");
const SHORT_SUMMARY_ID = signalId("pytest-short-summary");

interface PytestAnalysis {
  readonly statusRows: readonly Signal[];
  readonly diagnostics: Signal | null;
  readonly shortSummary: Signal | null;
  readonly summary: Signal;
}

interface ParsedPytest {
  readonly statusRows: readonly ByteSpan[];
  readonly diagnostics: ByteSpan | null;
  readonly shortSummary: ByteSpan | null;
  readonly summary: ByteSpan;
  readonly counts: Readonly<Record<string, number>>;
}

export class PytestProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: "pytest",
      family: "python",
      fixture_family: "pytest",
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
    return parsePytest(context.safe_baseline) === null ? "no_match" : "match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const parsed = parsePytest(context.safe_baseline);
    if (
      parsed === null ||
      !pytestOutcomeConsistent(
        parsed.counts,
        context.observation.termination.code,
      )
    ) {
      throw new Error("unsupported or contradictory pytest output");
    }

    const summary = context.verbatimSignal(SUMMARY_ID, parsed.summary);
    const diagnostics =
      parsed.diagnostics === null
        ? null
        : context.verbatimSignal(DIAGNOSTICS_ID, parsed.diagnostics);
    const shortSummary =
      parsed.shortSummary === null
        ? null
        : context.verbatimSignal(SHORT_SUMMARY_ID, parsed.shortSummary);
    const statusRows = parsed.statusRows.map((span, index) =>
      context.verbatimSignal(signalId("pytest-status-" + String(index)), span),
    );

    const required = [
      summary.id,
      ...(diagnostics === null ? [] : [diagnostics.id]),
      ...(shortSummary === null ? [] : [shortSummary.id]),
      ...statusRows.map((signal) => signal.id),
    ];

    return {
      data: Object.freeze({
        statusRows: Object.freeze(statusRows),
        diagnostics,
        shortSummary,
        summary,
      }) satisfies PytestAnalysis,
      preservation: new PreservationContract(required),
    };
  }

  render(analysis: unknown, writer: LeanWriter): void {
    const parsed = pytestAnalysis(analysis);
    let wroteSection = false;

    for (const row of parsed.statusRows) {
      writer.signalLine(row);
      wroteSection = true;
    }

    if (parsed.diagnostics !== null) {
      if (wroteSection) {
        writer.newline();
      }
      writer.signalLine(parsed.diagnostics);
      wroteSection = true;
    }

    if (parsed.shortSummary !== null) {
      if (wroteSection) {
        writer.newline();
      }
      writer.signalLine(parsed.shortSummary);
      wroteSection = true;
    }

    if (wroteSection) {
      writer.newline();
    }
    writer.signalLine(parsed.summary);
  }

  validate(analysis: unknown, rendered: RenderedOutput): void {
    const parsed = pytestAnalysis(analysis);
    const required = [
      ...parsed.statusRows,
      ...(parsed.diagnostics === null ? [] : [parsed.diagnostics]),
      ...(parsed.shortSummary === null ? [] : [parsed.shortSummary]),
      parsed.summary,
    ];

    for (const signal of required) {
      if (!rendered.text.includes(signal.canonical_text)) {
        throw new Error("pytest rendered output lost required evidence");
      }
    }
  }
}

export function pytestProfiles(): Profile[] {
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
  if (command.program === "pytest" || command.program === "py.test") {
    return true;
  }

  return (
    /^python(?:\d+(?:\.\d+)*)?$/u.test(command.program) &&
    command.args[0] === "-m" &&
    command.args[1] === "pytest"
  );
}

function parsePytest(input: string): ParsedPytest | null {
  const lines = lineRecords(input);
  const summaries = lines
    .map((line, index) => ({ index, parsed: parseSummaryLine(line.text) }))
    .filter(
      (
        value,
      ): value is {
        index: number;
        parsed: Readonly<Record<string, number>>;
      } => value.parsed !== null,
    );

  if (summaries.length !== 1) {
    return null;
  }

  const summaryEntry = summaries[0];
  if (
    summaryEntry === undefined ||
    summaryEntry.index !== lines.length - 1
  ) {
    return null;
  }

  const summaryLine = lines[summaryEntry.index];
  if (summaryLine === undefined) {
    return null;
  }

  const detailedStart = lines.findIndex((line) => {
    const title = sectionTitle(line.text);
    return title === "FAILURES" || title === "ERRORS";
  });
  const shortStart = lines.findIndex(
    (line) => sectionTitle(line.text) === "short test summary info",
  );

  const diagnostics =
    detailedStart < 0
      ? null
      : sectionSpan(
          lines,
          detailedStart,
          shortStart > detailedStart ? shortStart : summaryEntry.index,
        );
  const shortSummary =
    shortStart < 0
      ? null
      : sectionSpan(lines, shortStart, summaryEntry.index);

  const statusLimitCandidates = [
    detailedStart,
    shortStart,
    summaryEntry.index,
  ].filter((value) => value >= 0);
  const statusLimit = Math.min(...statusLimitCandidates);

  const statusRows = lines
    .slice(0, statusLimit)
    .filter((line) => isNonPassNodeRow(line.text))
    .map((line) => ({
      start_byte: line.start_byte,
      end_byte: line.end_byte,
    }));

  const failed = summaryEntry.parsed.failed ?? 0;
  const errors = summaryEntry.parsed.errors ?? 0;
  if (failed > 0 || errors > 0) {
    const hasFailureIdentity =
      diagnostics !== null ||
      shortSummary !== null ||
      statusRows.some((span) => {
        const line = textForSpan(input, span);
        return /\s(?:FAILED|ERROR)(?:\s+\[\s*\d+%\])?$/u.test(line);
      });
    if (!hasFailureIdentity) {
      return null;
    }
  }

  return {
    statusRows,
    diagnostics,
    shortSummary,
    summary: {
      start_byte: summaryLine.start_byte,
      end_byte: summaryLine.end_byte,
    },
    counts: summaryEntry.parsed,
  };
}

function parseSummaryLine(
  line: string,
): Readonly<Record<string, number>> | null {
  let content = line.trim();
  if (content.startsWith("=")) {
    content = content.replace(/^=+\s*/u, "").replace(/\s*=+$/u, "");
  }

  const duration = /^(.+?) in \d+(?:\.\d+)?s$/u.exec(content);
  if (duration === null) {
    return null;
  }

  const counts: Record<string, number> = {};
  const parts = duration[1]?.split(", ") ?? [];
  if (parts.length === 0) {
    return null;
  }

  for (const part of parts) {
    const match =
      /^(\d+) (passed|failed|errors?|skipped|xfailed|xpassed|deselected)$/u.exec(
        part,
      );
    if (match === null) {
      return null;
    }

    const value = Number(match[1]);
    if (!Number.isSafeInteger(value)) {
      return null;
    }

    const rawKey = match[2];
    if (rawKey === undefined) {
      return null;
    }
    const key = rawKey === "error" || rawKey === "errors" ? "errors" : rawKey;
    counts[key] = (counts[key] ?? 0) + value;
  }

  return Object.freeze(counts);
}

function pytestOutcomeConsistent(
  counts: Readonly<Record<string, number>>,
  exitCode: number | null,
): boolean {
  if (exitCode === null) {
    return false;
  }

  const failed = counts.failed ?? 0;
  const errors = counts.errors ?? 0;
  return failed > 0 || errors > 0 ? exitCode !== 0 : exitCode === 0;
}

function sectionTitle(line: string): string | null {
  if (!line.startsWith("=")) {
    return null;
  }
  const title = line.replace(/^=+\s*/u, "").replace(/\s*=+$/u, "");
  return title.length === 0 ? null : title;
}

function sectionSpan(
  lines: readonly LineRecord[],
  start: number,
  endExclusive: number,
): ByteSpan | null {
  const first = lines[start];
  if (first === undefined || start >= endExclusive) {
    return null;
  }

  let lastIndex = endExclusive - 1;
  while (lastIndex >= start && lines[lastIndex]?.text.length === 0) {
    lastIndex -= 1;
  }

  const last = lines[lastIndex];
  if (last === undefined) {
    return null;
  }

  return {
    start_byte: first.start_byte,
    end_byte: last.end_byte,
  };
}

function isNonPassNodeRow(line: string): boolean {
  return (
    line.includes("::") &&
    /\s(?:FAILED|ERROR|XFAIL|XPASS|SKIPPED)(?:\s+\[\s*\d+%\])?$/u.test(line)
  );
}

function textForSpan(input: string, span: ByteSpan): string {
  const bytes = Buffer.from(input, "utf8");
  return bytes.subarray(span.start_byte, span.end_byte).toString("utf8");
}

function pytestAnalysis(value: unknown): PytestAnalysis {
  if (
    typeof value !== "object" ||
    value === null ||
    !("statusRows" in value) ||
    !("diagnostics" in value) ||
    !("shortSummary" in value) ||
    !("summary" in value)
  ) {
    throw new Error("invalid pytest analysis");
  }
  return value as PytestAnalysis;
}
