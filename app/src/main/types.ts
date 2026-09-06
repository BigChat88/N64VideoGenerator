// Types shared between the main process, the preload and the renderer.
// The option names follow the videoconv64/audioconv64 flags 1:1 as documented
// in core/libdragon/tools/videoconv64/videoconv64.cpp, so it is easy to audit
// that we are not reinventing or reinterpreting anything.

export type VideoCodec = "mpeg1" | "h264";
export type AudioCompress = "none" | "vadpcm" | "ulc" | "opus";
export type EncodeSpeed = "quality" | "quick";
export type Deinterlace = "auto" | "on" | "off";
export type Profile = "auto" | "cartoon" | "film" | "noisy" | "none";

export interface ConvertOptions {
  inputPath: string;
  outputPath: string; // final .z64 path chosen by the user
  romTitle: string; // n64tool's --title

  codec: VideoCodec;
  quality: number; // 0..100, --quality
  speed: EncodeSpeed; // quick => --quick
  fps?: number; // --fps
  seekIntervalSec?: number; // --seek

  audioCompress: AudioCompress; // videoconv64 --audio-compress <0..3>, passed as-is to audioconv64 --wav-compress
  audioSampleRate: number; // --audio-parms RATE,CHANNELS
  audioChannels: 1 | 2;

  // Advanced (collapsed in the UI, defaults = current Makefile behavior)
  profile: Profile;
  quantMatrix: "n64" | "std";
  deinterlace?: Deinterlace; // not exposed in the UI: always "auto" unless a caller sets it
}

// The precompiled player (src/main.c) calls audio_init() with this fixed rate
// (AUDIO_HZ) and the libdragon mixer refuses (assert on real hardware) to play
// a wav64 encoded above that. It cannot be raised per conversion: the .elf is
// already compiled. See resources/rom-assets/MANIFEST.md.
export const MAX_AUDIO_SAMPLE_RATE = 32000;

export const DEFAULT_OPTIONS: Omit<ConvertOptions, "inputPath" | "outputPath" | "romTitle"> = {
  codec: "mpeg1",
  quality: 70,
  speed: "quality",
  audioCompress: "vadpcm",
  audioSampleRate: 32000,
  audioChannels: 1,
  profile: "auto",
  quantMatrix: "n64",
  deinterlace: "auto",
};

export type ProgressEvent =
  | { kind: "stage"; stage: "videoconv64" | "mkdfs" | "n64tool" | "romconfig" | "done"; label: string }
  | { kind: "log"; stream: "stdout" | "stderr"; line: string }
  | { kind: "error"; message: string }
  | { kind: "success"; outputPath: string };
