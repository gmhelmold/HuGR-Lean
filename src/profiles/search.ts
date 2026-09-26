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

interface ParsedMatch {
  readonly path: string;
  readonly pathSpan: ByteSpan;
  readonly suffixSpan: ByteSpan;
}

interface ParsedGroup {
  readonly path: string;
  readonly pathSpan: ByteSpan;
  readonly matches: readonly ByteSpan[];
}

interface RipgrepAnalysis {
  readonly groups: readonly {
    readonly path: Signal;
    readonly matches: readonly Signal[];
  }[];
}

interface LineRecord {
  readonly text: string;
  readonly startByte: number;
  readonly endByte: number;
}

const UNSUPPORTED_FORMAT_FLAGS = [
  "--json",
  "--heading",
  "--pretty",
  "--vimgrep",
  "--column",
  "--context",
  "--before-context",
  "--after-context",
  "--context-separator",
  "--field-context-separator",
  "--field-match-separator",
  "--null",
  "--null-data",
  "--files",
  "--files-with-matches",
  "--files-without-match",
  "--count",
  "--count-matches",
  "--no-filename",
  "--no-line-number",
  "--only-matching",
  "--replace",
  "--stats",
  "--color",
  "--colors",
] as const;

export class RipgrepGroupedProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: "ripgrep-grouped",
      family: "search",
      fixture_family: "search-rg",
      boundary_assumption: "native_text",
    };
  }

  requirements() {
    return COMPLETE_EXITED;
  }

  recognize(identity: InvocationIdentity): ProfileMatch {
    return matchesSupportedRipgrep(identity) ? "match" : "no_match";
  }

  shapeGuard(context: RouteContext): ProfileMatch {
    return parseRipgrepGroups(context.safe_baseline) === null
      ? "no_match"
      : "match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    if (
      context.observation.termination.kind !== "exited" ||
      context.observation.termination.code !== 0
    ) {
      throw new Error("ripgrep matched output requires exit code 0");
    }

    const parsed = parseRipgrepGroups(context.safe_baseline);
    if (parsed === null) {
      throw new Error("unsupported ripgrep output shape");
    }

    const groups = parsed.map((group, groupIndex) => {
      const path = context.verbatimSignal(
        signalId("rg-path-" + String(groupIndex)),
        group.pathSpan,
      );
      const matches = group.matches.map((span, matchIndex) =>
        context.verbatimSignal(
          signalId(
            "rg-match-" + String(groupIndex) + "-" + String(matchIndex),
          ),
          span,
        ),
      );
      return Object.freeze({ path, matches });
    });

    const required = groups.flatMap((group) => [
      group.path.id,
      ...group.matches.map((signal) => signal.id),
    ]);

    return {
      data: Object.freeze({ groups }) satisfies RipgrepAnalysis,
      preservation: new PreservationContract(required),
    };
  }

  render(analysis: unknown, writer: LeanWriter): void {
    const parsed = ripgrepAnalysis(analysis);
    for (const group of parsed.groups) {
      writer.signalLine(group.path);
      for (const match of group.matches) {
        writer.literal`  `;
        writer.signalLine(match);
      }
    }
  }

  validate(analysis: unknown, rendered: RenderedOutput): void {
    const parsed = ripgrepAnalysis(analysis);
    for (const group of parsed.groups) {
      if (!rendered.text.includes(group.path.canonical_text)) {
        throw new Error("ripgrep rendered output lost path evidence");
      }
      for (const match of group.matches) {
        if (!rendered.text.includes(match.canonical_text)) {
          throw new Error("ripgrep rendered output lost match evidence");
        }
      }
    }
  }
}

export function searchProfiles(): Profile[] {
  return [new RipgrepGroupedProfile()];
}

function matchesSupportedRipgrep(identity: InvocationIdentity): boolean {
  if (
    identity.kind !== "shell" ||
    identity.recognition.kind !== "direct" ||
    identity.recognition.identity.program !== "rg"
  ) {
    return false;
  }

  const args = identity.recognition.identity.args;
  if (args.length === 0) {
    return false;
  }

  return !args.some(isUnsupportedFormatArg);
}

