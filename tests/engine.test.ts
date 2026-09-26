import assert from "node:assert/strict";
import test from "node:test";

import { Engine, MIN_INPUT_BYTES } from "../src/engine.js";
import {
  LeanWriter,
  PreservationContract,
  signalId,
  type Signal,
} from "../src/preservation.js";
import {
  COMPLETE_EXITED,
  ProfileContext,
  type AnalysisBundle,
  type Profile,
  type ProfileDescriptor,
  type ProfileRequirements,
} from "../src/profile.js";
import {
  PROTOCOL_V1,
  exited,
  unknownTermination,
  type ObservationV1,
} from "../src/types.js";

const failureId = signalId("failure");

function observation(
  output: string,
  overrides: Partial<ObservationV1> = {},
): ObservationV1 {
  return {
    schema_version: PROTOCOL_V1,
    source: "shell",
    command: "cargo test",
    shell_dialect: "unknown",
    output,
    termination: exited(0),
    completeness: "complete",
    presentation: "unknown",
    ...overrides,
  };
}

class StaticProfile implements Profile {
  constructor(
    private readonly profileId: string,
    private readonly program: string,
    private readonly text: "ok" | "same",
    private readonly req: ProfileRequirements = {
      completeness: "any",
      termination: "any",
    },
    private readonly fail: "none" | "analyze" | "render" | "validate" = "none",
  ) {}

  descriptor(): ProfileDescriptor {
    return {
      id: this.profileId,
      family: "test",
      fixture_family: "engine",
      boundary_assumption: "native_text",
    };
  }

  requirements(): ProfileRequirements {
    return this.req;
  }

  recognize(identity: Parameters<Profile["recognize"]>[0]) {
    return identity.kind === "shell" &&
      identity.recognition.kind === "direct" &&
      identity.recognition.identity.program === this.program
      ? ("match" as const)
      : ("no_match" as const);
  }

  analyze(_context: ProfileContext): AnalysisBundle {
    if (this.fail === "analyze") {
      throw new Error("analyze");
    }
    return { data: null, preservation: new PreservationContract() };
  }

  render(_analysis: unknown, writer: LeanWriter): void {
    if (this.fail === "render") {
      throw new Error("render");
    }
    if (this.text === "ok") {
      writer.literal`ok`;
    } else {
      writer.literal`same`;
    }
  }

  validate(): void {
    if (this.fail === "validate") {
      throw new Error("validate");
    }
  }
}

class EvidenceProfile implements Profile {
  constructor(private readonly emit: boolean) {}

  descriptor(): ProfileDescriptor {
    return {
      id: "evidence-profile",
      family: "test",
      fixture_family: "engine",
      boundary_assumption: "native_text",
    };
  }

  recognize(identity: Parameters<Profile["recognize"]>[0]) {
    return identity.kind === "shell" &&
      identity.recognition.kind === "direct" &&
      identity.recognition.identity.program === "cargo"
      ? ("match" as const)
      : ("no_match" as const);
  }

  analyze(context: ProfileContext): AnalysisBundle {
    const start = context.safe_baseline.indexOf("ERROR");
    if (start < 0) {
      throw new Error("missing error");
    }
    const before = Buffer.byteLength(context.safe_baseline.slice(0, start));
    const signal = context.verbatimSignal(failureId, {
      start_byte: before,
      end_byte: before + Buffer.byteLength("ERROR"),
    });
    return {
      data: signal,
      preservation: PreservationContract.require(failureId),
    };
  }

  render(analysis: unknown, writer: LeanWriter): void {
    if (this.emit) {
      writer.signal(analysis as Signal);
    } else {
      writer.literal`ok`;
    }
  }
}

