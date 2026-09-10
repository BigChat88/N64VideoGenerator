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

## Desktop application

### How to run it

Download `N64VideoGenerator-<version>-portable.exe` from the project's GitHub
Releases and run it directly — it is a portable executable, no installation
required.

Then: pick an input video → set a ROM title → adjust options if you want →
**Convert to .z64** → choose where to save the ROM.

### What it requires 

- **Windows 10/11, 64-bit.** The native conversion tools are currently only
  bundled for `win32-x64`. On macOS/Linux the app falls back to a libdragon
  Docker container (development only) or a local `N64_INST` toolchain.
- **`ffmpeg` and `ffprobe` on your `PATH`.** They are *not* bundled yet (the
  H.264 path needs a GPL `libx264` build — licensing decision pending), so
  install a recent FFmpeg and make sure `ffmpeg -version` works in a terminal.

  **Installing FFmpeg on Windows:**
  - Easiest, with a package manager (run in PowerShell/Terminal):
    - `winget install Gyan.FFmpeg` &nbsp;— or —&nbsp; `choco install ffmpeg-full`
    - Open a **new** terminal afterwards so the updated `PATH` takes effect.
  - Manual: download a build from
    [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) (get "ffmpeg-release-full")
    or [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds/releases),
    unzip it somewhere permanent (e.g. `C:\ffmpeg`), then add the `bin` folder
    (`C:\ffmpeg\bin`, the one containing `ffmpeg.exe` and `ffprobe.exe`) to your
    `PATH`: *Start → "Edit the system environment variables" → Environment
    Variables → select `Path` → Edit → New*.
  - Verify: open a new terminal and run `ffmpeg -version` and `ffprobe -version`.


## Acknowledgements

Thanks to the **[libdragon](https://github.com/DragonMinded/libdragon)**
team for the open-source N64 SDK, and to id Software / JAMDAT / EA for the
original 2005 game.

# AI Note

The application was developed using AI. I'm just an enthusiast who wanted to create interesting projects. In this case, how it was achieved is not relevant to me.