function isUnsupportedFormatArg(arg: string): boolean {
  if (
    arg === "-A" ||
    arg === "-B" ||
    arg === "-C" ||
    arg === "-0" ||
    arg === "-I" ||
    arg === "-N" ||
    arg === "-c" ||
    arg === "-l" ||
    arg === "-L" ||
    arg === "-o" ||
    arg === "-p" ||
    arg === "-r"
  ) {
    return true;
  }

  if (/^-(?:A|B|C)\d+$/u.test(arg)) {
    return true;
  }

  return UNSUPPORTED_FORMAT_FLAGS.some(
    (flag) => arg === flag || arg.startsWith(flag + "="),
  );
}

function parseRipgrepGroups(input: string): ParsedGroup[] | null {
  if (input.length === 0 || input.includes("\r")) {
    return null;
  }

  const lines = lineRecords(input);
  if (lines.length < 2) {
    return null;
  }

  const matches: ParsedMatch[] = [];
  for (const line of lines) {
    if (line.text.length === 0) {
      return null;
    }

    const parsed = parseMatchLine(line);
    if (parsed === null) {
      return null;
    }
    matches.push(parsed);
  }

  const groups: {
    path: string;
    pathSpan: ByteSpan;
    matches: ByteSpan[];
  }[] = [];
  const closedPaths = new Set<string>();
  let current:
    | {
        path: string;
        pathSpan: ByteSpan;
        matches: ByteSpan[];
      }
    | undefined;

  for (const match of matches) {
    if (current === undefined || current.path !== match.path) {
      if (current !== undefined) {
        closedPaths.add(current.path);
      }
      if (closedPaths.has(match.path)) {
        return null;
      }
      current = {
        path: match.path,
        pathSpan: match.pathSpan,
        matches: [],
      };
      groups.push(current);
    }
    current.matches.push(match.suffixSpan);
  }

  if (!groups.some((group) => group.matches.length >= 2)) {
    return null;
  }

  return groups.map((group) =>
    Object.freeze({
      path: group.path,
      pathSpan: Object.freeze({ ...group.pathSpan }),
      matches: Object.freeze(
        group.matches.map((span) => Object.freeze({ ...span })),
      ),
    }),
  );
}

function parseMatchLine(line: LineRecord): ParsedMatch | null {
  const match = /^([^:\n]+):([1-9][0-9]*):(.*)$/u.exec(line.text);
  const path = match?.[1];
  const lineNumber = match?.[2];
  if (path === undefined || lineNumber === undefined || path.length === 0) {
    return null;
  }

  const pathBytes = Buffer.byteLength(path, "utf8");
  const suffixStart = line.startByte + pathBytes + 1;
  if (suffixStart >= line.endByte) {
    return null;
  }

  return {
    path,
    pathSpan: {
      start_byte: line.startByte,
      end_byte: line.startByte + pathBytes,
    },
    suffixSpan: {
      start_byte: suffixStart,
      end_byte: line.endByte,
    },
  };
}

function lineRecords(input: string): LineRecord[] {
  const records: LineRecord[] = [];
  let codeUnitOffset = 0;
  let byteOffset = 0;

  while (codeUnitOffset < input.length) {
    const newline = input.indexOf("\n", codeUnitOffset);
    const chunkEnd = newline < 0 ? input.length : newline + 1;
    const chunk = input.slice(codeUnitOffset, chunkEnd);
    const content = chunk.endsWith("\n") ? chunk.slice(0, -1) : chunk;
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

function ripgrepAnalysis(value: unknown): RipgrepAnalysis {
  if (
    typeof value !== "object" ||
    value === null ||
    !("groups" in value) ||
    !Array.isArray(value.groups)
  ) {
    throw new Error("invalid ripgrep analysis");
  }
  return value as RipgrepAnalysis;
}
