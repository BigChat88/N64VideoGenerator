import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { runProcess } from "./run-process";
import { extraEnvFor, resolveFfmpegPaths, resolveToolMode, ToolMode, ToolName } from "./tools-path";
import { ConvertOptions, DEFAULT_ULC_QUALITY, MAX_AUDIO_SAMPLE_RATE, ProgressEvent } from "./types";

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

/**
 * Runs ffmpeg/ffprobe (docker-aware) and returns everything it wrote to stdout.
 * Unlike runTool(), this uses the ffmpeg/ffprobe paths resolved by
 * resolveFfmpegPaths() (which may be bare "ffmpeg"/"ffprobe" on PATH even in
 * "bundled" mode, when only the N64 tools are bundled), so it must not go
 * through the ToolName/toolsDir machinery.
 */
async function runFf(
  kind: "ffmpeg" | "ffprobe",
  exePath: string,
  args: string[],
  mode: ToolMode,
  mounts: Mount[],
  env: NodeJS.ProcessEnv | undefined,
  emit: Emit
): Promise<string> {
  let stdout = "";
  const onLine = (stream: "stdout" | "stderr", line: string) => {
    if (stream === "stdout") stdout += line + "\n";
    else emit({ kind: "log", stream, line });
  };

  if (mode.mode === "docker") {
    const dockerArgs: string[] = ["run", "--rm"];
    for (const m of mounts) {
      dockerArgs.push("-v", `${m.hostDir}:${m.containerDir}${m.readOnly ? ":ro" : ""}`);
    }
    const workMount = mounts.find((m) => m.containerDir === "/work");
    if (workMount) dockerArgs.push("-w", "/work");
    dockerArgs.push(mode.image, kind);
    for (const a of args) dockerArgs.push(toContainerPath(a, mounts));
    await runProcess("docker", dockerArgs, { onLine });
    return stdout;
  }

  await runProcess(exePath, args, { env, onLine });
  return stdout;
}

/**
 * Lists the stream indexes of the file's audio streams, in file order.
 * Best-effort: if ffprobe can't be run at all
 * this returns null, and the caller assumes the video has a single audio track
 * (the previous behavior) and lets videoconv64 report any real tooling problem
 * itself.
 */
async function probeAudioStreams(
  ffprobe: string,
  inputPath: string,
  mode: ToolMode,
  mounts: Mount[],
  env: NodeJS.ProcessEnv | undefined,
  emit: Emit
): Promise<number[] | null> {
  try {
    const out = await runFf(
      "ffprobe",
      ffprobe,
      [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=index",
        "-of",
        "csv=p=0",
        inputPath,
      ],
      mode,
      mounts,
      env,
      emit
    );
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+$/.test(line))
      .map(Number);
  } catch (err) {
    emit({
      kind: "log",
      stream: "stderr",
      line: `Could not probe for audio streams (${err instanceof Error ? err.message : String(err)}); assuming the video has audio.`,
    });
    return null;
  }
}

/**
 * Remuxes `inputPath` keeping only its first video stream, the audio stream
 * `audioIndex` and (if `keepSubtitles`) the subtitle streams, all stream-copied
 * so this stays fast.
 *
 * videoconv64 converts every audio track of the input, and once there is more
 * than one it names them "video.0.wav64", "video.1.wav64"... while fmv_play()
 * (core/libdragon/src/video/fmv.c) only looks for "video.wav64": a video with
 * several audio tracks (eg. one per language) would end up as a silent ROM,
 * also carrying every unused track.
 */
async function remuxWithSingleAudio(
  ffmpeg: string,
  inputPath: string,
  outputPath: string,
  audioIndex: number,
  keepSubtitles: boolean,
  mode: ToolMode,
  mounts: Mount[],
  env: NodeJS.ProcessEnv | undefined,
  emit: Emit
): Promise<void> {
  await runFf(
    "ffmpeg",
    ffmpeg,
    [
      "-hide_banner",
      "-nostats",
      "-y",
      "-v",
      "error",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      `0:${audioIndex}`,
      ...(keepSubtitles ? ["-map", "0:s?"] : []),
      "-c",
      "copy",
      outputPath,
    ],
    mode,
    mounts,
    env,
    emit
  );
}

