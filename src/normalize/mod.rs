//! Conservative terminal-only SafeNormalization primitives.
//!
//! Public access is applicability-gated by `PresentationV1::TerminalRendered`.
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
    /// `ESC [ [0-9;:]* m`
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

    for (newline_index, _) in input.match_indices('
') {
        let raw_line = &input[line_start..newline_index];

        if let Some(body) = raw_line.strip_suffix('') {
            output.push_str(collapse_redraw_body(body).unwrap_or(body));
            output.push_str("
");
        } else {
            output.push_str(collapse_redraw_body(raw_line).unwrap_or(raw_line));
            output.push('
');
        }

        line_start = newline_index + 1;
    }

    let tail = &input[line_start..];
    output.push_str(collapse_redraw_body(tail).unwrap_or(tail));
    output
}

fn collapse_redraw_body(body: &str) -> Option<&str> {
    if !body.contains('') {
        return None;
    }

    let mut previous_width = 0;
    let mut final_frame = None;
    let mut frame_count = 0;

    for frame in body.split('') {
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
    use super::{collapse_monotonic_ascii_redraws, strip_recognized_sgr};

    #[test]
    fn strips_only_recognized_sgr_sequences() {
        assert_eq!(
            strip_recognized_sgr("[31mred[0m plain"),
            "red plain"
        );
        assert_eq!(
            strip_recognized_sgr("[38;2;255;0;128mtrue[m"),
            "true"
        );
        assert_eq!(
            strip_recognized_sgr("[38:5:42mindexed[0m"),
            "indexed"
        );
    }

    #[test]
    fn leaves_unknown_or_malformed_escape_sequences_exact() {
        for value in [
            "[2Jclear",
            "[Hhome",
            "[31unterminated",
            "]8;;https://example.com\\link]8;;\\",
            "literal [31m",
        ] {
            assert_eq!(strip_recognized_sgr(value), value);
        }
    }

    #[test]
    fn sgr_stripping_preserves_unicode_payload() {
        assert_eq!(
            strip_recognized_sgr("α [1m中😀[22m ω"),
            "α 中😀 ω"
        );
    }

    #[test]
    fn sgr_primitive_is_idempotent_and_non_expanding() {
        for value in [
            "",
            "plain",
            "[31mred[0m",
            "[2Jnot-sgr",
            "é[1m中[0m",
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
            collapse_monotonic_ascii_redraws("9%10%100%
"),
            "100%
"
        );
        assert_eq!(
            collapse_monotonic_ascii_redraws("|/-Done
"),
            "Done
"
        );
        assert_eq!(
            collapse_monotonic_ascii_redraws("abcdefghi"),
            "ghi"
        );
    }

    #[test]
    fn preserves_shrinking_or_non_ascii_redraws() {
        for value in [
            "100%9%
",
            "Done|
",
            "ééabc
",
            "abc中中
",
            "abc	def
",
            "abc
",
            "abc",
        ] {
            assert_eq!(collapse_monotonic_ascii_redraws(value), value);
        }
    }

    #[test]
    fn preserves_crlf_while_collapsing_safe_redraw_body() {
        assert_eq!(
            collapse_monotonic_ascii_redraws("10%20%
next
"),
            "20%
next
"
        );
    }

    #[test]
    fn redraw_primitive_is_idempotent_and_non_expanding() {
        for value in [
            "",
            "plain
",
            "9%10%100%
",
            "|/-Done
",
            "100%9%
",
            "abbcccdddd",
            "a
bcc
c",
        ] {
            let once = collapse_monotonic_ascii_redraws(value);
            let twice = collapse_monotonic_ascii_redraws(&once);
            assert_eq!(twice, once);
            assert!(once.len() <= value.len());
        }
    }

    #[test]
    fn does_not_minify_whitespace_blank_lines_or_repetition() {
        let value = "a

  a  
a
a
";
        assert_eq!(strip_recognized_sgr(value), value);
        assert_eq!(collapse_monotonic_ascii_redraws(value), value);
    }
}
