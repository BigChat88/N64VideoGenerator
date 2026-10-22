import { spawn } from "node:child_process";
import { basename } from "node:path";

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
  // Name the tool without its directory: bundled tools live under a long
  // temp/resources path that only clutters the error popup.
  const name = basename(command).replace(/\.exe$/i, "");

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
    });

    // The tools print their fatal error as the last stderr line; keep it so
    // the failure says why. Progress bars redraw with "\r", so only the text
    // after the last one is a real message.
    let lastStderrLine = "";
    const pipe = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line.length > 0) opts.onLine?.(stream, line);
        if (stream === "stderr") {
          const message = line.slice(line.lastIndexOf("\r") + 1).trim();
          if (message.length > 0) lastStderrLine = message;
        }
      }
    };
    child.stdout?.on("data", pipe("stdout"));
    child.stderr?.on("data", pipe("stderr"));

    child.on("error", (err) => {
      reject(new Error(`Could not run ${name} ("${command}"): ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ code });
      } else {
        const reason = lastStderrLine ? `: ${lastStderrLine}` : "";
        reject(new Error(`${name} failed (exit code ${code})${reason}`));
      }
    });
  });
}
