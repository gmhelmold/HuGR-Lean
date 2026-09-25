//! HuGR-Lean core library.
//!
//! WP1.1 intentionally exposes only Protocol V1 and a passthrough processor.
//! Routing, profiles, normalization, and recovery are implemented by later work
//! packages after the protocol boundary is stable.

pub mod protocol;

use protocol::{FilterResultV1, ObservationV1, ProtocolError};

/// Process one validated Protocol V1 observation.
///
/// WP1.1 deliberately returns passthrough. The engine pipeline that may produce
/// normalized/reduced output belongs to WP1.3.
pub fn process_v1(observation: ObservationV1) -> Result<FilterResultV1, ProtocolError> {
    observation.validate()?;
    Ok(FilterResultV1::passthrough(observation.output.len()))
}
