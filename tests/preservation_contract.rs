use hugr_lean::command::{CommandRecognition, InvocationIdentity};
use hugr_lean::engine::{Engine, EngineConfig};
use hugr_lean::preservation::{
    ByteSpan, CanonicalizationRule, DerivedEvidence, EvidenceError, EvidenceRef, LeanWriter,
    OutcomeField, PreservationContract, PreservationError, RenderedOutput, Signal, SignalId,
};
use hugr_lean::profile::{
    AnalysisBundle, Profile, ProfileAnalysis, ProfileContext, ProfileError, ProfileMatch,
    RouteContext,
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

#[test]
fn verbatim_signal_is_anchored_to_exact_utf8_span() {
    let input = "prefix ERROR: boom suffix";
    let start = input.find("ERROR: boom").unwrap();
    let span = ByteSpan::new(start, start + "ERROR: boom".len());

    let signal = Signal::verbatim(FAILURE_ID, input, span).unwrap();

    assert_eq!(signal.id(), FAILURE_ID);
    assert_eq!(signal.canonical_text(), "ERROR: boom");
    assert_eq!(signal.evidence(), &EvidenceRef::InputSpan(span));
}

#[test]
fn byte_spans_reject_empty_out_of_bounds_and_split_utf8_boundaries() {
    let input = "aéz";

    assert_eq!(
        ByteSpan::new(1, 1).validate(input),
        Err(EvidenceError::InvalidSpan)
    );
    assert_eq!(
        ByteSpan::new(0, input.len() + 1).validate(input),
        Err(EvidenceError::InvalidSpan)
    );
    assert_eq!(
        ByteSpan::new(2, 3).validate(input),
        Err(EvidenceError::InvalidUtf8Boundary)
    );
}

#[test]
fn canonicalized_signal_uses_closed_named_rule() {
    let input = "  warning  ";
    let signal = Signal::canonicalized(
        FAILURE_ID,
        input,
        ByteSpan::new(0, input.len()),
        CanonicalizationRule::TrimAsciiWhitespace,
    )
    .unwrap();

    assert_eq!(signal.canonical_text(), "warning");
    assert_eq!(
        signal.evidence(),
        &EvidenceRef::Canonicalized {
            rule_id: "trim_ascii_whitespace",
            source_span: ByteSpan::new(0, input.len()),
        }
    );
}

#[test]
fn canonicalization_cannot_create_empty_evidence() {
    let input = "   ";
    let error = Signal::canonicalized(
        FAILURE_ID,
        input,
        ByteSpan::new(0, input.len()),
        CanonicalizationRule::TrimAsciiWhitespace,
    )
    .unwrap_err();

    assert_eq!(error, EvidenceError::EmptyCanonicalText);
}

#[test]
fn outcome_signal_is_derived_only_from_explicit_observation_state() {
    let observation = observation("failure");

    let exit = Signal::from_outcome(EXIT_ID, OutcomeField::ExitCode, &observation).unwrap();
    assert_eq!(exit.canonical_text(), "exit_code=1");
    assert_eq!(
        exit.evidence(),
        &EvidenceRef::OutcomeField(OutcomeField::ExitCode)
    );

    let mut unknown = observation;
    unknown.termination = TerminationV1::unknown();
    assert_eq!(
        Signal::from_outcome(EXIT_ID, OutcomeField::ExitCode, &unknown),
        Err(EvidenceError::UnavailableOutcomeField)
    );
}

#[test]
fn derived_count_is_mechanical_and_traceable_to_source_spans() {
    let input = "FAIL one\nFAIL two\n";
    let spans = vec![
        ByteSpan::new(0, "FAIL one".len()),
        ByteSpan::new("FAIL one\n".len(), "FAIL one\nFAIL two".len()),
    ];

    let derived = DerivedEvidence::count("count_failures", input, spans.clone(), "failures").unwrap();

    assert_eq!(derived.rendered_text(), "2 failures");
    assert_eq!(derived.rule_id(), "count_failures");
    assert_eq!(derived.source_spans(), spans.as_slice());
}

#[test]
fn derived_signal_records_rule_and_source_spans() {
    let input = "FAIL one\nFAIL two\n";
    let spans = vec![
        ByteSpan::new(0, "FAIL one".len()),
        ByteSpan::new("FAIL one\n".len(), "FAIL one\nFAIL two".len()),
    ];

    let signal = Signal::derived_count(
        COUNT_ID,
        "count_failures",
        input,
        spans.clone(),
        "failures",
    )
    .unwrap();

    assert_eq!(signal.canonical_text(), "2 failures");
    assert_eq!(
        signal.evidence(),
        &EvidenceRef::Derived {
            rule_id: "count_failures",
            source_spans: spans,
        }
    );
}

#[test]
fn derived_evidence_rejects_empty_provenance() {
    assert_eq!(
        DerivedEvidence::count("count", "x", Vec::new(), "items"),
        Err(EvidenceError::InvalidSpan)
    );
    assert_eq!(
        DerivedEvidence::count("", "x", vec![ByteSpan::new(0, 1)], "items"),
        Err(EvidenceError::InvalidRuleId)
    );
}

#[test]
fn lean_writer_records_signals_and_derived_provenance() {
    let input = "FAIL one\nFAIL two\n";
    let signal = Signal::verbatim(
        FAILURE_ID,
        input,
        ByteSpan::new(0, "FAIL one".len()),
    )
    .unwrap();
    let derived = DerivedEvidence::count(
        "count_failures",
        input,
        vec![
            ByteSpan::new(0, "FAIL one".len()),
            ByteSpan::new("FAIL one\n".len(), "FAIL one\nFAIL two".len()),
        ],
        "failures",
    )
    .unwrap();

    let mut writer = LeanWriter::new();
    writer.static_text("failure: ");
    writer.signal(&signal);
    writer.newline();
    writer.derived(&derived);
    let output = writer.finish();

    assert_eq!(output.text(), "failure: FAIL one\n2 failures");
    assert!(output.emitted_signal_ids().contains(&FAILURE_ID));
    assert_eq!(output.derived_records().len(), 1);
    assert_eq!(output.derived_records()[0].rule_id(), "count_failures");
    assert_eq!(output.derived_records()[0].source_spans().len(), 2);
}

#[test]
fn preservation_contract_rejects_missing_required_signal() {
    let contract = PreservationContract::require(FAILURE_ID);
    let mut writer = LeanWriter::new();
    writer.static_text("no dynamic evidence");
    let output = writer.finish();

    assert_eq!(
        contract.validate(&output),
        Err(PreservationError::MissingRequiredSignal)
    );
}

#[test]
fn preservation_contract_accepts_emitted_required_signal() {
    let input = "ERROR";
    let signal = Signal::verbatim(FAILURE_ID, input, ByteSpan::new(0, input.len())).unwrap();
    let contract = PreservationContract::require(FAILURE_ID);

    let mut writer = LeanWriter::new();
    writer.signal(&signal);
    let output = writer.finish();

    assert_eq!(contract.validate(&output), Ok(()));
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
        let signal = Signal::verbatim(
            FAILURE_ID,
            context.safe_baseline,
            ByteSpan::new(start, start + needle.len()),
        )
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

#[test]
fn render_output_has_no_public_mutating_escape_hatch_in_normal_use() {
    fn inspect(output: &RenderedOutput) -> (&str, usize, usize) {
        (
            output.text(),
            output.emitted_signal_ids().len(),
            output.derived_records().len(),
        )
    }

    let output = LeanWriter::new().finish();
    assert_eq!(inspect(&output), ("", 0, 0));
}
