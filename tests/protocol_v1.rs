use std::io::Cursor;

use hugr_lean::process_v1;
use hugr_lean::protocol::{
    read_observation_v1, write_result_v1, CompletenessV1, DecisionV1, DiagnosticCodeV1,
    FilterResultV1, MetricsV1, ObservationV1, PresentationV1, ProtocolError, ShellDialectV1,
    SourceV1, TerminationV1, PROTOCOL_V1,
};

fn sample_observation() -> ObservationV1 {
    ObservationV1 {
        schema_version: PROTOCOL_V1,
        source: SourceV1::Shell,
        command: Some("cargo test".to_string()),
        shell_dialect: ShellDialectV1::Unknown,
        output: "test result: ok. 4 passed\n".to_string(),
        termination: TerminationV1::Exited { code: 0 },
        completeness: CompletenessV1::Complete,
        presentation: PresentationV1::Unknown,
    }
}

#[test]
fn valid_observation_round_trips_through_passthrough_protocol() {
    let input = serde_json::to_vec(&sample_observation()).unwrap();
    let observation = read_observation_v1(Cursor::new(input)).unwrap();
    let result = process_v1(observation.clone()).unwrap();

    assert_eq!(result.decision, DecisionV1::Passthrough);
    assert_eq!(result.replacement, None);
    assert_eq!(result.metrics.input_bytes, observation.output.len() as u64);
    assert_eq!(result.metrics.output_bytes, observation.output.len() as u64);
    assert_eq!(result.metrics.saved_bytes, 0);

    let mut encoded = Vec::new();
    write_result_v1(&mut encoded, &result).unwrap();
    let decoded: FilterResultV1 = serde_json::from_slice(&encoded).unwrap();
    assert_eq!(decoded, result);
}

#[test]
fn passthrough_response_does_not_echo_original_payload() {
    let observation = sample_observation();
    let original = observation.output.clone();
    let result = process_v1(observation).unwrap();

    let json = serde_json::to_string(&result).unwrap();
    assert!(!json.contains(&original));
    assert!(json.contains(r#""replacement":null"#));
}

#[test]
fn rejects_unsupported_schema_version() {
    let mut value = serde_json::to_value(sample_observation()).unwrap();
    value["schema_version"] = serde_json::json!(2);

    let error = read_observation_v1(Cursor::new(serde_json::to_vec(&value).unwrap())).unwrap_err();
    assert!(matches!(
        error,
        ProtocolError::UnsupportedSchemaVersion { received: 2 }
    ));
}

#[test]
fn rejects_unknown_request_fields() {
    let mut value = serde_json::to_value(sample_observation()).unwrap();
    value["host"] = serde_json::json!("opencode");

    let error = read_observation_v1(Cursor::new(serde_json::to_vec(&value).unwrap())).unwrap_err();
    assert!(matches!(error, ProtocolError::Json(_)));
}

#[test]
fn rejects_multiple_json_requests_in_one_envelope() {
    let first = serde_json::to_string(&sample_observation()).unwrap();
    let second = serde_json::to_string(&sample_observation()).unwrap();
    let joined = format!("{first}\n{second}\n");

    let error = read_observation_v1(Cursor::new(joined.into_bytes())).unwrap_err();
    assert!(matches!(error, ProtocolError::Json(_)));
}

#[test]
fn rejects_inconsistent_passthrough_response() {
    let result = FilterResultV1 {
        schema_version: PROTOCOL_V1,
        decision: DecisionV1::Passthrough,
        replacement: Some("should not exist".to_string()),
        profile: None,
        metrics: MetricsV1 {
            input_bytes: 16,
            output_bytes: 8,
            saved_bytes: 8,
        },
        raw_ref: None,
        diagnostics: Vec::new(),
    };

    assert!(matches!(
        result.validate(),
        Err(ProtocolError::InvalidResult(_))
    ));
}

#[test]
fn rejects_too_many_diagnostic_codes() {
    let result = FilterResultV1 {
        schema_version: PROTOCOL_V1,
        decision: DecisionV1::FailedOpen,
        replacement: None,
        profile: None,
        metrics: MetricsV1 {
            input_bytes: 10,
            output_bytes: 10,
            saved_bytes: 0,
        },
        raw_ref: None,
        diagnostics: vec![DiagnosticCodeV1::ProtocolWarning; 17],
    };

    assert!(matches!(
        result.validate(),
        Err(ProtocolError::InvalidResult(_))
    ));
}

#[test]
fn rejects_expanding_result_metrics() {
    let result = FilterResultV1 {
        schema_version: PROTOCOL_V1,
        decision: DecisionV1::Reduced,
        replacement: Some("larger than the input".to_string()),
        profile: Some("test".to_string()),
        metrics: MetricsV1 {
            input_bytes: 4,
            output_bytes: 21,
            saved_bytes: 0,
        },
        raw_ref: None,
        diagnostics: Vec::new(),
    };

    assert!(matches!(
        result.validate(),
        Err(ProtocolError::InvalidResult(_))
    ));
}

#[test]
fn termination_unknown_is_distinct_from_success() {
    let mut observation = sample_observation();
    observation.termination = TerminationV1::Unknown;

    let json = serde_json::to_value(observation).unwrap();
    assert_eq!(json["termination"]["kind"], "unknown");
    assert!(json["termination"].get("code").is_none());
}
