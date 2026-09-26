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

interface SearchMatch {
  readonly path: ByteSpan;
  readonly tail: ByteSpan;
}

interface SearchGroup {
  readonly path: Signal;
  readonly matches: readonly Signal[];
}

interface SearchAnalysis {
  readonly groups: readonly SearchGroup[];
}

interface LineRecord {
  readonly text: string;
  readonly startByte: number;
  readonly endByte: number;
}

export class FileLineSearchProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: "file-line-search",
      family: "search",
      fixture_family: "filesystem-search",
      boundary_assumption: "native_text",
    };
  }

  requirements() {
    return COMPLETE_EXITED;
  }

  recognize(identity: InvocationIdentity): ProfileMatch {
    return matchesExplicitFileLineSearch(identity) ? "match" : "no_match";
  }

  shapeGuard(context: RouteContext): ProfileMatch {
    const parsed = parseFileLineSearch(context.safe_baseline);
    return parsed !== null && parsed.some((group) => group.length > 1)
      ? "match"
      : "no_match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const parsed = parseFileLineSearch(context.safe_baseline);
    if (parsed === null || !parsed.some((group) => group.length > 1)) {
      throw new Error("unsupported or non-beneficial file-line search shape");
    }

    const groups = parsed.map((matches, groupIndex) => {
      const first = matches[0];
      if (first === undefined) {
        throw new Error("empty search group");
      }

      const path = context.verbatimSignal(
        signalId("search-path-" + String(groupIndex)),
        first.path,
      );
      const tails = matches.map((match, matchIndex) =>
        context.verbatimSignal(
          signalId(
            "search-match-" + String(groupIndex) + "-" + String(matchIndex),
          ),
          match.tail,
        ),
      );

      return Object.freeze({ path, matches: Object.freeze(tails) });
    });

    const required = groups.flatMap((group) => [
      group.path.id,
      ...group.matches.map((signal) => signal.id),
    ]);

    return {
      data: Object.freeze({ groups: Object.freeze(groups) }) satisfies SearchAnalysis,
      preservation: new PreservationContract(required),
    };
  }

  render(analysis: unknown, writer: LeanWriter): void {
    const parsed = searchAnalysis(analysis);

    parsed.groups.forEach((group, groupIndex) => {
      if (groupIndex > 0) {
        writer.newline();
      }
      writer.signal(group.path);
      writer.staticLine(":");
      for (const match of group.matches) {
        writer.signalLine(match);
      }
    });
  }

  validate(analysis: unknown, rendered: RenderedOutput): void {
    const parsed = searchAnalysis(analysis);
    for (const group of parsed.groups) {
      if (!rendered.text.includes(group.path.canonical_text)) {
        throw new Error("search rendering lost path evidence");
      }
      for (const match of group.matches) {
        if (!rendered.text.includes(match.canonical_text)) {
          throw new Error("search rendering lost match evidence");
        }
      }
    }
  }
}

export function filesystemSearchProfiles(): Profile[] {
  return [new FileLineSearchProfile()];
}

function matchesExplicitFileLineSearch(identity: InvocationIdentity): boolean {
  if (
    identity.kind !== "shell" ||
    identity.recognition.kind !== "direct"
  ) {
    return false;
  }

  const command = identity.recognition.identity;
  if (command.program !== "grep" && command.program !== "rg") {
    return false;
  }

  if (hasUnsupportedSearchOutputMode(command.args)) {
    return false;
  }

  return (
    hasFlag(command.args, "n", "--line-number") &&
    hasFlag(command.args, "H", "--with-filename")
  );
}

function hasFlag(
  args: readonly string[],
  short: string,
  long: string,
): boolean {
  return args.some((arg) => {
    if (arg === long || arg === "-" + short) {
      return true;
    }
    return (
      arg.startsWith("-") &&
      !arg.startsWith("--") &&
      arg.slice(1).includes(short)
    );
  });
}

function hasUnsupportedSearchOutputMode(args: readonly string[]): boolean {
  return args.some((arg) => {
    if (
      arg === "--json" ||
      arg === "--heading" ||
      arg === "--column" ||
      arg === "--vimgrep" ||
      arg === "--null" ||
      arg === "-0" ||
      arg === "--null-data" ||
      arg === "-z"
    ) {
      return true;
    }

    if (
      arg === "-A" ||
      arg === "-B" ||
      arg === "-C" ||
      /^-[ABC]\d+$/u.test(arg) ||
      arg.startsWith("--after-context") ||
      arg.startsWith("--before-context") ||
      arg.startsWith("--context")
    ) {
      return true;
    }

    return (
      arg === "--color" ||
      arg === "--colour" ||
      arg === "--color=always" ||
      arg === "--colour=always"
    );
  });
}

function parseFileLineSearch(input: string): SearchMatch[][] | null {
  const lines = lineRecords(input);
  if (lines.length === 0) {
    return null;
  }

  const groups: SearchMatch[][] = [];
  let currentPath: string | null = null;

  for (const line of lines) {
    if (line.text.length === 0) {
      return null;
    }

    const parsed = parseFileLine(line);
    if (parsed === null) {
      return null;
    }

    if (parsed.pathText !== currentPath) {
      groups.push([]);
      currentPath = parsed.pathText;
    }

    const group = groups.at(-1);
    if (group === undefined) {
      return null;
    }
    group.push({ path: parsed.path, tail: parsed.tail });
  }

  return groups;
}

function parseFileLine(
  line: LineRecord,
): { readonly pathText: string; readonly path: ByteSpan; readonly tail: ByteSpan } | null {
  const delimiters: Array<{
    readonly colonStart: number;
    readonly tailStart: number;
  }> = [];

  const pattern = /:(\d+):/gu;
  for (const match of line.text.matchAll(pattern)) {
    if (match.index === undefined) {
      return null;
    }

    const digits = match[1];
    if (digits === undefined) {
      return null;
    }

    const lineNumber = Number(digits);
    if (!Number.isSafeInteger(lineNumber) || lineNumber <= 0) {
      return null;
    }

    delimiters.push({
      colonStart: match.index,
      tailStart: match.index + 1,
    });
  }

  if (delimiters.length !== 1) {
    return null;
  }

  const delimiter = delimiters[0];
  if (delimiter === undefined || delimiter.colonStart === 0) {
    return null;
  }

  const pathText = line.text.slice(0, delimiter.colonStart);
  const pathBytes = Buffer.byteLength(pathText, "utf8");
  const prefixBeforeTail = line.text.slice(0, delimiter.tailStart);
  const tailStartBytes = Buffer.byteLength(prefixBeforeTail, "utf8");

  return {
    pathText,
    path: {
      start_byte: line.startByte,
      end_byte: line.startByte + pathBytes,
    },
    tail: {
      start_byte: line.startByte + tailStartBytes,
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

function searchAnalysis(value: unknown): SearchAnalysis {
  if (
    typeof value !== "object" ||
    value === null ||
    !("groups" in value) ||
    !Array.isArray(value.groups)
  ) {
    throw new Error("invalid search analysis");
  }

  return value as SearchAnalysis;
}
