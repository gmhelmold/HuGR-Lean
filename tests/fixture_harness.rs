mod support;

use std::path::{Path, PathBuf};

use hugr_lean::engine::{Engine, EngineConfig};

use support::fixture::{parse_case_toml, verify_fixture, LoadedFixture};
use support::proving_profile::{ProvingProfile, PROOF_SIGNAL_NAME};

fn fixture_root(relative: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures")
        .join(relative)
}

#[test]
fn e0_seed_fixtures_execute_against_default_engine() {
    let engine = Engine::default();

    for relative in [
        "seed/unknown-repeated-lines",
        "seed/exact-patch-like",
        "seed/incomplete-test-like",
    ] {
        let fixture = LoadedFixture::load(fixture_root(relative)).unwrap();
        verify_fixture(&engine, &fixture).unwrap_or_else(|error| panic!("{relative}: {error}"));
    }
}

#[test]
fn proving_fixture_traverses_real_profile_pipeline() {
    let engine = Engine::new(EngineConfig::default(), vec![Box::new(ProvingProfile)]).unwrap();
    let fixture = LoadedFixture::load(fixture_root("proving/engine-path")).unwrap();

    verify_fixture(&engine, &fixture).unwrap();
}

#[test]
fn fixture_parser_rejects_unknown_metadata_fields() {
    let invalid = r#"
schema = 1
id = "invalid"
kind = "core"
unexpected = true

[observation]
source = "other"
command = ""
shell_dialect = "unknown"
termination = "unknown"
completeness = "complete"
presentation = "unknown"

[expect]
decision = "passthrough"
profile = ""
required_literals = []
forbidden_literals = []
properties = []

[preservation]
mandatory_signal_ids = []
permitted_removals = []

[provenance]
kind = "synthetic"
source_repo = ""
source_commit = ""
source_path = ""
license = ""
origin_issue = 25
notes = ""
"#;

    assert!(parse_case_toml(invalid).is_err());
}

#[test]
fn fixture_loader_maps_exited_termination_only_with_exit_code() {
    let fixture = LoadedFixture::load(fixture_root("proving/engine-path")).unwrap();
    let observation = fixture.observation().unwrap();

    assert_eq!(observation.termination.code, Some(0));
}

#[test]
fn fixture_loader_rejects_contradictory_or_missing_exit_codes() {
    let mut contradictory = LoadedFixture::load(fixture_root("proving/engine-path")).unwrap();
    contradictory.case.observation.termination = hugr_lean::protocol::TerminationKindV1::Unknown;
    assert!(contradictory.observation().is_err());

    let mut missing = LoadedFixture::load(fixture_root("proving/engine-path")).unwrap();
    missing.case.observation.exit_code = None;
    assert!(missing.observation().is_err());
}

#[test]
fn proving_fixture_annotation_matches_runtime_preservation_signal() {
    let fixture = LoadedFixture::load(fixture_root("proving/engine-path")).unwrap();

    assert_eq!(
        fixture.case.preservation.mandatory_signal_ids,
        vec![PROOF_SIGNAL_NAME.to_owned()]
    );
}

#[test]
fn proving_profile_is_not_registered_by_default() {
    let fixture = LoadedFixture::load(fixture_root("proving/engine-path")).unwrap();
    let error = verify_fixture(&Engine::default(), &fixture).unwrap_err();

    assert!(error.to_string().contains("expected decision Reduced"));
}


#[test]
fn normalization_kind_requires_normalization_metadata() {
    let invalid = r#"
schema = 1
id = "invalid-normalization"
kind = "normalization"

[observation]
source = "other"
command = ""
shell_dialect = "unknown"
termination = "unknown"
completeness = "complete"
presentation = "terminal_rendered"

[expect]
decision = "passthrough"
profile = ""
required_literals = []
forbidden_literals = []
properties = []

[preservation]
mandatory_signal_ids = []
permitted_removals = []

[provenance]
kind = "synthetic"
source_repo = ""
source_commit = ""
source_path = ""
license = ""
origin_issue = 27
notes = ""
"#;

    let case = parse_case_toml(invalid).unwrap();
    assert!(support::fixture::validate_fixture_case(&case).is_err());
}

#[test]
fn normalization_metadata_is_forbidden_on_non_normalization_kind() {
    let invalid = r#"
schema = 1
id = "invalid-core"
kind = "core"

[observation]
source = "other"
command = ""
shell_dialect = "unknown"
termination = "unknown"
completeness = "complete"
presentation = "unknown"

[expect]
decision = "passthrough"
profile = ""
required_literals = []
forbidden_literals = []
properties = []

[preservation]
mandatory_signal_ids = []
permitted_removals = []

[provenance]
kind = "synthetic"
source_repo = ""
source_commit = ""
source_path = ""
license = ""
origin_issue = 27
notes = ""

[normalization]
primitive = "strip_sgr"
"#;

    let case = parse_case_toml(invalid).unwrap();
    assert!(support::fixture::validate_fixture_case(&case).is_err());
}
