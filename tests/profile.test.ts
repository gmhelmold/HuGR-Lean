import assert from "node:assert/strict";
import test from "node:test";

import {
  Engine,
  EngineBuildError,
} from "../src/engine.js";
import { LeanWriter, PreservationContract } from "../src/preservation.js";
import {
  ProfileContext,
  ProfileRegistry,
  ProfileRegistryError,
  type AnalysisBundle,
  type Profile,
  type ProfileDescriptor,
} from "../src/profile.js";
import {
  PROTOCOL_V1,
  exited,
  type ObservationV1,
} from "../src/types.js";

class SimpleProfile implements Profile {
  constructor(
    private readonly metadata: ProfileDescriptor,
    private readonly program = metadata.id,
  ) {}

  descriptor(): ProfileDescriptor {
    return this.metadata;
  }

  recognize(identity: Parameters<Profile["recognize"]>[0]): "match" | "no_match" {
    return identity.kind === "shell" &&
      identity.recognition.kind === "direct" &&
      identity.recognition.identity.program === this.program
      ? "match"
      : "no_match";
  }

  analyze(_context: ProfileContext): AnalysisBundle {
    return { data: null, preservation: new PreservationContract() };
  }

  render(_analysis: unknown, writer: LeanWriter): void {
    writer.literal`ok`;
  }
}

test("registry accepts native and already-structured boundary profiles", () => {
  const registry = new ProfileRegistry([
    new SimpleProfile({
      id: "cargo-test",
      family: "rust",
      fixture_family: "rust-cargo",
      boundary_assumption: "native_text",
    }),
    new SimpleProfile({
      id: "json-lint",
      family: "diagnostics",
      fixture_family: "lint-json",
      boundary_assumption: "structured_text",
    }),
  ]);
  assert.equal(registry.size, 2);
});

test("registry rejects duplicates, invalid names, and rewrite-dependent profiles", () => {
  assert.throws(
    () =>
      new ProfileRegistry([
        new SimpleProfile({
          id: "same",
          family: "one",
          fixture_family: "one",
          boundary_assumption: "native_text",
        }),
        new SimpleProfile({
          id: "same",
          family: "two",
          fixture_family: "two",
          boundary_assumption: "native_text",
        }),
      ]),
    ProfileRegistryError,
  );

  assert.throws(
    () =>
      new ProfileRegistry([
        new SimpleProfile({
          id: "Cargo Test",
          family: "rust",
          fixture_family: "rust-cargo",
          boundary_assumption: "native_text",
        }),
      ]),
    ProfileRegistryError,
  );

  assert.throws(
    () =>
      new ProfileRegistry([
        new SimpleProfile({
          id: "go-json",
          family: "go",
          fixture_family: "go-test",
          boundary_assumption: "rewrite_dependent",
        }),
      ]),
    ProfileRegistryError,
  );
});

test("engine build propagates registry admission failure", () => {
  assert.throws(
    () =>
      new Engine(undefined, [
        new SimpleProfile({
          id: "rewrite-only",
          family: "go",
          fixture_family: "go-test",
          boundary_assumption: "rewrite_dependent",
        }),
      ]),
    EngineBuildError,
  );
});

test("registry snapshots descriptor metadata after admission", () => {
  let calls = 0;
  const profile: Profile = {
    descriptor() {
      calls += 1;
      return calls === 1
        ? {
            id: "stable-profile",
            family: "test",
            fixture_family: "profile-framework",
            boundary_assumption: "native_text",
          }
        : {
            id: "changed-after-admission",
            family: "test",
            fixture_family: "profile-framework",
            boundary_assumption: "rewrite_dependent",
          };
    },
    recognize(identity) {
      return identity.kind === "shell" &&
        identity.recognition.kind === "direct" &&
        identity.recognition.identity.program === "stable-profile"
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

  const engine = new Engine(undefined, [profile]);
  const observation: ObservationV1 = {
    schema_version: PROTOCOL_V1,
    source: "shell",
    command: "stable-profile",
    shell_dialect: "unknown",
    output: "very noisy output",
    termination: exited(0),
    completeness: "complete",
    presentation: "unknown",
  };

  const result = engine.process(observation);
  assert.equal(result.decision, "reduced");
  assert.equal(result.profile, "stable-profile");
  assert.equal(result.replacement, "ok");
  assert.equal(calls, 1);
});
