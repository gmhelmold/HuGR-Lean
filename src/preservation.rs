//! Evidence-backed rendering and Preservation Contracts.
//!
//! Data-bearing output must originate from validated input spans, explicit
//! observation outcome fields, or mechanically derived evidence. Free-form
//! dynamic strings are deliberately absent from the writer API.

use std::collections::BTreeSet;

use crate::profile::ProfileContext;
use crate::protocol::{CompletenessV1, ObservationV1, TerminationKindV1};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SignalId(&'static str);

impl SignalId {
    pub const fn new(value: &'static str) -> Self {
        Self(value)
    }

    pub const fn as_str(self) -> &'static str {
        self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ByteSpan {
    pub start_byte: usize,
    pub end_byte: usize,
}

impl ByteSpan {
    pub const fn new(start_byte: usize, end_byte: usize) -> Self {
        Self {
            start_byte,
            end_byte,
        }
    }

    pub fn validate(self, input: &str) -> Result<(), EvidenceError> {
        if self.start_byte >= self.end_byte || self.end_byte > input.len() {
            return Err(EvidenceError::InvalidSpan);
        }

        if !input.is_char_boundary(self.start_byte) || !input.is_char_boundary(self.end_byte) {
            return Err(EvidenceError::InvalidUtf8Boundary);
        }

        Ok(())
    }

    pub fn extract(self, input: &str) -> Result<&str, EvidenceError> {
        self.validate(input)?;
        Ok(&input[self.start_byte..self.end_byte])
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutcomeField {
    ExitCode,
    Termination,
    Completeness,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CanonicalizationRule {
    TrimAsciiWhitespace,
}

impl CanonicalizationRule {
    pub const fn id(self) -> &'static str {
        match self {
            Self::TrimAsciiWhitespace => "trim_ascii_whitespace",
        }
    }

    fn apply(self, value: &str) -> String {
        match self {
            Self::TrimAsciiWhitespace => value
                .trim_matches(|c: char| c.is_ascii_whitespace())
                .to_owned(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EvidenceRef {
    InputSpan(ByteSpan),
    OutcomeField(OutcomeField),
    Canonicalized {
        rule_id: &'static str,
        source_span: ByteSpan,
    },
    Derived {
        rule_id: &'static str,
        source_spans: Vec<ByteSpan>,
    },
}

/// Evidence-bearing dynamic text.
///
/// Low-level constructors are intentionally not public. Profiles create
/// signals through `ProfileContext`, which binds evidence to the engine's
/// actual analysis baseline and observation.
///
/// ```compile_fail
/// use hugr_lean::preservation::{ByteSpan, Signal, SignalId};
///
/// let fabricated = String::from("fabricated");
/// let _ = Signal::verbatim(
///     SignalId::new("fake"),
///     &fabricated,
///     ByteSpan::new(0, fabricated.len()),
/// );
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signal {
    id: SignalId,
    canonical_text: String,
    evidence: EvidenceRef,
}

impl Signal {
    fn verbatim(id: SignalId, input: &str, span: ByteSpan) -> Result<Self, EvidenceError> {
        validate_signal_id(id)?;
        let text = span.extract(input)?.to_owned();
        Ok(Self {
            id,
            canonical_text: text,
            evidence: EvidenceRef::InputSpan(span),
        })
    }

    fn canonicalized(
        id: SignalId,
        input: &str,
        span: ByteSpan,
        rule: CanonicalizationRule,
    ) -> Result<Self, EvidenceError> {
        validate_signal_id(id)?;
        let text = rule.apply(span.extract(input)?);
        if text.is_empty() {
            return Err(EvidenceError::EmptyCanonicalText);
        }
        Ok(Self {
            id,
            canonical_text: text,
            evidence: EvidenceRef::Canonicalized {
                rule_id: rule.id(),
                source_span: span,
            },
        })
    }

    fn from_outcome(
        id: SignalId,
        field: OutcomeField,
        observation: &ObservationV1,
    ) -> Result<Self, EvidenceError> {
        validate_signal_id(id)?;
        let canonical_text = match field {
            OutcomeField::ExitCode => {
                if observation.termination.kind != TerminationKindV1::Exited {
                    return Err(EvidenceError::UnavailableOutcomeField);
                }
                let Some(code) = observation.termination.code else {
                    return Err(EvidenceError::UnavailableOutcomeField);
                };
                format!("exit_code={code}")
            }
            OutcomeField::Termination => {
                let value = match observation.termination.kind {
                    TerminationKindV1::Unknown => "unknown",
                    TerminationKindV1::Exited => "exited",
                    TerminationKindV1::Aborted => "aborted",
                    TerminationKindV1::TimedOut => "timed_out",
                };
                format!("termination={value}")
            }
            OutcomeField::Completeness => {
                let value = match observation.completeness {
                    CompletenessV1::Unknown => "unknown",
                    CompletenessV1::Complete => "complete",
                    CompletenessV1::Truncated => "truncated",
                };
                format!("completeness={value}")
            }
        };

        Ok(Self {
            id,
            canonical_text,
            evidence: EvidenceRef::OutcomeField(field),
        })
    }

    fn derived_count(
        id: SignalId,
        rule_id: &'static str,
        input: &str,
        source_spans: Vec<ByteSpan>,
        noun: &'static str,
    ) -> Result<Self, EvidenceError> {
        validate_signal_id(id)?;
        validate_rule_id(rule_id)?;
        validate_count_source_spans(input, &source_spans)?;
        let canonical_text = format!("{} {noun}", source_spans.len());

        Ok(Self {
            id,
            canonical_text,
            evidence: EvidenceRef::Derived {
                rule_id,
                source_spans,
            },
        })
    }

    pub const fn id(&self) -> SignalId {
        self.id
    }

    pub fn canonical_text(&self) -> &str {
        &self.canonical_text
    }

    pub fn evidence(&self) -> &EvidenceRef {
        &self.evidence
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DerivedEvidence {
    rendered_text: String,
    rule_id: &'static str,
    source_spans: Vec<ByteSpan>,
}

impl DerivedEvidence {
    fn count(
        rule_id: &'static str,
        input: &str,
        source_spans: Vec<ByteSpan>,
        noun: &'static str,
    ) -> Result<Self, EvidenceError> {
        validate_rule_id(rule_id)?;
        validate_count_source_spans(input, &source_spans)?;

        Ok(Self {
            rendered_text: format!("{} {noun}", source_spans.len()),
            rule_id,
            source_spans,
        })
    }

    pub fn rendered_text(&self) -> &str {
        &self.rendered_text
    }

    pub const fn rule_id(&self) -> &'static str {
        self.rule_id
    }

    pub fn source_spans(&self) -> &[ByteSpan] {
        &self.source_spans
    }
}

impl ProfileContext<'_> {
    pub fn verbatim_signal(&self, id: SignalId, span: ByteSpan) -> Result<Signal, EvidenceError> {
        Signal::verbatim(id, self.safe_baseline, span)
    }

    pub fn canonicalized_signal(
        &self,
        id: SignalId,
        span: ByteSpan,
        rule: CanonicalizationRule,
    ) -> Result<Signal, EvidenceError> {
        Signal::canonicalized(id, self.safe_baseline, span, rule)
    }

    pub fn outcome_signal(
        &self,
        id: SignalId,
        field: OutcomeField,
    ) -> Result<Signal, EvidenceError> {
        Signal::from_outcome(id, field, self.observation)
    }

    pub fn derived_count_signal(
        &self,
        id: SignalId,
        rule_id: &'static str,
        source_spans: Vec<ByteSpan>,
        noun: &'static str,
    ) -> Result<Signal, EvidenceError> {
        Signal::derived_count(id, rule_id, self.safe_baseline, source_spans, noun)
    }

    pub fn derived_count(
        &self,
        rule_id: &'static str,
        source_spans: Vec<ByteSpan>,
        noun: &'static str,
    ) -> Result<DerivedEvidence, EvidenceError> {
        DerivedEvidence::count(rule_id, self.safe_baseline, source_spans, noun)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EvidenceError {
    InvalidSpan,
    InvalidUtf8Boundary,
    UnavailableOutcomeField,
    EmptyCanonicalText,
    InvalidRuleId,
    InvalidSignalId,
    NonMonotonicSourceSpans,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PreservationContract {
    required_signal_ids: BTreeSet<SignalId>,
}

impl PreservationContract {
    pub fn new(required_signal_ids: impl IntoIterator<Item = SignalId>) -> Self {
        Self {
            required_signal_ids: required_signal_ids.into_iter().collect(),
        }
    }

    pub fn require(signal_id: SignalId) -> Self {
        Self::new([signal_id])
    }

    pub fn required_signal_ids(&self) -> &BTreeSet<SignalId> {
        &self.required_signal_ids
    }

    pub fn validate(&self, output: &RenderedOutput) -> Result<(), PreservationError> {
        if self
            .required_signal_ids
            .is_subset(output.emitted_signal_ids())
        {
            Ok(())
        } else {
            Err(PreservationError::MissingRequiredSignal)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreservationError {
    MissingRequiredSignal,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LeanWriter {
    text: String,
    emitted_signal_ids: BTreeSet<SignalId>,
    derived_records: Vec<DerivedRecord>,
}

impl LeanWriter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Static labels/punctuation only.
    ///
    /// The `&'static str` type intentionally prevents normal
    /// observation-derived strings from flowing through this method.
    ///
    /// ```compile_fail
    /// use hugr_lean::preservation::LeanWriter;
    ///
    /// let mut writer = LeanWriter::new();
    /// let dynamic = String::from("observation-derived");
    /// writer.static_text(&dynamic);
    /// ```
    pub fn static_text(&mut self, text: &'static str) {
        self.text.push_str(text);
    }

    pub fn static_line(&mut self, text: &'static str) {
        self.static_text(text);
        self.newline();
    }

    pub fn signal(&mut self, signal: &Signal) {
        self.text.push_str(signal.canonical_text());
        self.emitted_signal_ids.insert(signal.id());
    }

    pub fn signal_line(&mut self, signal: &Signal) {
        self.signal(signal);
        self.newline();
    }

    pub fn derived(&mut self, evidence: &DerivedEvidence) {
        self.text.push_str(evidence.rendered_text());
        self.derived_records.push(DerivedRecord {
            rule_id: evidence.rule_id(),
            source_spans: evidence.source_spans().to_vec(),
        });
    }

    pub fn newline(&mut self) {
        self.text.push('\n');
    }

    pub fn finish(self) -> RenderedOutput {
        RenderedOutput {
            text: self.text,
            emitted_signal_ids: self.emitted_signal_ids,
            derived_records: self.derived_records,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DerivedRecord {
    rule_id: &'static str,
    source_spans: Vec<ByteSpan>,
}

impl DerivedRecord {
    pub const fn rule_id(&self) -> &'static str {
        self.rule_id
    }

    pub fn source_spans(&self) -> &[ByteSpan] {
        &self.source_spans
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedOutput {
    text: String,
    emitted_signal_ids: BTreeSet<SignalId>,
    derived_records: Vec<DerivedRecord>,
}

impl RenderedOutput {
    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn emitted_signal_ids(&self) -> &BTreeSet<SignalId> {
        &self.emitted_signal_ids
    }

    pub fn derived_records(&self) -> &[DerivedRecord] {
        &self.derived_records
    }

    pub fn into_text(self) -> String {
        self.text
    }
}

fn validate_signal_id(signal_id: SignalId) -> Result<(), EvidenceError> {
    if signal_id.as_str().is_empty() {
        Err(EvidenceError::InvalidSignalId)
    } else {
        Ok(())
    }
}

fn validate_rule_id(rule_id: &'static str) -> Result<(), EvidenceError> {
    if rule_id.is_empty() {
        Err(EvidenceError::InvalidRuleId)
    } else {
        Ok(())
    }
}

fn validate_count_source_spans(
    input: &str,
    source_spans: &[ByteSpan],
) -> Result<(), EvidenceError> {
    validate_source_spans(input, source_spans)?;

    for pair in source_spans.windows(2) {
        let previous = pair[0];
        let next = pair[1];
        if previous.start_byte >= next.start_byte || previous.end_byte > next.start_byte {
            return Err(EvidenceError::NonMonotonicSourceSpans);
        }
    }

    Ok(())
}

fn validate_source_spans(input: &str, source_spans: &[ByteSpan]) -> Result<(), EvidenceError> {
    if source_spans.is_empty() {
        return Err(EvidenceError::InvalidSpan);
    }

    for span in source_spans {
        span.validate(input)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{
        CompletenessV1, ObservationV1, PresentationV1, ShellDialectV1, SourceV1, TerminationV1,
        PROTOCOL_V1,
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
    fn empty_signal_id_is_rejected_without_panicking() {
        assert_eq!(
            Signal::verbatim(SignalId::new(""), "x", ByteSpan::new(0, 1)),
            Err(EvidenceError::InvalidSignalId)
        );
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

        let derived =
            DerivedEvidence::count("count_failures", input, spans.clone(), "failures").unwrap();

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

        let signal =
            Signal::derived_count(COUNT_ID, "count_failures", input, spans.clone(), "failures")
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
    fn derived_evidence_rejects_empty_or_invalid_provenance() {
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
    fn derived_count_rejects_duplicate_overlapping_or_unordered_spans() {
        let input = "one two three";

        for spans in [
            vec![ByteSpan::new(0, 3), ByteSpan::new(0, 3)],
            vec![ByteSpan::new(0, 7), ByteSpan::new(4, 7)],
            vec![ByteSpan::new(8, 13), ByteSpan::new(0, 3)],
        ] {
            assert_eq!(
                DerivedEvidence::count("count", input, spans, "items"),
                Err(EvidenceError::NonMonotonicSourceSpans)
            );
        }
    }

    #[test]
    fn lean_writer_records_signals_and_derived_provenance() {
        let input = "FAIL one\nFAIL two\n";
        let signal =
            Signal::verbatim(FAILURE_ID, input, ByteSpan::new(0, "FAIL one".len())).unwrap();
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
    fn preservation_contract_requires_actual_emission() {
        let contract = PreservationContract::require(FAILURE_ID);

        let mut missing = LeanWriter::new();
        missing.static_text("no dynamic evidence");
        assert_eq!(
            contract.validate(&missing.finish()),
            Err(PreservationError::MissingRequiredSignal)
        );

        let input = "ERROR";
        let signal = Signal::verbatim(FAILURE_ID, input, ByteSpan::new(0, input.len())).unwrap();
        let mut emitted = LeanWriter::new();
        emitted.signal(&signal);
        assert_eq!(contract.validate(&emitted.finish()), Ok(()));
    }
}
