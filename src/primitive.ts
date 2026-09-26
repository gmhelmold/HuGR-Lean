import type { ByteSpan } from "./preservation.js";

export class PrimitiveError extends Error {
  override readonly name = "PrimitiveError";
}

export function exactSpans(input: string, needle: string): ByteSpan[] {
  if (needle.length === 0) {
    throw new PrimitiveError("needle must not be empty");
  }

  const spans: ByteSpan[] = [];
  let from = 0;
  while (from <= input.length - needle.length) {
    const start = input.indexOf(needle, from);
    if (start < 0) {
      break;
    }
    spans.push({ start_byte: utf8Offset(input, start), end_byte: utf8Offset(input, start + needle.length) });
    from = start + needle.length;
  }
  return spans;
}

export function linePrefixSpans(input: string, prefix: string): ByteSpan[] {
  if (prefix.length === 0) {
    throw new PrimitiveError("prefix must not be empty");
  }

  return lineSpans(input, (line) => line.startsWith(prefix));
}

export function exactLineSpans(input: string, value: string): ByteSpan[] {
  if (value.length === 0) {
    throw new PrimitiveError("value must not be empty");
  }

  return lineSpans(input, (line) => line === value);
}

function lineSpans(
  input: string,
  predicate: (line: string) => boolean,
): ByteSpan[] {
  const spans: ByteSpan[] = [];
  let charOffset = 0;

  for (const chunk of splitInclusiveLf(input)) {
    const content = lineContent(chunk);
    if (predicate(content)) {
      spans.push({
        start_byte: utf8Offset(input, charOffset),
        end_byte: utf8Offset(input, charOffset + content.length),
      });
    }
    charOffset += chunk.length;
  }

  return spans;
}

function lineContent(chunk: string): string {
  if (!chunk.endsWith("\n")) {
    return chunk;
  }

  const withoutLf = chunk.slice(0, -1);
  return withoutLf.endsWith("\r")
    ? withoutLf.slice(0, -1)
    : withoutLf;
}

function splitInclusiveLf(input: string): string[] {
  if (input.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < input.length) {
    const newline = input.indexOf("\n", start);
    if (newline < 0) {
      chunks.push(input.slice(start));
      break;
    }
    chunks.push(input.slice(start, newline + 1));
    start = newline + 1;
  }
  return chunks;
}

function utf8Offset(input: string, charOffset: number): number {
  return Buffer.byteLength(input.slice(0, charOffset), "utf8");
}
