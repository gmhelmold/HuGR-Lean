import assert from "node:assert/strict";
import test from "node:test";

import { Engine } from "../src/engine.js";
import {
  PROTOCOL_V1,
  unknownTermination,
  utf8Bytes,
  type ObservationV1,
} from "../src/types.js";

const alphabet = [
  "a", "Z", "0", " ", "\t", "\n", "\r", "\0", "\u001b", "\u007f",
  "|", "&", ";", ">", "<", "$", "'", '"', "*", "?", "[", "]", "{", "}",
  "(", ")", "\\", "/", "-", "_", ":", ".", "=", ",", "é", "中", "😀",
] as const;

test("4096 arbitrary UTF-8/shell-like cases do not mutate unknown output", () => {
  const engine = new Engine();
  let state = 0x6a09e667f3bcc909n;

  for (let caseIndex = 0; caseIndex < 4096; caseIndex += 1) {
    state ^= BigInt(caseIndex) * 0x9e3779b97f4a7c15n;
    const generated = generatedString(state);
    state = generated.state;
    const output = generated.value;
    const source = caseIndex % 2 === 0 ? "other" : "shell";
    const observation: ObservationV1 = {
      schema_version: PROTOCOL_V1,
      source,
      command: source === "shell" ? output : null,
      shell_dialect: "unknown",
      output,
      termination: unknownTermination(),
      completeness: "unknown",
      presentation: "unknown",
    };

    const result = engine.process(observation);
    assert.equal(result.decision, "passthrough", `case ${caseIndex}`);
    assert.equal(result.replacement, null, `case ${caseIndex}`);
    assert.equal(result.metrics.input_bytes, utf8Bytes(output));
    assert.equal(result.metrics.output_bytes, utf8Bytes(output));
    assert.equal(result.metrics.saved_bytes, 0);
  }
});

function generatedString(initial: bigint): { value: string; state: bigint } {
  let state = initial & 0xffffffffffffffffn;
  const first = next(state);
  state = first.state;
  const length = Number(first.value % 96n);
  let output = "";

  for (let index = 0; index < length; index += 1) {
    const step = next(state);
    state = step.state;
    const alphabetIndex = Number(step.value % BigInt(alphabet.length));
    output += alphabet[alphabetIndex] ?? "";
  }

  return { value: output, state };
}

function next(state: bigint): { value: bigint; state: bigint } {
  const nextState =
    (state * 6364136223846793005n + 1442695040888963407n) &
    0xffffffffffffffffn;
  return { value: nextState, state: nextState };
}
