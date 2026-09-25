//! Small mechanical primitives shared by profile families.
//!
//! These helpers expose spans and exact matching only. They do not decide what
//! is important, truncate arbitrary content, or infer semantics.

use crate::preservation::ByteSpan;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrimitiveError {
    EmptyNeedle,
    EmptyPrefix,
}

/// Find exact, non-overlapping occurrences of a non-empty needle.
pub fn exact_spans(input: &str, needle: &str) -> Result<Vec<ByteSpan>, PrimitiveError> {
    if needle.is_empty() {
        return Err(PrimitiveError::EmptyNeedle);
    }

    Ok(input
        .match_indices(needle)
        .map(|(start, value)| ByteSpan::new(start, start + value.len()))
        .collect())
}

/// Find logical line-content spans whose text begins with a non-empty prefix.
///
/// Returned spans exclude LF and a directly preceding CR line terminator.
pub fn line_prefix_spans(input: &str, prefix: &str) -> Result<Vec<ByteSpan>, PrimitiveError> {
    if prefix.is_empty() {
        return Err(PrimitiveError::EmptyPrefix);
    }

    let mut spans = Vec::new();
    let mut offset = 0;

    for chunk in input.split_inclusive('\n') {
        let content_len = line_content_len(chunk);
        let content = &chunk[..content_len];

        if content.starts_with(prefix) && !content.is_empty() {
            spans.push(ByteSpan::new(offset, offset + content_len));
        }

        offset += chunk.len();
    }

    if offset < input.len() {
        let tail = &input[offset..];
        if tail.starts_with(prefix) && !tail.is_empty() {
            spans.push(ByteSpan::new(offset, input.len()));
        }
    }

    Ok(spans)
}

/// Find logical line-content spans that exactly equal a non-empty value.
pub fn exact_line_spans(input: &str, value: &str) -> Result<Vec<ByteSpan>, PrimitiveError> {
    if value.is_empty() {
        return Err(PrimitiveError::EmptyNeedle);
    }

    let mut spans = Vec::new();
    let mut offset = 0;

    for chunk in input.split_inclusive('\n') {
        let content_len = line_content_len(chunk);
        let content = &chunk[..content_len];

        if content == value {
            spans.push(ByteSpan::new(offset, offset + content_len));
        }

        offset += chunk.len();
    }

    if offset < input.len() && &input[offset..] == value {
        spans.push(ByteSpan::new(offset, input.len()));
    }

    Ok(spans)
}

fn line_content_len(chunk: &str) -> usize {
    let without_lf = chunk.strip_suffix('\n').unwrap_or(chunk);
    without_lf
        .strip_suffix('\r')
        .map_or(without_lf.len(), str::len)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_spans_are_ordered_and_non_overlapping() {
        let spans = exact_spans("aa xx aa aa", "aa").unwrap();
        assert_eq!(
            spans,
            vec![
                ByteSpan::new(0, 2),
                ByteSpan::new(6, 8),
                ByteSpan::new(9, 11)
            ]
        );
    }

    #[test]
    fn exact_spans_respect_utf8_boundaries() {
        let input = "é中é";
        let spans = exact_spans(input, "é").unwrap();
        assert_eq!(spans, vec![ByteSpan::new(0, 2), ByteSpan::new(5, 7)]);
        for span in spans {
            assert!(span.validate(input).is_ok());
        }
    }

    #[test]
    fn line_helpers_handle_lf_crlf_and_tail() {
        let input = "FAIL one\r\nok\nFAIL two";
        assert_eq!(
            line_prefix_spans(input, "FAIL").unwrap(),
            vec![ByteSpan::new(0, 8), ByteSpan::new(12, 20)]
        );
        assert_eq!(
            exact_line_spans(input, "ok").unwrap(),
            vec![ByteSpan::new(10, 12)]
        );
    }

    #[test]
    fn empty_matching_terms_are_rejected() {
        assert_eq!(exact_spans("x", ""), Err(PrimitiveError::EmptyNeedle));
        assert_eq!(line_prefix_spans("x", ""), Err(PrimitiveError::EmptyPrefix));
        assert_eq!(exact_line_spans("x", ""), Err(PrimitiveError::EmptyNeedle));
    }
}