/**
 * Remuxes `inputPath` into a new container that carries a silent stereo audio
 * track the same length as the video (via ffmpeg's anullsrc + -shortest, with
 * the video stream stream-copied so this stays fast).
 *
 * A video with no audio track leaves fmv_play() (see core/libdragon/src/video/
 * fmv.c) without its master clock, so playback can drift out of pace on real
 * hardware. Giving every ROM a (silent) video.wav64 keeps the player on its
 * audio-synced path.
 */
async function remuxWithSilentAudio(
  ffmpeg: string,
  inputPath: string,
  outputPath: string,
  mode: ToolMode,
  mounts: Mount[],
  env: NodeJS.ProcessEnv | undefined,
  emit: Emit
): Promise<void> {
  await runFf(
    "ffmpeg",
    ffmpeg,
    [
      "-hide_banner",
      "-nostats",
      "-y",
      "-v",
      "error",
      "-i",
      inputPath,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "pcm_s16le",
      "-shortest",
      outputPath,
    ],
    mode,
    mounts,
    env,
    emit
  );
}

export async function convertVideoToZ64(
  options: ConvertOptions,
  resourcesRoot: string,
  emit: Emit
): Promise<void> {
  const noAudio = options.audioMode === "none";

  if (!noAudio && options.audioSampleRate > MAX_AUDIO_SAMPLE_RATE) {
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
    emit({ kind: "stage", stage: "probe", label: "Checking the audio track..." });
    let vcInput = inputCopy;
    let silentTrackReady = false;
    const audioStreams = noAudio
      ? []
      : await probeAudioStreams(ffprobe, inputCopy, mode, mounts, extraEnv, emit);
    const needSilentTrack = noAudio || audioStreams?.length === 0;
    if (audioStreams && audioStreams.length > 1) {
      // Always the first track, whatever the container marks as default.
      const chosen = audioStreams[0];
      emit({
        kind: "log",
        stream: "stdout",
        line: `The video has ${audioStreams.length} audio tracks; using the first one (stream #${chosen}).`,
      });
      // Same "video" stem requirement as the silent remux below.
      const singleDir = join(workDir, "single-audio");
      await mkdir(singleDir, { recursive: true });
      const singleInput = join(singleDir, "video.mkv");
      // Copying the subtitles can fail for codecs Matroska can't carry (eg.
      // mp4's mov_text), so retry without them rather than keep every track.
      for (const keepSubtitles of [true, false]) {
        try {
          await remuxWithSingleAudio(
            ffmpeg,
            inputCopy,
            singleInput,
            chosen,
            keepSubtitles,
            mode,
            mounts,
            extraEnv,
            emit
          );
          vcInput = singleInput;
          if (!keepSubtitles) {
            emit({ kind: "log", stream: "stderr", line: "Could not keep the subtitles; continuing without them." });
          }
          break;
        } catch (err) {
          emit({
            kind: "log",
            stream: "stderr",
            line: `Could not select a single audio track (${err instanceof Error ? err.message : String(err)})${keepSubtitles ? "; retrying without subtitles" : "; continuing with all of them"}.`,
          });
        }
      }
    }
    if (needSilentTrack) {
      emit({
        kind: "log",
        stream: "stdout",
        line: noAudio ? "Audio disabled; using a silent track." : "No audio track found; adding a silent one.",
      });
      // videoconv64 names every DFS entry after the input file's basename stem
      // (strip_ext(base_name(input)) + ".m1v"/".wav64"/".seek"), and the
      // precompiled player hardcodes "rom:/video.m1v" / "rom:/video.h264" (and
      // fmv derives "rom:/video.wav64" from that). So the silent remux must keep
      // the stem exactly "video": a sibling file like "video.silent.mkv" would
      // yield "video.silent.m1v" and the ROM would assert on boot with
      // "error opening file rom:/video.m1v: No such file or directory". Put it in
      // its own subdir so it can be "video.mkv" without clashing with inputCopy.
      const silentDir = join(workDir, "silent");
      await mkdir(silentDir, { recursive: true });
      const silentInput = join(silentDir, "video.mkv");
      try {
        await remuxWithSilentAudio(ffmpeg, inputCopy, silentInput, mode, mounts, extraEnv, emit);
        vcInput = silentInput;
        silentTrackReady = true;
      } catch (err) {
        emit({
          kind: "log",
          stream: "stderr",
          line: `Could not add a silent audio track (${err instanceof Error ? err.message : String(err)}); continuing without one.`,
        });
      }
    }

    const stripSourceAudio = noAudio && !silentTrackReady;
    // The silent track is digital silence (ffmpeg anullsrc = all-zero samples).
    // audioconv64's VADPCM encoder asserts on that input ("lookup[i].codes[j] != 0"
    // in huff_vadpcm.c: its Huffman table builder degenerates when every residual
    // is zero), so a "no audio" conversion would always fail. ULC encodes silence
    // fine (~0.5 KB for a whole video), is cheap to decode, and the precompiled
    // player already calls wav64_init_compression(2) for it (see rom-assets
    // MANIFEST). Opus also works but forces 48 kHz and is heavier.
    const audioCompress = noAudio ? "ulc" : options.audioCompress;
    const audioSampleRate = noAudio ? MAX_AUDIO_SAMPLE_RATE : options.audioSampleRate;
    const audioChannels = noAudio ? 1 : options.audioChannels;
    // The silent track keeps audioconv64's default ULC quality: it's digital
    // silence, so quality doesn't matter and the default keeps it tiny.
    let audioCompressArg = String(AUDIO_COMPRESS_CODE[audioCompress]);
    if (audioCompress === "ulc" && !noAudio) {
      const q = Math.round(options.ulcQuality ?? DEFAULT_ULC_QUALITY);
      if (!(q >= 1 && q <= 100)) {
        throw new Error(`The ULC quality (${options.ulcQuality}) must be between 1 and 100.`);
      }
      audioCompressArg += `,quality=${q}`;
    }
    // Huffman (audioconv64's wav64 default for VADPCM) is expanded on the CPU,
    // and stereo decompresses both planes of each block per read. Without it
    // the frames stream by async DMA, which lightens stereo playback next to
    // the video decoder for only ~12% more ROM space.
    if (audioCompress === "vadpcm" && audioChannels === 2) {
      audioCompressArg += ",huffman=false";
    }

    // --- 1. videoconv64: input video -> .m1v/.h264 + .wav64 + .seek ---
    emit({
      kind: "stage",
      stage: "videoconv64",
      label: noAudio ? "Converting video (no audio)..." : "Converting video and audio...",
    });
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
      ...(stripSourceAudio ? ["--no-audio"] : []),
      // videoconv64's 2-pass MPEG-1 encode writes pass 1 to "-f null", where
      // ffmpeg defaults to vfr and drops frames whose timestamps collide after
      // the fps filter, while pass 2 (.m1v) keeps them all. On sources with
      // irregular timestamps pass 2 then outruns the pass-1 log and aborts with
      // "Input is longer than 2-pass log file". Forcing CFR makes both passes
      // emit the same frames (the fps filter already makes the stream CFR).
      ...(options.codec === "mpeg1" ? ["--ffmpeg-opts", "-fps_mode cfr"] : []),
      "--audio-compress",
      audioCompressArg,
      "--audio-parms",
      `${audioSampleRate},${audioChannels}`,
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
      vcInput,
    ];
    await runTool("videoconv64", vcArgs, mode, toolsDir, mounts, extraEnv, onLine);

    // Runtime settings for the precompiled player, which reads them at boot
    // (core/src/main.c: read_player_cfg()).
    await writeFile(
      join(filesystemDir, "player.cfg"),
      `frame_skipping=${options.frameSkipping === false ? 0 : 1}
`
    );

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
        join(romAssetsDir, "toolchain.version"),
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
    await copyFile(src, dest);
    await rm(src, { force: true });
  }
}
