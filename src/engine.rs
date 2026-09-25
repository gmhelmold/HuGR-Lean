//! Host-independent HuGR-Lean routing and fail-open pipeline.

use crate::command::identify_invocation;
use crate::normalize::{safe_normalize, SafeNormalizationError, SafeNormalizationOutcome};
use crate::preservation::LeanWriter;
use crate::profile::{
    Profile, ProfileContext, ProfileMatch, ProfileRegistry, ProfileRegistryError, ProfileStage,
    RequirementFailure, RouteContext,
};
use crate::protocol::{
    DecisionV1, DiagnosticCodeV1, FilterResultV1, MetricsV1, ObservationV1, ProtocolError,
    PROTOCOL_V1,
};

pub const MIN_INPUT_BYTES: usize = 1024 * 1024;
pub const DEFAULT_MAX_INPUT_BYTES: usize = 4 * 1024 * 1024;
pub const HARD_MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EngineConfig {
    pub max_input_bytes: usize,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            max_input_bytes: DEFAULT_MAX_INPUT_BYTES,
        }
    }
}

impl EngineConfig {
    pub fn validate(&self) -> Result<(), EngineConfigError> {
        if !(MIN_INPUT_BYTES..=HARD_MAX_INPUT_BYTES).contains(&self.max_input_bytes) {
            return Err(EngineConfigError::MaxInputBytesOutOfRange {
                received: self.max_input_bytes,
            });
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineConfigError {
    MaxInputBytesOutOfRange { received: usize },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineBuildError {
    Config(EngineConfigError),
    Registry(ProfileRegistryError),
}

impl From<EngineConfigError> for EngineBuildError {
    fn from(error: EngineConfigError) -> Self {
        Self::Config(error)
    }
}

impl From<ProfileRegistryError> for EngineBuildError {
    fn from(error: ProfileRegistryError) -> Self {
        Self::Registry(error)
    }
}

#[derive(Default)]
pub struct Engine {
    config: EngineConfig,
    profiles: ProfileRegistry,
}

impl Engine {
    pub fn new(
        config: EngineConfig,
        profiles: Vec<Box<dyn Profile>>,
    ) -> Result<Self, EngineBuildError> {
        config.validate()?;
        let profiles = ProfileRegistry::new(profiles)?;
        Ok(Self { config, profiles })
    }

    pub fn process(&self, observation: ObservationV1) -> Result<FilterResultV1, ProtocolError> {
        self.process_with_normalizer(observation, safe_normalize)
    }

    fn process_with_normalizer<N>(
        &self,
        observation: ObservationV1,
        normalizer: N,
    ) -> Result<FilterResultV1, ProtocolError>
    where
        N: FnOnce(&ObservationV1) -> Result<SafeNormalizationOutcome, SafeNormalizationError>,
    {
        observation.validate()?;

        if observation.output.len() > self.config.max_input_bytes {
            return checked(failed_open(
                observation.output.len(),
                Some(DiagnosticCodeV1::InputTooLarge),
            ));
        }

        let normalization = match normalizer(&observation) {
            Ok(normalization) => normalization,
            Err(_) => {
                return checked(failed_open(
                    observation.output.len(),
                    Some(DiagnosticCodeV1::SafeNormalizationFailed),
                ));
            }
        };

        let safe_baseline = match &normalization {
            SafeNormalizationOutcome::Changed(text) => text.as_str(),
            SafeNormalizationOutcome::NotApplicable | SafeNormalizationOutcome::Unchanged => {
                observation.output.as_str()
            }
        };

        let identity = identify_invocation(&observation);
        let route_context = RouteContext {
            observation: &observation,
            identity: &identity,
            safe_baseline,
        };

        let mut matches = self.profiles.iter().filter(|profile| {
            profile.recognize(&identity) == ProfileMatch::Match
                && profile.shape_guard(&route_context) == ProfileMatch::Match
        });

        let Some(profile) = matches.next() else {
            return checked(baseline_result(observation.output.len(), &normalization));
        };

        if matches.next().is_some() {
            return checked(failed_open(
                observation.output.len(),
                Some(DiagnosticCodeV1::AmbiguousProfile),
            ));
        }

        if let Err(failure) = profile.requirements().check(&observation) {
            let diagnostic = match failure {
                RequirementFailure::IncompleteInput => DiagnosticCodeV1::IncompleteInput,
                RequirementFailure::TerminationNotExited => match observation.termination.kind {
                    crate::protocol::TerminationKindV1::Unknown => {
                        DiagnosticCodeV1::UnknownTermination
                    }
                    crate::protocol::TerminationKindV1::Aborted
                    | crate::protocol::TerminationKindV1::TimedOut => {
                        DiagnosticCodeV1::TerminationNotExited
                    }
                    crate::protocol::TerminationKindV1::Exited => {
                        unreachable!("exited termination satisfies the exited profile requirement")
                    }
                },
            };
            return checked(failed_open(observation.output.len(), Some(diagnostic)));
        }

        let context = ProfileContext {
            observation: &observation,
            identity: &identity,
            safe_baseline,
        };

        let analysis = match profile.analyze(&context) {
            Ok(analysis) => analysis,
            Err(_) => {
                return checked(failed_open(
                    observation.output.len(),
                    Some(DiagnosticCodeV1::ProfileParseFailed),
                ));
            }
        };

        let mut writer = LeanWriter::new();
        if profile.render(analysis.data(), &mut writer).is_err() {
            return checked(failed_open(
                observation.output.len(),
                Some(DiagnosticCodeV1::ProfileParseFailed),
            ));
        }
        let rendered = writer.finish();

        if analysis.preservation().validate(&rendered).is_err() {
            return checked(failed_open(
                observation.output.len(),
                Some(DiagnosticCodeV1::PreservationFailed),
            ));
        }

        if let Err(error) = profile.validate(analysis.data(), &rendered) {
            let diagnostic = match error.stage {
                ProfileStage::Validate => DiagnosticCodeV1::PreservationFailed,
                ProfileStage::Analyze | ProfileStage::Render => {
                    DiagnosticCodeV1::ProfileParseFailed
                }
            };
            return checked(failed_open(observation.output.len(), Some(diagnostic)));
        }

        if rendered.text().len() >= safe_baseline.len() {
            return checked(baseline_result(observation.output.len(), &normalization));
        }

        checked(reduced(
            observation.output.len(),
            rendered.into_text(),
            profile.id(),
        ))
    }
}

fn baseline_result(input_bytes: usize, normalization: &SafeNormalizationOutcome) -> FilterResultV1 {
    match normalization {
        SafeNormalizationOutcome::Changed(replacement) => {
            normalized(input_bytes, replacement.clone())
        }
        SafeNormalizationOutcome::NotApplicable | SafeNormalizationOutcome::Unchanged => {
            FilterResultV1::passthrough(input_bytes)
        }
    }
}

fn failed_open(input_bytes: usize, diagnostic: Option<DiagnosticCodeV1>) -> FilterResultV1 {
    let bytes = to_u64(input_bytes);
    FilterResultV1 {
        schema_version: PROTOCOL_V1,
        decision: DecisionV1::FailedOpen,
        replacement: None,
        profile: None,
        metrics: MetricsV1 {
            input_bytes: bytes,
            output_bytes: bytes,
            saved_bytes: 0,
        },
        raw_ref: None,
        diagnostics: diagnostic.into_iter().collect(),
    }
}

fn normalized(input_bytes: usize, replacement: String) -> FilterResultV1 {
    let input_bytes = to_u64(input_bytes);
    let output_bytes = to_u64(replacement.len());

    FilterResultV1 {
        schema_version: PROTOCOL_V1,
        decision: DecisionV1::Normalized,
        replacement: Some(replacement),
        profile: None,
        metrics: MetricsV1 {
            input_bytes,
            output_bytes,
            saved_bytes: input_bytes.saturating_sub(output_bytes),
        },
        raw_ref: None,
        diagnostics: Vec::new(),
    }
}

fn reduced(input_bytes: usize, replacement: String, profile: &'static str) -> FilterResultV1 {
    let input_bytes = to_u64(input_bytes);
    let output_bytes = to_u64(replacement.len());

    FilterResultV1 {
        schema_version: PROTOCOL_V1,
        decision: DecisionV1::Reduced,
        replacement: Some(replacement),
        profile: Some(profile.to_owned()),
        metrics: MetricsV1 {
            input_bytes,
            output_bytes,
            saved_bytes: input_bytes.saturating_sub(output_bytes),
        },
        raw_ref: None,
        diagnostics: Vec::new(),
    }
}

fn to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

fn checked(result: FilterResultV1) -> Result<FilterResultV1, ProtocolError> {
    result.validate()?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{
        CompletenessV1, PresentationV1, ShellDialectV1, SourceV1, TerminationV1,
    };

    fn terminal_observation(output: &str) -> ObservationV1 {
        ObservationV1 {
            schema_version: PROTOCOL_V1,
            source: SourceV1::Other,
            command: None,
            shell_dialect: ShellDialectV1::Unknown,
            output: output.to_owned(),
            termination: TerminationV1::unknown(),
            completeness: CompletenessV1::Complete,
            presentation: PresentationV1::TerminalRendered,
        }
    }

    #[test]
    fn normalization_failure_fails_open_to_adapter_owned_original() {
        let observation = terminal_observation("\u{1b}[31mred\u{1b}[0m");
        let input_bytes = observation.output.len();

        let result = Engine::default()
            .process_with_normalizer(observation, |_| Err(SafeNormalizationError::NonIdempotent))
            .unwrap();

        assert_eq!(result.decision, DecisionV1::FailedOpen);
        assert_eq!(result.replacement, None);
        assert_eq!(
            result.diagnostics,
            vec![DiagnosticCodeV1::SafeNormalizationFailed]
        );
        assert_eq!(result.metrics.input_bytes, input_bytes as u64);
        assert_eq!(result.metrics.output_bytes, input_bytes as u64);
        assert_eq!(result.metrics.saved_bytes, 0);
    }
}
