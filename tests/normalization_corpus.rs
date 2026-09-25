mod support;

use std::fs;
use std::path::{Path, PathBuf};

use hugr_lean::protocol::DecisionV1;
use support::fixture::{
    verify_normalization_fixture, FixtureKind, LoadedFixture, NormalizationPrimitive,
};

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures")
        .join("normalization")
}

fn normalization_fixtures() -> Vec<LoadedFixture> {
    let mut directories: Vec<PathBuf> = fs::read_dir(fixture_root())
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.is_dir())
        .collect();
    directories.sort();

    directories
        .into_iter()
        .map(|path| LoadedFixture::load(path).unwrap())
        .collect()
}

#[test]
fn all_normalization_corpus_cases_execute() {
    let fixtures = normalization_fixtures();
    assert!(
        fixtures.len() >= 12,
        "adversarial normalization corpus unexpectedly small"
    );

    for fixture in fixtures {
        assert_eq!(fixture.case.kind, FixtureKind::Normalization);
        verify_normalization_fixture(&fixture)
            .unwrap_or_else(|error| panic!("{}: {error}", fixture.case.id));
    }
}

#[test]
fn every_primitive_has_positive_and_negative_fixture_evidence() {
    let fixtures = normalization_fixtures();

    for primitive in [
        NormalizationPrimitive::StripSgr,
        NormalizationPrimitive::CollapseCarriageRedraws,
    ] {
        let matching: Vec<_> = fixtures
            .iter()
            .filter(|fixture| {
                fixture
                    .case
                    .normalization
                    .as_ref()
                    .map(|normalization| normalization.primitive == primitive)
                    .unwrap_or(false)
            })
            .collect();

        assert!(
            matching
                .iter()
                .any(|fixture| fixture.case.expect.decision == DecisionV1::Normalized),
            "{primitive:?} has no positive normalized fixture"
        );
        assert!(
            matching
                .iter()
                .any(|fixture| fixture.case.expect.decision == DecisionV1::Passthrough),
            "{primitive:?} has no negative passthrough fixture"
        );
    }
}

#[test]
fn negative_normalization_fixtures_require_exact_passthrough_property() {
    for fixture in normalization_fixtures() {
        if fixture.case.expect.decision != DecisionV1::Passthrough {
            continue;
        }

        let properties = &fixture.case.expect.properties;
        assert!(
            properties
                .iter()
                .any(|property| format!("{property:?}") == "PassthroughExact"),
            "{} negative case does not require passthrough_exact",
            fixture.case.id
        );
    }
}
