//! Conservative invocation identity for Protocol V1.
//!
//! This module never executes shell text. It only recognizes a deliberately
//! narrow subset that is safe enough to use for profile routing.

use crate::protocol::{ObservationV1, ShellDialectV1, SourceV1};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InvocationIdentity {
    Source(SourceV1),
    Shell(CommandRecognition),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommandRecognition {
    Direct(CommandIdentity),
    ComplexOrUnknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandIdentity {
    /// Executable token exactly as observed after any admitted POSIX env prefix.
    pub executable: String,
    /// Lexical basename used for command-family routing. No filesystem lookup.
    pub program: String,
    /// Remaining bare arguments, preserved exactly as tokens.
    pub args: Vec<String>,
}

pub fn identify_invocation(observation: &ObservationV1) -> InvocationIdentity {
    if observation.source != SourceV1::Shell {
        return InvocationIdentity::Source(observation.source);
    }

    let recognition = observation
        .command
        .as_deref()
        .map(|command| recognize_shell_command(command, observation.shell_dialect))
        .unwrap_or(CommandRecognition::ComplexOrUnknown);

    InvocationIdentity::Shell(recognition)
}

pub fn recognize_shell_command(command: &str, dialect: ShellDialectV1) -> CommandRecognition {
    if command.is_empty()
        || command
            .chars()
            .any(|ch| ch.is_ascii_whitespace() && !matches!(ch, ' ' | '\t'))
    {
        return CommandRecognition::ComplexOrUnknown;
    }

    let tokens: Vec<&str> = command
        .split([' ', '\t'])
        .filter(|token| !token.is_empty())
        .collect();
    if tokens.is_empty() {
        return CommandRecognition::ComplexOrUnknown;
    }

    let executable_index = match dialect {
        ShellDialectV1::Posix => skip_posix_assignments(&tokens),
        ShellDialectV1::Unknown | ShellDialectV1::PowerShell | ShellDialectV1::Cmd => 0,
    };

    if executable_index >= tokens.len() {
        return CommandRecognition::ComplexOrUnknown;
    }

    let executable = tokens[executable_index];
    if !is_portable_executable_token(executable) {
        return CommandRecognition::ComplexOrUnknown;
    }

    let args = &tokens[executable_index + 1..];
    if !args.iter().all(|token| is_portable_bare_token(token)) {
        return CommandRecognition::ComplexOrUnknown;
    }

    let program = lexical_program_name(executable);
    if program.is_empty() || program == "." || program == ".." {
        return CommandRecognition::ComplexOrUnknown;
    }

    CommandRecognition::Direct(CommandIdentity {
        executable: executable.to_owned(),
        program: program.to_owned(),
        args: args.iter().map(|arg| (*arg).to_owned()).collect(),
    })
}

fn skip_posix_assignments(tokens: &[&str]) -> usize {
    let mut index = 0;
    while let Some(token) = tokens.get(index) {
        if !is_unambiguous_posix_assignment(token) {
            break;
        }
        index += 1;
    }
    index
}

fn is_unambiguous_posix_assignment(token: &str) -> bool {
    let Some((name, value)) = token.split_once('=') else {
        return false;
    };

    if !is_posix_name(name) {
        return false;
    }

    value.is_empty() || is_portable_bare_token(value)
}

fn is_posix_name(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    (first == '_' || first.is_ascii_alphabetic())
        && chars.all(|ch| ch == '_' || ch.is_ascii_alphanumeric())
}

/// Portable bare-token grammar used when shell semantics are not known.
///
/// The allowlist is intentionally narrow. Anything that could plausibly carry
/// shell quoting, expansion, substitution, grouping, globbing, redirection, or
/// command chaining is rejected rather than interpreted.
fn is_portable_executable_token(token: &str) -> bool {
    !token.ends_with('/')
        && !token.ends_with('\\')
        && is_portable_bare_token(token)
        && !token.contains('=')
}

fn is_portable_bare_token(token: &str) -> bool {
    !token.is_empty()
        && token.chars().all(|ch| {
            ch.is_ascii_alphanumeric()
                || matches!(ch, '_' | '-' | '.' | '/' | ':' | '=' | '@' | '+' | ',')
        })
}

fn lexical_program_name(executable: &str) -> &str {
    executable
        .rsplit(['/', '\\'])
        .find(|segment| !segment.is_empty())
        .unwrap_or("")
}

#[cfg(test)]
mod tests {
    use super::{is_unambiguous_posix_assignment, lexical_program_name};

    #[test]
    fn recognizes_unambiguous_posix_assignment_shape() {
        assert!(is_unambiguous_posix_assignment("FOO=bar"));
        assert!(is_unambiguous_posix_assignment("_A="));
        assert!(is_unambiguous_posix_assignment("PATH=/usr/bin:/bin"));
        assert!(is_unambiguous_posix_assignment("RUSTFLAGS=-Dwarnings"));

        assert!(!is_unambiguous_posix_assignment("1FOO=bar"));
        assert!(!is_unambiguous_posix_assignment("FOO+=bar"));
        assert!(!is_unambiguous_posix_assignment("FOO=$BAR"));
        assert!(!is_unambiguous_posix_assignment("FOO=bar baz"));
    }

    #[test]
    fn lexical_program_name_does_not_touch_filesystem() {
        assert_eq!(lexical_program_name("git"), "git");
        assert_eq!(lexical_program_name("/usr/bin/git"), "git");
        assert_eq!(lexical_program_name("./node_modules/.bin/eslint"), "eslint");
        assert_eq!(lexical_program_name("C:\\tools\\cargo.exe"), "cargo.exe");
    }
}
