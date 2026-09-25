use hugr_lean::command::{CommandRecognition, InvocationIdentity};
use hugr_lean::engine::{Engine, EngineConfig};
use hugr_lean::preservation::{
    ByteSpan, LeanWriter, PreservationContract, RenderedOutput, Signal, SignalId,
};
use hugr_lean::profile::{
    AnalysisBundle, BoundaryAssumption, Profile, ProfileAnalysis, ProfileContext,
    ProfileDescriptor, ProfileError, ProfileMatch, RouteContext,
};
use hugr_lean::protocol::{
    CompletenessV1, DecisionV1, DiagnosticCodeV1, ObservationV1, PresentationV1, ShellDialectV1,
    SourceV1, TerminationV1, PROTOCOL_V1,
};

#[derive(Debug)]
struct StaticAnalysis {
    output: &'static str,
    fail_render: bool,
}

struct BaselineProfile {
    output: &'static str,
    expected_baseline: &'static str,
    fail_render: bool,
}

impl Profile for BaselineProfile {
    fn descriptor(&self) -> ProfileDescriptor {
        ProfileDescriptor::new(
            "baseline-profile",
            "test",
            "engine-normalization",
            BoundaryAssumption::NativeText,
        )
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

    fn shape_guard(&self, context: &RouteContext<'_>) -> ProfileMatch {
        if context.safe_baseline == self.expected_baseline {
            ProfileMatch::Match
        } else {
            ProfileMatch::NoMatch
        }
    }

    fn analyze(&self, _context: &ProfileContext<'_>) -> Result<AnalysisBundle, ProfileError> {
        Ok(AnalysisBundle::new(
            Box::new(StaticAnalysis {
                output: self.output,
                fail_render: self.fail_render,
            }),
            PreservationContract::default(),
        ))
    }

    fn render(
        &self,
        analysis: &dyn ProfileAnalysis,
        writer: &mut LeanWriter,
    ) -> Result<(), ProfileError> {
        let analysis = analysis
            .as_any()
            .downcast_ref::<StaticAnalysis>()
            .ok_or_else(ProfileError::render)?;

        if analysis.fail_render {
            return Err(ProfileError::render());
        }

        writer.static_text(analysis.output);
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

fn observation(presentation: PresentationV1, command: Option<&str>, output: &str) -> ObservationV1 {
    ObservationV1 {
        schema_version: PROTOCOL_V1,
        source: if command.is_some() {
            SourceV1::Shell
        } else {
            SourceV1::Other
        },
        command: command.map(str::to_owned),
        shell_dialect: ShellDialectV1::Unknown,
        output: output.to_owned(),
        termination: TerminationV1::exited(0),
        completeness: CompletenessV1::Complete,
        presentation,
    }
}

#[test]
fn default_engine_emits_normalized_result_for_terminal_sgr() {
    let input = "\u{1b}[31mred\u{1b}[0m plain\n";
    let result = Engine::default()
        .process(observation(PresentationV1::TerminalRendered, None, input))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Normalized);
    assert_eq!(result.replacement.as_deref(), Some("red plain\n"));
    assert_eq!(result.profile, None);
    assert_eq!(result.metrics.input_bytes, input.len() as u64);
    assert_eq!(result.metrics.output_bytes, "red plain\n".len() as u64);
}

#[test]
fn unknown_presentation_keeps_ansi_like_bytes_exact() {
    let input = "\u{1b}[31mred\u{1b}[0m\n";
    let result = Engine::default()
        .process(observation(PresentationV1::Unknown, None, input))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Passthrough);
    assert_eq!(result.replacement, None);
    assert_eq!(result.metrics.input_bytes, result.metrics.output_bytes);
}

#[test]
fn engine_composes_sgr_then_redraw() {
    let input = "\u{1b}[31m9%\u{1b}[0m\r\u{1b}[33m10%\u{1b}[0m\r\u{1b}[32m100%\u{1b}[0m\n";
    let result = Engine::default()
        .process(observation(PresentationV1::TerminalRendered, None, input))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Normalized);
    assert_eq!(result.replacement.as_deref(), Some("100%\n"));
}

#[test]
fn byte_identical_terminal_normalization_remains_passthrough() {
    let result = Engine::default()
        .process(observation(
            PresentationV1::TerminalRendered,
            None,
            "plain terminal text\n",
        ))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Passthrough);
    assert_eq!(result.replacement, None);
}

