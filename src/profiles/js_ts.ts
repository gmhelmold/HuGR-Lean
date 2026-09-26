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

const JEST_SUITES_ID = signalId("jest-suites-summary");
const JEST_TESTS_ID = signalId("jest-tests-summary");
const VITEST_FILES_ID = signalId("vitest-files-summary");
const VITEST_TESTS_ID = signalId("vitest-tests-summary");

interface LineRecord {
  readonly text: string;
  readonly startByte: number;
  readonly endByte: number;
  readonly endWithNewlineByte: number;
}

interface CountSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly todo: number;
}

interface TestRunnerAnalysis {
  readonly failures: readonly Signal[];
  readonly summaries: readonly Signal[];
}

interface TscAnalysis {
  readonly diagnostics: readonly Signal[];
}

interface ParsedTestRunner {
  readonly failures: readonly ByteSpan[];
  readonly summaries: readonly ByteSpan[];
  readonly failed: number;
}

export class JestProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: "jest",
      family: "js-ts",
      fixture_family: "js-ts",
      boundary_assumption: "native_text",
    };
  }

  requirements() {
    return COMPLETE_EXITED;
  }

  recognize(identity: InvocationIdentity): ProfileMatch {
    return explicitToolArgs(identity, "jest") === null ? "no_match" : "match";
  }

  shapeGuard(context: RouteContext): ProfileMatch {
    const args = explicitToolArgs(context.identity, "jest");
    if (args === null || hasJestOutputOverride(args)) {
      return "no_match";
    }
    return parseJest(context.safe_baseline) === null ? "no_match" : "match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const parsed = parseJest(context.safe_baseline);
    if (
      parsed === null ||
      !testOutcomeConsistent(parsed.failed, context.observation.termination.code)
    ) {
      throw new Error("unsupported or contradictory Jest output");
    }

    return testRunnerBundle(
      context,
      parsed,
      "jest-failure-",
      [JEST_SUITES_ID, JEST_TESTS_ID],
    );
  }

  render(analysis: unknown, writer: LeanWriter): void {
    renderTestRunner(testRunnerAnalysis(analysis), writer);
  }

  validate(analysis: unknown, rendered: RenderedOutput): void {
    validateTestRunner(testRunnerAnalysis(analysis), rendered, "Jest");
  }
}

export class VitestProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: "vitest",
      family: "js-ts",
      fixture_family: "js-ts",
      boundary_assumption: "native_text",
    };
  }

  requirements() {
    return COMPLETE_EXITED;
  }

  recognize(identity: InvocationIdentity): ProfileMatch {
    return explicitToolArgs(identity, "vitest") === null ? "no_match" : "match";
  }

  shapeGuard(context: RouteContext): ProfileMatch {
    const args = explicitToolArgs(context.identity, "vitest");
    if (args === null || hasVitestOutputOverride(args)) {
      return "no_match";
    }
    return parseVitest(context.safe_baseline) === null ? "no_match" : "match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const parsed = parseVitest(context.safe_baseline);
    if (
      parsed === null ||
      !testOutcomeConsistent(parsed.failed, context.observation.termination.code)
    ) {
      throw new Error("unsupported or contradictory Vitest output");
    }

    return testRunnerBundle(
      context,
      parsed,
      "vitest-failure-",
      [VITEST_FILES_ID, VITEST_TESTS_ID],
    );
  }

  render(analysis: unknown, writer: LeanWriter): void {
    renderTestRunner(testRunnerAnalysis(analysis), writer);
  }

  validate(analysis: unknown, rendered: RenderedOutput): void {
    validateTestRunner(testRunnerAnalysis(analysis), rendered, "Vitest");
  }
}

