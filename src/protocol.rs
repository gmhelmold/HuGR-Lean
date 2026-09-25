use std::error::Error;
use std::fmt;
use std::io::{self, Read, Write};

use serde::{Deserialize, Serialize};

pub const PROTOCOL_V1: u16 = 1;
pub const MAX_PROTOCOL_ENVELOPE_BYTES: usize = 128 * 1024 * 1024;
pub const MAX_DIAGNOSTICS: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceV1 {
    Shell,
    Read,
    Search,
    Lsp,
    Mcp,
    Browser,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShellDialectV1 {
    Unknown,
    Posix,
    PowerShell,
    Cmd,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TerminationV1 {
    Unknown,
    Exited { code: i32 },
    Aborted,
    TimedOut,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompletenessV1 {
    Unknown,
    Complete,
    Truncated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PresentationV1 {
    Unknown,
    TerminalRendered,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ObservationV1 {
    pub schema_version: u16,
    pub source: SourceV1,
    pub command: Option<String>,
    pub shell_dialect: ShellDialectV1,
    pub output: String,
    pub termination: TerminationV1,
    pub completeness: CompletenessV1,
    pub presentation: PresentationV1,
}

impl ObservationV1 {
    pub fn validate(&self) -> Result<(), ProtocolError> {
        if self.schema_version != PROTOCOL_V1 {
            return Err(ProtocolError::UnsupportedSchemaVersion {
                received: self.schema_version,
            });
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecisionV1 {
    Passthrough,
    Normalized,
    Reduced,
    FailedOpen,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticCodeV1 {
    AmbiguousProfile,
    ProfileParseFailed,
    PreservationFailed,
    InputTooLarge,
    RawStoreFailed,
    ProtocolWarning,
    IncompleteInput,
    UnknownTermination,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MetricsV1 {
    pub input_bytes: u64,
    pub output_bytes: u64,
    pub saved_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FilterResultV1 {
    pub schema_version: u16,
    pub decision: DecisionV1,
    pub replacement: Option<String>,
    pub profile: Option<String>,
    pub metrics: MetricsV1,
    pub raw_ref: Option<String>,
    pub diagnostics: Vec<DiagnosticCodeV1>,
}

impl FilterResultV1 {
    pub fn passthrough(input_bytes: usize) -> Self {
        let bytes = usize_to_u64(input_bytes);
        Self {
            schema_version: PROTOCOL_V1,
            decision: DecisionV1::Passthrough,
            replacement: None,
            profile: None,
            metrics: MetricsV1 {
                input_bytes: bytes,
                output_bytes: bytes,
                saved_bytes: 0,
            },
            raw_ref: None,
            diagnostics: Vec::new(),
        }
    }

    pub fn validate(&self) -> Result<(), ProtocolError> {
        if self.schema_version != PROTOCOL_V1 {
            return Err(ProtocolError::UnsupportedSchemaVersion {
                received: self.schema_version,
            });
        }

        let replacement_is_valid = match self.decision {
            DecisionV1::Normalized | DecisionV1::Reduced => self.replacement.is_some(),
            DecisionV1::Passthrough | DecisionV1::FailedOpen => self.replacement.is_none(),
        };

        if !replacement_is_valid {
            return Err(ProtocolError::InvalidResult(
                "decision/replacement combination violates Protocol V1",
            ));
        }

        if self.diagnostics.len() > MAX_DIAGNOSTICS {
            return Err(ProtocolError::InvalidResult(
                "diagnostic count exceeds Protocol V1 maximum",
            ));
        }

        if self.metrics.output_bytes > self.metrics.input_bytes {
            return Err(ProtocolError::InvalidResult(
                "Protocol V1 result must not expand model-visible output",
            ));
        }

        if self.metrics.saved_bytes
            != self
                .metrics
                .input_bytes
                .saturating_sub(self.metrics.output_bytes)
        {
            return Err(ProtocolError::InvalidResult(
                "saved_bytes does not match input/output byte metrics",
            ));
        }

        Ok(())
    }
}

#[derive(Debug)]
pub enum ProtocolError {
    Io(io::Error),
    Json(serde_json::Error),
    EnvelopeTooLarge { limit: usize },
    UnsupportedSchemaVersion { received: u16 },
    InvalidResult(&'static str),
}

impl fmt::Display for ProtocolError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "I/O error: {error}"),
            Self::Json(error) => write!(formatter, "invalid Protocol V1 JSON: {error}"),
            Self::EnvelopeTooLarge { limit } => {
                write!(formatter, "protocol envelope exceeds {limit} bytes")
            }
            Self::UnsupportedSchemaVersion { received } => {
                write!(formatter, "unsupported schema_version {received}; expected {PROTOCOL_V1}")
            }
            Self::InvalidResult(message) => write!(formatter, "invalid Protocol V1 result: {message}"),
        }
    }
}

impl Error for ProtocolError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Json(error) => Some(error),
            Self::EnvelopeTooLarge { .. }
            | Self::UnsupportedSchemaVersion { .. }
            | Self::InvalidResult(_) => None,
        }
    }
}

impl From<io::Error> for ProtocolError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for ProtocolError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

pub fn read_observation_v1<R: Read>(reader: R) -> Result<ObservationV1, ProtocolError> {
    let bytes = read_bounded(reader, MAX_PROTOCOL_ENVELOPE_BYTES)?;
    let observation: ObservationV1 = serde_json::from_slice(&bytes)?;
    observation.validate()?;
    Ok(observation)
}

pub fn write_result_v1<W: Write>(
    mut writer: W,
    result: &FilterResultV1,
) -> Result<(), ProtocolError> {
    result.validate()?;
    serde_json::to_writer(&mut writer, result)?;
    writer.write_all(b"\n")?;
    Ok(())
}

fn read_bounded<R: Read>(reader: R, limit: usize) -> Result<Vec<u8>, ProtocolError> {
    let take_limit = u64::try_from(limit)
        .unwrap_or(u64::MAX)
        .saturating_add(1);

    let mut bounded = reader.take(take_limit);
    let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
    bounded.read_to_end(&mut bytes)?;

    if bytes.len() > limit {
        return Err(ProtocolError::EnvelopeTooLarge { limit });
    }

    Ok(bytes)
}

fn usize_to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::{read_bounded, ProtocolError};

    #[test]
    fn bounded_reader_rejects_one_byte_over_limit() {
        let error = read_bounded(Cursor::new(b"12345"), 4).unwrap_err();
        assert!(matches!(
            error,
            ProtocolError::EnvelopeTooLarge { limit: 4 }
        ));
    }

    #[test]
    fn bounded_reader_accepts_exact_limit() {
        let bytes = read_bounded(Cursor::new(b"1234"), 4).unwrap();
        assert_eq!(bytes, b"1234");
    }
}
