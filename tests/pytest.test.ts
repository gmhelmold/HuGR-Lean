import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Engine } from "../src/engine.js";
import {
  PytestProfile,
  pythonPytestProfiles,
} from "../src/profiles/pytest.js";
import {
  PROTOCOL_V1,
  exited,
  type ObservationV1,
} from "../src/types.js";
import {
  loadFixtureDirectories,
  verifyFixture,
} from "./support/fixture.js";

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/python-pytest/", import.meta.url),
);

test("all pytest profile fixtures execute through the real engine", () => {
  const engine = new Engine(undefined, pythonPytestProfiles());
  const fixtures = loadFixtureDirectories(fixtureRoot);
  assert.ok(fixtures.length >= 7);

  for (const fixture of fixtures) {
    assert.equal(fixture.case.kind, "profile", fixture.case.id);
    verifyFixture(engine, fixture);
  }
});

test("pytest profile exposes native-text descriptor", () => {
  assert.deepEqual(new PytestProfile().descriptor(), {
    id: "pytest",
    family: "python",
    fixture_family: "python-pytest",
    boundary_assumption: "native_text",
  });
});

test("pytest executable and python -m pytest are recognized, unittest is not", () => {
  const input = "1 passed in 0.01s\n";
  for (const command of ["pytest", "pytest -q", "python -m pytest", "python3 -m pytest"]) {
    const result = new Engine(undefined, pythonPytestProfiles()).process(
      pytestObservation(command, input, exited(0)),
    );
    assert.equal(result.decision, "reduced", command);
    assert.equal(result.replacement, input, command);
  }

  const unittest = new Engine(undefined, pythonPytestProfiles()).process(
    pytestObservation("python -m unittest", input, exited(0)),
  );
  assert.equal(unittest.decision, "passthrough");
});

test("pytest failure summary contradicting exit status fails open", () => {
  const input = [
    "=== FAILURES ===",
    "____ test_one ____",
    "E AssertionError: boom",
    "=== short test summary info ===",
    "FAILED tests/test_demo.py::test_one - AssertionError",
    "1 failed in 0.01s",
    "",
  ].join("\n");

  const result = new Engine(undefined, pythonPytestProfiles()).process(
    pytestObservation("pytest", input, exited(0)),
  );

  assert.equal(result.decision, "failed_open");
  assert.equal(result.replacement, null);
  assert.deepEqual(result.diagnostics, ["profile_parse_failed"]);
});

test("pytest failure count must match short-summary failure/error lines", () => {
  const input = [
    "=== FAILURES ===",
    "____ test_one ____",
    "E AssertionError: boom",
    "=== short test summary info ===",
    "FAILED tests/test_demo.py::test_one - AssertionError",
    "2 failed in 0.01s",
    "",
  ].join("\n");

  const result = new Engine(undefined, pythonPytestProfiles()).process(
    pytestObservation("pytest", input, exited(1)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("two concatenated pytest sessions remain conservative", () => {
  const input = [
    "1 passed in 0.01s",
    "2 passed in 0.02s",
    "",
  ].join("\n");

  const result = new Engine(undefined, pythonPytestProfiles()).process(
    pytestObservation("pytest", input, exited(0)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("pytest bare trailing carriage return in summary remains unsupported", () => {
  const input = "1 passed in 0.01s\r";
  const result = new Engine(undefined, pythonPytestProfiles()).process(
    pytestObservation("pytest", input, exited(0)),
  );

  assert.equal(result.decision, "passthrough");
});

function pytestObservation(
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
