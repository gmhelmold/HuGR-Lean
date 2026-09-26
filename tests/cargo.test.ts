import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Engine } from "../src/engine.js";
import {
  CargoBuildProfile,
  CargoTestProfile,
  cargoProfiles,
} from "../src/profiles/cargo.js";
import {
  PROTOCOL_V1,
  exited,
  unknownTermination,
  type ObservationV1,
} from "../src/types.js";
import {
  loadFixtureDirectories,
  verifyFixture,
} from "./support/fixture.js";

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/rust-cargo/", import.meta.url),
);

test("all Cargo/rustc profile fixtures execute through the real engine", () => {
  const engine = new Engine(undefined, cargoProfiles());
  const fixtures = loadFixtureDirectories(fixtureRoot);
  assert.ok(fixtures.length >= 7);

  for (const fixture of fixtures) {
    assert.equal(fixture.case.kind, "profile", fixture.case.id);
    verifyFixture(engine, fixture);
  }
});

test("cargo profiles expose native-text descriptors", () => {
  const testProfile = new CargoTestProfile().descriptor();
  const buildProfile = new CargoBuildProfile().descriptor();

  assert.deepEqual(testProfile, {
    id: "cargo-test",
    family: "rust",
    fixture_family: "rust-cargo",
    boundary_assumption: "native_text",
  });
  assert.deepEqual(buildProfile, {
    id: "cargo-build",
    family: "rust",
    fixture_family: "rust-cargo",
    boundary_assumption: "native_text",
  });
});

test("cargo clippy remains unsupported rather than borrowing build behavior", () => {
  const input = [
    "warning: unused variable: \`x\`",
    " --> src/lib.rs:3:9",
    "",
  ].join("\n");

  const result = new Engine(undefined, cargoProfiles()).process(
    cargoObservation("cargo clippy", input, exited(0)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("cargo test compile-error shape without test summary remains conservative", () => {
  const input = [
    "   Compiling demo v0.1.0 (/work/demo)",
    "error[E0308]: mismatched types",
    " --> src/main.rs:2:5",
    "error: could not compile \`demo\` due to 1 previous error",
  ].join("\n");

  const result = new Engine(undefined, cargoProfiles()).process(
    cargoObservation("cargo test", input, exited(101)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("cargo test summary contradicting exit status fails open", () => {
  const input = [
    "running 1 test",
    "test tests::one ... ok",
    "",
    "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s",
    "",
  ].join("\n");

  const result = new Engine(undefined, cargoProfiles()).process(
    cargoObservation("cargo test", input, exited(101)),
  );

  assert.equal(result.decision, "failed_open");
  assert.equal(result.replacement, null);
  assert.deepEqual(result.diagnostics, ["profile_parse_failed"]);
});

test("cargo test unknown termination reaches requirements and fails open", () => {
  const input = [
    "running 1 test",
    "test tests::one ... ok",
    "",
    "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s",
    "",
  ].join("\n");

  const result = new Engine(undefined, cargoProfiles()).process(
    cargoObservation("cargo test", input, unknownTermination()),
  );

  assert.equal(result.decision, "failed_open");
  assert.deepEqual(result.diagnostics, ["unknown_termination"]);
});

test("cargo build success without diagnostics is left exact", () => {
  const input = [
    "   Compiling demo v0.1.0 (/work/demo)",
    "    Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 0.44s",
    "",
  ].join("\n");

  const result = new Engine(undefined, cargoProfiles()).process(
    cargoObservation("cargo build", input, exited(0)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

function cargoObservation(
  command: string,
  output: string,
  termination: ObservationV1["termination"],
): ObservationV1 {
  return {
    schema_version: PROTOCOL_V1,
    source: "shell",
    command,
    shell_dialect: "unknown",
    output,
    termination,
    completeness: "complete",
    presentation: "unknown",
  };
}
