import assert from "node:assert/strict";
import test from "node:test";

import {
  PROTOCOL_V1,
  ProtocolError,
  exited,
  passthroughResult,
  unknownTermination,
  utf8Bytes,
  validateFilterResultV1,
  validateObservationV1,
  type FilterResultV1,
  type ObservationV1,
} from "../src/types.js";

function observation(): ObservationV1 {
  return {
    schema_version: PROTOCOL_V1,
    source: "shell",
    command: "cargo test",
    shell_dialect: "unknown",
    output: "é output",
    termination: exited(0),
    completeness: "complete",
    presentation: "unknown",
  };
}

test("termination keeps unknown distinct from success", () => {
  const value = observation();
  value.termination = unknownTermination();
  assert.doesNotThrow(() => validateObservationV1(value));

  value.termination = { kind: "unknown", code: 0 };
  assert.throws(() => validateObservationV1(value), ProtocolError);
});

test("passthrough does not echo payload and uses UTF-8 byte metrics", () => {
  const result = passthroughResult("é");
  assert.equal(result.replacement, null);
  assert.equal(result.metrics.input_bytes, 2);
  assert.equal(result.metrics.output_bytes, 2);
  assert.equal(result.metrics.saved_bytes, 0);
  validateFilterResultV1(result);
});

test("result validation rejects inconsistent replacement metrics", () => {
  const invalid: FilterResultV1 = {
    schema_version: PROTOCOL_V1,
    decision: "reduced",
    replacement: "é",
    profile: "test",
    metrics: { input_bytes: 10, output_bytes: 1, saved_bytes: 9 },
    raw_ref: null,
    diagnostics: [],
  };
  assert.throws(() => validateFilterResultV1(invalid), ProtocolError);
  assert.equal(utf8Bytes("é"), 2);
});
