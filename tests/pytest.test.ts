import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Engine } from "../src/engine.js";
import { PytestProfile, pytestProfiles } from "../src/profiles/pytest.js";
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
  new URL("../fixtures/pytest/", import.meta.url),
);

test("all pytest profile fixtures execute through the real engine", () => {
  const engine = new Engine(undefined, pytestProfiles());
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
    fixture_family: "pytest",
    boundary_assumption: "native_text",
  });
});

test("direct pytest and python -m pytest invocations share the same profile", () => {
  const input = [
    "tests/test_main.py::test_add PASSED",
    "1 passed in 0.01s",
  ].join("\n");

  for (const command of [
    "pytest",
    "py.test",
    "python -m pytest",
    "python3 -m pytest",
    "python3.11 -m pytest",
  ]) {
    const result = new Engine(undefined, pytestProfiles()).process(
      pytestObservation(command, input, exited(0)),
    );

    assert.equal(result.decision, "reduced", command);
    assert.equal(result.replacement, "1 passed in 0.01s\n", command);
  }
});

test("pytest truncated complete-looking output fails open before analysis", () => {
  const input = [
    "tests/test_main.py::test_add PASSED",
    "1 passed in 0.01s",
  ].join("\n");
  const observation = pytestObservation("pytest", input, exited(0));
  observation.completeness = "truncated";

  const result = new Engine(undefined, pytestProfiles()).process(observation);
  assert.equal(result.decision, "failed_open");
  assert.deepEqual(result.diagnostics, ["incomplete_input"]);
});

test("pytest unknown termination fails open before analysis", () => {
  const input = [
    "tests/test_main.py::test_add PASSED",
    "1 passed in 0.01s",
  ].join("\n");

  const result = new Engine(undefined, pytestProfiles()).process(
    pytestObservation("pytest", input, unknownTermination()),
  );

  assert.equal(result.decision, "failed_open");
  assert.deepEqual(result.diagnostics, ["unknown_termination"]);
});

test("pytest summary contradicting host exit status fails open", () => {
  const input = [
    "tests/test_main.py::test_add PASSED",
    "1 passed in 0.01s",
  ].join("\n");

  const result = new Engine(undefined, pytestProfiles()).process(
    pytestObservation("pytest", input, exited(1)),
  );

  assert.equal(result.decision, "failed_open");
  assert.deepEqual(result.diagnostics, ["profile_parse_failed"]);
});

test("pytest warning summaries remain conservative until warning evidence is contracted", () => {
  const input = [
    "tests/test_main.py::test_add PASSED",
    "=============================== warnings summary ===============================",
    "tests/test_main.py:1",
    "  UserWarning: something changed",
    "1 passed, 1 warning in 0.02s",
  ].join("\n");

  const result = new Engine(undefined, pytestProfiles()).process(
    pytestObservation("pytest", input, exited(0)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("pytest multiple final summaries remain conservative", () => {
  const input = [
    "tests/test_one.py::test_one PASSED",
    "1 passed in 0.01s",
    "tests/test_two.py::test_two PASSED",
    "1 passed in 0.01s",
  ].join("\n");

  const result = new Engine(undefined, pytestProfiles()).process(
    pytestObservation("pytest", input, exited(0)),
  );

  assert.equal(result.decision, "passthrough");
});

test("pytest failed summary without diagnostic identity remains conservative", () => {
  const input = [
    "F",
    "1 failed in 0.01s",
  ].join("\n");

  const result = new Engine(undefined, pytestProfiles()).process(
    pytestObservation("pytest", input, exited(1)),
  );

  assert.equal(result.decision, "passthrough");
});

test("pytest no-tests exit shape is not guessed", () => {
  const input = "no tests ran in 0.01s";
  const result = new Engine(undefined, pytestProfiles()).process(
    pytestObservation("pytest", input, exited(5)),
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
