import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Engine } from "../src/engine.js";
import {
  RipgrepGroupedProfile,
  searchProfiles,
} from "../src/profiles/search.js";
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
  new URL("../fixtures/search-rg/", import.meta.url),
);

test("all filesystem/search fixtures execute through the real engine", () => {
  const engine = new Engine(undefined, searchProfiles());
  const fixtures = loadFixtureDirectories(fixtureRoot);
  assert.ok(fixtures.length >= 9);

  for (const fixture of fixtures) {
    verifyFixture(engine, fixture);
  }
});

test("ripgrep grouped profile exposes native-text descriptor", () => {
  assert.deepEqual(new RipgrepGroupedProfile().descriptor(), {
    id: "ripgrep-grouped",
    family: "search",
    fixture_family: "search-rg",
    boundary_assumption: "native_text",
  });
});

test("contiguous ripgrep matches group by exact repeated path", () => {
  const input = [
    "src/main.ts:10:const alpha = 1;",
    "src/main.ts:20:const beta = 2;",
    "src/lib.ts:5:export const gamma = 3;",
    "src/lib.ts:9:export const delta = 4;",
  ].join("\n");

  const result = new Engine(undefined, searchProfiles()).process(
    observation("rg const src", input, exited(0)),
  );

  assert.equal(result.decision, "reduced");
  assert.equal(
    result.replacement,
    [
      "src/main.ts",
      "  10:const alpha = 1;",
      "  20:const beta = 2;",
      "src/lib.ts",
      "  5:export const gamma = 3;",
      "  9:export const delta = 4;",
      "",
    ].join("\n"),
  );
});

test("interleaved file paths are not reordered by grouping", () => {
  const input = [
    "src/a.ts:1:match a1",
    "src/b.ts:2:match b1",
    "src/a.ts:3:match a2",
  ].join("\n");

  const result = new Engine(undefined, searchProfiles()).process(
    observation("rg match src", input, exited(0)),
  );

  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("Unicode paths and content survive byte-span grouping", () => {
  const input = [
    "src/café-中😀.ts:10:const café = true;",
    "src/café-中😀.ts:20:const 中 = false;",
  ].join("\n");

  const result = new Engine(undefined, searchProfiles()).process(
    observation("rg const src", input, exited(0)),
  );

  assert.equal(result.decision, "reduced");
  assert.ok(result.replacement?.includes("src/café-中😀.ts"));
  assert.ok(result.replacement?.includes("10:const café = true;"));
  assert.ok(result.replacement?.includes("20:const 中 = false;"));
});

test("format-changing ripgrep flags remain passthrough", () => {
  const input = [
    "src/main.ts:10:match one",
    "src/main.ts:20:match two",
  ].join("\n");
  const engine = new Engine(undefined, searchProfiles());

  for (const command of [
    "rg --heading match src",
    "rg -C2 match src",
    "rg -A2 match src",
    "rg --json match src",
    "rg --column match src",
    "rg --vimgrep match src",
    "rg --no-line-number match src",
    "rg -l match src",
    "rg -c match src",
    "rg --color=always match src",
  ]) {
    const result = engine.process(observation(command, input, exited(0)));
    assert.equal(result.decision, "passthrough", command);
    assert.equal(result.replacement, null);
  }
});

test("grep ls tree find and exact filesystem/search outputs stay passthrough", () => {
  const engine = new Engine(undefined, searchProfiles());
  const cases = [
    ["grep -Rn TODO src", "src/main.ts:10:// TODO exact\n"],
    ["ls -la", "total 8\ndrwxr-xr-x  2 user group 4096 src\n"],
    ["tree src", "src\n├── main.ts\n└── lib.ts\n"],
    ["find src -type f", "src/main.ts\nsrc/lib.ts\n"],
  ] as const;

  for (const [command, input] of cases) {
    const result = engine.process(observation(command, input, exited(0)));
    assert.equal(result.decision, "passthrough", command);
    assert.equal(result.replacement, null);
  }
});

test("single matches and distinct-only paths do not manufacture a grouping", () => {
  const engine = new Engine(undefined, searchProfiles());
  for (const input of [
    "src/main.ts:10:one match",
    [
      "src/a.ts:1:one",
      "src/b.ts:2:two",
      "src/c.ts:3:three",
    ].join("\n"),
  ]) {
    const result = engine.process(observation("rg match src", input, exited(0)));
    assert.equal(result.decision, "passthrough");
  }
});

test("truncated and unknown execution state fail open for admitted rg shape", () => {
  const input = [
    "src/main.ts:10:match one",
    "src/main.ts:20:match two",
  ].join("\n");
  const engine = new Engine(undefined, searchProfiles());

  const truncated = observation("rg match src", input, exited(0));
  truncated.completeness = "truncated";
  const truncatedResult = engine.process(truncated);
  assert.equal(truncatedResult.decision, "failed_open");
  assert.deepEqual(truncatedResult.diagnostics, ["incomplete_input"]);

  const unknown = engine.process(
    observation("rg match src", input, unknownTermination()),
  );
  assert.equal(unknown.decision, "failed_open");
  assert.deepEqual(unknown.diagnostics, ["unknown_termination"]);
});

test("nonzero rg exit with match-shaped output fails open", () => {
  const input = [
    "src/main.ts:10:match one",
    "src/main.ts:20:match two",
  ].join("\n");

  const result = new Engine(undefined, searchProfiles()).process(
    observation("rg match src", input, exited(2)),
  );

  assert.equal(result.decision, "failed_open");
  assert.deepEqual(result.diagnostics, ["profile_parse_failed"]);
});

test("standalone carriage returns and ambiguous colon paths remain passthrough", () => {
  const engine = new Engine(undefined, searchProfiles());

  for (const input of [
    "src/main.ts:10:one\rsrc/main.ts:20:two",
    "C:\\src\\main.ts:10:one\nC:\\src\\main.ts:20:two",
  ]) {
    const result = engine.process(observation("rg match src", input, exited(0)));
    assert.equal(result.decision, "passthrough");
  }
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
