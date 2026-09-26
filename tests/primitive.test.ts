import assert from "node:assert/strict";
import test from "node:test";

import {
  exactLineSpans,
  exactSpans,
  linePrefixSpans,
  PrimitiveError,
} from "../src/primitive.js";
import { validateByteSpan } from "../src/preservation.js";

test("exact spans are ordered, non-overlapping, and UTF-8 valid", () => {
  assert.deepEqual(exactSpans("aa xx aa aa", "aa"), [
    { start_byte: 0, end_byte: 2 },
    { start_byte: 6, end_byte: 8 },
    { start_byte: 9, end_byte: 11 },
  ]);

  const input = "é中é";
  const spans = exactSpans(input, "é");
  assert.deepEqual(spans, [
    { start_byte: 0, end_byte: 2 },
    { start_byte: 5, end_byte: 7 },
  ]);
  for (const span of spans) {
    assert.doesNotThrow(() => validateByteSpan(input, span));
  }
});

test("line helpers handle LF, CRLF, tail, and bare CR exactly", () => {
  const input = "FAIL one\r\nok\nFAIL two";
  assert.deepEqual(linePrefixSpans(input, "FAIL"), [
    { start_byte: 0, end_byte: 8 },
    { start_byte: 13, end_byte: 21 },
  ]);
  assert.deepEqual(exactLineSpans(input, "ok"), [
    { start_byte: 10, end_byte: 12 },
  ]);

  assert.deepEqual(linePrefixSpans("FAIL\r", "FAIL"), [
    { start_byte: 0, end_byte: 5 },
  ]);
  assert.deepEqual(exactLineSpans("FAIL\r", "FAIL"), []);
  assert.deepEqual(exactLineSpans("FAIL\r", "FAIL\r"), [
    { start_byte: 0, end_byte: 5 },
  ]);
});

test("empty matching terms are rejected", () => {
  assert.throws(() => exactSpans("x", ""), PrimitiveError);
  assert.throws(() => linePrefixSpans("x", ""), PrimitiveError);
  assert.throws(() => exactLineSpans("x", ""), PrimitiveError);
});