#[test]
fn shape_guard_receives_normalized_safe_baseline() {
    let engine = Engine::new(
        EngineConfig::default(),
        vec![Box::new(BaselineProfile {
            output: "ok",
            expected_baseline: "very noisy",
            fail_render: false,
        })],
    )
    .unwrap();

    let result = engine
        .process(observation(
            PresentationV1::TerminalRendered,
            Some("cargo test"),
            "\u{1b}[31mvery noisy\u{1b}[0m",
        ))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Reduced);
    assert_eq!(result.replacement.as_deref(), Some("ok"));
    assert_eq!(result.profile.as_deref(), Some("baseline-profile"));
}

const NORMALIZED_SIGNAL_ID: SignalId = SignalId::new("normalized-error");

struct NormalizedEvidenceAnalysis {
    signal: Signal,
}

struct NormalizedEvidenceProfile;

impl Profile for NormalizedEvidenceProfile {
    fn descriptor(&self) -> ProfileDescriptor {
        ProfileDescriptor::new(
            "normalized-evidence",
            "test",
            "engine-normalization",
            BoundaryAssumption::NativeText,
        )
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
            .verbatim_signal(
                NORMALIZED_SIGNAL_ID,
                ByteSpan::new(start, start + needle.len()),
            )
            .map_err(|_| ProfileError::analyze())?;

        Ok(AnalysisBundle::new(
            Box::new(NormalizedEvidenceAnalysis { signal }),
            PreservationContract::require(NORMALIZED_SIGNAL_ID),
        ))
    }

    fn render(
        &self,
        analysis: &dyn ProfileAnalysis,
        writer: &mut LeanWriter,
    ) -> Result<(), ProfileError> {
        let analysis = analysis
            .as_any()
            .downcast_ref::<NormalizedEvidenceAnalysis>()
            .ok_or_else(ProfileError::render)?;
        writer.signal(&analysis.signal);
        Ok(())
    }
}

#[test]
fn preservation_evidence_spans_bind_to_normalized_safe_baseline() {
    let engine = Engine::new(
        EngineConfig::default(),
        vec![Box::new(NormalizedEvidenceProfile)],
    )
    .unwrap();

    let original = "\u{1b}[31mERROR\u{1b}[0m noisy tail";
    let result = engine
        .process(observation(
            PresentationV1::TerminalRendered,
            Some("cargo test"),
            original,
        ))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Reduced);
    assert_eq!(result.replacement.as_deref(), Some("ERROR"));
    assert_eq!(result.profile.as_deref(), Some("normalized-evidence"));
}

#[test]
fn profile_that_does_not_improve_normalized_baseline_falls_back_to_normalized() {
    let engine = Engine::new(
        EngineConfig::default(),
        vec![Box::new(BaselineProfile {
            output: "very noisy",
            expected_baseline: "very noisy",
            fail_render: false,
        })],
    )
    .unwrap();

    let result = engine
        .process(observation(
            PresentationV1::TerminalRendered,
            Some("cargo test"),
            "\u{1b}[31mvery noisy\u{1b}[0m",
        ))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Normalized);
    assert_eq!(result.replacement.as_deref(), Some("very noisy"));
    assert_eq!(result.profile, None);
}

#[test]
fn profile_failure_after_normalization_fails_open_to_original() {
    let input = "\u{1b}[31mvery noisy\u{1b}[0m";
    let engine = Engine::new(
        EngineConfig::default(),
        vec![Box::new(BaselineProfile {
            output: "ok",
            expected_baseline: "very noisy",
            fail_render: true,
        })],
    )
    .unwrap();

    let result = engine
        .process(observation(
            PresentationV1::TerminalRendered,
            Some("cargo test"),
            input,
        ))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::FailedOpen);
    assert_eq!(result.replacement, None);
    assert_eq!(
        result.diagnostics,
        vec![DiagnosticCodeV1::ProfileParseFailed]
    );
    assert_eq!(result.metrics.input_bytes, input.len() as u64);
    assert_eq!(result.metrics.output_bytes, input.len() as u64);
}

#[test]
fn effective_output_is_idempotent_after_normalization() {
    let input = "\u{1b}[31mred\u{1b}[0m";
    let first = Engine::default()
        .process(observation(PresentationV1::TerminalRendered, None, input))
        .unwrap();
    let effective = first.replacement.as_deref().unwrap_or(input);

    let second = Engine::default()
        .process(observation(
            PresentationV1::TerminalRendered,
            None,
            effective,
        ))
        .unwrap();
    let second_effective = second.replacement.as_deref().unwrap_or(effective);

    assert_eq!(second_effective, effective);
    assert!(second.metrics.output_bytes <= first.metrics.output_bytes);
}
