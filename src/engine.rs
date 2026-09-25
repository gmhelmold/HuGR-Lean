//! Host-independent HuGR-Lean routing and fail-open pipeline.

use crate::command::identify_invocation;
use crate::preservation::LeanWriter;
use crate::profile::{
    Profile, ProfileContext, ProfileMatch, ProfileStage, RequirementFailure, RouteContext,
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

#[derive(Default)]
pub struct Engine {
    config: EngineConfig,
    profiles: Vec<Box<dyn Profile>>,
}

impl Engine {
    pub fn new(
        config: EngineConfig,
        profiles: Vec<Box<dyn Profile>>,
    ) -> Result<Self, EngineConfigError> {
        config.validate()?;
        Ok(Self { config, profiles })
    }

    pub fn process(&self, observation: ObservationV1) -> Result<FilterResultV1, ProtocolError> {
        observation.validate()?;

        if observation.output.len() > self.config.max_input_bytes {
            return checked(failed_open(
                observation.output.len(),
                Some(DiagnosticCodeV1::InputTooLarge),
            ));
        }

        // WP1.3 has no SafeNormalization implementation yet. The boundary input
        // is therefore the safe baseline. WP2 replaces this selection point
        // without changing routing/fail-open semantics.
        let safe_baseline = observation.output.as_str();
        let identity = identify_invocation(&observation);
        let route_context = RouteContext {
            observation: &observation,
            identity: &identity,
        };

        let mut matches = self.profiles.iter().filter(|profile| {
            profile.recognize(&identity) == ProfileMatch::Match
                && profile.shape_guard(&route_context) == ProfileMatch::Match
        });

        let Some(profile) = matches.next() else {
            return checked(FilterResultV1::passthrough(observation.output.len()));
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
            return checked(FilterResultV1::passthrough(observation.output.len()));
        }

        checked(reduced(
            observation.output.len(),
            rendered.into_text(),
            profile.id(),
        ))
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
