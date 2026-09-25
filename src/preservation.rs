//! Evidence-backed rendering and Preservation Contracts.
//!
//! Data-bearing output must originate from validated input spans, explicit
//! observation outcome fields, or mechanically derived evidence. Free-form
//! dynamic strings are deliberately absent from the writer API.

use std::collections::BTreeSet;

use crate::protocol::{
    CompletenessV1, ObservationV1, TerminationKindV1,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SignalId(&'static str);

impl SignalId {
    pub const fn new(value: &'static str) -> Self {
        assert!(!value.is_empty(), "SignalId must not be empty");
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
            Self::TrimAsciiWhitespace => value.trim_matches(|c: char| c.is_ascii_whitespace()).to_owned(),
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signal {
    id: SignalId,
    canonical_text: String,
    evidence: EvidenceRef,
}

impl Signal {
    pub fn verbatim(
        id: SignalId,
        input: &str,
        span: ByteSpan,
    ) -> Result<Self, EvidenceError> {
        let text = span.extract(input)?.to_owned();
        Ok(Self {
            id,
            canonical_text: text,
            evidence: EvidenceRef::InputSpan(span),
        })
    }

    pub fn canonicalized(
        id: SignalId,
        input: &str,
        span: ByteSpan,
        rule: CanonicalizationRule,
    ) -> Result<Self, EvidenceError> {
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

    pub fn from_outcome(
        id: SignalId,
        field: OutcomeField,
        observation: &ObservationV1,
    ) -> Result<Self, EvidenceError> {
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

    pub fn derived_count(
        id: SignalId,
        rule_id: &'static str,
        input: &str,
        source_spans: Vec<ByteSpan>,
        noun: &'static str,
    ) -> Result<Self, EvidenceError> {
        validate_rule_id(rule_id)?;
        validate_source_spans(input, &source_spans)?;
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
    pub fn count(
        rule_id: &'static str,
        input: &str,
        source_spans: Vec<ByteSpan>,
        noun: &'static str,
    ) -> Result<Self, EvidenceError> {
        validate_rule_id(rule_id)?;
        validate_source_spans(input, &source_spans)?;

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EvidenceError {
    InvalidSpan,
    InvalidUtf8Boundary,
    UnavailableOutcomeField,
    EmptyCanonicalText,
    InvalidRuleId,
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
    /// The &'static str type intentionally prevents normal observation-derived
    /// strings from flowing through this method.
    pub fn static_text(&mut self, text: &'static str) {
        self.text.push_str(text);
    }

    pub fn signal(&mut self, signal: &Signal) {
        self.text.push_str(signal.canonical_text());
        self.emitted_signal_ids.insert(signal.id());
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

fn validate_rule_id(rule_id: &'static str) -> Result<(), EvidenceError> {
    if rule_id.is_empty() {
        Err(EvidenceError::InvalidRuleId)
    } else {
        Ok(())
    }
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
