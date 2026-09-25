//! HuGR-Lean core library.
//!
//! Protocol V1 defines the host-independent boundary. Invocation identity is
//! deliberately conservative: unsupported shell syntax remains unknown rather
//! than being guessed.

pub mod command;
pub mod protocol;

use protocol::{FilterResultV1, ObservationV1, ProtocolError};

/// Process one validated Protocol V1 observation.
///
/// WP1.1/WP1.2 deliberately return passthrough. The engine pipeline that may
/// route profiles or produce normalized/reduced output belongs to WP1.3.
pub fn process_v1(observation: ObservationV1) -> Result<FilterResultV1, ProtocolError> {
    observation.validate()?;
    Ok(FilterResultV1::passthrough(observation.output.len()))
}