export class TscProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: "tsc",
      family: "js-ts",
      fixture_family: "js-ts",
      boundary_assumption: "native_text",
    };
  }

  requirements() {
    return COMPLETE_EXITED;
  }

  recognize(identity: InvocationIdentity): ProfileMatch {
    return explicitToolArgs(identity, "tsc") === null ? "no_match" : "match";
  }

  shapeGuard(context: RouteContext): ProfileMatch {
    const args = explicitToolArgs(context.identity, "tsc");
    if (args === null || hasUnsupportedTscMode(args)) {
      return "no_match";
    }
    return parseTscDiagnostics(context.safe_baseline) === null
      ? "no_match"
      : "match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const spans = parseTscDiagnostics(context.safe_baseline);
    if (
      spans === null ||
      context.observation.termination.code === null ||
      context.observation.termination.code === 0
    ) {
      throw new Error("unsupported or contradictory tsc diagnostics");
    }

    const diagnostics = spans.map((span, index) =>
      context.verbatimSignal(signalId("tsc-diagnostic-" + String(index)), span),
    );

    return {
      data: Object.freeze({ diagnostics }) satisfies TscAnalysis,
      preservation: new PreservationContract(
        diagnostics.map((signal) => signal.id),
      ),
    };
  }

  render(analysis: unknown, writer: LeanWriter): void {
    const parsed = tscAnalysis(analysis);
    parsed.diagnostics.forEach((diagnostic) => writer.signalLine(diagnostic));
  }

  validate(analysis: unknown, rendered: RenderedOutput): void {
    const parsed = tscAnalysis(analysis);
    for (const diagnostic of parsed.diagnostics) {
      if (!rendered.text.includes(diagnostic.canonical_text)) {
        throw new Error("tsc rendered output lost diagnostic evidence");
      }
    }
  }
}

export function jsTsProfiles(): Profile[] {
  return [new JestProfile(), new VitestProfile(), new TscProfile()];
}

function explicitToolArgs(
  identity: InvocationIdentity,
  tool: "jest" | "vitest" | "tsc",
): readonly string[] | null {
  if (
    identity.kind !== "shell" ||
    identity.recognition.kind !== "direct"
  ) {
    return null;
  }

  const command = identity.recognition.identity;
  if (command.program === tool) {
    return command.args;
  }

  if (
    (command.program === "npx" || command.program === "bunx") &&
    command.args[0] === tool
  ) {
    return command.args.slice(1);
  }

  if (
    (command.program === "pnpm" || command.program === "npm") &&
    command.args[0] === "exec" &&
    command.args[1] === tool
  ) {
    return command.args.slice(2);
  }

  return null;
}

function hasJestOutputOverride(args: readonly string[]): boolean {
  return args.some(
    (arg) =>
      arg === "--json" ||
      arg.startsWith("--json=") ||
      arg === "--outputFile" ||
      arg.startsWith("--outputFile=") ||
      arg === "--reporters" ||
      arg.startsWith("--reporters=") ||
      arg === "--watch" ||
      arg === "--watchAll",
  );
}

function hasVitestOutputOverride(args: readonly string[]): boolean {
  return args.some(
    (arg) =>
      arg === "--reporter" ||
      arg.startsWith("--reporter=") ||
      arg === "--reporters" ||
      arg.startsWith("--reporters=") ||
      arg === "--watch" ||
      arg === "--ui",
  );
}

function hasUnsupportedTscMode(args: readonly string[]): boolean {
  return args.some(
    (arg) =>
      arg === "--pretty" ||
      arg.startsWith("--pretty=") ||
      arg === "--watch" ||
      arg === "-w" ||
      arg === "--help" ||
      arg === "-h" ||
      arg === "--version" ||
      arg === "-v" ||
      arg === "--showConfig" ||
      arg === "--init",
  );
}

