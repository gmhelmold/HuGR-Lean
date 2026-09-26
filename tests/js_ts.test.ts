import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Engine } from "../src/engine.js";
import {
  JestProfile,
  TscProfile,
  VitestProfile,
  jsTsProfiles,
} from "../src/profiles/js_ts.js";
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
  new URL("../fixtures/js-ts/", import.meta.url),
);

const jestPass = [
  "PASS src/demo.test.js",
  "  ✓ works (2 ms)",
  "",
  "Test Suites: 1 passed, 1 total",
  "Tests:       1 passed, 1 total",
  "",
].join("\n");

const vitestPass = [
  " ✓ test/demo.test.ts (1 test) 20ms",
  "",
  " Test Files  1 passed (1)",
  "      Tests  1 passed (1)",
  "   Start at  10:30:00",
  "   Duration  0.20s",
  "",
].join("\n");

const tscError = [
  "src/é.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
  "",
  "Found 1 error in src/é.ts:12",
  "",
].join("\n");

test("all JS/TS profile fixtures execute through the real engine", () => {
  const engine = new Engine(undefined, jsTsProfiles());
  const fixtures = loadFixtureDirectories(fixtureRoot);
  assert.ok(fixtures.length >= 8);

  for (const fixture of fixtures) {
    assert.equal(fixture.case.kind, "profile", fixture.case.id);
    verifyFixture(engine, fixture);
  }
});

test("JS/TS profiles expose native-text descriptors", () => {
  assert.deepEqual(new JestProfile().descriptor(), {
    id: "jest",
    family: "js-ts",
    fixture_family: "js-ts",
    boundary_assumption: "native_text",
  });
  assert.deepEqual(new VitestProfile().descriptor(), {
    id: "vitest",
    family: "js-ts",
    fixture_family: "js-ts",
    boundary_assumption: "native_text",
  });
  assert.deepEqual(new TscProfile().descriptor(), {
    id: "tsc",
    family: "js-ts",
    fixture_family: "js-ts",
    boundary_assumption: "native_text",
  });
});

test("explicit direct and package-runner invocations are recognized", () => {
  const cases: Array<[string, string, number]> = [
    ["jest", jestPass, 0],
    ["npx jest", jestPass, 0],
    ["bunx jest", jestPass, 0],
    ["pnpm exec jest", jestPass, 0],
    ["npm exec jest", jestPass, 0],
    ["vitest run", vitestPass, 0],
    ["npx vitest run", vitestPass, 0],
    ["bunx vitest run", vitestPass, 0],
    ["pnpm exec vitest run", vitestPass, 0],
    ["tsc --noEmit", tscError, 2],
    ["npx tsc --noEmit", tscError, 2],
    ["pnpm exec tsc --noEmit", tscError, 2],
  ];

  const engine = new Engine(undefined, jsTsProfiles());
  for (const [command, output, code] of cases) {
    const result = engine.process(observation(command, output, exited(code)));
    assert.equal(result.decision, "reduced", command);
  }
});

test("npm test does not become a Jest/Vitest identity from output resemblance", () => {
  const engine = new Engine(undefined, jsTsProfiles());

  for (const output of [jestPass, vitestPass]) {
    const result = engine.process(observation("npm test", output, exited(0)));
    assert.equal(result.decision, "passthrough");
    assert.equal(result.replacement, null);
  }
});

test("reporter and JSON overrides remain outside native-text profiles", () => {
  const engine = new Engine(undefined, jsTsProfiles());

  for (const command of [
    "jest --json",
    "jest --reporters=default",
    "npx jest --outputFile=results.json",
  ]) {
    const result = engine.process(observation(command, jestPass, exited(0)));
    assert.equal(result.decision, "passthrough", command);
  }

  for (const command of [
    "vitest --reporter=json",
    "vitest --watch",
    "npx vitest --ui",
  ]) {
    const result = engine.process(observation(command, vitestPass, exited(0)));
    assert.equal(result.decision, "passthrough", command);
  }
});

test("Jest summary contradiction with host exit status fails open", () => {
  const result = new Engine(undefined, jsTsProfiles()).process(
    observation("jest", jestPass, exited(1)),
  );

  assert.equal(result.decision, "failed_open");
  assert.equal(result.replacement, null);
  assert.deepEqual(result.diagnostics, ["profile_parse_failed"]);
});

