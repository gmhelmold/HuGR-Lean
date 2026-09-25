use hugr_lean::command::{CommandRecognition, InvocationIdentity};
use hugr_lean::engine::{Engine, EngineConfig};
use hugr_lean::preservation::{
    ByteSpan, LeanWriter, OutcomeField, PreservationContract, RenderedOutput, Signal, SignalId,
};
use hugr_lean::profile::{
    AnalysisBundle, Profile, ProfileAnalysis, ProfileContext, ProfileError, ProfileMatch,
};
use hugr_lean::protocol::{
    CompletenessV1, DecisionV1, DiagnosticCodeV1, ObservationV1, PresentationV1, ShellDialectV1,
    SourceV1, TerminationV1, PROTOCOL_V1,
};

const FAILURE_ID: SignalId = SignalId::new("failure");
const EXIT_ID: SignalId = SignalId::new("exit-code");
const COUNT_ID: SignalId = SignalId::new("failure-count");

fn observation(output: &str) -> ObservationV1 {
    ObservationV1 {
        schema_version: PROTOCOL_V1,
        source: SourceV1::Shell,
        command: Some("cargo test".to_owned()),
        shell_dialect: ShellDialectV1::Unknown,
        output: output.to_owned(),
        termination: TerminationV1::exited(1),
        completeness: CompletenessV1::Complete,
        presentation: PresentationV1::Unknown,
    }
}

struct EvidenceAnalysis {
    signal: Signal,
    emit_signal: bool,
}

struct EvidenceProfile {
    emit_signal: bool,
}

impl Profile for EvidenceProfile {
    fn id(&self) -> &'static str {
        "evidence-profile"
    }

    fn recognize(&self, identity: &InvocationIdentity) -> ProfileMatch {
        match identity {
            InvocationIdentity::Shell(CommandRecognition::Direct(command))
                if command.program == "cargo" =>
            {
                ProfileMatch::Match
            }
            _ => ProfileMatch::NoMatch,
        }
    }

    fn analyze(&self, context: &ProfileContext<'_>) -> Result<AnalysisBundle, ProfileError> {
        let needle = "ERROR";
        let start = context
            .safe_baseline
            .find(needle)
            .ok_or_else(ProfileError::analyze)?;
        let signal = context
            .verbatim_signal(FAILURE_ID, ByteSpan::new(start, start + needle.len()))
            .map_err(|_| ProfileError::analyze())?;

        Ok(AnalysisBundle::new(
            Box::new(EvidenceAnalysis {
                signal,
                emit_signal: self.emit_signal,
            }),
            PreservationContract::require(FAILURE_ID),
        ))
    }

    fn render(
        &self,
        analysis: &dyn ProfileAnalysis,
        writer: &mut LeanWriter,
    ) -> Result<(), ProfileError> {
        let analysis = analysis
            .as_any()
            .downcast_ref::<EvidenceAnalysis>()
            .ok_or_else(ProfileError::render)?;

        if analysis.emit_signal {
            writer.signal(&analysis.signal);
        } else {
            writer.static_text("omitted");
        }

        Ok(())
    }

    fn validate(
        &self,
        _analysis: &dyn ProfileAnalysis,
        _rendered: &RenderedOutput,
    ) -> Result<(), ProfileError> {
        Ok(())
    }
}

#[test]
fn engine_fails_open_when_profile_omits_required_signal() {
    let engine = Engine::new(
        EngineConfig::default(),
        vec![Box::new(EvidenceProfile { emit_signal: false })],
    )
    .unwrap();

    let result = engine
        .process(observation("noise ERROR more noise"))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::FailedOpen);
    assert_eq!(result.replacement, None);
    assert_eq!(
        result.diagnostics,
        vec![DiagnosticCodeV1::PreservationFailed]
    );
}

#[test]
fn engine_reduces_when_required_signal_is_emitted() {
    let engine = Engine::new(
        EngineConfig::default(),
        vec![Box::new(EvidenceProfile { emit_signal: true })],
    )
    .unwrap();

    let result = engine
        .process(observation("noise ERROR more noise"))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Reduced);
    assert_eq!(result.replacement.as_deref(), Some("ERROR"));
    assert_eq!(result.profile.as_deref(), Some("evidence-profile"));
}

