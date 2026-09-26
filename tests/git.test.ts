import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Engine } from "../src/engine.js";
import { GitStatusProfile, gitProfiles } from "../src/profiles/git.js";
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
  new URL("../fixtures/git-status/", import.meta.url),
);

const cleanStatus = [
  "On branch main",
  "Your branch is up to date with 'origin/main'.",
  "",
  "nothing to commit, working tree clean",
  "",
].join("\n");

const stagedStatus = [
  "On branch main",
  "Your branch is up to date with 'origin/main'.",
  "",
  "Changes to be committed:",
  '  (use "git restore --staged <file>..." to unstage)',
  "  modified:   src/main.ts",
  "",
].join("\n");

test("all Git status fixtures execute through the real engine", () => {
  const engine = new Engine(undefined, gitProfiles());
  const fixtures = loadFixtureDirectories(fixtureRoot);
  assert.ok(fixtures.length >= 5);

  for (const fixture of fixtures) {
    verifyFixture(engine, fixture);
  }
});

test("Git status profile exposes native-text descriptor", () => {
  assert.deepEqual(new GitStatusProfile().descriptor(), {
    id: "git-status",
    family: "git",
    fixture_family: "git-status",
    boundary_assumption: "native_text",
  });
});

test("plain human git status removes only known hints and blank lines", () => {
  const result = new Engine(undefined, gitProfiles()).process(
    observation("git status", stagedStatus, exited(0)),
  );

  assert.equal(result.decision, "reduced");
  assert.equal(
    result.replacement,
    [
      "On branch main",
      "Your branch is up to date with 'origin/main'.",
      "Changes to be committed:",
      "  modified:   src/main.ts",
      "",
    ].join("\n"),
  );
});

test("clean branch tracking variants preserve branch state", () => {
  const engine = new Engine(undefined, gitProfiles());
  for (const tracking of [
    "Your branch is ahead of 'origin/feature' by 3 commits.",
    "Your branch is behind 'origin/main' by 5 commits, and can be fast-forwarded.",
  ]) {
    const input = [
      "On branch feature",
      tracking,
      '  (use "git push" to publish your local commits)',
      "",
      "nothing to commit, working tree clean",
      "",
    ].join("\n");

    const result = engine.process(observation("git status", input, exited(0)));
    assert.equal(result.decision, "reduced", tracking);
    assert.ok(result.replacement?.includes(tracking));
    assert.ok(!result.replacement?.includes("(use "));
  }
});

test("status format flags remain exact passthrough", () => {
  const engine = new Engine(undefined, gitProfiles());
  const input = " M src/router.ts\n?? notes.txt\n";

  for (const command of [
    "git status --short",
    "git status -s",
    "git status --porcelain",
    "git status --porcelain=v2",
    "git status -z",
    "git status --branch",
  ]) {
    const result = engine.process(observation(command, input, exited(0)));
    assert.equal(result.decision, "passthrough", command);
    assert.equal(result.replacement, null);
  }
});

test("diff show blob patch log and gh outputs remain exact passthrough", () => {
  const engine = new Engine(undefined, gitProfiles());
  const cases = [
    ["git diff", "diff --git a/a.txt b/a.txt\n@@ -1 +1 @@\n-old\n+new\n"],
    ["git show HEAD", "commit abc123\nAuthor: Dev\n\n    message\n\ndiff --git a/a b/a\n"],
    ["git show main:src/app.ts", "export const value = 42;\n"],
    ["git format-patch -1 --stdout", "From abc123 Mon Sep 17 00:00:00 2001\nSubject: [PATCH] exact\n"],
    ["git log -1", "commit abc123\nAuthor: Dev\n\n    exact commit message\n"],
    ["gh pr view 42", "title:\tImportant PR\nstate:\tOPEN\nbody:\tExact review evidence\n"],
  ] as const;

  for (const [command, input] of cases) {
    const result = engine.process(observation(command, input, exited(0)));
    assert.equal(result.decision, "passthrough", command);
    assert.equal(result.replacement, null);
  }
});

test("localized or unknown git status grammar remains passthrough", () => {
  const input = [
    "Auf Branch main",
    "Ihr Branch ist auf demselben Stand wie 'origin/main'.",
    "",
    "nichts zu committen, Arbeitsverzeichnis unverändert",
    "",
  ].join("\n");

  const result = new Engine(undefined, gitProfiles()).process(
    observation("git status", input, exited(0)),
  );
  assert.equal(result.decision, "passthrough");
  assert.equal(result.replacement, null);
});

test("unexpected status line prevents partial reduction", () => {
  const input = [
    "On branch main",
    "Your branch is up to date with 'origin/main'.",
    "",
    "UNKNOWN IMPORTANT STATE",
    "",
    "nothing to commit, working tree clean",
    "",
  ].join("\n");

  const result = new Engine(undefined, gitProfiles()).process(
    observation("git status", input, exited(0)),
  );
  assert.equal(result.decision, "passthrough");
});

test("truncated and unknown execution state fail open before analysis", () => {
  const engine = new Engine(undefined, gitProfiles());

  const truncated = observation("git status", cleanStatus, exited(0));
  truncated.completeness = "truncated";
  const truncatedResult = engine.process(truncated);
  assert.equal(truncatedResult.decision, "failed_open");
  assert.deepEqual(truncatedResult.diagnostics, ["incomplete_input"]);

  const unknown = engine.process(
    observation("git status", cleanStatus, unknownTermination()),
  );
  assert.equal(unknown.decision, "failed_open");
  assert.deepEqual(unknown.diagnostics, ["unknown_termination"]);
});

test("Unicode filenames survive byte-span rendering exactly", () => {
  const input = [
    "On branch main",
    "",
    "Untracked files:",
    '  (use "git add <file>..." to include in what will be committed)',
    "  café-中😀.txt",
    "",
  ].join("\n");

  const result = new Engine(undefined, gitProfiles()).process(
    observation("git status", input, exited(0)),
  );

  assert.equal(result.decision, "reduced");
  assert.ok(result.replacement?.includes("  café-中😀.txt"));
});

test("standalone trailing carriage return is not treated as presentation", () => {
  const input = cleanStatus.trimEnd() + "\r";
  const result = new Engine(undefined, gitProfiles()).process(
    observation("git status", input, exited(0)),
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
