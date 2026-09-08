export type VideoCodec = "mpeg1" | "h264";
export type AudioCompress = "none" | "vadpcm" | "ulc" | "opus";
export type AudioMode = "source" | "none";
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

  audioMode?: AudioMode; // default "source"; "none" => strip audio, silent ROM
  audioCompress: AudioCompress; // videoconv64 --audio-compress <0..3>, passed as-is to audioconv64 --wav-compress
  audioSampleRate: number; // --audio-parms RATE,CHANNELS
  audioChannels: 1 | 2;

  profile: Profile;
  quantMatrix: "n64" | "std";
  deinterlace?: Deinterlace; // not exposed in the UI: always "auto" unless a caller sets it
}

export const MAX_AUDIO_SAMPLE_RATE = 32000;

export const DEFAULT_OPTIONS: Omit<ConvertOptions, "inputPath" | "outputPath" | "romTitle"> = {
  codec: "mpeg1",
  quality: 70,
  speed: "quality",
  audioMode: "source",
  audioCompress: "vadpcm",
  audioSampleRate: 32000,
  audioChannels: 1,
  profile: "auto",
  quantMatrix: "n64",
  deinterlace: "auto",
};

export type ProgressEvent =
  | { kind: "stage"; stage: "probe" | "videoconv64" | "mkdfs" | "n64tool" | "romconfig" | "done"; label: string }
  | { kind: "log"; stream: "stdout" | "stderr"; line: string }
  | { kind: "error"; message: string }
  | { kind: "success"; outputPath: string };
