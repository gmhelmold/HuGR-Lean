import type { InvocationIdentity } from "./command.js";
import {
  createCanonicalizedSignal,
  createDerivedCount,
  createDerivedCountSignal,
  createOutcomeSignal,
  createVerbatimSignal,
  type ByteSpan,
  type CanonicalizationRule,
  type DerivedEvidence,
  LeanWriter,
  type OutcomeField,
  PreservationContract,
  type RenderedOutput,
  type Signal,
  type SignalId,
} from "./preservation.js";
import type { ObservationV1 } from "./types.js";

export type ProfileMatch = "no_match" | "match";
export type CompletenessRequirement = "any" | "complete";
export type TerminationRequirement = "any" | "exited";
export type BoundaryAssumption =
  | "native_text"
  | "structured_text"
  | "rewrite_dependent";

export interface ProfileRequirements {
  completeness: CompletenessRequirement;
  termination: TerminationRequirement;
}

export const ANY_REQUIREMENTS: ProfileRequirements = {
  completeness: "any",
  termination: "any",
};

export const COMPLETE_EXITED: ProfileRequirements = {
  completeness: "complete",
  termination: "exited",
};

export interface ProfileDescriptor {
  id: string;
  family: string;
  fixture_family: string;
  boundary_assumption: BoundaryAssumption;
}

export interface RouteContext {
  observation: ObservationV1;
  identity: InvocationIdentity;
  safe_baseline: string;
}

export class ProfileContext {
  constructor(
    readonly observation: ObservationV1,
    readonly identity: InvocationIdentity,
    readonly safe_baseline: string,
  ) {}

  verbatimSignal(id: SignalId, span: ByteSpan): Signal {
    return createVerbatimSignal(id, this.safe_baseline, span);
  }

  canonicalizedSignal(
    id: SignalId,
    span: ByteSpan,
    rule: CanonicalizationRule,
  ): Signal {
    return createCanonicalizedSignal(id, this.safe_baseline, span, rule);
  }

  outcomeSignal(id: SignalId, field: OutcomeField): Signal {
    return createOutcomeSignal(id, field, this.observation);
  }

  derivedCountSignal(
    id: SignalId,
    ruleId: string,
    spans: ByteSpan[],
  ): Signal {
    return createDerivedCountSignal(id, ruleId, this.safe_baseline, spans);
  }

  derivedCount(
    ruleId: string,
    spans: ByteSpan[],
  ): DerivedEvidence {
    return createDerivedCount(ruleId, this.safe_baseline, spans);
  }
}

export interface AnalysisBundle {
  data: unknown;
  preservation: PreservationContract;
}

export interface Profile {
  descriptor(): ProfileDescriptor;
  requirements?(): ProfileRequirements;
  recognize(identity: InvocationIdentity): ProfileMatch;
  shapeGuard?(context: RouteContext): ProfileMatch;
  analyze(context: ProfileContext): AnalysisBundle;
  render(analysis: unknown, writer: LeanWriter): void;
  validate?(analysis: unknown, rendered: RenderedOutput): void;
}

export class ProfileRegistryError extends Error {
  override readonly name = "ProfileRegistryError";
}

export interface RegisteredProfile {
  readonly descriptor: Readonly<ProfileDescriptor>;
  readonly profile: Profile;
}

export class ProfileRegistry {
  readonly #profiles: RegisteredProfile[];

  constructor(profiles: Profile[] = []) {
    const ids = new Set<string>();
    this.#profiles = profiles.map((profile) => {
      const descriptor = Object.freeze({ ...profile.descriptor() });
      validateDescriptor(descriptor);

      if (ids.has(descriptor.id)) {
        throw new ProfileRegistryError(
          `duplicate profile id: ${descriptor.id}`,
        );
      }
      ids.add(descriptor.id);

      return Object.freeze({ descriptor, profile });
    });
  }

  get size(): number {
    return this.#profiles.length;
  }

  entries(): readonly RegisteredProfile[] {
    return this.#profiles;
  }
}

export function checkRequirements(
  requirements: ProfileRequirements,
  observation: ObservationV1,
): "incomplete_input" | "termination_not_exited" | null {
  if (
    requirements.completeness === "complete" &&
    observation.completeness !== "complete"
  ) {
    return "incomplete_input";
  }

  if (
    requirements.termination === "exited" &&
    observation.termination.kind !== "exited"
  ) {
    return "termination_not_exited";
  }

  return null;
}

function validateDescriptor(descriptor: ProfileDescriptor): void {
  validateComponent(descriptor.id, "profile id");
  validateComponent(descriptor.family, "profile family");
  validateComponent(descriptor.fixture_family, "fixture family");

  if (descriptor.boundary_assumption === "rewrite_dependent") {
    throw new ProfileRegistryError(
      `rewrite-dependent profile rejected: ${descriptor.id}`,
    );
  }
}

function validateComponent(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(value)) {
    throw new ProfileRegistryError(`invalid ${label}: ${value}`);
  }
}
