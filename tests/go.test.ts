import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Engine } from "../src/engine.js";
import {
  GoTestVerboseProfile,
  goProfiles,
} from "../src/profiles/go.js";
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
  new URL("../fixtures/go/", import.meta.url),
);

const passingVerbose = [
  "=== RUN   TestAdd",
  "--- PASS: TestAdd (0.00s)",
  "=== RUN   TestSub",
  "--- PASS: TestSub (0.00s)",
  "PASS",
  "ok  \texample.com/demo/math\t0.003s",
  "",
].join("\n");

const failingVerbose = [
  "=== RUN   TestAdd",
  "--- PASS: TestAdd (0.00s)",
  "=== RUN   TestBroken",
  "    math_test.go:15: expected 5, got 3",
  "--- FAIL: TestBroken (0.01s)",
  "FAIL",
  "FAIL\texample.com/demo/math\t0.015s",
  "",
].join("\n");

test("all Go profile fixtures execute through the real engine", () => {
  const engine = new Engine(undefined, goProfiles());
  const fixtures = loadFixtureDirectories(fixtureRoot);
  assert.ok(fixtures.length >= 7);

  for (const fixture of fixtures) {
    assert.equal(fixture.case.kind, "profile", fixture.case.id);
    verifyFixture(engine, fixture);
  }
});

test("Go verbose profile exposes native-text descriptor", () => {
  assert.deepEqual(new GoTestVerboseProfile().descriptor(), {
    id: "go-test-verbose",
    family: "go",
    fixture_family: "go",
    boundary_assumption: "native_text",
  });
});

test("go test -v is admitted with flags/packages in conservative bare syntax", () => {
  const engine = new Engine(undefined, goProfiles());
  for (const command of [
    "go test -v",
    "go test ./... -v",
    "go test -count=1 -v ./...",
    "go test -test.v ./pkg",
  ]) {
    const result = engine.process(
      observation(command, passingVerbose, exited(0)),
    );
    assert.equal(result.decision, "reduced", command);
    assert.ok(result.replacement?.includes("ok  \texample.com/demo/math\t0.003s"));
  }
});

test("go test without verbose mode remains exact passthrough", () => {
  const input = "ok  \texample.com/demo/math\t0.003s\n";
  const result = new Engine(undefined, goProfiles()).process(
    observation("go test ./...", input, exited(0)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("go test -json is never treated as native verbose text", () => {
  const result = new Engine(undefined, goProfiles()).process(
    observation("go test -v -json ./...", passingVerbose, exited(0)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("go test benchmark and fuzz modes remain outside the profile", () => {
  const engine = new Engine(undefined, goProfiles());
  for (const command of [
    "go test -v -bench=.",
    "go test -v -fuzz=FuzzFoo",
  ]) {
    const result = engine.process(
      observation(command, passingVerbose, exited(0)),
    );
    assert.equal(result.decision, "passthrough", command);
  }
});

test("failure block and package identity survive reduction", () => {
  const result = new Engine(undefined, goProfiles()).process(
    observation("go test -v ./...", failingVerbose, exited(1)),
  );

  assert.equal(result.decision, "reduced");
  assert.ok(result.replacement?.includes("=== RUN   TestBroken"));
  assert.ok(result.replacement?.includes("math_test.go:15: expected 5, got 3"));
  assert.ok(result.replacement?.includes("--- FAIL: TestBroken (0.01s)"));
  assert.ok(result.replacement?.includes("FAIL\texample.com/demo/math\t0.015s"));
  assert.ok(!result.replacement?.includes("TestAdd"));
});

test("package summary contradicting host exit status fails open", () => {
  const result = new Engine(undefined, goProfiles()).process(
    observation("go test -v", passingVerbose, exited(1)),
  );

  assert.equal(result.decision, "failed_open");
  assert.equal(result.replacement, null);
  assert.deepEqual(result.diagnostics, ["profile_parse_failed"]);
});

test("truncated and unknown execution state fail open before analysis", () => {
  const engine = new Engine(undefined, goProfiles());

  const truncated = observation("go test -v", failingVerbose, exited(1));
  truncated.completeness = "truncated";
  const truncatedResult = engine.process(truncated);
  assert.equal(truncatedResult.decision, "failed_open");
  assert.deepEqual(truncatedResult.diagnostics, ["incomplete_input"]);

  const unknown = engine.process(
    observation("go test -v", failingVerbose, unknownTermination()),
  );
  assert.equal(unknown.decision, "failed_open");
  assert.deepEqual(unknown.diagnostics, ["unknown_termination"]);
});

test("subtests and parallel framing remain conservative version drift", () => {
  const engine = new Engine(undefined, goProfiles());

  const subtest = [
    "=== RUN   TestOuter",
    "=== RUN   TestOuter/child",
    "--- PASS: TestOuter/child (0.00s)",
    "--- PASS: TestOuter (0.00s)",
    "PASS",
    "ok  \texample.com/demo\t0.002s",
    "",
  ].join("\n");

  const parallel = [
    "=== RUN   TestParallel",
    "=== PAUSE TestParallel",
    "=== CONT  TestParallel",
    "--- PASS: TestParallel (0.00s)",
    "PASS",
    "ok  \texample.com/demo\t0.002s",
    "",
  ].join("\n");

  for (const input of [subtest, parallel]) {
    const result = engine.process(
      observation("go test -v", input, exited(0)),
    );
    assert.equal(result.decision, "passthrough");
    assert.equal(result.replacement, null);
  }
});

test("unknown non-indented test output prevents partial reduction", () => {
  const input = [
    "=== RUN   TestOne",
    "rogue package output",
    "--- PASS: TestOne (0.00s)",
    "PASS",
    "ok  \texample.com/demo\t0.002s",
    "",
  ].join("\n");

  const result = new Engine(undefined, goProfiles()).process(
    observation("go test -v", input, exited(0)),
  );
  assert.equal(result.decision, "passthrough");
});

test("go build and go vet remain passthrough until their own reduction is justified", () => {
  const engine = new Engine(undefined, goProfiles());
  const build = [
    "# example.com/demo",
    "./main.go:5:2: undefined: Missing",
    "",
  ].join("\n");

  for (const command of ["go build ./...", "go vet ./..."]) {
    const result = engine.process(observation(command, build, exited(1)));
    assert.equal(result.decision, "passthrough", command);
    assert.equal(result.replacement, null);
  }
});

test("bare trailing carriage return remains unsupported native data", () => {
  const input = passingVerbose.trimEnd() + "\r";
  const result = new Engine(undefined, goProfiles()).process(
    observation("go test -v", input, exited(0)),
  );
  assert.equal(result.decision, "passthrough");
});

function observation(
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
