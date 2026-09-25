//! HuGR-Lean core library.
//!
//! Protocol V1 defines the host-independent boundary. Invocation identity and
//! the routing engine are deliberately conservative: unsupported or ambiguous
//! observations fail open rather than being guessed.

pub mod command;
pub mod engine;
pub mod normalize;
pub mod preservation;
pub mod profile;
pub mod protocol;

use engine::Engine;
use protocol::{FilterResultV1, ObservationV1, ProtocolError};

/// Process one Protocol V1 observation using the default engine.
///
/// The default engine intentionally has no registered profiles yet, so it is a
/// deterministic passthrough. Profile implementations are added by later work.
pub fn process_v1(observation: ObservationV1) -> Result<FilterResultV1, ProtocolError> {
    Engine::default().process(observation)
}
