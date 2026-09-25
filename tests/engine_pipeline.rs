use hugr_lean::command::{CommandRecognition, InvocationIdentity};
use hugr_lean::engine::{
    Engine, EngineConfig, EngineConfigError, DEFAULT_MAX_INPUT_BYTES, HARD_MAX_INPUT_BYTES,
    MIN_INPUT_BYTES,
};
use hugr_lean::preservation::{LeanWriter, PreservationContract, RenderedOutput};
use hugr_lean::profile::{
    AnalysisBundle, BoundaryAssumption, CompletenessRequirement, Profile, ProfileAnalysis,
    ProfileContext, ProfileDescriptor, ProfileError, ProfileMatch, ProfileRequirements,
    RouteContext, TerminationRequirement,
};
use hugr_lean::protocol::{
    CompletenessV1, DecisionV1, DiagnosticCodeV1, ObservationV1, PresentationV1, ShellDialectV1,
    SourceV1, TerminationV1, PROTOCOL_V1,
};

#[derive(Debug)]
struct TestAnalysis {
    rendered: &'static str,
    valid: bool,
}

struct TestProfile {
    id: &'static str,
    program: &'static str,
    requirements: ProfileRequirements,
    rendered: &'static str,
    analyze_error: bool,
    render_error: bool,
    valid: bool,
}

impl TestProfile {
    fn reducing(id: &'static str, program: &'static str, rendered: &'static str) -> Self {
        Self {
            id,
            program,
            requirements: ProfileRequirements::ANY,
            rendered,
            analyze_error: false,
            render_error: false,
            valid: true,
        }
    }
}

impl Profile for TestProfile {
    fn descriptor(&self) -> ProfileDescriptor {
        ProfileDescriptor::new(
            self.id,
            "test",
            "engine-pipeline",
            BoundaryAssumption::NativeText,
        )
    }

    fn requirements(&self) -> ProfileRequirements {
        self.requirements
    }

    fn recognize(&self, identity: &InvocationIdentity) -> ProfileMatch {
        match identity {
            InvocationIdentity::Shell(CommandRecognition::Direct(identity))
                if identity.program == self.program =>
            {
                ProfileMatch::Match
            }
            _ => ProfileMatch::NoMatch,
        }
    }

    fn analyze(&self, _context: &ProfileContext<'_>) -> Result<AnalysisBundle, ProfileError> {
        if self.analyze_error {
            return Err(ProfileError::analyze());
        }

        Ok(AnalysisBundle::new(
            Box::new(TestAnalysis {
                rendered: self.rendered,
                valid: self.valid,
            }),
            PreservationContract::default(),
        ))
    }

    fn render(
        &self,
        analysis: &dyn ProfileAnalysis,
        writer: &mut LeanWriter,
    ) -> Result<(), ProfileError> {
        if self.render_error {
            return Err(ProfileError::render());
        }

        let analysis = analysis
            .as_any()
            .downcast_ref::<TestAnalysis>()
            .ok_or_else(ProfileError::render)?;
        writer.static_text(analysis.rendered);
        Ok(())
    }

    fn validate(
        &self,
        analysis: &dyn ProfileAnalysis,
        rendered: &RenderedOutput,
    ) -> Result<(), ProfileError> {
        let analysis = analysis
            .as_any()
            .downcast_ref::<TestAnalysis>()
            .ok_or_else(ProfileError::validate)?;

        if !analysis.valid || rendered.text() != analysis.rendered {
            return Err(ProfileError::validate());
        }

        Ok(())
    }
}

fn shell_observation(output: &str) -> ObservationV1 {
    ObservationV1 {
        schema_version: PROTOCOL_V1,
        source: SourceV1::Shell,
        command: Some("cargo test".to_owned()),
        shell_dialect: ShellDialectV1::Unknown,
        output: output.to_owned(),
        termination: TerminationV1::exited(0),
        completeness: CompletenessV1::Complete,
        presentation: PresentationV1::Unknown,
    }
}

fn engine(profiles: Vec<Box<dyn Profile>>) -> Engine {
    Engine::new(EngineConfig::default(), profiles).unwrap()
}

#[test]
fn no_matching_profile_is_passthrough() {
    let result = engine(Vec::new())
        .process(shell_observation("unchanged output"))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Passthrough);
    assert_eq!(result.replacement, None);
    assert_eq!(result.profile, None);
    assert_eq!(result.metrics.input_bytes, result.metrics.output_bytes);
    assert_eq!(result.metrics.saved_bytes, 0);
}