test("Jest internal count mismatch remains conservative", () => {
  const input = [
    "PASS src/demo.test.js",
    "  ✓ works",
    "",
    "Test Suites: 1 passed, 1 total",
    "Tests:       1 passed, 2 total",
    "",
  ].join("\n");

  const result = new Engine(undefined, jsTsProfiles()).process(
    observation("jest", input, exited(0)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("Vitest inconsistent native-looking totals remain conservative", () => {
  const input = [
    " ✓ test/example-1.test.ts (5 tests | 1 skipped) 306ms",
    " ✓ test/example-2.test.ts (5 tests) 307ms",
    "",
    " Test Files  2 passed (4)",
    "      Tests  10 passed | 3 skipped (65)",
    "",
  ].join("\n");

  const result = new Engine(undefined, jsTsProfiles()).process(
    observation("vitest run", input, exited(0)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("unknown trailing output after Jest/Vitest summaries remains conservative", () => {
  const engine = new Engine(undefined, jsTsProfiles());

  const jestTrailing = jestPass + "UNEXPECTED post-run warning\n";
  const jestResult = engine.process(
    observation("jest", jestTrailing, exited(0)),
  );
  assert.equal(jestResult.decision, "passthrough");
  assert.equal(jestResult.replacement, null);

  const vitestTrailing = vitestPass + "UNEXPECTED post-run warning\n";
  const vitestResult = engine.process(
    observation("vitest run", vitestTrailing, exited(0)),
  );
  assert.equal(vitestResult.decision, "passthrough");
  assert.equal(vitestResult.replacement, null);
});

test("complete/exited requirements reject truncated and unknown test results", () => {
  const engine = new Engine(undefined, jsTsProfiles());

  const truncated = observation("jest", jestPass, exited(0));
  truncated.completeness = "truncated";
  const truncatedResult = engine.process(truncated);
  assert.equal(truncatedResult.decision, "failed_open");
  assert.deepEqual(truncatedResult.diagnostics, ["incomplete_input"]);

  const unknown = engine.process(
    observation("vitest run", vitestPass, unknownTermination()),
  );
  assert.equal(unknown.decision, "failed_open");
  assert.deepEqual(unknown.diagnostics, ["unknown_termination"]);
});

test("tsc textual diagnostics preserve Unicode file location evidence", () => {
  const result = new Engine(undefined, jsTsProfiles()).process(
    observation("tsc --noEmit", tscError, exited(2)),
  );

  assert.equal(result.decision, "reduced");
  assert.ok(result.replacement?.includes("src/é.ts(12,5)"));
  assert.ok(result.replacement?.includes("TS2322"));
  assert.ok(!result.replacement?.includes("Found 1 error"));
});

test("tsc summary/table text cannot precede diagnostic evidence", () => {
  const engine = new Engine(undefined, jsTsProfiles());

  for (const input of [
    [
      "Found 1 error in src/app.ts:1",
      "src/app.ts(1,1): error TS2322: Type mismatch.",
      "",
    ].join("\n"),
    [
      "Errors  Files",
      "     1  src/app.ts:1",
      "src/app.ts(1,1): error TS2322: Type mismatch.",
      "",
    ].join("\n"),
  ]) {
    const result = engine.process(
      observation("tsc --noEmit", input, exited(2)),
    );
    assert.equal(result.decision, "passthrough");
    assert.equal(result.replacement, null);
  }
});

test("tsc diagnostics contradicting successful exit fail open", () => {
  const result = new Engine(undefined, jsTsProfiles()).process(
    observation("tsc --noEmit", tscError, exited(0)),
  );

  assert.equal(result.decision, "failed_open");
  assert.deepEqual(result.diagnostics, ["profile_parse_failed"]);
});

test("tsc pretty/watch/help variants remain conservative", () => {
  const engine = new Engine(undefined, jsTsProfiles());

  for (const command of [
    "tsc --pretty",
    "tsc --pretty=false",
    "tsc --watch",
    "tsc -w",
    "tsc --help",
    "tsc --showConfig",
  ]) {
    const result = engine.process(observation(command, tscError, exited(2)));
    assert.equal(result.decision, "passthrough", command);
  }
});

test("ANSI pretty tsc output is not parsed as plain textual diagnostics", () => {
  const pretty =
    "\u001b[96msrc/index.ts\u001b[0m:\u001b[93m1\u001b[0m:\u001b[93m7\u001b[0m - " +
    "\u001b[91merror\u001b[0m TS2322: Type mismatch\n";

  const result = new Engine(undefined, jsTsProfiles()).process(
    observation("tsc --noEmit", pretty, exited(2)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("tsc truncated and unknown termination diagnostics fail open", () => {
  const engine = new Engine(undefined, jsTsProfiles());

  const truncated = observation("tsc --noEmit", tscError, exited(2));
  truncated.completeness = "truncated";
  const truncatedResult = engine.process(truncated);
  assert.equal(truncatedResult.decision, "failed_open");
  assert.deepEqual(truncatedResult.diagnostics, ["incomplete_input"]);

  const unknown = engine.process(
    observation("tsc --noEmit", tscError, unknownTermination()),
  );
  assert.equal(unknown.decision, "failed_open");
  assert.deepEqual(unknown.diagnostics, ["unknown_termination"]);
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
