export {
  Engine,
  EngineBuildError,
  DEFAULT_MAX_INPUT_BYTES,
  HARD_MAX_INPUT_BYTES,
  MIN_INPUT_BYTES,
  type EngineConfig,
} from "./engine.js";
export {
  identifyInvocation,
  recognizeShellCommand,
  type CommandIdentity,
  type CommandRecognition,
  type InvocationIdentity,
} from "./command.js";
export {
  collapseMonotonicAsciiRedraws,
  safeNormalize,
  SafeNormalizationError,
  stripRecognizedSgr,
  type SafeNormalizationOutcome,
} from "./normalize.js";
export {
  LeanWriter,
  PreservationContract,
  PreservationError,
  RenderedOutput,
  signalId,
  validateByteSpan,
  type ByteSpan,
  type CanonicalizationRule,
  type DerivedEvidence,
  type EvidenceRef,
  type OutcomeField,
  type Signal,
  type SignalId,
} from "./preservation.js";
export {
  ANY_REQUIREMENTS,
  COMPLETE_EXITED,
  ProfileRegistry,
  ProfileRegistryError,
  type AnalysisBundle,
  type BoundaryAssumption,
  type CompletenessRequirement,
  type Profile,
  type ProfileContext,
  type ProfileDescriptor,
  type ProfileMatch,
  type ProfileRequirements,
  type RouteContext,
  type TerminationRequirement,
} from "./profile.js";
export {
  CargoBuildProfile,
  CargoTestProfile,
  cargoProfiles,
} from "./profiles/cargo.js";
export {
  PytestProfile,
  pythonPytestProfiles,
} from "./profiles/pytest.js";
export {
  JestProfile,
  TscProfile,
  VitestProfile,
  jsTsProfiles,
} from "./profiles/js_ts.js";
export {
  GoTestVerboseProfile,
  goProfiles,
} from "./profiles/go.js";
export {
  GitStatusProfile,
  gitProfiles,
} from "./profiles/git.js";
export {
  RipgrepGroupedProfile,
  searchProfiles,
} from "./profiles/search.js";
export { v1Profiles } from "./profiles/index.js";
export {
  MAX_DIAGNOSTICS,
  PROTOCOL_V1,
  ProtocolError,
  exited,
  passthroughResult,
  unknownTermination,
  utf8Bytes,
  validateFilterResultV1,
  validateObservationV1,
  validateTermination,
  type CompletenessV1,
  type DecisionV1,
  type DiagnosticCodeV1,
  type FilterResultV1,
  type MetricsV1,
  type ObservationV1,
  type PresentationV1,
  type ShellDialectV1,
  type SourceV1,
  type TerminationKindV1,
  type TerminationV1,
} from "./types.js";
