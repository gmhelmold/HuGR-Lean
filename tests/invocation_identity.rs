use hugr_lean::command::{
    identify_invocation, recognize_shell_command, CommandIdentity, CommandRecognition,
    InvocationIdentity,
};
use hugr_lean::protocol::{
    CompletenessV1, ObservationV1, PresentationV1, ShellDialectV1, SourceV1, TerminationV1,
    PROTOCOL_V1,
};

fn shell_observation(command: Option<&str>, dialect: ShellDialectV1) -> ObservationV1 {
    ObservationV1 {
        schema_version: PROTOCOL_V1,
        source: SourceV1::Shell,
        command: command.map(str::to_owned),
        shell_dialect: dialect,
        output: String::new(),
        termination: TerminationV1::unknown(),
        completeness: CompletenessV1::Unknown,
        presentation: PresentationV1::Unknown,
    }
}

fn direct(command: &str, dialect: ShellDialectV1) -> CommandIdentity {
    match recognize_shell_command(command, dialect) {
        CommandRecognition::Direct(identity) => identity,
        CommandRecognition::ComplexOrUnknown => {
            panic!("expected direct recognition for {command:?}")
        }
    }
}

fn assert_complex(command: &str, dialect: ShellDialectV1) {
    assert_eq!(
        recognize_shell_command(command, dialect),
        CommandRecognition::ComplexOrUnknown,
        "command should remain conservative: {command:?}"
    );
}

#[test]
fn common_unknown_dialect_bare_commands_route() {
    let cases = [
        ("cargo test", "cargo", vec!["test"]),
        ("git status --short", "git", vec!["status", "--short"]),
        ("pytest -q", "pytest", vec!["-q"]),
        ("npm test", "npm", vec!["test"]),
        (
            "./node_modules/.bin/eslint src/lib.rs",
            "eslint",
            vec!["src/lib.rs"],
        ),
        (
            "/usr/bin/cargo test foo::bar --features=a,b",
            "cargo",
            vec!["test", "foo::bar", "--features=a,b"],
        ),
    ];

    for (command, expected_program, expected_args) in cases {
        let identity = direct(command, ShellDialectV1::Unknown);
        assert_eq!(identity.program, expected_program);
        assert_eq!(identity.args, expected_args);
    }
}

#[test]
fn extra_ascii_whitespace_does_not_change_bare_identity() {
    let identity = direct("  cargo\t test   --locked  ", ShellDialectV1::Unknown);
    assert_eq!(identity.executable, "cargo");
    assert_eq!(identity.program, "cargo");
    assert_eq!(identity.args, ["test", "--locked"]);
}

#[test]
fn non_shell_sources_route_only_by_source() {
    let mut observation = shell_observation(Some("cargo test"), ShellDialectV1::Unknown);
    observation.source = SourceV1::Read;

    assert_eq!(
        identify_invocation(&observation),
        InvocationIdentity::Source(SourceV1::Read)
    );
}

#[test]
fn missing_shell_command_is_complex_or_unknown() {
    let observation = shell_observation(None, ShellDialectV1::Unknown);

    assert_eq!(
        identify_invocation(&observation),
        InvocationIdentity::Shell(CommandRecognition::ComplexOrUnknown)
    );
}

#[test]
fn unknown_dialect_does_not_interpret_posix_env_assignments() {
    assert_complex("FOO=bar cargo test", ShellDialectV1::Unknown);
}

#[test]
fn posix_dialect_skips_only_unambiguous_leading_assignments() {
    let identity = direct(
        "FOO=bar RUSTFLAGS=-Dwarnings cargo test --locked",
        ShellDialectV1::Posix,
    );
    assert_eq!(identity.executable, "cargo");
    assert_eq!(identity.program, "cargo");
    assert_eq!(identity.args, ["test", "--locked"]);
}

#[test]
fn posix_assignment_without_executable_is_not_a_command_identity() {
    assert_complex("FOO=bar", ShellDialectV1::Posix);
    assert_complex("FOO=bar BAR=baz", ShellDialectV1::Posix);
}

#[test]
fn posix_assignment_with_expansion_is_rejected() {
    assert_complex("FOO=$BAR cargo test", ShellDialectV1::Posix);
    assert_complex("PATH=~/bin cargo test", ShellDialectV1::Posix);
}

#[test]
fn unknown_dialect_rejects_quotes_and_escapes() {
    let cases = [
        "cargo test 'foo'",
        "cargo test \"foo\"",
        "cargo test foo\\ bar",
        "printf '%s' value",
    ];

    for command in cases {
        assert_complex(command, ShellDialectV1::Unknown);
    }
}

#[test]
fn unknown_dialect_rejects_variable_and_command_expansion() {
    let cases = [
        "echo $HOME",
        "echo ${HOME}",
        "echo $(pwd)",
        "echo `pwd`",
        "echo ~",
        "echo *.rs",
        "echo file?.rs",
        "echo [ab].rs",
        "echo {a,b}",
    ];

    for command in cases {
        assert_complex(command, ShellDialectV1::Unknown);
    }
}

#[test]
fn rejects_shell_control_operators_and_redirection() {
    let cases = [
        "cargo test | tee out.txt",
        "cargo test || echo fail",
        "cargo test && echo ok",
        "cargo test ; echo ok",
        "cargo test > out.txt",
        "cargo test >> out.txt",
        "cargo test < in.txt",
        "cat << EOF",
        "sleep 1 &",
        "( cargo test )",
    ];

    for command in cases {
        assert_complex(command, ShellDialectV1::Unknown);
    }
}

#[test]
fn rejects_multi_command_newlines_and_carriage_returns() {
    assert_complex("cargo test\necho done", ShellDialectV1::Unknown);
    assert_complex("cargo test\recho done", ShellDialectV1::Unknown);
}

#[test]
fn known_non_posix_dialects_do_not_gain_unimplemented_quote_semantics() {
    for dialect in [ShellDialectV1::PowerShell, ShellDialectV1::Cmd] {
        let identity = direct("cargo test", dialect);
        assert_eq!(identity.program, "cargo");

        assert_complex("cargo test \"quoted arg\"", dialect);
        assert_complex("echo $HOME", dialect);
        assert_complex("echo %PATH%", dialect);
        assert_complex("echo ^value", dialect);
    }
}

#[test]
fn shell_source_identity_uses_command_recognizer() {
    let observation = shell_observation(Some("/usr/bin/git status"), ShellDialectV1::Unknown);

    assert_eq!(
        identify_invocation(&observation),
        InvocationIdentity::Shell(CommandRecognition::Direct(CommandIdentity {
            executable: "/usr/bin/git".to_string(),
            program: "git".to_string(),
            args: vec!["status".to_string()],
        }))
    );
}

#[test]
fn empty_or_only_whitespace_command_is_unknown() {
    assert_complex("", ShellDialectV1::Unknown);
    assert_complex("   \t ", ShellDialectV1::Unknown);
}

#[test]
fn invalid_executable_tokens_are_not_identities() {
    assert_complex(".", ShellDialectV1::Unknown);
    assert_complex("..", ShellDialectV1::Unknown);
    assert_complex("FOO=bar", ShellDialectV1::Unknown);
    assert_complex("/usr/bin/", ShellDialectV1::Unknown);
}
