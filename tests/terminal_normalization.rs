use hugr_lean::normalize::terminal_safe_text;
use hugr_lean::protocol::{
    CompletenessV1, ObservationV1, PresentationV1, ShellDialectV1, SourceV1, TerminationV1,
    PROTOCOL_V1,
};

fn observation(source: SourceV1, presentation: PresentationV1, output: &str) -> ObservationV1 {
    ObservationV1 {
        schema_version: PROTOCOL_V1,
        source,
        command: Some("cargo test".to_owned()),
        shell_dialect: ShellDialectV1::Unknown,
        output: output.to_owned(),
        termination: TerminationV1::exited(0),
        completeness: CompletenessV1::Complete,
        presentation,
    }
}

#[test]
fn shell_source_does_not_authorize_terminal_normalization() {
    let observation = observation(
        SourceV1::Shell,
        PresentationV1::Unknown,
        "[31mred[0m",
    );

    assert!(terminal_safe_text(&observation).is_none());
}

#[test]
fn terminal_rendered_is_the_applicability_capability() {
    let observation = observation(
        SourceV1::Other,
        PresentationV1::TerminalRendered,
        "[31mred[0m",
    );

    let terminal = terminal_safe_text(&observation).unwrap();
    assert_eq!(terminal.text(), observation.output);
    assert_eq!(terminal.strip_sgr(), "red");
}

#[test]
fn public_terminal_api_exposes_safe_carriage_redraw_primitive() {
    let observation = observation(
        SourceV1::Other,
        PresentationV1::TerminalRendered,
        "9%10%100%
",
    );

    let terminal = terminal_safe_text(&observation).unwrap();
    assert_eq!(terminal.collapse_carriage_redraws(), "100%
");
}

#[test]
fn public_terminal_api_preserves_unsafe_shrinking_redraw() {
    let observation = observation(
        SourceV1::Shell,
        PresentationV1::TerminalRendered,
        "100%9%
",
    );

    let terminal = terminal_safe_text(&observation).unwrap();
    assert_eq!(terminal.collapse_carriage_redraws(), observation.output);
}
