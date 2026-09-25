//! Stable profile framework for deterministic post-execution reducers.
//!
//! Every profile declares a small descriptor, input requirements, identity
//! recognition, optional shape guard, deterministic analysis, evidence-backed
//! rendering, and optional final validation.

use std::any::Any;
use std::collections::BTreeSet;

use crate::command::InvocationIdentity;
use crate::preservation::{LeanWriter, PreservationContract, RenderedOutput};
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

/// Declares what shape of boundary input a profile implementation consumes.
///
/// RewriteDependent exists only so donor-derived implementations can be
/// rejected explicitly. HuGR-Lean v1 never executes a profile with that
/// assumption.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoundaryAssumption {
    NativeText,
    StructuredText,
    RewriteDependent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProfileDescriptor {
    id: &'static str,
    family: &'static str,
    fixture_family: &'static str,
    boundary_assumption: BoundaryAssumption,
}

impl ProfileDescriptor {
    pub const fn new(
        id: &'static str,
        family: &'static str,
        fixture_family: &'static str,
        boundary_assumption: BoundaryAssumption,
    ) -> Self {
        Self {
            id,
            family,
            fixture_family,
            boundary_assumption,
        }
    }

    pub const fn id(self) -> &'static str {
        self.id
    }

    pub const fn family(self) -> &'static str {
        self.family
    }

    pub const fn fixture_family(self) -> &'static str {
        self.fixture_family
    }

    pub const fn boundary_assumption(self) -> BoundaryAssumption {
        self.boundary_assumption
    }

    fn validate(self) -> Result<(), ProfileRegistryError> {
        validate_component(self.id)
            .map_err(|_| ProfileRegistryError::InvalidProfileId { id: self.id })?;
        validate_component(self.family).map_err(|_| ProfileRegistryError::InvalidFamily {
            id: self.id,
            family: self.family,
        })?;
        validate_component(self.fixture_family).map_err(|_| {
            ProfileRegistryError::InvalidFixtureFamily {
                id: self.id,
                fixture_family: self.fixture_family,
            }
        })?;

        if self.boundary_assumption == BoundaryAssumption::RewriteDependent {
            return Err(ProfileRegistryError::RewriteDependent { id: self.id });
        }

        Ok(())
    }
}

fn validate_component(value: &str) -> Result<(), ()> {
    let mut bytes = value.bytes();
    let Some(first) = bytes.next() else {
        return Err(());
    };

    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return Err(());
    }

    if bytes.all(|byte| {
        byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_' | b'.')
    }) {
        Ok(())
    } else {
        Err(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProfileRegistryError {
    InvalidProfileId {
        id: &'static str,
    },
    InvalidFamily {
        id: &'static str,
        family: &'static str,
    },
    InvalidFixtureFamily {
        id: &'static str,
        fixture_family: &'static str,
    },
    DuplicateProfileId {
        id: &'static str,
    },
    RewriteDependent {
        id: &'static str,
    },
}

pub struct RegisteredProfile {
    descriptor: ProfileDescriptor,
    profile: Box<dyn Profile>,
}

impl RegisteredProfile {
    pub const fn descriptor(&self) -> ProfileDescriptor {
        self.descriptor
    }

    pub fn profile(&self) -> &dyn Profile {
        self.profile.as_ref()
    }
}

pub struct ProfileRegistry {
    profiles: Vec<RegisteredProfile>,
}

impl Default for ProfileRegistry {
    fn default() -> Self {
        Self::empty()
    }
}

impl ProfileRegistry {
    pub fn empty() -> Self {
        Self {
            profiles: Vec::new(),
        }
    }

    pub fn new(profiles: Vec<Box<dyn Profile>>) -> Result<Self, ProfileRegistryError> {
        let mut ids = BTreeSet::new();
        let mut registered = Vec::with_capacity(profiles.len());

        for profile in profiles {
            let descriptor = profile.descriptor();
            descriptor.validate()?;

            if !ids.insert(descriptor.id()) {
                return Err(ProfileRegistryError::DuplicateProfileId {
                    id: descriptor.id(),
                });
            }

            registered.push(RegisteredProfile {
                descriptor,
                profile,
            });
        }

        Ok(Self {
            profiles: registered,
        })
    }

    pub fn iter(&self) -> impl Iterator<Item = &RegisteredProfile> {
        self.profiles.iter()
    }

    pub fn len(&self) -> usize {
        self.profiles.len()
    }

    pub fn is_empty(&self) -> bool {
        self.profiles.is_empty()
    }
}

pub struct RouteContext<'a> {
    pub observation: &'a ObservationV1,
    pub identity: &'a InvocationIdentity,
    pub safe_baseline: &'a str,
}

pub struct ProfileContext<'a> {
    pub observation: &'a ObservationV1,
    pub identity: &'a InvocationIdentity,
    pub safe_baseline: &'a str,
}

pub struct AnalysisBundle {
    data: Box<dyn ProfileAnalysis>,
    preservation: PreservationContract,
}

impl AnalysisBundle {
    pub fn new(data: Box<dyn ProfileAnalysis>, preservation: PreservationContract) -> Self {
        Self { data, preservation }
    }

    pub fn data(&self) -> &dyn ProfileAnalysis {
        self.data.as_ref()
    }

    pub fn preservation(&self) -> &PreservationContract {
        &self.preservation
    }
}

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
    fn descriptor(&self) -> ProfileDescriptor;

    fn requirements(&self) -> ProfileRequirements {
        ProfileRequirements::ANY
    }

    /// First-stage recognition receives invocation identity only. Output
    /// resemblance can never create a command identity.
    fn recognize(&self, identity: &InvocationIdentity) -> ProfileMatch;

    /// Optional second-stage shape guard. It can reject an identity match but
    /// cannot create one.
    fn shape_guard(&self, _context: &RouteContext<'_>) -> ProfileMatch {
        ProfileMatch::Match
    }

    fn analyze(&self, context: &ProfileContext<'_>) -> Result<AnalysisBundle, ProfileError>;

    fn render(
        &self,
        analysis: &dyn ProfileAnalysis,
        writer: &mut LeanWriter,
    ) -> Result<(), ProfileError>;

    fn validate(
        &self,
        _analysis: &dyn ProfileAnalysis,
        _rendered: &RenderedOutput,
    ) -> Result<(), ProfileError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn descriptor_components_are_deliberately_narrow() {
        for valid in ["cargo-test", "rust.cargo", "python_pytest", "v1"] {
            assert_eq!(validate_component(valid), Ok(()));
        }

        for invalid in ["", "Cargo", "-cargo", "cargo/test", "cargo test", "café"] {
            assert_eq!(validate_component(invalid), Err(()));
        }
    }
}
