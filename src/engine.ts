import { identifyInvocation } from "./command.js";
import { safeNormalize } from "./normalize.js";
import { LeanWriter, PreservationError } from "./preservation.js";
import {
  ANY_REQUIREMENTS,
  checkRequirements,
  ProfileContext,
  ProfileRegistry,
  ProfileRegistryError,
  type Profile,
} from "./profile.js";
import {
  PROTOCOL_V1,
  ProtocolError,
  passthroughResult,
  type DiagnosticCodeV1,
  type FilterResultV1,
  type ObservationV1,
  utf8Bytes,
  validateFilterResultV1,
  validateObservationV1,
} from "./types.js";

export const MIN_INPUT_BYTES = 1024 * 1024;
export const DEFAULT_MAX_INPUT_BYTES = 4 * 1024 * 1024;
export const HARD_MAX_INPUT_BYTES = 16 * 1024 * 1024;

export interface EngineConfig {
  max_input_bytes: number;
}

export class EngineBuildError extends Error {
  override readonly name = "EngineBuildError";
}

export class Engine {
  readonly #config: EngineConfig;
  readonly #profiles: ProfileRegistry;

  constructor(
    config: EngineConfig = { max_input_bytes: DEFAULT_MAX_INPUT_BYTES },
    profiles: Profile[] = [],
  ) {
    if (
      !Number.isInteger(config.max_input_bytes) ||
      config.max_input_bytes < MIN_INPUT_BYTES ||
      config.max_input_bytes > HARD_MAX_INPUT_BYTES
    ) {
      throw new EngineBuildError("max_input_bytes outside supported bounds");
    }

    this.#config = { ...config };
    try {
      this.#profiles = new ProfileRegistry(profiles);
    } catch (error) {
      if (error instanceof ProfileRegistryError) {
        throw new EngineBuildError(error.message, { cause: error });
      }
      throw error;
    }
  }

  process(observation: ObservationV1): FilterResultV1 {
    validateObservationV1(observation);

    const inputBytes = utf8Bytes(observation.output);
    if (inputBytes > this.#config.max_input_bytes) {
      return checked(failedOpen(observation.output, "input_too_large"));
    }

    let normalization: ReturnType<typeof safeNormalize>;
    try {
      normalization = safeNormalize(observation);
    } catch {
      return checked(
        failedOpen(observation.output, "safe_normalization_failed"),
      );
    }

    const safeBaseline =
      normalization.kind === "changed"
        ? normalization.text
        : observation.output;

    const identity = identifyInvocation(observation);
    const routeContext = {
      observation,
      identity,
      safe_baseline: safeBaseline,
    };

    const matches: ReturnType<ProfileRegistry["entries"]>[number][] = [];
    try {
      for (const registered of this.#profiles.entries()) {
        const profile = registered.profile;
        if (
          profile.recognize(identity) === "match" &&
          (profile.shapeGuard?.(routeContext) ?? "match") === "match"
        ) {
          matches.push(registered);
        }
      }
    } catch {
      return checked(failedOpen(observation.output, "profile_parse_failed"));
    }

    if (matches.length === 0) {
      return checked(baselineResult(observation.output, normalization));
    }

    if (matches.length > 1) {
      return checked(failedOpen(observation.output, "ambiguous_profile"));
    }

    const registered = matches[0];
    if (registered === undefined) {
      return checked(baselineResult(observation.output, normalization));
    }

    const profile = registered.profile;
    let requirementFailure: ReturnType<typeof checkRequirements>;
    try {
      const requirements = profile.requirements?.() ?? ANY_REQUIREMENTS;
      requirementFailure = checkRequirements(requirements, observation);
    } catch {
      return checked(failedOpen(observation.output, "profile_parse_failed"));
    }
    if (requirementFailure === "incomplete_input") {
      return checked(failedOpen(observation.output, "incomplete_input"));
    }
    if (requirementFailure === "termination_not_exited") {
      const diagnostic: DiagnosticCodeV1 =
        observation.termination.kind === "unknown"
          ? "unknown_termination"
          : "termination_not_exited";
      return checked(failedOpen(observation.output, diagnostic));
    }

    const context = new ProfileContext(observation, identity, safeBaseline);

    let analysis: ReturnType<Profile["analyze"]>;
    try {
      analysis = profile.analyze(context);
    } catch {
      return checked(failedOpen(observation.output, "profile_parse_failed"));
    }

    const writer = new LeanWriter();
    try {
      profile.render(analysis.data, writer);
    } catch {
      return checked(failedOpen(observation.output, "profile_parse_failed"));
    }

    const rendered = writer.finish();
    try {
      analysis.preservation.validate(rendered);
      profile.validate?.(analysis.data, rendered);
    } catch (error) {
      if (error instanceof PreservationError || error instanceof Error) {
        return checked(failedOpen(observation.output, "preservation_failed"));
      }
      return checked(failedOpen(observation.output, "preservation_failed"));
    }

    if (utf8Bytes(rendered.text) >= utf8Bytes(safeBaseline)) {
      return checked(baselineResult(observation.output, normalization));
    }

    return checked(
      reducedResult(
        observation.output,
        rendered.text,
        registered.descriptor.id,
      ),
    );
  }
}

function baselineResult(
  original: string,
  normalization: ReturnType<typeof safeNormalize>,
): FilterResultV1 {
  return normalization.kind === "changed"
    ? normalizedResult(original, normalization.text)
    : passthroughResult(original);
}

function failedOpen(
  input: string,
  diagnostic: DiagnosticCodeV1,
): FilterResultV1 {
  const bytes = utf8Bytes(input);
  return {
    schema_version: PROTOCOL_V1,
    decision: "failed_open",
    replacement: null,
    profile: null,
    metrics: {
      input_bytes: bytes,
      output_bytes: bytes,
      saved_bytes: 0,
    },
    raw_ref: null,
    diagnostics: [diagnostic],
  };
}

function normalizedResult(
  original: string,
  replacement: string,
): FilterResultV1 {
  return changedResult("normalized", original, replacement, null);
}

function reducedResult(
  original: string,
  replacement: string,
  profile: string,
): FilterResultV1 {
  return changedResult("reduced", original, replacement, profile);
}

function changedResult(
  decision: "normalized" | "reduced",
  original: string,
  replacement: string,
  profile: string | null,
): FilterResultV1 {
  const inputBytes = utf8Bytes(original);
  const outputBytes = utf8Bytes(replacement);
  return {
    schema_version: PROTOCOL_V1,
    decision,
    replacement,
    profile,
    metrics: {
      input_bytes: inputBytes,
      output_bytes: outputBytes,
      saved_bytes: inputBytes - outputBytes,
    },
    raw_ref: null,
    diagnostics: [],
  };
}

function checked(result: FilterResultV1): FilterResultV1 {
  try {
    validateFilterResultV1(result);
  } catch (error) {
    if (error instanceof ProtocolError) {
      throw error;
    }
    throw error;
  }
  return result;
}
