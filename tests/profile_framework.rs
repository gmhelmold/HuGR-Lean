use hugr_lean::command::{CommandRecognition, InvocationIdentity};
use hugr_lean::engine::{Engine, EngineBuildError, EngineConfig};
use hugr_lean::preservation::{LeanWriter, PreservationContract};
use hugr_lean::profile::{
    AnalysisBundle, BoundaryAssumption, Profile, ProfileAnalysis, ProfileContext,
    ProfileDescriptor, ProfileError, ProfileMatch, ProfileRegistry, ProfileRegistryError,
};

struct FrameworkProfile {
    descriptor: ProfileDescriptor,
    program: &'static str,
}

impl FrameworkProfile {
    fn native(id: &'static str, family: &'static str, fixture_family: &'static str) -> Self {
        Self {
            descriptor: ProfileDescriptor::new(
                id,
                family,
                fixture_family,
                BoundaryAssumption::NativeText,
            ),
            program: id,
        }
    }

    fn with_assumption(
        id: &'static str,
        family: &'static str,
        fixture_family: &'static str,
        assumption: BoundaryAssumption,
    ) -> Self {
        Self {
            descriptor: ProfileDescriptor::new(id, family, fixture_family, assumption),
            program: id,
        }
    }
}

impl Profile for FrameworkProfile {
    fn descriptor(&self) -> ProfileDescriptor {
        self.descriptor
    }

    fn recognize(&self, identity: &InvocationIdentity) -> ProfileMatch {
        match identity {
            InvocationIdentity::Shell(CommandRecognition::Direct(command))
                if command.program == self.program =>
            {
                ProfileMatch::Match
            }
            _ => ProfileMatch::NoMatch,
        }
    }

    fn analyze(&self, _context: &ProfileContext<'_>) -> Result<AnalysisBundle, ProfileError> {
        Ok(AnalysisBundle::new(
            Box::new(()),
            PreservationContract::default(),
        ))
    }

    fn render(
        &self,
        _analysis: &dyn ProfileAnalysis,
        writer: &mut LeanWriter,
    ) -> Result<(), ProfileError> {
        writer.static_text("ok");
        Ok(())
    }
}

#[test]
fn registry_accepts_independent_native_and_structured_families() {
    let registry = ProfileRegistry::new(vec![
        Box::new(FrameworkProfile::with_assumption(
            "cargo-test",
            "rust",
            "rust-cargo",
            BoundaryAssumption::NativeText,
        )),
        Box::new(FrameworkProfile::with_assumption(
            "json-lint",
            "diagnostics",
            "lint-json",
            BoundaryAssumption::StructuredText,
        )),
    ])
    .unwrap();

    assert_eq!(registry.len(), 2);
    assert!(!registry.is_empty());
}

#[test]
fn duplicate_profile_ids_are_rejected_before_execution() {
    let error = ProfileRegistry::new(vec![
        Box::new(FrameworkProfile::native("same", "one", "one")),
        Box::new(FrameworkProfile::native("same", "two", "two")),
    ])
    .err()
    .expect("expected admission failure");

    assert_eq!(
        error,
        ProfileRegistryError::DuplicateProfileId { id: "same" }
    );
}

#[test]
fn rewrite_dependent_profile_is_rejected_at_registry_admission() {
    let error = ProfileRegistry::new(vec![Box::new(FrameworkProfile::with_assumption(
        "donor-json",
        "go",
        "go-test",
        BoundaryAssumption::RewriteDependent,
    ))])
    .err()
    .expect("expected admission failure");

    assert_eq!(
        error,
        ProfileRegistryError::RewriteDependent { id: "donor-json" }
    );
}

#[test]
fn invalid_descriptor_components_are_rejected() {
    let invalid_id = ProfileRegistry::new(vec![Box::new(FrameworkProfile::native(
        "Cargo Test",
        "rust",
        "rust-cargo",
    ))])
    .err()
    .expect("expected admission failure");
    assert_eq!(
        invalid_id,
        ProfileRegistryError::InvalidProfileId { id: "Cargo Test" }
    );

    let invalid_family = ProfileRegistry::new(vec![Box::new(FrameworkProfile::native(
        "cargo-test",
        "Rust/Cargo",
        "rust-cargo",
    ))])
    .err()
    .expect("expected admission failure");
    assert_eq!(
        invalid_family,
        ProfileRegistryError::InvalidFamily {
            id: "cargo-test",
            family: "Rust/Cargo",
        }
    );

    let invalid_fixture = ProfileRegistry::new(vec![Box::new(FrameworkProfile::native(
        "cargo-test",
        "rust",
        "../cargo",
    ))])
    .err()
    .expect("expected admission failure");
    assert_eq!(
        invalid_fixture,
        ProfileRegistryError::InvalidFixtureFamily {
            id: "cargo-test",
            fixture_family: "../cargo",
        }
    );
}

#[test]
fn engine_build_propagates_registry_admission_failure() {
    let error = Engine::new(
        EngineConfig::default(),
        vec![Box::new(FrameworkProfile::with_assumption(
            "rewrite-only",
            "go",
            "go-test",
            BoundaryAssumption::RewriteDependent,
        ))],
    )
    .err()
    .expect("expected admission failure");

    assert_eq!(
        error,
        EngineBuildError::Registry(ProfileRegistryError::RewriteDependent { id: "rewrite-only" })
    );
}

#[test]
fn descriptor_is_the_single_source_of_profile_identity() {
    let profile = FrameworkProfile::native("cargo-test", "rust", "rust-cargo");
    let descriptor = profile.descriptor();

    assert_eq!(profile.id(), "cargo-test");
    assert_eq!(descriptor.id(), "cargo-test");
    assert_eq!(descriptor.family(), "rust");
    assert_eq!(descriptor.fixture_family(), "rust-cargo");
    assert_eq!(
        descriptor.boundary_assumption(),
        BoundaryAssumption::NativeText
    );
}
