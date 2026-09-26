import {
  LeanWriter,
  PreservationContract,
  signalId,
  type Signal,
} from "../../src/preservation.js";
import {
  COMPLETE_EXITED,
  ProfileContext,
  type AnalysisBundle,
  type Profile,
  type ProfileDescriptor,
  type RouteContext,
} from "../../src/profile.js";

export const PROVING_PROFILE_ID = "proving-profile";
export const PROOF_SIGNAL_NAME = "proof-signal";
const proofSignalId = signalId(PROOF_SIGNAL_NAME);

interface ProvingAnalysis {
  signal: Signal;
}

export class ProvingProfile implements Profile {
  descriptor(): ProfileDescriptor {
    return {
      id: PROVING_PROFILE_ID,
      family: "test",
      fixture_family: "proving",
      boundary_assumption: "native_text",
    };
  }

  requirements() {
    return COMPLETE_EXITED;
  }

  recognize(identity: Parameters<Profile["recognize"]>[0]) {
    return identity.kind === "shell" &&
      identity.recognition.kind === "direct" &&
      identity.recognition.identity.program === "hugr-lean-prove"
      ? ("match" as const)
      : ("no_match" as const);
  }

  shapeGuard(context: RouteContext) {
    return proofLineSpan(context.safe_baseline) === null
      ? ("no_match" as const)
      : ("match" as const);
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const span = proofLineSpan(context.safe_baseline);
    if (span === null) {
      throw new Error("proof line missing");
    }

    const signal = context.verbatimSignal(proofSignalId, span);
    return {
      data: { signal } satisfies ProvingAnalysis,
      preservation: PreservationContract.require(proofSignalId),
    };
  }

  render(analysis: unknown, writer: LeanWriter): void {
    const value = analysis as ProvingAnalysis;
    writer.signalLine(value.signal);
  }

  validate(analysis: unknown, rendered: ReturnType<LeanWriter["finish"]>): void {
    const value = analysis as ProvingAnalysis;
    if (
      rendered.text !== value.signal.canonical_text + "\n" ||
      !rendered.emitted_signal_ids.has(proofSignalId)
    ) {
      throw new Error("proving profile validation failed");
    }
  }
}

function proofLineSpan(input: string): { start_byte: number; end_byte: number } | null {
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

    if (content.startsWith("PROOF ")) {
      return {
        start_byte: byteOffset,
        end_byte: byteOffset + Buffer.byteLength(content, "utf8"),
      };
    }

    codeUnitOffset = chunkEnd;
    byteOffset += Buffer.byteLength(chunk, "utf8");
  }

  return null;
}
