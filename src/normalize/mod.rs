//! Conservative terminal-only SafeNormalization primitives.
//!
//! Public access is applicability-gated by PresentationV1::TerminalRendered.
//! The individual transformations intentionally recognize only narrow cases
//! whose presentation semantics can be established mechanically.

use crate::protocol::{ObservationV1, PresentationV1};

pub struct TerminalSafeText<'a> {
    text: &'a str,
}

impl<'a> TerminalSafeText<'a> {
    pub fn text(&self) -> &'a str {
        self.text
    }

    /// Remove only recognized SGR styling sequences:
    ///
    /// ESC [ [0-9;:]* m
    ///
    /// Other CSI/OSC/control sequences remain untouched.
    pub fn strip_sgr(&self) -> String {
        strip_recognized_sgr(self.text)
    }

    /// Collapse carriage-return redraws only when every frame is non-empty
    /// printable ASCII and frame widths never shrink.
    ///
    /// For that admitted grammar, each next frame necessarily overwrites every
    /// display column written by its predecessor, so the final visible content
    /// is exactly the final frame.
    pub fn collapse_carriage_redraws(&self) -> String {
        collapse_monotonic_ascii_redraws(self.text)
    }
}

/// Establish whether generic terminal SafeNormalization is allowed.
///
/// Source/tool identity is deliberately irrelevant here. A shell observation
/// does not imply terminal presentation semantics.
pub fn terminal_safe_text(observation: &ObservationV1) -> Option<TerminalSafeText<'_>> {
    if observation.presentation == PresentationV1::TerminalRendered {
        Some(TerminalSafeText {
            text: &observation.output,
        })
    } else {
        None
    }
}



