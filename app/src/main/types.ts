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
  frameSkipping?: boolean; // default true; written to the ROM's player.cfg (fmv_parms_t.disable_frame_skipping)

  audioMode?: AudioMode; // default "source"; "none" => strip audio, silent ROM
  audioCompress: AudioCompress; // videoconv64 --audio-compress <0..3>, passed as-is to audioconv64 --wav-compress
  ulcQuality?: number; // 1..100, ULC VBR quality (audioconv64 "ulc,quality=N"); only used with audioCompress "ulc"
  audioSampleRate: number; // --audio-parms RATE,CHANNELS
  audioChannels: 1 | 2;

  profile: Profile;
  quantMatrix: "n64" | "std";
  deinterlace?: Deinterlace; // not exposed in the UI: always "auto" unless a caller sets it
}

export const MAX_AUDIO_SAMPLE_RATE = 32000;

// audioconv64's own ULC default is quality 50, which comes out around 18 kbps
// mono: audibly broken for music. 90 is roughly 90 kbps mono, still smaller
// than VADPCM (~130 kbps).
export const DEFAULT_ULC_QUALITY = 90;

export const DEFAULT_OPTIONS: Omit<ConvertOptions, "inputPath" | "outputPath" | "romTitle"> = {
  codec: "mpeg1",
  quality: 70,
  speed: "quality",
  frameSkipping: true,
  audioMode: "source",
  audioCompress: "vadpcm",
  ulcQuality: DEFAULT_ULC_QUALITY,
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
