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

const PACKAGE_SUMMARY_ID = signalId("go-test-package-summary");

interface LineRecord {
  readonly text: string;
  readonly startByte: number;
  readonly endByte: number;
}

interface GoTestAnalysis {
  readonly failures: readonly Signal[];
  readonly skipped: readonly Signal[];
  readonly packageSummary: Signal;
}

interface ParsedGoTestVerbose {
  readonly failures: readonly ByteSpan[];
  readonly skipped: readonly ByteSpan[];
  readonly packageSummary: ByteSpan;
  readonly packageFailed: boolean;
}

export class GoTestVerboseProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: "go-test-verbose",
      family: "go",
      fixture_family: "go",
      boundary_assumption: "native_text",
    };
  }

  requirements() {
    return COMPLETE_EXITED;
  }

  recognize(identity: InvocationIdentity): ProfileMatch {
    return matchesGoTestVerbose(identity) ? "match" : "no_match";
  }

  shapeGuard(context: RouteContext): ProfileMatch {
    return parseGoTestVerbose(context.safe_baseline) === null
      ? "no_match"
      : "match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const parsed = parseGoTestVerbose(context.safe_baseline);
    if (
      parsed === null ||
      !outcomeConsistent(
        parsed.packageFailed,
        context.observation.termination.code,
      )
    ) {
      throw new Error("unsupported or contradictory native go test -v output");
    }

    const failures = parsed.failures.map((span, index) =>
      context.verbatimSignal(
        signalId("go-test-failure-" + String(index)),
        span,
      ),
    );
    const skipped = parsed.skipped.map((span, index) =>
      context.verbatimSignal(
        signalId("go-test-skip-" + String(index)),
        span,
      ),
    );
    const packageSummary = context.verbatimSignal(
      PACKAGE_SUMMARY_ID,
      parsed.packageSummary,
    );

    return {
      data: Object.freeze({
        failures,
        skipped,
        packageSummary,
      }) satisfies GoTestAnalysis,
      preservation: new PreservationContract([
        ...failures.map((signal) => signal.id),
        ...skipped.map((signal) => signal.id),
        packageSummary.id,
      ]),
    };
  }

  render(analysis: unknown, writer: LeanWriter): void {
    const parsed = goTestAnalysis(analysis);

    for (const failure of parsed.failures) {
      writer.signalLine(failure);
    }
    for (const skipped of parsed.skipped) {
      writer.signalLine(skipped);
    }
    writer.signalLine(parsed.packageSummary);
  }

  validate(analysis: unknown, rendered: RenderedOutput): void {
    const parsed = goTestAnalysis(analysis);
    for (const signal of [
      ...parsed.failures,
      ...parsed.skipped,
      parsed.packageSummary,
    ]) {
      if (!rendered.text.includes(signal.canonical_text)) {
        throw new Error("Go test rendered output lost required evidence");
      }
    }
  }
}

export function goProfiles(): Profile[] {
  return [new GoTestVerboseProfile()];
}

function matchesGoTestVerbose(identity: InvocationIdentity): boolean {
  if (
    identity.kind !== "shell" ||
    identity.recognition.kind !== "direct"
  ) {
    return false;
  }

  const command = identity.recognition.identity;
  if (command.program !== "go" || command.args[0] !== "test") {
    return false;
  }

  const args = command.args.slice(1);
  if (args.some(isUnsupportedGoTestMode)) {
    return false;
  }

  const argsSeparator = args.indexOf("-args");
  const goArgs = argsSeparator < 0 ? args : args.slice(0, argsSeparator);
  return goArgs.some((arg) => arg === "-v");
}

function isUnsupportedGoTestMode(arg: string): boolean {
  return (
    arg === "-json" ||
    arg.startsWith("-json=") ||
    arg === "-bench" ||
    arg.startsWith("-bench=") ||
    arg === "-fuzz" ||
    arg.startsWith("-fuzz=")
  );
}