#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SafeNormalizationOutcome {
    NotApplicable,
    Unchanged,
    Changed(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SafeNormalizationError {
    Expanded,
    NonIdempotent,
}

/// Compose all currently admitted generic terminal normalizations.
///
/// Order is intentional:
///
/// 1. strip proven SGR styling;
/// 2. evaluate carriage-redraw proof on the resulting visible ASCII frames.
///
/// The function self-checks non-expansion and idempotence before returning a
/// changed baseline.
pub fn safe_normalize(
    observation: &ObservationV1,
) -> Result<SafeNormalizationOutcome, SafeNormalizationError> {
    if observation.presentation != PresentationV1::TerminalRendered {
        return Ok(SafeNormalizationOutcome::NotApplicable);
    }

    let candidate = compose_terminal_normalization(&observation.output);
    validate_composed_candidate(&observation.output, &candidate)?;

    if candidate == observation.output {
        Ok(SafeNormalizationOutcome::Unchanged)
    } else {
        Ok(SafeNormalizationOutcome::Changed(candidate))
    }
}

fn compose_terminal_normalization(input: &str) -> String {
    let without_sgr = strip_recognized_sgr(input);
    collapse_monotonic_ascii_redraws(&without_sgr)
}

fn validate_composed_candidate(
    input: &str,
    candidate: &str,
) -> Result<(), SafeNormalizationError> {
    if candidate.len() > input.len() {
        return Err(SafeNormalizationError::Expanded);
    }

    if compose_terminal_normalization(candidate) != candidate {
        return Err(SafeNormalizationError::NonIdempotent);
    }

    Ok(())
}

fn strip_recognized_sgr(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output = String::with_capacity(input.len());
    let mut index = 0;

    while index < bytes.len() {
        if let Some(end) = recognized_sgr_end(bytes, index) {
            index = end;
            continue;
        }

        let character = input[index..]
            .chars()
            .next()
            .expect("index remains on a valid UTF-8 boundary");
        output.push(character);
        index += character.len_utf8();
    }

    output
}

fn recognized_sgr_end(bytes: &[u8], start: usize) -> Option<usize> {
    if bytes.get(start) != Some(&0x1b) || bytes.get(start + 1) != Some(&b'[') {
        return None;
    }

    let mut index = start + 2;
    while let Some(byte) = bytes.get(index) {
        if byte.is_ascii_digit() || matches!(byte, b';' | b':') {
            index += 1;
            continue;
        }

        return (*byte == b'm').then_some(index + 1);
    }

    None
}

fn collapse_monotonic_ascii_redraws(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut line_start = 0;

    for (newline_index, _) in input.match_indices('\n') {
        let raw_line = &input[line_start..newline_index];

        if let Some(body) = raw_line.strip_suffix('\r') {
            output.push_str(collapse_redraw_body(body).unwrap_or(body));
            output.push_str("\r\n");
        } else {
            output.push_str(collapse_redraw_body(raw_line).unwrap_or(raw_line));
            output.push('\n');
        }

        line_start = newline_index + 1;
    }

    let tail = &input[line_start..];
    output.push_str(collapse_redraw_body(tail).unwrap_or(tail));
    output
}

fn collapse_redraw_body(body: &str) -> Option<&str> {
    if !body.contains('\r') {
        return None;
    }

    let mut previous_width = 0;
    let mut final_frame = None;
    let mut frame_count = 0;

    for frame in body.split('\r') {
        if frame.is_empty() || !frame.bytes().all(|byte| (0x20..=0x7e).contains(&byte)) {
            return None;
        }

        if frame.len() < previous_width {
            return None;
        }

        previous_width = frame.len();
        final_frame = Some(frame);
        frame_count += 1;
    }

    (frame_count >= 2).then_some(final_frame?)
}

#[cfg(test)]
mod tests {
    use super::{
        collapse_monotonic_ascii_redraws, safe_normalize, strip_recognized_sgr,
        validate_composed_candidate, SafeNormalizationError, SafeNormalizationOutcome,
    };
    use crate::protocol::{
        CompletenessV1, ObservationV1, PresentationV1, ShellDialectV1, SourceV1, TerminationV1,
        PROTOCOL_V1,
    };

    #[test]
    fn strips_only_recognized_sgr_sequences() {
        assert_eq!(
            strip_recognized_sgr("\u{1b}[31mred\u{1b}[0m plain"),
            "red plain"
        );
        assert_eq!(
            strip_recognized_sgr("\u{1b}[38;2;255;0;128mtrue\u{1b}[m"),
            "true"
        );
        assert_eq!(
            strip_recognized_sgr("\u{1b}[38:5:42mindexed\u{1b}[0m"),
            "indexed"
        );
    }

    #[test]
    fn leaves_unknown_or_malformed_escape_sequences_exact() {
        for value in [
            "\u{1b}[2Jclear",
            "\u{1b}[Hhome",
            "\u{1b}[31unterminated",
            "\u{1b}]8;;https://example.com\u{1b}\\\\link\u{1b}]8;;\u{1b}\\\\",
            "literal [31m",
        ] {
            assert_eq!(strip_recognized_sgr(value), value);
        }
    }

    #[test]
    fn sgr_stripping_preserves_unicode_payload() {
        assert_eq!(
            strip_recognized_sgr("α \u{1b}[1m中😀\u{1b}[22m ω"),
            "α 中😀 ω"
        );
    }

    #[test]
    fn sgr_primitive_is_idempotent_and_non_expanding() {
        for value in [
            "",
            "plain",
            "\u{1b}[31mred\u{1b}[0m",
            "\u{1b}[2Jnot-sgr",
            "é\u{1b}[1m中\u{1b}[0m",
        ] {
            let once = strip_recognized_sgr(value);
            let twice = strip_recognized_sgr(&once);
            assert_eq!(twice, once);
            assert!(once.len() <= value.len());
        }
    }

    #[test]
    fn collapses_monotonic_ascii_progress_and_spinner_redraws() {
        assert_eq!(
            collapse_monotonic_ascii_redraws("9%\r10%\r100%\n"),
            "100%\n"
        );
        assert_eq!(
            collapse_monotonic_ascii_redraws("|\r/\r-\rDone\n"),
            "Done\n"
        );
        assert_eq!(collapse_monotonic_ascii_redraws("abc\rdef\rghi"), "ghi");
    }

    #[test]
    fn preserves_shrinking_or_non_ascii_redraws() {
        for value in [
            "100%\r9%\n",
            "Done\r|\n",
            "éé\rabc\n",
            "abc\r中中\n",
            "abc\r\tdef\n",
            "abc\r\n",
            "abc\r",
        ] {
            assert_eq!(collapse_monotonic_ascii_redraws(value), value);
        }
    }

    #[test]
    fn preserves_crlf_while_collapsing_safe_redraw_body() {
        assert_eq!(
            collapse_monotonic_ascii_redraws("10%\r20%\r\nnext\r\n"),
            "20%\r\nnext\r\n"
        );
    }

    #[test]
    fn redraw_primitive_is_idempotent_and_non_expanding() {
        for value in [
            "",
            "plain\n",
            "9%\r10%\r100%\n",
            "|\r/\r-\rDone\n",
            "100%\r9%\n",
            "a\rbb\rccc\rdddd",
            "a\nb\rcc\nc",
        ] {
            let once = collapse_monotonic_ascii_redraws(value);
            let twice = collapse_monotonic_ascii_redraws(&once);
            assert_eq!(twice, once);
            assert!(once.len() <= value.len());
        }
    }

    fn observation(presentation: PresentationV1, output: &str) -> ObservationV1 {
        ObservationV1 {
            schema_version: PROTOCOL_V1,
            source: SourceV1::Other,
            command: None,
            shell_dialect: ShellDialectV1::Unknown,
            output: output.to_owned(),
            termination: TerminationV1::unknown(),
            completeness: CompletenessV1::Complete,
            presentation,
        }
    }

    #[test]
    fn composed_normalization_strips_sgr_before_proving_redraw() {
        let input = "\u{1b}[31m9%\u{1b}[0m\r\u{1b}[33m10%\u{1b}[0m\r\u{1b}[32m100%\u{1b}[0m\n";
        let result = safe_normalize(&observation(PresentationV1::TerminalRendered, input)).unwrap();

        assert_eq!(
            result,
            SafeNormalizationOutcome::Changed("100%\n".to_owned())
        );
    }

    #[test]
    fn composed_normalization_is_not_applicable_without_presentation_provenance() {
        let input = "\u{1b}[31m9%\u{1b}[0m\r100%\n";
        let result = safe_normalize(&observation(PresentationV1::Unknown, input)).unwrap();

        assert_eq!(result, SafeNormalizationOutcome::NotApplicable);
    }

    #[test]
    fn composed_normalization_reports_unchanged_for_safe_plain_terminal_text() {
        let result = safe_normalize(&observation(
            PresentationV1::TerminalRendered,
            "plain terminal text\n",
        ))
        .unwrap();

        assert_eq!(result, SafeNormalizationOutcome::Unchanged);
    }

    #[test]
    fn composed_candidate_validation_rejects_expansion_and_non_idempotence() {
        assert_eq!(
            validate_composed_candidate("x", "xx"),
            Err(SafeNormalizationError::Expanded)
        );
        assert_eq!(
            validate_composed_candidate("\u{1b}[31mred\u{1b}[0m", "\u{1b}[31mred\u{1b}[0m"),
            Err(SafeNormalizationError::NonIdempotent)
        );
    }

    #[test]
    fn does_not_minify_whitespace_blank_lines_or_repetition() {
        let value = "a\n\n  a  \na\na\n";
        assert_eq!(strip_recognized_sgr(value), value);
        assert_eq!(collapse_monotonic_ascii_redraws(value), value);
    }
}
