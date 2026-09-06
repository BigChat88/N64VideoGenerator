// Small helper to run a command, streaming each stdout/stderr line exactly as
// the tool emits it (without reinterpreting it) and rejecting the promise if
// the process exits with a non-zero code. Every tool in the pipeline
// (videoconv64, mkdfs, n64tool, ed64romconfig, docker) uses this.

import { spawn } from "node:child_process";

export interface RunResult {
  code: number;
}

export async function runProcess(
  command: string,
  args: string[],
  opts: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    onLine?: (stream: "stdout" | "stderr", line: string) => void;
  } = {}
): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
    });

    const pipe = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line.length > 0) opts.onLine?.(stream, line);
      }
    };
    child.stdout?.on("data", pipe("stdout"));
    child.stderr?.on("data", pipe("stderr"));

    child.on("error", (err) => {
      reject(new Error(`Could not run "${command}": ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ code });
      } else {
        reject(new Error(`"${command}" exited with code ${code}`));
      }
    });
  });
}