function parseJest(input: string): ParsedTestRunner | null {
  const lines = lineRecords(input);
  const suiteSummaryIndexes = exactTrimmedPrefixIndexes(lines, "Test Suites:");
  const testSummaryIndexes = exactTrimmedPrefixIndexes(lines, "Tests:");
  if (suiteSummaryIndexes.length !== 1 || testSummaryIndexes.length !== 1) {
    return null;
  }

  const suiteSummaryIndex = suiteSummaryIndexes[0];
  const testSummaryIndex = testSummaryIndexes[0];
  if (
    suiteSummaryIndex === undefined ||
    testSummaryIndex === undefined ||
    suiteSummaryIndex >= testSummaryIndex
  ) {
    return null;
  }

  const suiteLine = lines[suiteSummaryIndex];
  const testLine = lines[testSummaryIndex];
  if (suiteLine === undefined || testLine === undefined) {
    return null;
  }

  const suites = parseJestCountSummary(
    suiteLine.text.trim().slice("Test Suites:".length).trim(),
    new Set(["passed", "failed", "skipped", "total"]),
  );
  const tests = parseJestCountSummary(
    testLine.text.trim().slice("Tests:".length).trim(),
    new Set(["passed", "failed", "skipped", "todo", "total"]),
  );
  if (suites === null || tests === null) {
    return null;
  }

  const suiteHeaders = lines
    .slice(0, suiteSummaryIndex)
    .map((line, index) => ({
      index,
      kind: jestSuiteKind(line.text),
    }))
    .filter((entry) => entry.kind !== null);

  if (
    suiteHeaders.length !== suites.total ||
    suiteHeaders.filter((entry) => entry.kind === "fail").length !== suites.failed
  ) {
    return null;
  }

  const failureDetailCount = lines
    .slice(0, suiteSummaryIndex)
    .filter((line) => line.text.trimStart().startsWith("● ")).length;
  if (failureDetailCount !== tests.failed) {
    return null;
  }

  const failures: ByteSpan[] = [];
  for (let index = 0; index < suiteHeaders.length; index += 1) {
    const header = suiteHeaders[index];
    if (header?.kind !== "fail") {
      continue;
    }
    const nextHeader = suiteHeaders[index + 1]?.index ?? suiteSummaryIndex;
    const start = lines[header.index]?.startByte;
    const endLine = lastNonEmptyLine(lines, header.index, nextHeader);
    if (start === undefined || endLine === null) {
      return null;
    }
    failures.push({ start_byte: start, end_byte: endLine.endByte });
  }

  return {
    failures,
    summaries: [
      { start_byte: suiteLine.startByte, end_byte: suiteLine.endByte },
      { start_byte: testLine.startByte, end_byte: testLine.endByte },
    ],
    failed: tests.failed + suites.failed,
  };
}

function parseVitest(input: string): ParsedTestRunner | null {
  const lines = lineRecords(input);
  const fileSummaryIndexes = lines
    .map((line, index) =>
      line.text.trimStart().startsWith("Test Files  ") ? index : -1,
    )
    .filter((index) => index >= 0);
  const testSummaryIndexes = lines
    .map((line, index) =>
      /^Tests\s{2,}/u.test(line.text.trimStart()) ? index : -1,
    )
    .filter((index) => index >= 0);

  if (fileSummaryIndexes.length !== 1 || testSummaryIndexes.length !== 1) {
    return null;
  }

  const fileSummaryIndex = fileSummaryIndexes[0];
  const testSummaryIndex = testSummaryIndexes[0];
  if (
    fileSummaryIndex === undefined ||
    testSummaryIndex === undefined ||
    fileSummaryIndex >= testSummaryIndex
  ) {
    return null;
  }

  const fileSummaryLine = lines[fileSummaryIndex];
  const testSummaryLine = lines[testSummaryIndex];
  if (fileSummaryLine === undefined || testSummaryLine === undefined) {
    return null;
  }

  const files = parseVitestCountSummary(fileSummaryLine.text.trim());
  const tests = parseVitestCountSummary(testSummaryLine.text.trim());
  if (files === null || tests === null) {
    return null;
  }

  const suiteHeaders = lines
    .slice(0, fileSummaryIndex)
    .map((line, index) => ({
      index,
      kind: vitestSuiteKind(line.text),
    }))
    .filter((entry) => entry.kind !== null);

  if (
    suiteHeaders.length !== files.total ||
    suiteHeaders.filter((entry) => entry.kind === "fail").length !== files.failed
  ) {
    return null;
  }

  const failedTestMarkers = lines
    .slice(0, fileSummaryIndex)
    .filter((line) => /^\s{3,}❯\s+/u.test(line.text)).length;
  if (failedTestMarkers !== tests.failed) {
    return null;
  }

  const failures: ByteSpan[] = [];
  for (let index = 0; index < suiteHeaders.length; index += 1) {
    const header = suiteHeaders[index];
    if (header?.kind !== "fail") {
      continue;
    }
    const nextHeader = suiteHeaders[index + 1]?.index ?? fileSummaryIndex;
    const start = lines[header.index]?.startByte;
    const endLine = lastNonEmptyLine(lines, header.index, nextHeader);
    if (start === undefined || endLine === null) {
      return null;
    }
    failures.push({ start_byte: start, end_byte: endLine.endByte });
  }

  return {
    failures,
    summaries: [
      { start_byte: fileSummaryLine.startByte, end_byte: fileSummaryLine.endByte },
      { start_byte: testSummaryLine.startByte, end_byte: testSummaryLine.endByte },
    ],
    failed: tests.failed + files.failed,
  };
}