struct OutcomeAnalysis {
    signal: Signal,
}

struct OutcomeProfile;

impl Profile for OutcomeProfile {
    fn id(&self) -> &'static str {
        "outcome-profile"
    }

    fn recognize(&self, identity: &InvocationIdentity) -> ProfileMatch {
        match identity {
            InvocationIdentity::Shell(CommandRecognition::Direct(command))
                if command.program == "cargo" =>
            {
                ProfileMatch::Match
            }
            _ => ProfileMatch::NoMatch,
        }
    }

    fn analyze(&self, context: &ProfileContext<'_>) -> Result<AnalysisBundle, ProfileError> {
        let signal = context
            .outcome_signal(EXIT_ID, OutcomeField::ExitCode)
            .map_err(|_| ProfileError::analyze())?;

        Ok(AnalysisBundle::new(
            Box::new(OutcomeAnalysis { signal }),
            PreservationContract::require(EXIT_ID),
        ))
    }

    fn render(
        &self,
        analysis: &dyn ProfileAnalysis,
        writer: &mut LeanWriter,
    ) -> Result<(), ProfileError> {
        let analysis = analysis
            .as_any()
            .downcast_ref::<OutcomeAnalysis>()
            .ok_or_else(ProfileError::render)?;
        writer.signal(&analysis.signal);
        Ok(())
    }
}

#[test]
fn profile_context_binds_outcome_evidence_to_observation() {
    let engine = Engine::new(EngineConfig::default(), vec![Box::new(OutcomeProfile)]).unwrap();

    let result = engine
        .process(observation("very long failing command output"))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Reduced);
    assert_eq!(result.replacement.as_deref(), Some("exit_code=1"));
}

struct CountAnalysis {
    signal: Signal,
}

struct CountProfile;

impl Profile for CountProfile {
    fn id(&self) -> &'static str {
        "count-profile"
    }

    fn recognize(&self, identity: &InvocationIdentity) -> ProfileMatch {
        match identity {
            InvocationIdentity::Shell(CommandRecognition::Direct(command))
                if command.program == "cargo" =>
            {
                ProfileMatch::Match
            }
            _ => ProfileMatch::NoMatch,
        }
    }

    fn analyze(&self, context: &ProfileContext<'_>) -> Result<AnalysisBundle, ProfileError> {
        let first = context
            .safe_baseline
            .find("FAIL one")
            .ok_or_else(ProfileError::analyze)?;
        let second = context
            .safe_baseline
            .find("FAIL two")
            .ok_or_else(ProfileError::analyze)?;

        let signal = context
            .derived_count_signal(
                COUNT_ID,
                "count_failures",
                vec![
                    ByteSpan::new(first, first + "FAIL one".len()),
                    ByteSpan::new(second, second + "FAIL two".len()),
                ],
                "failures",
            )
            .map_err(|_| ProfileError::analyze())?;

        Ok(AnalysisBundle::new(
            Box::new(CountAnalysis { signal }),
            PreservationContract::require(COUNT_ID),
        ))
    }

    fn render(
        &self,
        analysis: &dyn ProfileAnalysis,
        writer: &mut LeanWriter,
    ) -> Result<(), ProfileError> {
        let analysis = analysis
            .as_any()
            .downcast_ref::<CountAnalysis>()
            .ok_or_else(ProfileError::render)?;
        writer.signal(&analysis.signal);
        Ok(())
    }
}

#[test]
fn profile_context_mechanically_derives_count_from_baseline_spans() {
    let engine = Engine::new(EngineConfig::default(), vec![Box::new(CountProfile)]).unwrap();

    let result = engine
        .process(observation("FAIL one\nnoise\nFAIL two\nmore noise"))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Reduced);
    assert_eq!(result.replacement.as_deref(), Some("2 failures"));
}