#[test]
fn one_matching_profile_can_reduce() {
    let result = engine(vec![Box::new(TestProfile::reducing(
        "cargo-test",
        "cargo",
        "ok",
    ))])
    .process(shell_observation("very noisy cargo test output"))
    .unwrap();

    assert_eq!(result.decision, DecisionV1::Reduced);
    assert_eq!(result.replacement.as_deref(), Some("ok"));
    assert_eq!(result.profile.as_deref(), Some("cargo-test"));
    assert_eq!(result.metrics.output_bytes, 2);
    assert_eq!(
        result.metrics.saved_bytes,
        result.metrics.input_bytes - result.metrics.output_bytes
    );
}

#[test]
fn two_matching_profiles_fail_open_as_ambiguous() {
    let result = engine(vec![
        Box::new(TestProfile::reducing("one", "cargo", "one")),
        Box::new(TestProfile::reducing("two", "cargo", "two")),
    ])
    .process(shell_observation("very noisy cargo output"))
    .unwrap();

    assert_eq!(result.decision, DecisionV1::FailedOpen);
    assert_eq!(result.replacement, None);
    assert_eq!(result.profile, None);
    assert_eq!(result.diagnostics, vec![DiagnosticCodeV1::AmbiguousProfile]);
}

#[test]
fn incomplete_requirement_fails_open_before_analysis() {
    let mut profile = TestProfile::reducing("cargo", "cargo", "ok");
    profile.requirements = ProfileRequirements {
        completeness: CompletenessRequirement::Complete,
        termination: TerminationRequirement::Any,
    };

    let mut observation = shell_observation("truncated cargo output");
    observation.completeness = CompletenessV1::Truncated;

    let result = engine(vec![Box::new(profile)])
        .process(observation)
        .unwrap();

    assert_eq!(result.decision, DecisionV1::FailedOpen);
    assert_eq!(result.replacement, None);
    assert_eq!(result.diagnostics, vec![DiagnosticCodeV1::IncompleteInput]);
}

#[test]
fn exited_requirement_fails_open_when_termination_is_unknown() {
    let mut profile = TestProfile::reducing("cargo", "cargo", "ok");
    profile.requirements = ProfileRequirements {
        completeness: CompletenessRequirement::Any,
        termination: TerminationRequirement::Exited,
    };

    let mut observation = shell_observation("unknown termination output");
    observation.termination = TerminationV1::unknown();

    let result = engine(vec![Box::new(profile)])
        .process(observation)
        .unwrap();

    assert_eq!(result.decision, DecisionV1::FailedOpen);
    assert_eq!(result.replacement, None);
    assert_eq!(
        result.diagnostics,
        vec![DiagnosticCodeV1::UnknownTermination]
    );
}

#[test]
fn exited_requirement_distinguishes_known_non_exit_termination() {
    let mut profile = TestProfile::reducing("cargo", "cargo", "ok");
    profile.requirements = ProfileRequirements {
        completeness: CompletenessRequirement::Any,
        termination: TerminationRequirement::Exited,
    };

    let mut observation = shell_observation("timed out output");
    observation.termination = hugr_lean::protocol::TerminationV1 {
        kind: hugr_lean::protocol::TerminationKindV1::TimedOut,
        code: None,
    };

    let result = engine(vec![Box::new(profile)])
        .process(observation)
        .unwrap();

    assert_eq!(result.decision, DecisionV1::FailedOpen);
    assert_eq!(
        result.diagnostics,
        vec![DiagnosticCodeV1::TerminationNotExited]
    );
}

struct ShapeOnlyProfile;

impl Profile for ShapeOnlyProfile {
    fn descriptor(&self) -> ProfileDescriptor {
        ProfileDescriptor::new(
            "shape-only",
            "test",
            "engine-pipeline",
            BoundaryAssumption::NativeText,
        )
    }

    fn recognize(&self, _identity: &InvocationIdentity) -> ProfileMatch {
        ProfileMatch::NoMatch
    }

    fn shape_guard(&self, context: &RouteContext<'_>) -> ProfileMatch {
        if context.observation.output.contains("MAGIC") {
            ProfileMatch::Match
        } else {
            ProfileMatch::NoMatch
        }
    }