test("default engine passes unknown output through", () => {
  const result = new Engine().process(observation("unchanged output"));
  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("one profile reduces and two profiles fail open", () => {
  const one = new Engine(undefined, [
    new StaticProfile("cargo-test", "cargo", "ok"),
  ]).process(observation("very noisy cargo output"));
  assert.equal(one.decision, "reduced");
  assert.equal(one.replacement, "ok");
  assert.equal(one.profile, "cargo-test");

  const ambiguous = new Engine(undefined, [
    new StaticProfile("one", "cargo", "ok"),
    new StaticProfile("two", "cargo", "ok"),
  ]).process(observation("very noisy cargo output"));
  assert.equal(ambiguous.decision, "failed_open");
  assert.deepEqual(ambiguous.diagnostics, ["ambiguous_profile"]);
});

test("requirements fail conservative before analysis", () => {
  const engine = new Engine(undefined, [
    new StaticProfile("cargo-test", "cargo", "ok", COMPLETE_EXITED),
  ]);

  const incomplete = engine.process(
    observation("output", { completeness: "truncated" }),
  );
  assert.equal(incomplete.decision, "failed_open");
  assert.deepEqual(incomplete.diagnostics, ["incomplete_input"]);

  const unknown = engine.process(
    observation("output", { termination: unknownTermination() }),
  );
  assert.equal(unknown.decision, "failed_open");
  assert.deepEqual(unknown.diagnostics, ["unknown_termination"]);

  const timedOut = engine.process(
    observation("output", {
      termination: { kind: "timed_out", code: null },
    }),
  );
  assert.equal(timedOut.decision, "failed_open");
  assert.deepEqual(timedOut.diagnostics, ["termination_not_exited"]);
});

test("analysis/render/validation failures fail open", () => {
  for (const stage of ["analyze", "render", "validate"] as const) {
    const result = new Engine(undefined, [
      new StaticProfile("cargo-test", "cargo", "ok", {
        completeness: "any",
        termination: "any",
      }, stage),
    ]).process(observation("input"));
    assert.equal(result.decision, "failed_open");
  }
});

test("missing preservation evidence fails open", () => {
  const result = new Engine(undefined, [
    new EvidenceProfile(false),
  ]).process(observation("noise ERROR more noise"));
  assert.equal(result.decision, "failed_open");
  assert.deepEqual(result.diagnostics, ["preservation_failed"]);
});

test("preserved evidence can reduce", () => {
  const result = new Engine(undefined, [
    new EvidenceProfile(true),
  ]).process(observation("noise ERROR more noise"));
  assert.equal(result.decision, "reduced");
  assert.equal(result.replacement, "ERROR");
});

test("normalized baseline feeds profile evidence and wins non-improving fallback", () => {
  const reduced = new Engine(undefined, [
    new EvidenceProfile(true),
  ]).process(
    observation("\u001b[31mERROR\u001b[0m noisy tail", {
      presentation: "terminal_rendered",
    }),
  );
  assert.equal(reduced.decision, "reduced");
  assert.equal(reduced.replacement, "ERROR");

  const fallback = new Engine(undefined, [
    new StaticProfile("cargo-test", "cargo", "same"),
  ]).process(
    observation("\u001b[31msame\u001b[0m", {
      presentation: "terminal_rendered",
    }),
  );
  assert.equal(fallback.decision, "normalized");
  assert.equal(fallback.replacement, "same");
});

test("oversized active input fails open", () => {
  const result = new Engine({ max_input_bytes: MIN_INPUT_BYTES }).process(
    observation("x".repeat(MIN_INPUT_BYTES + 1)),
  );
  assert.equal(result.decision, "failed_open");
  assert.deepEqual(result.diagnostics, ["input_too_large"]);
});


test("invalid JavaScript profile requirements fail open", () => {
  const profile: Profile = {
    descriptor() {
      return {
        id: "bad-requirements",
        family: "test",
        fixture_family: "engine",
        boundary_assumption: "native_text",
      };
    },
    requirements() {
      return {
        completeness: "whatever",
        termination: "any",
      } as unknown as ProfileRequirements;
    },
    recognize(identity) {
      return identity.kind === "shell" &&
        identity.recognition.kind === "direct" &&
        identity.recognition.identity.program === "cargo"
        ? "match"
        : "no_match";
    },
    analyze() {
      return { data: null, preservation: new PreservationContract() };
    },
    render(_analysis, writer) {
      writer.literal`ok`;
    },
  };

  const result = new Engine(undefined, [profile]).process(observation("noisy"));
  assert.equal(result.decision, "failed_open");
  assert.deepEqual(result.diagnostics, ["profile_parse_failed"]);
});