function parseTscDiagnostics(input: string): ByteSpan[] | null {
  if (input.includes("\u001b")) {
    return null;
  }

  const lines = lineRecords(input);
  if (lines.length === 0) {
    return null;
  }

  const spans: ByteSpan[] = [];
  let parsedCount = 0;
  let declaredCount: number | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) {
      return null;
    }
    const trimmed = line.text.trim();

    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    const declared = /^Found (\d+) errors?(?: in .+)?\.?$/u.exec(trimmed);
    if (declared !== null) {
      if (declaredCount !== null) {
        return null;
      }
      declaredCount = Number(declared[1]);
      index += 1;
      continue;
    }

    if (
      trimmed === "Errors  Files" ||
      /^\d+\s+\S.*:\d+$/u.test(trimmed)
    ) {
      index += 1;
      continue;
    }

    if (!isTscDiagnosticStart(line.text)) {
      return null;
    }

    const start = line.startByte;
    let end = line.endByte;
    parsedCount += 1;
    index += 1;

    while (index < lines.length) {
      const next = lines[index];
      if (next === undefined) {
        return null;
      }
      if (isTscDiagnosticStart(next.text)) {
        break;
      }
      const nextTrimmed = next.text.trim();
      if (
        nextTrimmed.length === 0 ||
        /^Found \d+ errors?(?: in .+)?\.?$/u.test(nextTrimmed) ||
        nextTrimmed === "Errors  Files" ||
        /^\d+\s+\S.*:\d+$/u.test(nextTrimmed)
      ) {
        break;
      }
      if (!/^\s+/u.test(next.text)) {
        return null;
      }
      end = next.endByte;
      index += 1;
    }

    spans.push({ start_byte: start, end_byte: end });
  }

  if (
    parsedCount === 0 ||
    (declaredCount !== null && declaredCount !== parsedCount)
  ) {
    return null;
  }

  return spans;
}

function isTscDiagnosticStart(line: string): boolean {
  return (
    /^.+\(\d+,\d+\): error TS\d+: .+$/u.test(line) ||
    /^error TS\d+: .+$/u.test(line)
  );
}

function testRunnerBundle(
  context: ProfileContext,
  parsed: ParsedTestRunner,
  failurePrefix: string,
  summaryIds: readonly ReturnType<typeof signalId>[],
): AnalysisBundle {
  const failures = parsed.failures.map((span, index) =>
    context.verbatimSignal(signalId(failurePrefix + String(index)), span),
  );
  const summaries = parsed.summaries.map((span, index) => {
    const id = summaryIds[index];
    if (id === undefined) {
      throw new Error("missing summary signal id");
    }
    return context.verbatimSignal(id, span);
  });

  return {
    data: Object.freeze({ failures, summaries }) satisfies TestRunnerAnalysis,
    preservation: new PreservationContract([
      ...failures.map((signal) => signal.id),
      ...summaries.map((signal) => signal.id),
    ]),
  };
}

function renderTestRunner(
  analysis: TestRunnerAnalysis,
  writer: LeanWriter,
): void {
  analysis.failures.forEach((failure, index) => {
    if (index > 0) {
      writer.newline();
    }
    writer.signalLine(failure);
  });
  if (analysis.failures.length > 0) {
    writer.newline();
  }
  analysis.summaries.forEach((summary) => writer.signalLine(summary));
}

function validateTestRunner(
  analysis: TestRunnerAnalysis,
  rendered: RenderedOutput,
  label: string,
): void {
  for (const signal of [...analysis.failures, ...analysis.summaries]) {
    if (!rendered.text.includes(signal.canonical_text)) {
      throw new Error(label + " rendered output lost required evidence");
    }
  }
}

function testRunnerAnalysis(value: unknown): TestRunnerAnalysis {
  if (
    typeof value !== "object" ||
    value === null ||
    !("failures" in value) ||
    !("summaries" in value)
  ) {
    throw new Error("invalid test runner analysis");
  }
  return value as TestRunnerAnalysis;
}

