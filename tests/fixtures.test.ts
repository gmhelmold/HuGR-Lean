import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Engine } from "../src/engine.js";
import {
  loadFixture,
  loadFixtureDirectories,
  parseCaseToml,
  verifyFixture,
  verifyNormalizationFixture,
} from "./support/fixture.js";
import {
  PROOF_SIGNAL_NAME,
  ProvingProfile,
} from "./support/proving-profile.js";

const fixtureRoot = fileURLToPath(new URL("../fixtures/", import.meta.url));

test("E0 seed fixtures execute unchanged against TypeScript default engine", () => {
  const engine = new Engine();
  for (const relative of [
    "seed/unknown-repeated-lines",
    "seed/exact-patch-like",
    "seed/incomplete-test-like",
  ]) {
    verifyFixture(engine, loadFixture(path.join(fixtureRoot, relative)));
  }
});

test("proving fixture traverses TypeScript profile pipeline", () => {
  const fixture = loadFixture(path.join(fixtureRoot, "proving/engine-path"));
  verifyFixture(new Engine(undefined, [new ProvingProfile()]), fixture);
  assert.deepEqual(fixture.case.preservation.mandatory_signal_ids, [
    PROOF_SIGNAL_NAME,
  ]);
});

test("proving profile is not registered by default", () => {
  const fixture = loadFixture(path.join(fixtureRoot, "proving/engine-path"));
  assert.throws(() => verifyFixture(new Engine(), fixture));
});

test("all normalization corpus fixtures execute unchanged", () => {
  const fixtures = loadFixtureDirectories(
    path.join(fixtureRoot, "normalization"),
  );
  assert.ok(fixtures.length >= 21);
  for (const fixture of fixtures) {
    assert.equal(fixture.case.kind, "normalization");
    verifyNormalizationFixture(fixture);
  }
});

test("every normalization primitive has positive and negative evidence", () => {
  const fixtures = loadFixtureDirectories(
    path.join(fixtureRoot, "normalization"),
  );

  for (const primitive of [
    "strip_sgr",
    "collapse_carriage_redraws",
  ] as const) {
    const matching = fixtures.filter(
      (fixture) => fixture.case.normalization?.primitive === primitive,
    );
    assert.ok(
      matching.some((fixture) => fixture.case.expect.decision === "normalized"),
      primitive,
    );
    assert.ok(
      matching.some((fixture) => fixture.case.expect.decision === "passthrough"),
      primitive,
    );
  }
});

test("negative normalization fixtures require exact passthrough", () => {
  for (const fixture of loadFixtureDirectories(
    path.join(fixtureRoot, "normalization"),
  )) {
    if (fixture.case.expect.decision !== "passthrough") {
      continue;
    }
    assert.ok(
      fixture.case.expect.properties.includes("passthrough_exact"),
      fixture.case.id,
    );
  }
});

test("fixture parser rejects unknown metadata fields", () => {
  assert.throws(() =>
    parseCaseToml(`
schema = 1
id = "invalid"
kind = "core"
unexpected = true

[observation]
source = "other"
command = ""
shell_dialect = "unknown"
termination = "unknown"
completeness = "complete"
presentation = "unknown"

[expect]
decision = "passthrough"
profile = ""
required_literals = []
forbidden_literals = []
properties = []

[preservation]
mandatory_signal_ids = []
permitted_removals = []

[provenance]
kind = "synthetic"
source_repo = ""
source_commit = ""
source_path = ""
license = ""
origin_issue = 72
notes = ""
`),
  );
});
