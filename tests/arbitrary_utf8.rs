use std::io::Cursor;
use std::panic::{catch_unwind, AssertUnwindSafe};

use hugr_lean::process_v1;
use hugr_lean::protocol::{
    read_observation_v1, CompletenessV1, DecisionV1, ObservationV1, PresentationV1,
    ShellDialectV1, SourceV1, TerminationV1, PROTOCOL_V1,
};

const ALPHABET: &[char] = &[
    'a', 'Z', '0', ' ', '\t', '\n', '\r', '\0', '\u{001b}', '\u{007f}',
    '|', '&', ';', '>', '<', '$', '\u{0060}', '\u{0027}', '\u{0022}', '*', '?',
    '[', ']', '{', '}', '(', ')', '\u{005c}', '/', '-', '_', ':', '.', '=', ',',
    'é', '中', '😀',
];

#[test]
fn arbitrary_utf8_and_shell_like_inputs_do_not_panic_or_mutate_unknown_output() {
    let mut state = 0x6a09_e667_f3bc_c909_u64;

    for case_index in 0..4096_u32 {
        let output = generated_string(&mut state, case_index);
        let source = if case_index % 2 == 0 {
            SourceV1::Other
        } else {
            SourceV1::Shell
        };
        let command = if source == SourceV1::Shell {
            Some(output.clone())
        } else {
            None
        };

        let observation = ObservationV1 {
            schema_version: PROTOCOL_V1,
            source,
            command,
            shell_dialect: ShellDialectV1::Unknown,
            output: output.clone(),
            termination: TerminationV1::unknown(),
            completeness: CompletenessV1::Unknown,
            presentation: PresentationV1::Unknown,
        };

        let encoded = serde_json::to_vec(&observation).unwrap();
        let decoded = catch_unwind(AssertUnwindSafe(|| {
            read_observation_v1(Cursor::new(encoded))
        }))
        .unwrap_or_else(|_| panic!("protocol decoder panicked for case {case_index}"))
        .unwrap();

        let result = catch_unwind(AssertUnwindSafe(|| process_v1(decoded)))
            .unwrap_or_else(|_| panic!("engine panicked for case {case_index}"))
            .unwrap();

        assert_eq!(
            result.decision,
            DecisionV1::Passthrough,
            "case {case_index}"
        );
        assert_eq!(result.replacement, None, "case {case_index}");
        assert_eq!(result.metrics.input_bytes, output.len() as u64);
        assert_eq!(result.metrics.output_bytes, output.len() as u64);
        assert_eq!(result.metrics.saved_bytes, 0);
    }
}

fn generated_string(state: &mut u64, salt: u32) -> String {
    *state ^= u64::from(salt).wrapping_mul(0x9e37_79b9_7f4a_7c15);
    let len = (next(state) % 96) as usize;
    let mut output = String::new();

    for _ in 0..len {
        let index = (next(state) % ALPHABET.len() as u64) as usize;
        output.push(ALPHABET[index]);
    }

    output
}

fn next(state: &mut u64) -> u64 {
    *state = state
        .wrapping_mul(6_364_136_223_846_793_005)
        .wrapping_add(1_442_695_040_888_963_407);
    *state
}
