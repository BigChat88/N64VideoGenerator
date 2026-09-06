import { copyFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { runProcess } from "./run-process";
import { extraEnvFor, resolveFfmpegPaths, resolveToolMode, ToolMode, ToolName } from "./tools-path";
import { ConvertOptions, MAX_AUDIO_SAMPLE_RATE, ProgressEvent } from "./types";

const AUDIO_COMPRESS_CODE: Record<ConvertOptions["audioCompress"], number> = {
  none: 0,
  vadpcm: 1,
  ulc: 2,
  opus: 3,
};

const DOCKER_TOOL_PATH: Record<ToolName, string> = {
  ffmpeg: "ffmpeg",
  ffprobe: "ffprobe",
  videoconv64: "/n64_toolchain/bin/videoconv64",
  mkdfs: "/n64_toolchain/bin/mkdfs",
  n64tool: "/n64_toolchain/bin/n64tool",
  ed64romconfig: "/n64_toolchain/bin/ed64romconfig",
};
type Emit = (event: ProgressEvent) => void;

interface Mount {
  hostDir: string;
  containerDir: string;
  readOnly?: boolean;
}

function toContainerPath(hostPath: string, mounts: Mount[]): string {
  const normalized = hostPath.replace(/\\/g, "/");
  for (const m of mounts) {
    const hostNorm = m.hostDir.replace(/\\/g, "/");
    if (normalized === hostNorm || normalized.startsWith(hostNorm + "/")) {
      const rel = normalized.slice(hostNorm.length).replace(/^\/+/, "");
      return rel ? `${m.containerDir}/${rel}` : m.containerDir;
    }
  }
  // Not a path we bind mount (e.g. a flag like "--quality"): return it as-is.
  return hostPath;
}

/**
 * Runs a tool according to the resolved mode (bundled/system: directly;
 * docker: inside the libdragon container, translating host -> mount paths).
 */
async function runTool(
  tool: ToolName,
  args: string[],
  mode: ToolMode,
  toolsDir: string | null,
  mounts: Mount[],
  env: NodeJS.ProcessEnv | undefined,
  onLine: (stream: "stdout" | "stderr", line: string) => void
): Promise<void> {
  if (mode.mode === "docker") {
    const dockerArgs: string[] = ["run", "--rm"];
    for (const m of mounts) {
      dockerArgs.push("-v", `${m.hostDir}:${m.containerDir}${m.readOnly ? ":ro" : ""}`);
    }
    const workMount = mounts.find((m) => m.containerDir === "/work");
    if (workMount) dockerArgs.push("-w", "/work");
    dockerArgs.push(mode.image);
    dockerArgs.push(DOCKER_TOOL_PATH[tool]);
    for (const a of args) dockerArgs.push(toContainerPath(a, mounts));
    await runProcess("docker", dockerArgs, { onLine });
    return;
  }

  const exe =
    process.platform === "win32" ? `${tool}.exe` : tool;
  const command = toolsDir ? join(toolsDir, exe) : tool;
  await runProcess(command, args, { env, onLine });
}

export async function convertVideoToZ64(
  options: ConvertOptions,
  resourcesRoot: string,
  emit: Emit
): Promise<void> {
  if (options.audioSampleRate > MAX_AUDIO_SAMPLE_RATE) {
    throw new Error(
      `The audio sample rate (${options.audioSampleRate} Hz) exceeds the maximum the ` +
        `precompiled player supports (${MAX_AUDIO_SAMPLE_RATE} Hz): the libdragon mixer ` +
        `refuses to play a wav64 encoded above that (assert on real hardware). ` +
        `Lower it and try again.`
    );
  }

  const romAssetsDir = join(resourcesRoot, "rom-assets");
  const mode = resolveToolMode(resourcesRoot);
  const toolsDir = mode.mode === "bundled" || mode.mode === "system" ? mode.dir ?? null : null;
  const { ffmpeg, ffprobe } = resolveFfmpegPaths(resourcesRoot, mode);
  const extraEnv = extraEnvFor(resourcesRoot, mode);

  const tempRoot = await mkdtemp(join(tmpdir(), "n64videogen-"));
  const workDir = join(tempRoot, "work");
  const filesystemDir = join(workDir, "filesystem");
  await mkdir(filesystemDir, { recursive: true });

  const inputCopy = join(workDir, `video${extnameOf(options.inputPath)}`);
  await copyFile(options.inputPath, inputCopy);

  const mounts: Mount[] = [
    { hostDir: workDir, containerDir: "/work" },
    { hostDir: romAssetsDir, containerDir: "/rom-assets", readOnly: true },
  ];

  const onLine = (stream: "stdout" | "stderr", line: string) => emit({ kind: "log", stream, line });

  try {
    // --- 1. videoconv64: input video -> .m1v/.h264 + .wav64 + .seek ---
    emit({ kind: "stage", stage: "videoconv64", label: "Converting video and audio..." });
    const vcArgs = [
      "-o",
      filesystemDir,
      "--codec",
      options.codec,
      "--quality",
      String(options.quality),
      ...(options.speed === "quick" ? ["--quick"] : []),
      ...(options.fps ? ["--fps", String(options.fps)] : []),
      ...(options.seekIntervalSec ? ["--seek", String(options.seekIntervalSec)] : []),
      "--audio-compress",
      String(AUDIO_COMPRESS_CODE[options.audioCompress]),
      "--audio-parms",
      `${options.audioSampleRate},${options.audioChannels}`,
      "--profile",
      options.profile,
      "--quant-matrix",
      options.quantMatrix,
      "--deinterlace",
      options.deinterlace ?? "auto",
      "--ffmpeg-path",
      ffmpeg,
      "--ffprobe-path",
      ffprobe,
      inputCopy,
    ];
    await runTool("videoconv64", vcArgs, mode, toolsDir, mounts, extraEnv, onLine);

    // --- 2. mkdfs: pack filesystem/ into a .dfs ---
    emit({ kind: "stage", stage: "mkdfs", label: "Packing the ROM filesystem..." });
    const dfsPath = join(workDir, "video.dfs");
    await runTool("mkdfs", [dfsPath, filesystemDir], mode, toolsDir, mounts, extraEnv, onLine);

    // --- 3. n64tool: combine the precompiled .elf + the .dfs -> .z64 ---
    emit({ kind: "stage", stage: "n64tool", label: "Generating the .z64 ROM..." });
    const romTmp = join(workDir, "output.z64.tmp");
    await runTool(
      "n64tool",
      [
        "--toc",
        "--title",
        options.romTitle,
        "--category",
        "N",
        "--output",
        romTmp,
        "--align",
        "256",
        join(romAssetsDir, "player.elf.stripped"),
        join(romAssetsDir, "player.elf.sym"),
        dfsPath,
        join(romAssetsDir, "libdragon.version"),
      ],
      mode,
      toolsDir,
      mounts,
      extraEnv,
      onLine
    );

    // --- 4. ed64romconfig: same defaults as N64_ROM_SAVETYPE/REGIONFREE ---
    emit({ kind: "stage", stage: "romconfig", label: "Configuring the ROM header..." });
    await runTool(
      "ed64romconfig",
      ["--savetype", "none", "--regionfree", romTmp],
      mode,
      toolsDir,
      mounts,
      extraEnv,
      onLine
    );

    await mkdir(dirnameOf(options.outputPath), { recursive: true });
    await moveFile(romTmp, options.outputPath);

    emit({ kind: "stage", stage: "done", label: "Done" });
    emit({ kind: "success", outputPath: options.outputPath });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function extnameOf(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i >= 0 ? b.slice(i) : "";
}

function dirnameOf(p: string): string {
  return p.replace(/[\\/][^\\/]*$/, "");
}

async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch {
    // rename fails when src/dest are on different drives (common: temp on C:,
    // user-chosen output on another drive). Fall back to copy + delete.
    await copyFile(src, dest);
    await rm(src, { force: true });
  }
}
