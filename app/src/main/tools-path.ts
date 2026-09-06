// Resolves where the native tools that the conversion pipeline needs live:
// ffmpeg, ffprobe, videoconv64, audioconv64 (used internally by videoconv64),
// mkdfs, n64tool and ed64romconfig.
//
// Resolution order (most to least preferred):
//   1. Binaries bundled in resources/tools/<platform>-<arch>/ — what the app
//      installed by an end user will use (see plan: "bundle precompiled
//      binaries").
//   2. Binaries already installed on the system (PATH, or $N64_INST/bin) —
//      handy for developers who already have the native libdragon toolchain
//      (same as this repo's Makefile).
//   3. The libdragon Docker container (ghcr.io/dragonminded/libdragon), if
//      available — ONLY for development/testing on this machine while no
//      bundled native .exe binaries exist (see
//      .github/workflows/build-desktop-tools.yml, which is what produces
//      mode 1 for real releases). This mode must not be used in the app
//      distributed to end users.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export type ToolName =
  | "ffmpeg"
  | "ffprobe"
  | "videoconv64"
  | "mkdfs"
  | "n64tool"
  | "ed64romconfig";

export type ToolMode =
  | { mode: "bundled"; dir: string }
  | { mode: "system"; dir: string | null }
  | { mode: "docker"; image: string };

const DOCKER_IMAGE = "ghcr.io/dragonminded/libdragon:latest";

function platformDir(): string {
  // electron-builder / Node already normalize this to "win32", "darwin", "linux".
  const arch = process.arch; // "x64", "arm64", ...
  return `${process.platform}-${arch}`;
}

// videoconv64 has no flag to say where audioconv64 is: it always looks for it
// at "$N64_INST/bin/audioconv64(.exe)" (see
// core/libdragon/tools/videoconv64/vconv_audio.cpp, audioconv64_path()). That
// is why we bundle the binaries under tools/<platform-arch>/bin/, mimicking
// the layout of a real N64_INST, and set that environment variable when
// invoking it (see convert.ts).
function bundledRoot(resourcesRoot: string): string {
  return join(resourcesRoot, "tools", platformDir());
}

function bundledToolsDir(resourcesRoot: string): string {
  return join(bundledRoot(resourcesRoot), "bin");
}

function exeName(tool: ToolName): string {
  return process.platform === "win32" ? `${tool}.exe` : tool;
}

function commandExists(cmd: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Decides which resolution mode to use, once per app startup.
 * `resourcesRoot` is the project's `resources/` folder (in dev) or the
 * packaged bundle's (`process.resourcesPath` in production).
 */
export function resolveToolMode(resourcesRoot: string): ToolMode {
  const bundled = bundledToolsDir(resourcesRoot);
  if (existsSync(join(bundled, exeName("videoconv64")))) {
    return { mode: "bundled", dir: bundled };
  }

  const n64Inst = process.env.N64_INST;
  const systemDir = n64Inst ? join(n64Inst, "bin") : null;
  const systemHasTools =
    (systemDir && existsSync(join(systemDir, exeName("videoconv64")))) ||
    commandExists("videoconv64");
  if (systemHasTools) {
    return { mode: "system", dir: systemDir };
  }

  if (dockerAvailable()) {
    return { mode: "docker", image: DOCKER_IMAGE };
  }

  throw new Error(
    "Conversion tools not found (videoconv64/mkdfs/n64tool). " +
      "Install the full app (with bundled binaries), or set N64_INST to point " +
      "at a libdragon toolchain, or install Docker Desktop for development mode."
  );
}

/**
 * Path to ffmpeg/ffprobe when the mode is NOT docker (docker already ships
 * them inside the image). They are resolved independently of the mode for
 * mkdfs/n64tool/videoconv64: those may already be bundled
 * (resources/tools/) while ffmpeg/ffprobe are not yet (see TODO in
 * app/README.md), in which case we fall back to the system PATH, same as
 * videoconv64's default (--ffmpeg-path ffmpeg --ffprobe-path ffprobe).
 */
export function resolveFfmpegPaths(resourcesRoot: string, mode: ToolMode): { ffmpeg: string; ffprobe: string } {
  if (mode.mode === "bundled") {
    const ffmpegBundled = join(mode.dir, exeName("ffmpeg"));
    const ffprobeBundled = join(mode.dir, exeName("ffprobe"));
    if (existsSync(ffmpegBundled) && existsSync(ffprobeBundled)) {
      return { ffmpeg: ffmpegBundled, ffprobe: ffprobeBundled };
    }
  }
  return { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };
}

/**
 * Extra environment variables to inject when invoking a tool directly
 * (bundled/system), outside docker. Only needed in "bundled" mode: in
 * "system" mode we assume the developer already has N64_INST set (or the
 * operating system default).
 */
export function extraEnvFor(resourcesRoot: string, mode: ToolMode): NodeJS.ProcessEnv | undefined {
  if (mode.mode === "bundled") {
    return { N64_INST: bundledRoot(resourcesRoot) };
  }
  return undefined;
}
