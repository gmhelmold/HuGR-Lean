import assert from "node:assert/strict";
import test from "node:test";

import {
  identifyInvocation,
  recognizeShellCommand,
  type CommandIdentity,
} from "../src/command.js";
import {
  PROTOCOL_V1,
  type ObservationV1,
  type ShellDialectV1,
  unknownTermination,
} from "../src/types.js";

function direct(command: string, dialect: ShellDialectV1): CommandIdentity {
  const recognition = recognizeShellCommand(command, dialect);
  assert.equal(recognition.kind, "direct", command);
  if (recognition.kind !== "direct") {
    throw new Error("expected direct recognition");
  }
  return recognition.identity;
}

function complex(command: string, dialect: ShellDialectV1 = "unknown"): void {
  assert.deepEqual(recognizeShellCommand(command, dialect), {
    kind: "complex_or_unknown",
  });
}

test("common bare commands route conservatively", () => {
  assert.deepEqual(direct("cargo test", "unknown"), {
    executable: "cargo",
    program: "cargo",
    args: ["test"],
  });
  assert.deepEqual(direct("/usr/bin/git status --short", "unknown"), {
    executable: "/usr/bin/git",
    program: "git",
    args: ["status", "--short"],
  });
  assert.deepEqual(direct("./node_modules/.bin/eslint src/lib.ts", "unknown"), {
    executable: "./node_modules/.bin/eslint",
    program: "eslint",
    args: ["src/lib.ts"],
  });
});

test("unknown dialect rejects shell semantics", () => {
  for (const command of [
    "cargo test 'foo'",
    'cargo test "foo"',
    "cargo test foo\\ bar",
    "echo $HOME",
    "echo ${HOME}",
    "echo $(pwd)",
    "echo `pwd`",
    "echo ~",
    "echo *.ts",
    "cargo test | tee out",
    "cargo test || echo fail",
    "cargo test && echo ok",
    "cargo test ; echo ok",
    "cargo test > out",
    "sleep 1 &",
    "( cargo test )",
    "cargo test\necho done",
    "echo café",
    "echo \u001b[31mred",
  ]) {
    complex(command);
  }
});

test("posix skips only unambiguous leading assignments", () => {
  assert.deepEqual(
    direct("FOO=bar RUSTFLAGS=-Dwarnings cargo test --locked", "posix"),
    {
      executable: "cargo",
      program: "cargo",
      args: ["test", "--locked"],
    },
  );
  complex("FOO=$BAR cargo test", "posix");
  complex("FOO=bar", "posix");
  complex("FOO=bar cargo test", "unknown");
});

test("non-shell sources route only by source", () => {
  const observation: ObservationV1 = {
    schema_version: PROTOCOL_V1,
    source: "read",
    command: "cargo test",
    shell_dialect: "unknown",
    output: "",
    termination: unknownTermination(),
    completeness: "unknown",
    presentation: "unknown",
  };
  assert.deepEqual(identifyInvocation(observation), {
    kind: "source",
    source: "read",
  });
});

test("recognition is deterministic", () => {
  const command = "/usr/bin/cargo test foo::bar --features=a,b";
  const first = recognizeShellCommand(command, "unknown");
  for (let index = 0; index < 32; index += 1) {
    assert.deepEqual(recognizeShellCommand(command, "unknown"), first);
  }
});
