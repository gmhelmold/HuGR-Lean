import type {
  CompletenessV1,
  ObservationV1,
  TerminationKindV1,
} from "./types.js";

export interface ByteSpan {
  start_byte: number;
  end_byte: number;
}

export type OutcomeField = "exit_code" | "termination" | "completeness";
export type CanonicalizationRule = "trim_ascii_whitespace";

export type EvidenceRef =
  | { kind: "input_span"; span: ByteSpan }
  | { kind: "outcome_field"; field: OutcomeField }
  | {
      kind: "canonicalized";
      rule_id: CanonicalizationRule;
      source_span: ByteSpan;
    }
  | {
      kind: "derived";
      rule_id: string;
      source_spans: ByteSpan[];
    };

declare const signalIdBrand: unique symbol;
export type SignalId = string & { readonly [signalIdBrand]: true };

export function signalId(value: string): SignalId {
  if (value.length === 0) {
    throw new EvidenceError("signal id must not be empty");
  }
  return value as SignalId;
}

export class EvidenceError extends Error {
  override readonly name = "EvidenceError";
}

export class Signal {
  private constructor(
    readonly id: SignalId,
    readonly canonical_text: string,
    readonly evidence: EvidenceRef,
  ) {}

  /** @internal */
  static verbatim(id: SignalId, input: string, span: ByteSpan): Signal {
    validateSignalId(id);
    return new Signal(id, extractSpan(input, span), {
      kind: "input_span",
      span: { ...span },
    });
  }

  /** @internal */
  static canonicalized(
    id: SignalId,
    input: string,
    span: ByteSpan,
    rule: CanonicalizationRule,
  ): Signal {
    validateSignalId(id);
    const source = extractSpan(input, span);
    const text =
      rule === "trim_ascii_whitespace"
        ? source.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/gu, "")
        : source;

    if (text.length === 0) {
      throw new EvidenceError("canonical evidence must not be empty");
    }

    return new Signal(id, text, {
      kind: "canonicalized",
      rule_id: rule,
      source_span: { ...span },
    });
  }

  /** @internal */
  static outcome(
    id: SignalId,
    field: OutcomeField,
    observation: ObservationV1,
  ): Signal {
    validateSignalId(id);
    let text: string;
    if (field === "exit_code") {
      if (
        observation.termination.kind !== "exited" ||
        observation.termination.code === null
      ) {
        throw new EvidenceError("exit code is unavailable");
      }
      text = `exit_code=${observation.termination.code}`;
    } else if (field === "termination") {
      text = `termination=${observation.termination.kind}`;
    } else {
      text = `completeness=${observation.completeness}`;
    }

    return new Signal(id, text, { kind: "outcome_field", field });
  }

  /** @internal */
  static derivedCount(
    id: SignalId,
    ruleId: string,
    input: string,
    sourceSpans: ByteSpan[],
  ): Signal {
    validateSignalId(id);
    validateRuleId(ruleId);
    validateCountSpans(input, sourceSpans);
    return new Signal(id, String(sourceSpans.length), {
      kind: "derived",
      rule_id: ruleId,
      source_spans: sourceSpans.map((span) => ({ ...span })),
    });
  }
}

export class DerivedEvidence {
  private constructor(
    readonly rendered_text: string,
    readonly rule_id: string,
    readonly source_spans: ByteSpan[],
  ) {}

  /** @internal */
  static count(
    ruleId: string,
    input: string,
    sourceSpans: ByteSpan[],
  ): DerivedEvidence {
    validateRuleId(ruleId);
    validateCountSpans(input, sourceSpans);
    return new DerivedEvidence(
      String(sourceSpans.length),
      ruleId,
      sourceSpans.map((span) => ({ ...span })),
    );
  }
}

export class PreservationContract {
  readonly required_signal_ids: ReadonlySet<SignalId>;

  constructor(ids: Iterable<SignalId> = []) {
    this.required_signal_ids = new Set(ids);
  }

  static require(id: SignalId): PreservationContract {
    return new PreservationContract([id]);
  }

  validate(output: RenderedOutput): void {
    for (const id of this.required_signal_ids) {
      if (!output.emitted_signal_ids.has(id)) {
        throw new PreservationError("missing required signal");
      }
    }
  }
}

export class PreservationError extends Error {
  override readonly name = "PreservationError";
}

export interface DerivedRecord {
  rule_id: string;
  source_spans: ByteSpan[];
}

export class LeanWriter {
  #text = "";
  #signalIds = new Set<SignalId>();
  #derived: DerivedRecord[] = [];

  literal(strings: TemplateStringsArray, ...values: never[]): void {
    this.#appendLiteral(strings, values);
  }

  literalLine(strings: TemplateStringsArray, ...values: never[]): void {
    this.#appendLiteral(strings, values);
    this.newline();
  }

  signal(signal: Signal): void {
    this.#text += signal.canonical_text;
    this.#signalIds.add(signal.id);
  }

  signalLine(signal: Signal): void {
    this.signal(signal);
    this.newline();
  }

