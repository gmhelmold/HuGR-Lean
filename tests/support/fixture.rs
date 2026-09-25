use std::fmt;
use std::fs;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::Path;

use hugr_lean::engine::Engine;
use hugr_lean::normalize::terminal_safe_text;
use hugr_lean::protocol::{
    CompletenessV1, DecisionV1, ObservationV1, PresentationV1, ShellDialectV1, SourceV1,
    TerminationKindV1, TerminationV1, PROTOCOL_V1,
};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixtureCase {
    pub schema: u16,
    pub id: String,
    pub kind: FixtureKind,
    pub observation: FixtureObservation,
    pub expect: FixtureExpectation,
    pub preservation: FixturePreservation,
    pub provenance: FixtureProvenance,
    pub normalization: Option<FixtureNormalization>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixtureNormalization {
    pub primitive: NormalizationPrimitive,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NormalizationPrimitive {
    StripSgr,
    CollapseCarriageRedraws,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FixtureKind {
    Core,
    Normalization,
    Profile,
    Integration,
    Regression,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixtureObservation {
    pub source: SourceV1,
    pub command: String,
    pub shell_dialect: FixtureShellDialect,
    pub termination: TerminationKindV1,
    pub exit_code: Option<i32>,
    pub completeness: CompletenessV1,
    pub presentation: PresentationV1,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FixtureShellDialect {
    Unknown,
    Posix,
    Powershell,
    Cmd,
}

impl From<FixtureShellDialect> for ShellDialectV1 {
    fn from(value: FixtureShellDialect) -> Self {
        match value {
            FixtureShellDialect::Unknown => Self::Unknown,
            FixtureShellDialect::Posix => Self::Posix,
            FixtureShellDialect::Powershell => Self::PowerShell,
            FixtureShellDialect::Cmd => Self::Cmd,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixtureExpectation {
    pub decision: DecisionV1,
    pub profile: String,
    pub golden: Option<String>,
    #[serde(default)]
    pub required_literals: Vec<String>,
    #[serde(default)]
    pub forbidden_literals: Vec<String>,
    #[serde(default)]
    pub properties: Vec<FixtureProperty>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FixtureProperty {
    NonExpanding,
    Idempotent,
    PassthroughExact,
    NoPanic,
    PreservesRequiredLiterals,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixturePreservation {
    #[serde(default)]
    pub mandatory_signal_ids: Vec<String>,
    #[serde(default)]
    pub permitted_removals: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixtureProvenance {
    pub kind: FixtureProvenanceKind,
    pub source_repo: String,
    pub source_commit: String,
    pub source_path: String,
    pub license: String,
    pub origin_issue: u64,
    pub notes: String,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FixtureProvenanceKind {
    Synthetic,
    Captured,
    Donor,
    Regression,
}

#[derive(Debug, Clone)]
pub struct LoadedFixture {
    pub case: FixtureCase,
    pub input: String,
    pub expected: Option<String>,
}

impl LoadedFixture {
    pub fn load(root: impl AsRef<Path>) -> Result<Self, HarnessError> {
        let root = root.as_ref().to_path_buf();
        let case_text = read(&root.join("case.toml"))?;
        let case = parse_case_toml(&case_text)?;

        if case.schema != 1 {
            return Err(HarnessError::new(format!(
                "fixture {} uses unsupported schema {}",
                case.id, case.schema
            )));
        }
        if case.id.is_empty() {
            return Err(HarnessError::new("fixture id must not be empty"));
        }

        let directory_id = root
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| HarnessError::new("fixture directory must have a UTF-8 name"))?;
        if directory_id != case.id {
            return Err(HarnessError::new(format!(
                "fixture id {:?} does not match directory {:?}",
                case.id, directory_id
            )));
        }

        validate_kind_and_provenance(&case)?;
        validate_normalization_metadata(&case)?;
        validate_provenance(&case)?;
        validate_preservation_metadata(&case)?;

        let input = read(&root.join("input.txt"))?;
        let expected = match &case.expect.golden {
            Some(path) => {
                validate_relative_fixture_path(path)?;
                Some(read(&root.join(path))?)
            }
            None => None,
        };

        Ok(Self {
            case,
            input,
            expected,
        })
    }

    pub fn observation(&self) -> Result<ObservationV1, HarnessError> {
        let termination = TerminationV1 {
            kind: self.case.observation.termination,
            code: self.case.observation.exit_code,
        };
        termination
            .validate()
            .map_err(|error| HarnessError::new(error.to_string()))?;

        let observation = ObservationV1 {
            schema_version: PROTOCOL_V1,
            source: self.case.observation.source,
            command: nonempty(&self.case.observation.command),
            shell_dialect: self.case.observation.shell_dialect.into(),
            output: self.input.clone(),
            termination,
            completeness: self.case.observation.completeness,
            presentation: self.case.observation.presentation,
        };
        observation
            .validate()
            .map_err(|error| HarnessError::new(error.to_string()))?;
        Ok(observation)
    }
}

pub fn parse_case_toml(input: &str) -> Result<FixtureCase, HarnessError> {
    toml::from_str(input)
        .map_err(|error| HarnessError::new(format!("invalid fixture TOML: {error}")))
}

pub fn verify_fixture(engine: &Engine, fixture: &LoadedFixture) -> Result<(), HarnessError> {
    let observation = fixture.observation()?;
    let input = observation.output.clone();

    let result = catch_unwind(AssertUnwindSafe(|| engine.process(observation.clone())))
        .map_err(|_| HarnessError::new(format!("fixture {} panicked", fixture.case.id)))?
        .map_err(|error| HarnessError::new(error.to_string()))?;

    if result.decision != fixture.case.expect.decision {
        return Err(HarnessError::new(format!(
            "fixture {} expected decision {:?}, got {:?}",
            fixture.case.id, fixture.case.expect.decision, result.decision
        )));
    }

    let expected_profile = nonempty(&fixture.case.expect.profile);
    if result.profile.as_deref() != expected_profile.as_deref() {
        return Err(HarnessError::new(format!(
            "fixture {} expected profile {:?}, got {:?}",
            fixture.case.id, expected_profile, result.profile
        )));
    }

    let effective = result.replacement.as_deref().unwrap_or(&input);

    if let Some(expected) = &fixture.expected {
        if effective != expected {
            return Err(HarnessError::new(format!(
                "fixture {} golden output mismatch",
                fixture.case.id
            )));
        }
    }

    for literal in &fixture.case.expect.required_literals {
        if !effective.contains(literal) {
            return Err(HarnessError::new(format!(
                "fixture {} lost required literal {:?}",
                fixture.case.id, literal
            )));
        }
    }

    for literal in &fixture.case.expect.forbidden_literals {
        if effective.contains(literal) {
            return Err(HarnessError::new(format!(
                "fixture {} retained forbidden literal {:?}",
                fixture.case.id, literal
            )));
        }
    }

    for property in &fixture.case.expect.properties {
        verify_property(*property, engine, &observation, &result, effective)?;
    }

    Ok(())
}

pub fn verify_normalization_fixture(fixture: &LoadedFixture) -> Result<(), HarnessError> {
    if fixture.case.kind != FixtureKind::Normalization {
        return Err(HarnessError::new(format!(
            "fixture {} is not a normalization fixture",
            fixture.case.id
        )));
    }

    let normalization = fixture
        .case
        .normalization
        .as_ref()
        .ok_or_else(|| HarnessError::new("normalization fixture missing primitive"))?;

    let observation = fixture.observation()?;
    let input = observation.output.clone();

    let effective = catch_unwind(AssertUnwindSafe(|| {
        let Some(terminal) = terminal_safe_text(&observation) else {
            return input.clone();
        };

        match normalization.primitive {
            NormalizationPrimitive::StripSgr => terminal.strip_sgr(),
            NormalizationPrimitive::CollapseCarriageRedraws => {
                terminal.collapse_carriage_redraws()
            }
        }
    }))
    .map_err(|_| HarnessError::new(format!("fixture {} panicked", fixture.case.id)))?;

    let decision = if effective == input {
        DecisionV1::Passthrough
    } else {
        DecisionV1::Normalized
    };

    if decision != fixture.case.expect.decision {
        return Err(HarnessError::new(format!(
            "fixture {} expected decision {:?}, got {:?}",
            fixture.case.id, fixture.case.expect.decision, decision
        )));
    }

    if !fixture.case.expect.profile.is_empty() {
        return Err(HarnessError::new(
            "normalization fixtures must not declare a profile",
        ));
    }

    if let Some(expected) = &fixture.expected {
        if &effective != expected {
            return Err(HarnessError::new(format!(
                "fixture {} golden output mismatch",
                fixture.case.id
            )));
        }
    }

    for literal in &fixture.case.expect.required_literals {
        if !effective.contains(literal) {
            return Err(HarnessError::new(format!(
                "fixture {} lost required literal {:?}",
                fixture.case.id, literal
            )));
        }
    }

    for literal in &fixture.case.expect.forbidden_literals {
        if effective.contains(literal) {
            return Err(HarnessError::new(format!(
                "fixture {} retained forbidden literal {:?}",
                fixture.case.id, literal
            )));
        }
    }

    for property in &fixture.case.expect.properties {
        match property {
            FixtureProperty::NonExpanding => {
                if effective.len() > input.len() {
                    return Err(HarnessError::new("non_expanding property failed"));
                }
            }
            FixtureProperty::Idempotent => {
                let mut second_observation = observation.clone();
                second_observation.output = effective.clone();
                let second = match terminal_safe_text(&second_observation) {
                    Some(terminal) => match normalization.primitive {
                        NormalizationPrimitive::StripSgr => terminal.strip_sgr(),
                        NormalizationPrimitive::CollapseCarriageRedraws => {
                            terminal.collapse_carriage_redraws()
                        }
                    },
                    None => effective.clone(),
                };
                if second != effective {
                    return Err(HarnessError::new("idempotence property failed"));
                }
            }
            FixtureProperty::PassthroughExact => {
                if decision != DecisionV1::Passthrough || effective != input {
                    return Err(HarnessError::new("passthrough_exact property failed"));
                }
            }
            FixtureProperty::NoPanic => {}
            FixtureProperty::PreservesRequiredLiterals => {}
        }
    }

    Ok(())
}

fn verify_property(
    property: FixtureProperty,
    engine: &Engine,
    observation: &ObservationV1,
    result: &hugr_lean::protocol::FilterResultV1,
    effective: &str,
) -> Result<(), HarnessError> {
    match property {
        FixtureProperty::NonExpanding => {
            if effective.len() > observation.output.len()
                || result.metrics.output_bytes > result.metrics.input_bytes
            {
                return Err(HarnessError::new("non_expanding property failed"));
            }
        }
        FixtureProperty::Idempotent => {
            let mut second_observation = observation.clone();
            second_observation.output = effective.to_owned();
            let second = catch_unwind(AssertUnwindSafe(|| engine.process(second_observation)))
                .map_err(|_| HarnessError::new("idempotence re-run panicked"))?
                .map_err(|error| HarnessError::new(error.to_string()))?;
            let second_effective = second.replacement.as_deref().unwrap_or(effective);
            if second_effective != effective {
                return Err(HarnessError::new("idempotence property failed"));
            }
        }
        FixtureProperty::PassthroughExact => {
            if result.decision != DecisionV1::Passthrough || effective != observation.output {
                return Err(HarnessError::new("passthrough_exact property failed"));
            }
        }
        FixtureProperty::NoPanic => {
            // The main verification call is already wrapped in catch_unwind.
        }
        FixtureProperty::PreservesRequiredLiterals => {
            // Required literals are checked unconditionally above.
        }
    }

    Ok(())
}

fn validate_normalization_metadata(case: &FixtureCase) -> Result<(), HarnessError> {
    match (case.kind, case.normalization.as_ref()) {
        (FixtureKind::Normalization, Some(_)) => Ok(()),
        (FixtureKind::Normalization, None) => Err(HarnessError::new(
            "normalization fixture kind requires [normalization] metadata",
        )),
        (_, Some(_)) => Err(HarnessError::new(
            "[normalization] metadata requires fixture kind = normalization",
        )),
        (_, None) => Ok(()),
    }
}

fn validate_kind_and_provenance(case: &FixtureCase) -> Result<(), HarnessError> {
    match (case.kind, case.provenance.kind) {
        (FixtureKind::Regression, FixtureProvenanceKind::Regression) => Ok(()),
        (FixtureKind::Regression, _) => Err(HarnessError::new(
            "regression fixture kind requires regression provenance",
        )),
        (_, FixtureProvenanceKind::Regression) => Err(HarnessError::new(
            "regression provenance requires fixture kind = regression",
        )),
        _ => Ok(()),
    }
}

fn validate_preservation_metadata(case: &FixtureCase) -> Result<(), HarnessError> {
    if case
        .preservation
        .mandatory_signal_ids
        .iter()
        .any(|value| value.is_empty())
    {
        return Err(HarnessError::new(
            "mandatory_signal_ids must not contain empty values",
        ));
    }

    if case
        .preservation
        .permitted_removals
        .iter()
        .any(|value| value.is_empty())
    {
        return Err(HarnessError::new(
            "permitted_removals must not contain empty values",
        ));
    }

    Ok(())
}

fn validate_relative_fixture_path(value: &str) -> Result<(), HarnessError> {
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(HarnessError::new(
            "fixture golden path must remain inside the fixture directory",
        ));
    }

    Ok(())
}

fn validate_provenance(case: &FixtureCase) -> Result<(), HarnessError> {
    match case.provenance.kind {
        FixtureProvenanceKind::Synthetic => Ok(()),
        FixtureProvenanceKind::Captured => {
            if case.provenance.notes.is_empty() {
                Err(HarnessError::new(
                    "captured fixture provenance requires reproduction notes",
                ))
            } else {
                Ok(())
            }
        }
        FixtureProvenanceKind::Donor => {
            if [
                &case.provenance.source_repo,
                &case.provenance.source_commit,
                &case.provenance.source_path,
                &case.provenance.license,
            ]
            .iter()
            .any(|value| value.is_empty())
            {
                Err(HarnessError::new(
                    "donor fixture provenance requires repo, commit, path, and license",
                ))
            } else {
                Ok(())
            }
        }
        FixtureProvenanceKind::Regression => {
            if case.provenance.origin_issue == 0 {
                Err(HarnessError::new(
                    "regression fixture provenance requires origin_issue",
                ))
            } else {
                Ok(())
            }
        }
    }
}

fn read(path: &Path) -> Result<String, HarnessError> {
    fs::read_to_string(path)
        .map_err(|error| HarnessError::new(format!("{}: {error}", path.display())))
}

fn nonempty(value: &str) -> Option<String> {
    if value.is_empty() {
        None
    } else {
        Some(value.to_owned())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HarnessError(String);

impl HarnessError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for HarnessError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for HarnessError {}