function tscAnalysis(value: unknown): TscAnalysis {
  if (
    typeof value !== "object" ||
    value === null ||
    !("diagnostics" in value)
  ) {
    throw new Error("invalid tsc analysis");
  }
  return value as TscAnalysis;
}

function testOutcomeConsistent(
  failed: number,
  exitCode: number | null,
): boolean {
  if (exitCode === null) {
    return false;
  }
  return failed === 0 ? exitCode === 0 : exitCode !== 0;
}

function parseJestCountSummary(
  text: string,
  allowed: ReadonlySet<string>,
): CountSummary | null {
  const counts = parseNamedCounts(text, allowed);
  if (counts === null) {
    return null;
  }
  const total = counts.get("total");
  if (total === undefined) {
    return null;
  }
  const passed = counts.get("passed") ?? 0;
  const failed = counts.get("failed") ?? 0;
  const skipped = counts.get("skipped") ?? 0;
  const todo = counts.get("todo") ?? 0;
  if (passed + failed + skipped + todo !== total) {
    return null;
  }
  return { total, passed, failed, skipped, todo };
}

function parseVitestCountSummary(line: string): CountSummary | null {
  const match = /^(?:Test Files|Tests)\s{2,}(.+)\s+\((\d+)\)$/u.exec(line);
  const countsText = match?.[1];
  const totalText = match?.[2];
  if (countsText === undefined || totalText === undefined) {
    return null;
  }

  const counts = parseNamedCounts(
    countsText.replace(/\s*\|\s*/gu, ", "),
    new Set(["passed", "failed", "skipped"]),
  );
  const total = Number(totalText);
  if (counts === null || !Number.isSafeInteger(total)) {
    return null;
  }

  const passed = counts.get("passed") ?? 0;
  const failed = counts.get("failed") ?? 0;
  const skipped = counts.get("skipped") ?? 0;
  if (passed + failed + skipped !== total) {
    return null;
  }

  return { total, passed, failed, skipped, todo: 0 };
}

function parseNamedCounts(
  text: string,
  allowed: ReadonlySet<string>,
): Map<string, number> | null {
  const result = new Map<string, number>();
  for (const part of text.split(",").map((value) => value.trim())) {
    const match = /^(\d+)\s+([a-z]+)$/u.exec(part);
    const countText = match?.[1];
    const label = match?.[2];
    if (
      countText === undefined ||
      label === undefined ||
      !allowed.has(label) ||
      result.has(label)
    ) {
      return null;
    }
    const count = Number(countText);
    if (!Number.isSafeInteger(count)) {
      return null;
    }
    result.set(label, count);
  }
  return result;
}

function jestSuiteKind(line: string): "pass" | "fail" | null {
  const trimmed = line.trimStart();
  if (/^PASS\s+\S/u.test(trimmed)) {
    return "pass";
  }
  if (/^FAIL\s+\S/u.test(trimmed)) {
    return "fail";
  }
  return null;
}

function vitestSuiteKind(line: string): "pass" | "fail" | null {
  const trimmed = line.trimStart();
  if (/^✓\s+\S.+\(\d+\s+tests?(?:\s+\|\s+\d+\s+skipped)?\)\s+\S+/u.test(trimmed)) {
    return "pass";
  }
  if (/^❯\s+\S.+\(\d+\s+tests?\s+\|\s+\d+\s+failed\)\s+\S+/u.test(trimmed)) {
    return "fail";
  }
  return null;
}

function exactTrimmedPrefixIndexes(
  lines: readonly LineRecord[],
  prefix: string,
): number[] {
  return lines
    .map((line, index) => (line.text.trimStart().startsWith(prefix) ? index : -1))
    .filter((index) => index >= 0);
}

function lastNonEmptyLine(
  lines: readonly LineRecord[],
  startIndex: number,
  endIndex: number,
): LineRecord | null {
  for (let index = endIndex - 1; index >= startIndex; index -= 1) {
    const line = lines[index];
    if (line !== undefined && line.text.length > 0) {
      return line;
    }
  }
  return null;
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
      endWithNewlineByte: byteOffset + chunkBytes,
    });

    codeUnitOffset = chunkEnd;
    byteOffset += chunkBytes;
  }

  return records;
}
