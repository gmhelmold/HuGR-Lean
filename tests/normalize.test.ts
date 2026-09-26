import assert from "node:assert/strict";
import test from "node:test";

import {
  collapseMonotonicAsciiRedraws,
  safeNormalize,
  stripRecognizedSgr,
} from "../src/normalize.js";
import {
  PROTOCOL_V1,
  type ObservationV1,
  unknownTermination,
} from "../src/types.js";

function observation(
  presentation: ObservationV1["presentation"],
  output: string,
): ObservationV1 {
  return {
    schema_version: PROTOCOL_V1,
    source: "other",
    command: null,
    shell_dialect: "unknown",
    output,
    termination: unknownTermination(),
    completeness: "complete",
    presentation,
  };
}

test("SGR stripping is narrow, idempotent, and Unicode-safe", () => {
  assert.equal(stripRecognizedSgr("\u001b[31mred\u001b[0m plain"), "red plain");
  assert.equal(stripRecognizedSgr("α \u001b[1m中😀\u001b[22m ω"), "α 中😀 ω");

  for (const value of [
    "\u001b[2Jclear",
    "\u001b[Hhome",
    "\u001b[31unterminated",
    "literal [31m",
  ]) {
    assert.equal(stripRecognizedSgr(value), value);
  }

  const once = stripRecognizedSgr("\u001b[31mred\u001b[0m");
  assert.equal(stripRecognizedSgr(once), once);
});

test("carriage redraw collapse admits only monotonic printable ASCII", () => {
  assert.equal(collapseMonotonicAsciiRedraws("9%\r10%\r100%\n"), "100%\n");
  assert.equal(collapseMonotonicAsciiRedraws("|\r/\r-\rDone\n"), "Done\n");
  assert.equal(collapseMonotonicAsciiRedraws("abc\rdef\rghi"), "ghi");
  assert.equal(collapseMonotonicAsciiRedraws("10%\r20%\r\n"), "20%\r\n");

  for (const value of [
    "100%\r9%\n",
    "Done\r|\n",
    "éé\rabc\n",
    "abc\r中中\n",
    "abc\r\tdef\n",
    "abc\r",
  ]) {
    assert.equal(collapseMonotonicAsciiRedraws(value), value);
  }
});

test("SafeNormalization requires terminal presentation provenance", () => {
  const input = "\u001b[31m9%\u001b[0m\r\u001b[32m100%\u001b[0m\n";
  assert.deepEqual(safeNormalize(observation("unknown", input)), {
    kind: "not_applicable",
  });
  assert.deepEqual(safeNormalize(observation("terminal_rendered", input)), {
    kind: "changed",
    text: "100%\n",
  });
});

test("composed normalization is idempotent and non-expanding", () => {
  const original = "\u001b[31mred\u001b[0m";
  const first = safeNormalize(observation("terminal_rendered", original));
  assert.equal(first.kind, "changed");
  if (first.kind !== "changed") {
    throw new Error("expected changed normalization");
  }
  assert.deepEqual(safeNormalize(observation("terminal_rendered", first.text)), {
    kind: "unchanged",
  });
  assert.ok(Buffer.byteLength(first.text) <= Buffer.byteLength(original));
});
