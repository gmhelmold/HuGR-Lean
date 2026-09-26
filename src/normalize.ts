import type { ObservationV1 } from "./types.js";
import { utf8Bytes } from "./types.js";

export type SafeNormalizationOutcome =
  | { kind: "not_applicable" }
  | { kind: "unchanged" }
  | { kind: "changed"; text: string };

export class SafeNormalizationError extends Error {
  override readonly name = "SafeNormalizationError";
}

export function stripRecognizedSgr(input: string): string {
  return input.replace(/\x1b\[[0-9;:]*m/gu, "");
}

export function collapseMonotonicAsciiRedraws(input: string): string {
  let output = "";
  let offset = 0;

  while (offset < input.length) {
    const newline = input.indexOf("\n", offset);
    const end = newline < 0 ? input.length : newline + 1;
    const chunk = input.slice(offset, end);
    output += collapsePhysicalLine(chunk);
    offset = end;
  }

  return output;
}

export function safeNormalize(
  observation: ObservationV1,
): SafeNormalizationOutcome {
  if (observation.presentation !== "terminal_rendered") {
    return { kind: "not_applicable" };
  }

  const candidate = composeTerminalNormalization(observation.output);
  validateComposedCandidate(observation.output, candidate);

  return candidate === observation.output
    ? { kind: "unchanged" }
    : { kind: "changed", text: candidate };
}

function composeTerminalNormalization(input: string): string {
  return collapseMonotonicAsciiRedraws(stripRecognizedSgr(input));
}

function validateComposedCandidate(input: string, candidate: string): void {
  if (utf8Bytes(candidate) > utf8Bytes(input)) {
    throw new SafeNormalizationError("normalization expanded input");
  }

  if (composeTerminalNormalization(candidate) !== candidate) {
    throw new SafeNormalizationError("normalization is not idempotent");
  }
}

function collapsePhysicalLine(chunk: string): string {
  let body = chunk;
  let lineEnding = "";

  if (chunk.endsWith("\r\n")) {
    body = chunk.slice(0, -2);
    lineEnding = "\r\n";
  } else if (chunk.endsWith("\n")) {
    body = chunk.slice(0, -1);
    lineEnding = "\n";
  }

  if (!body.includes("\r")) {
    return chunk;
  }

  const frames = body.split("\r");
  if (frames.length < 2) {
    return chunk;
  }

  let previousWidth = 0;
  for (const frame of frames) {
    if (
      frame.length === 0 ||
      ![...frame].every((character) => {
        const code = character.charCodeAt(0);
        return code >= 0x20 && code <= 0x7e;
      }) ||
      frame.length < previousWidth
    ) {
      return chunk;
    }
    previousWidth = frame.length;
  }

  const finalFrame = frames.at(-1);
  return finalFrame === undefined ? chunk : finalFrame + lineEnding;
}