    fn analyze(&self, _context: &ProfileContext<'_>) -> Result<AnalysisBundle, ProfileError> {
        Ok(AnalysisBundle::new(
            Box::new(TestAnalysis {
                rendered: "x",
                valid: true,
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
            .downcast_ref::<TestAnalysis>()
            .ok_or_else(ProfileError::render)?;
        writer.static_text(analysis.rendered);
        Ok(())
    }
}

#[test]
fn shape_guard_cannot_create_identity_match_on_its_own() {
    let result = engine(vec![Box::new(ShapeOnlyProfile)])
        .process(shell_observation("MAGIC output"))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::Passthrough);
    assert_eq!(result.replacement, None);
}

#[test]
fn analysis_failure_fails_open() {
    let mut profile = TestProfile::reducing("cargo", "cargo", "ok");
    profile.analyze_error = true;

    let result = engine(vec![Box::new(profile)])
        .process(shell_observation("input"))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::FailedOpen);
    assert_eq!(
        result.diagnostics,
        vec![DiagnosticCodeV1::ProfileParseFailed]
    );
}

#[test]
fn render_failure_fails_open() {
    let mut profile = TestProfile::reducing("cargo", "cargo", "ok");
    profile.render_error = true;

    let result = engine(vec![Box::new(profile)])
        .process(shell_observation("input"))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::FailedOpen);
    assert_eq!(
        result.diagnostics,
        vec![DiagnosticCodeV1::ProfileParseFailed]
    );
}

#[test]
fn validation_failure_fails_open() {
    let mut profile = TestProfile::reducing("cargo", "cargo", "ok");
    profile.valid = false;

    let result = engine(vec![Box::new(profile)])
        .process(shell_observation("input"))
        .unwrap();

    assert_eq!(result.decision, DecisionV1::FailedOpen);
    assert_eq!(
        result.diagnostics,
        vec![DiagnosticCodeV1::PreservationFailed]
    );
}

#[test]
fn equal_size_candidate_is_discarded() {
    let result = engine(vec![Box::new(TestProfile::reducing(
        "cargo", "cargo", "same",
    ))])
    .process(shell_observation("same"))
    .unwrap();

    assert_eq!(result.decision, DecisionV1::Passthrough);
    assert_eq!(result.replacement, None);
    assert_eq!(result.profile, None);
}

#[test]
fn larger_candidate_is_discarded() {
    let result = engine(vec![Box::new(TestProfile::reducing(
        "cargo",
        "cargo",
        "this is larger",
    ))])
    .process(shell_observation("tiny"))
    .unwrap();

    assert_eq!(result.decision, DecisionV1::Passthrough);
    assert_eq!(result.replacement, None);
    assert_eq!(result.profile, None);
}

#[test]
fn input_above_active_limit_fails_open_before_routing() {
    let config = EngineConfig {
        max_input_bytes: MIN_INPUT_BYTES,
    };
    let engine = Engine::new(
        config,
        vec![Box::new(TestProfile::reducing("cargo", "cargo", "ok"))],
    )
    .unwrap();

    let output = "x".repeat(MIN_INPUT_BYTES + 1);
    let result = engine.process(shell_observation(&output)).unwrap();

    assert_eq!(result.decision, DecisionV1::FailedOpen);
    assert_eq!(result.replacement, None);
    assert_eq!(result.diagnostics, vec![DiagnosticCodeV1::InputTooLarge]);
    assert_eq!(result.metrics.input_bytes, (MIN_INPUT_BYTES + 1) as u64);
    assert_eq!(result.metrics.output_bytes, (MIN_INPUT_BYTES + 1) as u64);
}

#[test]
fn engine_config_enforces_specified_bounds() {
    assert!(EngineConfig {
        max_input_bytes: MIN_INPUT_BYTES
    }
    .validate()
    .is_ok());
    assert!(EngineConfig {
        max_input_bytes: DEFAULT_MAX_INPUT_BYTES
    }
    .validate()
    .is_ok());
    assert!(EngineConfig {
        max_input_bytes: HARD_MAX_INPUT_BYTES
    }
    .validate()
    .is_ok());

    assert_eq!(
        EngineConfig {
            max_input_bytes: MIN_INPUT_BYTES - 1
        }
        .validate(),
        Err(EngineConfigError::MaxInputBytesOutOfRange {
            received: MIN_INPUT_BYTES - 1
        })
    );
    assert_eq!(
        EngineConfig {
            max_input_bytes: HARD_MAX_INPUT_BYTES + 1
        }
        .validate(),
        Err(EngineConfigError::MaxInputBytesOutOfRange {
            received: HARD_MAX_INPUT_BYTES + 1
        })
    );
}

#[test]
fn engine_result_is_deterministic_for_equivalent_input() {
    let engine = engine(vec![Box::new(TestProfile::reducing(
        "cargo", "cargo", "ok",
    ))]);
    let observation = shell_observation("very noisy output");

    let first = engine.process(observation.clone()).unwrap();
    for _ in 0..32 {
        assert_eq!(engine.process(observation.clone()).unwrap(), first);
    }
}
