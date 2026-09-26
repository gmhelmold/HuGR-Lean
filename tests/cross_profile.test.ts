import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Engine } from "../src/engine.js";
import { ProfileRegistry } from "../src/profile.js";
import { v1Profiles } from "../src/profiles/index.js";
import {
  PROTOCOL_V1,
  exited,
  type ObservationV1,
} from "../src/types.js";
import {
  loadFixtureDirectories,
  verifyFixture,
} from "./support/fixture.js";

const fixtureFamilies = [
  "rust-cargo",
  "python-pytest",
  "js-ts",
  "go",
  "git-status",
  "search-rg",
] as const;

test("combined v1 registry admits every production profile with unique ownership", () => {
  const profiles = v1Profiles();
  const registry = new ProfileRegistry(profiles);

  assert.equal(profiles.length, 9);
  assert.equal(registry.size, 9);

  const ids = registry.entries().map((entry) => entry.descriptor.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every production fixture executes through the combined v1 engine", () => {
  const engine = new Engine(undefined, v1Profiles());
  let fixtureCount = 0;

  for (const family of fixtureFamilies) {
    const root = fileURLToPath(
      new URL("../fixtures/" + family + "/", import.meta.url),
    );
    const fixtures = loadFixtureDirectories(root);
    assert.ok(fixtures.length > 0, family);
    fixtureCount += fixtures.length;

    for (const fixture of fixtures) {
      verifyFixture(engine, fixture);
    }
  }

  assert.ok(fixtureCount >= 35);
});

test("wrong-family output resemblance cannot create a cross-profile match", () => {
  const engine = new Engine(undefined, v1Profiles());
  const cases = [
    [
      "cargo test",
      "============================= 1 passed in 0.01s =============================",
    ],
    [
      "pytest -q",
      "running 1 test\ntest smoke ... ok\n\ntest result: ok. 1 passed; 0 failed; 0 ignored",
    ],
    [
      "go test -v ./...",
      "On branch main\n\nnothing to commit, working tree clean\n",
    ],
    [
      "git status",
      "src/main.ts:10:const one = 1;\nsrc/main.ts:20:const two = 2;",
    ],
    [
      "rg TODO src",
      "On branch main\n\nUntracked files:\n  exact.txt\n",
    ],
    [
      "tsc --noEmit",
      "============================= 2 passed in 0.02s =============================",
    ],
  ] as const;

  for (const [command, output] of cases) {
    const result = engine.process(observation(command, output));
    assert.equal(result.decision, "passthrough", command);
    assert.equal(result.profile, null, command);
  }
});

test("exact-evidence and deferred families stay passthrough under combined registry", () => {
  const engine = new Engine(undefined, v1Profiles());
  const cases = [
    ["git diff", "diff --git a/a b/a\n@@ -1 +1 @@\n-old\n+new\n"],
    ["git show main:src/app.ts", "export const exact = true;\n"],
    ["grep -Rn TODO src", "src/a.ts:10:// TODO exact\n"],
    ["ls -la", "drwxr-xr-x 2 user group 4096 src\n"],
    ["tree src", "src\n└── main.ts\n"],
    ["find src -type f", "src/main.ts\n"],
    ["docker logs app", "same\nsame\nimportant\n"],
    ["kubectl get pods", "NAME READY STATUS RESTARTS AGE\napp 1/1 Running 0 1m\n"],
  ] as const;

  for (const [command, output] of cases) {
    const result = engine.process(observation(command, output));
    assert.equal(result.decision, "passthrough", command);
    assert.equal(result.replacement, null, command);
  }
});

test("version-drifted known identities remain conservative in combined engine", () => {
  const engine = new Engine(undefined, v1Profiles());
  const cases = [
    ["cargo test", "UNKNOWN CARGO TEST FORMAT\nimportant"],
    ["pytest -q", "PYTEST FUTURE FORMAT\nimportant"],
    ["go test -v ./...", "=== FUTURE GO TEST FORMAT ===\nimportant"],
    ["git status", "FUTURE GIT STATUS FORMAT\nimportant"],
    ["rg match src", "future-search-format without delimiters"],
  ] as const;

  for (const [command, output] of cases) {
    const result = engine.process(observation(command, output));
    assert.equal(result.decision, "passthrough", command);
  }
});

function observation(command: string, output: string): ObservationV1 {
  return {
    schema_version: PROTOCOL_V1,
    source: "shell",
    command,
    shell_dialect: "unknown",
    output,
    termination: exited(0),
    completeness: "complete",
    presentation: "unknown",
  };
}
