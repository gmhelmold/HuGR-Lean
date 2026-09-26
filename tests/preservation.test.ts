import assert from "node:assert/strict";
import test from "node:test";

import {
  LeanWriter,
  PreservationContract,
  PreservationError,
  signalId,
  validateByteSpan,
} from "../src/preservation.js";
import { ProfileContext } from "../src/profile.js";
import {
  PROTOCOL_V1,
  exited,
  type ObservationV1,
} from "../src/types.js";

const failureId = signalId("failure");
const exitId = signalId("exit-code");
const countId = signalId("failure-count");

function context(output: string): ProfileContext {
  const observation: ObservationV1 = {
    schema_version: PROTOCOL_V1,
    source: "shell",
    command: "cargo test",
    shell_dialect: "unknown",
    output,
    termination: exited(1),
    completeness: "complete",
    presentation: "unknown",
  };
  return new ProfileContext(
    observation,
    {
      kind: "shell",
      recognition: {
        kind: "direct",
        identity: { executable: "cargo", program: "cargo", args: ["test"] },
      },
    },
    output,
  );
}

test("verbatim signals are bound to UTF-8 byte spans", () => {
  const ctx = context("prefix ERROR: boom suffix");
  const prefixBytes = Buffer.byteLength("prefix ");
  const signal = ctx.verbatimSignal(failureId, {
    start_byte: prefixBytes,
    end_byte: prefixBytes + Buffer.byteLength("ERROR: boom"),
  });
  assert.equal(signal.canonical_text, "ERROR: boom");

  assert.throws(() =>
    validateByteSpan("aéz", { start_byte: 2, end_byte: 3 }),
  );
});

test("outcome and derived evidence are mechanical", () => {
  const exit = context("failure").outcomeSignal(exitId, "exit_code");
  assert.equal(exit.canonical_text, "exit_code=1");

  const input = "FAIL one\nFAIL two\n";
  const ctx = context(input);
  const first = Buffer.byteLength("FAIL one");
  const secondStart = Buffer.byteLength("FAIL one\n");
  const secondEnd = Buffer.byteLength("FAIL one\nFAIL two");
  const signal = ctx.derivedCountSignal(
    countId,
    "count_failures",
    [
      { start_byte: 0, end_byte: first },
      { start_byte: secondStart, end_byte: secondEnd },
    ],
    "failures",
  );
  assert.equal(signal.canonical_text, "2 failures");

  assert.throws(() =>
    ctx.derivedCountSignal(
      countId,
      "count_failures",
      [
        { start_byte: 0, end_byte: first },
        { start_byte: 0, end_byte: first },
      ],
      "failures",
    ),
  );
});

test("PreservationContract requires actual writer emission", () => {
  const ctx = context("ERROR");
  const signal = ctx.verbatimSignal(failureId, {
    start_byte: 0,
    end_byte: Buffer.byteLength("ERROR"),
  });
  const contract = PreservationContract.require(failureId);

  assert.throws(() => contract.validate(new LeanWriter().finish()), PreservationError);

  const writer = new LeanWriter();
  writer.signal(signal);
  assert.doesNotThrow(() => contract.validate(writer.finish()));
});

test("writer line helpers retain evidence provenance", () => {
  const ctx = context("ERROR");
  const signal = ctx.verbatimSignal(failureId, {
    start_byte: 0,
    end_byte: Buffer.byteLength("ERROR"),
  });
  const derived = ctx.derivedCount(
    "count_errors",
    [{ start_byte: 0, end_byte: Buffer.byteLength("ERROR") }],
    "errors",
  );

  const writer = new LeanWriter();
  writer.staticLine("summary:");
  writer.signalLine(signal);
  writer.derivedLine(derived);
  const output = writer.finish();

  assert.equal(output.text, "summary:\nERROR\n1 errors\n");
  assert.ok(output.emitted_signal_ids.has(failureId));
  assert.equal(output.derived_records[0]?.rule_id, "count_errors");
});
