//! Minimal profile contract used by the core routing pipeline.
//!
//! WP1.3 keeps the contract deliberately small. Concrete preservation evidence
//! and LeanWriter semantics are introduced by WP1.4 without changing routing.

use std::any::Any;

use crate::command::InvocationIdentity;
use crate::protocol::{CompletenessV1, ObservationV1, TerminationKindV1};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProfileMatch {
    NoMatch,
    Match,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompletenessRequirement {
    Any,
    Complete,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerminationRequirement {
    Any,
    Exited,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProfileRequirements {
    pub completeness: CompletenessRequirement,
    pub termination: TerminationRequirement,
}

impl ProfileRequirements {
    pub const ANY: Self = Self {
        completeness: CompletenessRequirement::Any,
        termination: TerminationRequirement::Any,
    };

    pub const COMPLETE_EXITED: Self = Self {
        completeness: CompletenessRequirement::Complete,
        termination: TerminationRequirement::Exited,
    };

    pub fn check(&self, observation: &ObservationV1) -> Result<(), RequirementFailure> {
        if self.completeness == CompletenessRequirement::Complete
            && observation.completeness != CompletenessV1::Complete
        {
            return Err(RequirementFailure::IncompleteInput);
        }

        if self.termination == TerminationRequirement::Exited
            && observation.termination.kind != TerminationKindV1::Exited
        {
            return Err(RequirementFailure::TerminationNotExited);
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequirementFailure {
    IncompleteInput,
    TerminationNotExited,
}

pub struct RouteContext<'a> {
    pub observation: &'a ObservationV1,
    pub identity: &'a InvocationIdentity,
}

pub struct ProfileContext<'a> {
    pub observation: &'a ObservationV1,
    pub identity: &'a InvocationIdentity,
    pub safe_baseline: &'a str,
}

/// Type-erased analysis value owned by one profile.
///
/// The engine never inspects this payload. Profiles can retain typed analysis
/// without forcing a shared semantic schema into the core.
pub trait ProfileAnalysis: Any + Send + Sync {
    fn as_any(&self) -> &dyn Any;
}

impl<T> ProfileAnalysis for T
where
    T: Any + Send + Sync,
{
    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProfileStage {
    Analyze,
    Render,
    Validate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProfileError {
    pub stage: ProfileStage,
}

impl ProfileError {
    pub const fn analyze() -> Self {
        Self {
            stage: ProfileStage::Analyze,
        }
    }

    pub const fn render() -> Self {
        Self {
            stage: ProfileStage::Render,
        }
    }

    pub const fn validate() -> Self {
        Self {
            stage: ProfileStage::Validate,
        }
    }
}

pub trait Profile: Send + Sync {
    fn id(&self) -> &'static str;

    fn requirements(&self) -> ProfileRequirements {
        ProfileRequirements::ANY
    }

    /// First-stage recognition. This method receives invocation identity only,
    /// so shell profiles cannot route solely from output resemblance.
    fn recognize(&self, identity: &InvocationIdentity) -> ProfileMatch;

    /// Optional second-stage shape guard. The engine calls this only after
    /// identity recognition has matched.
    fn shape_guard(&self, _context: &RouteContext<'_>) -> ProfileMatch {
        ProfileMatch::Match
    }

    fn analyze(
        &self,
        context: &ProfileContext<'_>,
    ) -> Result<Box<dyn ProfileAnalysis>, ProfileError>;

    fn render(&self, analysis: &dyn ProfileAnalysis) -> Result<String, ProfileError>;

    fn validate(&self, analysis: &dyn ProfileAnalysis, rendered: &str) -> Result<(), ProfileError>;
}
