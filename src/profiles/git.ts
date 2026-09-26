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

interface GitStatusAnalysis {
  readonly lines: readonly Signal[];
}

interface LineRecord {
  readonly text: string;
  readonly startByte: number;
  readonly endByte: number;
}

const SECTION_HEADERS = new Set([
  "Changes to be committed:",
  "Changes not staged for commit:",
  "Untracked files:",
  "Unmerged paths:",
]);

const KNOWN_HINT_LINES = new Set([
  '  (use "git restore --staged <file>..." to unstage)',
  '  (use "git add <file>..." to update what will be committed)',
  '  (use "git restore <file>..." to discard changes in working directory)',
  '  (use "git add <file>..." to include in what will be committed)',
  '  (fix conflicts and run "git commit")',
  '  (use "git merge --abort" to abort the merge)',
  '  (use "git add <file>..." to mark resolution)',
  '  (use "git push" to publish your local commits)',
  '  (use "git pull" to update your local branch)',
]);

export class GitStatusProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: "git-status",
      family: "git",
      fixture_family: "git-status",
      boundary_assumption: "native_text",
    };
  }

  requirements() {
    return COMPLETE_EXITED;
  }

  recognize(identity: InvocationIdentity): ProfileMatch {
    return matchesPlainGitStatus(identity) ? "match" : "no_match";
  }

  shapeGuard(context: RouteContext): ProfileMatch {
    return parseGitStatus(context.safe_baseline) === null ? "no_match" : "match";
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const spans = parseGitStatus(context.safe_baseline);
    if (spans === null) {
      throw new Error("unsupported git status output shape");
    }

    const lines = spans.map((span, index) =>
      context.verbatimSignal(signalId("git-status-line-" + String(index)), span),
    );

    return {
      data: Object.freeze({ lines }) satisfies GitStatusAnalysis,
      preservation: new PreservationContract(lines.map((signal) => signal.id)),
    };
  }

  render(analysis: unknown, writer: LeanWriter): void {
    for (const signal of gitStatusAnalysis(analysis).lines) {
      writer.signalLine(signal);
    }
  }

  validate(analysis: unknown, rendered: RenderedOutput): void {
    const parsed = gitStatusAnalysis(analysis);
    for (const signal of parsed.lines) {
      if (!rendered.text.includes(signal.canonical_text)) {
        throw new Error("git status rendered output lost required evidence");
      }
    }
  }
}

export function gitProfiles(): Profile[] {
  return [new GitStatusProfile()];
}

function matchesPlainGitStatus(identity: InvocationIdentity): boolean {
  return (
    identity.kind === "shell" &&
    identity.recognition.kind === "direct" &&
    identity.recognition.identity.program === "git" &&
    identity.recognition.identity.args.length === 1 &&
    identity.recognition.identity.args[0] === "status"
  );
}

function parseGitStatus(input: string): ByteSpan[] | null {
  const lines = lineRecords(input);
  if (lines.length === 0) {
    return null;
  }

  let index = 0;
  const kept: ByteSpan[] = [];
  const droppedHints = new Set<string>();

  const first = lines[index];
  if (
    first === undefined ||
    (!/^On branch .+$/u.test(first.text) &&
      !/^HEAD detached at .+$/u.test(first.text))
  ) {
    return null;
  }
  kept.push(spanOf(first));
  index += 1;

  const tracking = lines[index];
  if (tracking !== undefined && isBranchTrackingLine(tracking.text)) {
    kept.push(spanOf(tracking));
    index += 1;
  }

  const mergeState = lines[index];
  if (mergeState !== undefined && mergeState.text === "You have unmerged paths.") {
    kept.push(spanOf(mergeState));
    index += 1;
  }

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) {
      return null;
    }

    if (line.text.length === 0) {
      index += 1;
      continue;
    }

    if (shouldDropKnownHint(line.text, droppedHints)) {
      index += 1;
      continue;
    }

    if (SECTION_HEADERS.has(line.text)) {
      kept.push(spanOf(line));
      index += 1;

      let entries = 0;
      while (index < lines.length) {
        const entry = lines[index];
        if (entry === undefined) {
          return null;
        }

        if (entry.text.length === 0) {
          index += 1;
          break;
        }
        if (shouldDropKnownHint(entry.text, droppedHints)) {
          index += 1;
          continue;
        }
        if (SECTION_HEADERS.has(entry.text) || isFinalStatusLine(entry.text)) {
          break;
        }
        if (!/^\s{2,}\S/u.test(entry.text)) {
          return null;
        }

        kept.push(spanOf(entry));
        entries += 1;
        index += 1;
      }

      if (entries === 0) {
        return null;
      }
      continue;
    }

    if (isFinalStatusLine(line.text)) {
      kept.push(spanOf(line));
      index += 1;
      continue;
    }

    return null;
  }

  return kept.length >= 2 ? kept : null;
}

function isBranchTrackingLine(line: string): boolean {
  return (
    /^Your branch is up to date with '.+'\.$/u.test(line) ||
    /^Your branch is ahead of '.+' by \d+ commits?\.$/u.test(line) ||
    /^Your branch is behind '.+' by \d+ commits?, and can be fast-forwarded\.$/u.test(
      line,
    ) ||
    /^Your branch and '.+' have diverged,/u.test(line)
  );
}

function shouldDropKnownHint(line: string, dropped: Set<string>): boolean {
  if (!KNOWN_HINT_LINES.has(line) || dropped.has(line)) {
    return false;
  }
  dropped.add(line);
  return true;
}

function isFinalStatusLine(line: string): boolean {
  return (
    line === "nothing to commit, working tree clean" ||
    /^no changes added to commit \(.+\)$/u.test(line)
  );
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

function spanOf(line: LineRecord): ByteSpan {
  return { start_byte: line.startByte, end_byte: line.endByte };
}

function gitStatusAnalysis(value: unknown): GitStatusAnalysis {
  if (
    typeof value !== "object" ||
    value === null ||
    !("lines" in value) ||
    !Array.isArray(value.lines)
  ) {
    throw new Error("invalid git status analysis");
  }
  return value as GitStatusAnalysis;
}
