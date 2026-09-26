import type {
  ObservationV1,
  ShellDialectV1,
  SourceV1,
} from "./types.js";

export interface CommandIdentity {
  executable: string;
  program: string;
  args: string[];
}

export type CommandRecognition =
  | { kind: "direct"; identity: CommandIdentity }
  | { kind: "complex_or_unknown" };

export type InvocationIdentity =
  | { kind: "source"; source: SourceV1 }
  | { kind: "shell"; recognition: CommandRecognition };

const COMPLEX: CommandRecognition = { kind: "complex_or_unknown" };

export function identifyInvocation(observation: ObservationV1): InvocationIdentity {
  if (observation.source !== "shell") {
    return { kind: "source", source: observation.source };
  }

  return {
    kind: "shell",
    recognition:
      observation.command === null
        ? COMPLEX
        : recognizeShellCommand(observation.command, observation.shell_dialect),
  };
}

export function recognizeShellCommand(
  command: string,
  dialect: ShellDialectV1,
): CommandRecognition {
  if (
    command.length === 0 ||
    [...command].some(
      (character) =>
        isAsciiWhitespace(character) &&
        character !== " " &&
        character !== "\t",
    )
  ) {
    return COMPLEX;
  }

  const tokens = command.split(/[ \t]+/u).filter(Boolean);
  if (tokens.length === 0) {
    return COMPLEX;
  }

  const executableIndex =
    dialect === "posix" ? skipPosixAssignments(tokens) : 0;

  if (executableIndex >= tokens.length) {
    return COMPLEX;
  }

  const executable = tokens[executableIndex];
  if (executable === undefined || !isPortableExecutableToken(executable)) {
    return COMPLEX;
  }

  const args = tokens.slice(executableIndex + 1);
  if (!args.every(isPortableBareToken)) {
    return COMPLEX;
  }

  const program = lexicalProgramName(executable);
  if (program.length === 0 || program === "." || program === "..") {
    return COMPLEX;
  }

  return {
    kind: "direct",
    identity: {
      executable,
      program,
      args,
    },
  };
}

function skipPosixAssignments(tokens: readonly string[]): number {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined || !isUnambiguousPosixAssignment(token)) {
      break;
    }
    index += 1;
  }
  return index;
}

function isUnambiguousPosixAssignment(token: string): boolean {
  const separator = token.indexOf("=");
  if (separator < 0) {
    return false;
  }

  const name = token.slice(0, separator);
  const value = token.slice(separator + 1);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) {
    return false;
  }

  return value.length === 0 || isPortableBareToken(value);
}

function isPortableExecutableToken(token: string): boolean {
  return (
    !token.endsWith("/") &&
    !token.endsWith("\\") &&
    !token.includes("=") &&
    isPortableBareToken(token)
  );
}

function isPortableBareToken(token: string): boolean {
  return /^[A-Za-z0-9_./:=@+,-]+$/u.test(token);
}

function lexicalProgramName(executable: string): string {
  const parts = executable.split(/[\\/]/u).filter(Boolean);
  return parts.at(-1) ?? "";
}

function isAsciiWhitespace(character: string): boolean {
  return /^[\t\n\v\f\r ]$/u.test(character);
}
