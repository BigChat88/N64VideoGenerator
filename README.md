# N64 Video Generator

## What it does

Turns an ordinary video file into a
**playable Nintendo 64 ROM** that plays that video back with sound on real N64
hardware (e.g. through an EverDrive64 / SummerCart64) or in any N64 emulator.

It does this by reusing [libdragon](https://github.com/DragonMinded/libdragon)'s
video (MPEG-1 / H.264) and audio decoding APIs: a small, generic player program
is compiled once for the N64, and each conversion only re-packs your video into
a fresh ROM alongside that player.

## What it generates

A single **`.z64` ROM file** at the location you choose. That file is the whole
deliverable: it embeds the video, the audio and the player, and needs nothing
else to run.

Encoding is configurable: video codec (MPEG-1 or H.264), quality (0–100),
quick vs. quality encoding, target FPS, seek interval, audio compression
(VADPCM / Opus / ULC / uncompressed), sample rate (max **32000 Hz** — the
precompiled player is fixed at that rate), mono/stereo, plus advanced encoding
profile and quantization matrix.

---

## Desktop application

### How to run it (end user)

Download a build from the project's GitHub Releases and run it:

| Artifact | How to use |
|---|---|
| `N64VideoGenerator-<version>-portable.exe` | Run directly, no installation. |
| `N64 Video Generator Setup <version>.exe` | Installer (Start Menu shortcut, uninstaller). |

Then: pick an input video → set a ROM title → adjust options if you want →
**Convert to .z64** → choose where to save the ROM.

### What it requires (end user)

- **Windows 10/11, 64-bit.** The native conversion tools are currently only
  bundled for `win32-x64`. On macOS/Linux the app falls back to a libdragon
  Docker container (development only) or a local `N64_INST` toolchain.
- **`ffmpeg` and `ffprobe` on your `PATH`.** They are *not* bundled yet (the
  H.264 path needs a GPL `libx264` build — licensing decision pending), so
  install a recent FFmpeg and make sure `ffmpeg -version` works in a terminal.
- Everything else — the N64 player `.elf`, `videoconv64`, `mkdfs`, `n64tool`,
  `ed64romconfig`, `audioconv64` — ships inside the app under
  [`resources/`](app/resources).

# AI Note

The application was developed using AI. I'm just an enthusiast who wanted to
generate videos on the N64. In this case, the means used to achieve it are not
relevant to me.