  derived(evidence: DerivedEvidence): void {
    this.#text += evidence.rendered_text;
    this.#derived.push({
      rule_id: evidence.rule_id,
      source_spans: evidence.source_spans.map((span) => ({ ...span })),
    });
  }

  derivedLine(evidence: DerivedEvidence): void {
    this.derived(evidence);
    this.newline();
  }

  newline(): void {
    this.#text += "\n";
  }

  finish(): RenderedOutput {
    return new RenderedOutput(
      this.#text,
      new Set(this.#signalIds),
      this.#derived.map((record) => ({
        rule_id: record.rule_id,
        source_spans: record.source_spans.map((span) => ({ ...span })),
      })),
    );
  }

  #appendLiteral(
    strings: TemplateStringsArray,
    values: readonly unknown[],
  ): void {
    if (values.length !== 0) {
      throw new EvidenceError("static literal output cannot contain interpolation");
    }
    if (!Object.isFrozen(strings) || !Object.isFrozen(strings.raw)) {
      throw new EvidenceError("static output must come from tagged-template syntax");
    }
    this.#text += strings.join("");
  }
}

export class RenderedOutput {
  constructor(
    readonly text: string,
    readonly emitted_signal_ids: ReadonlySet<SignalId>,
    readonly derived_records: readonly DerivedRecord[],
  ) {}
}

/** @internal */
export function createVerbatimSignal(
  id: SignalId,
  input: string,
  span: ByteSpan,
): Signal {
  return Signal.verbatim(id, input, span);
}

/** @internal */
export function createCanonicalizedSignal(
  id: SignalId,
  input: string,
  span: ByteSpan,
  rule: CanonicalizationRule,
): Signal {
  return Signal.canonicalized(id, input, span, rule);
}

/** @internal */
export function createOutcomeSignal(
  id: SignalId,
  field: OutcomeField,
  observation: ObservationV1,
): Signal {
  return Signal.outcome(id, field, observation);
}

/** @internal */
export function createDerivedCountSignal(
  id: SignalId,
  ruleId: string,
  input: string,
  sourceSpans: ByteSpan[],
): Signal {
  return Signal.derivedCount(id, ruleId, input, sourceSpans);
}

/** @internal */
export function createDerivedCount(
  ruleId: string,
  input: string,
  sourceSpans: ByteSpan[],
): DerivedEvidence {
  return DerivedEvidence.count(ruleId, input, sourceSpans);
}

export function validateByteSpan(input: string, span: ByteSpan): void {
  if (
    !Number.isInteger(span.start_byte) ||
    !Number.isInteger(span.end_byte) ||
    span.start_byte < 0 ||
    span.start_byte >= span.end_byte
  ) {
    throw new EvidenceError("invalid byte span");
  }

  const total = Buffer.byteLength(input, "utf8");
  if (span.end_byte > total) {
    throw new EvidenceError("byte span exceeds input");
  }

  byteSpanToCodeUnits(input, span);
}

function extractSpan(input: string, span: ByteSpan): string {
  const [start, end] = byteSpanToCodeUnits(input, span);
  return input.slice(start, end);
}

function byteSpanToCodeUnits(input: string, span: ByteSpan): [number, number] {
  const total = Buffer.byteLength(input, "utf8");
  if (
    span.start_byte < 0 ||
    span.start_byte >= span.end_byte ||
    span.end_byte > total
  ) {
    throw new EvidenceError("invalid byte span");
  }

  let byteOffset = 0;
  let codeUnitOffset = 0;
  let start: number | undefined;
  let end: number | undefined;

  if (span.start_byte === 0) {
    start = 0;
  }

  for (const character of input) {
    const nextBytes = byteOffset + Buffer.byteLength(character, "utf8");
    const nextCodeUnits = codeUnitOffset + character.length;

    if (nextBytes === span.start_byte) {
      start = nextCodeUnits;
    }
    if (nextBytes === span.end_byte) {
      end = nextCodeUnits;
    }

    byteOffset = nextBytes;
    codeUnitOffset = nextCodeUnits;
  }

  if (span.end_byte === total) {
    end = input.length;
  }

  if (start === undefined || end === undefined) {
    throw new EvidenceError("byte span splits a UTF-8 code point");
  }

  return [start, end];
}

function validateSignalId(id: SignalId): void {
  if (id.length === 0) {
    throw new EvidenceError("signal id must not be empty");
  }
}

function validateRuleId(ruleId: string): void {
  if (ruleId.length === 0) {
    throw new EvidenceError("rule id must not be empty");
  }
}

function validateCountSpans(input: string, spans: ByteSpan[]): void {
  if (spans.length === 0) {
    throw new EvidenceError("derived evidence requires source spans");
  }

  let previous: ByteSpan | undefined;
  for (const span of spans) {
    validateByteSpan(input, span);
    if (
      previous !== undefined &&
      (previous.start_byte >= span.start_byte ||
        previous.end_byte > span.start_byte)
    ) {
      throw new EvidenceError(
        "derived count spans must be ordered, distinct, and non-overlapping",
      );
    }
    previous = span;
  }
}

export function formatTermination(kind: TerminationKindV1): string {
  return kind;
}

export function formatCompleteness(value: CompletenessV1): string {
  return value;
}
