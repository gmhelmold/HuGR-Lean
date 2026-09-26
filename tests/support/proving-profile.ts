import { linePrefixSpans } from "../../src/primitive.js";
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
    return linePrefixSpans(context.safe_baseline, "PROOF ").length > 0
      ? ("match" as const)
      : ("no_match" as const);
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const span = linePrefixSpans(context.safe_baseline, "PROOF ")[0];
    if (span === undefined) {
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