function parseGoTestVerbose(input: string): ParsedGoTestVerbose | null {
  const lines = lineRecords(input);
  if (lines.length < 3) {
    return null;
  }

  const failures: ByteSpan[] = [];
  const skipped: ByteSpan[] = [];
  let failedTests = 0;
  let index = 0;

  while (index < lines.length) {
    const startLine = lines[index];
    if (startLine === undefined || !startLine.text.startsWith("=== RUN   ")) {
      break;
    }

    const testName = startLine.text.slice("=== RUN   ".length);
    if (testName.length === 0 || testName.includes("/")) {
      return null;
    }

    const blockStart = startLine.startByte;
    let hasTestOutput = false;
    index += 1;

    while (index < lines.length) {
      const line = lines[index];
      if (line === undefined) {
        return null;
      }

      const result = parseVerboseTestResult(line.text);
      if (result !== null) {
        if (result.name !== testName) {
          return null;
        }

        if (result.status === "pass" && hasTestOutput) {
          return null;
        }

        if (result.status === "fail") {
          failures.push({
            start_byte: blockStart,
            end_byte: line.endByte,
          });
          failedTests += 1;
        } else if (result.status === "skip") {
          skipped.push({
            start_byte: blockStart,
            end_byte: line.endByte,
          });
        }

        index += 1;
        break;
      }

      if (line.text.length !== 0) {
        if (!/^\s+/u.test(line.text)) {
          return null;
        }
        hasTestOutput = true;
      }
      index += 1;
    }

    if (index > lines.length) {
      return null;
    }
  }

  if (index === 0) {
    return null;
  }

  const marker = lines[index];
  if (
    marker === undefined ||
    (marker.text !== "PASS" && marker.text !== "FAIL")
  ) {
    return null;
  }
  index += 1;

  const packageLine = lines[index];
  if (packageLine === undefined) {
    return null;
  }

  const packageStatus = parsePackageSummary(packageLine.text);
  if (packageStatus === null) {
    return null;
  }
  index += 1;

  for (; index < lines.length; index += 1) {
    if (lines[index]?.text.length !== 0) {
      return null;
    }
  }

  const packageFailed = packageStatus === "fail";
  if (
    (marker.text === "FAIL") !== packageFailed ||
    (failedTests > 0) !== packageFailed
  ) {
    return null;
  }

  return {
    failures,
    skipped,
    packageSummary: {
      start_byte: packageLine.startByte,
      end_byte: packageLine.endByte,
    },
    packageFailed,
  };
}

function parseVerboseTestResult(
  line: string,
): { readonly status: "pass" | "fail" | "skip"; readonly name: string } | null {
  const match =
    /^--- (PASS|FAIL|SKIP): ([A-Za-z0-9_.-]+) \([0-9.]+s\)$/u.exec(
      line.trimStart(),
    );
  const statusText = match?.[1];
  const name = match?.[2];
  if (statusText === undefined || name === undefined) {
    return null;
  }

  const status =
    statusText === "PASS"
      ? "pass"
      : statusText === "FAIL"
        ? "fail"
        : "skip";
  return { status, name };
}

function parsePackageSummary(line: string): "pass" | "fail" | null {
  if (/^ok\s+\S+\s+(?:[0-9.]+s|\(cached\))$/u.test(line)) {
    return "pass";
  }
  if (/^FAIL\s+\S+\s+[0-9.]+s$/u.test(line)) {
    return "fail";
  }
  return null;
}

function outcomeConsistent(
  packageFailed: boolean,
  exitCode: number | null,
): boolean {
  if (exitCode === null) {
    return false;
  }
  return packageFailed ? exitCode !== 0 : exitCode === 0;
}

function goTestAnalysis(value: unknown): GoTestAnalysis {
  if (
    typeof value !== "object" ||
    value === null ||
    !("failures" in value) ||
    !("skipped" in value) ||
    !("packageSummary" in value)
  ) {
    throw new Error("invalid Go test analysis");
  }
  return value as GoTestAnalysis;
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
