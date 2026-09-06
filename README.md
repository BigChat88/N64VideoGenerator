# N64 Video Generator

Turns a video file (mp4, etc.) into a playable Nintendo 64 ROM (`.z64`) that
plays it back with audio, using [libdragon](https://github.com/DragonMinded/libdragon)'s
video (MPEG-1 / H.264) and audio decoding APIs. The ROM runs on real N64
hardware (e.g. via an EverDrive64) or in an emulator.

The project is split into two independent parts:

```
core/  N64 firmware + the video/ROM conversion toolchain
app/   Electron GUI that wraps the same conversion pipeline
```

## [`core/`](core)

The N64 side: a small libdragon program ([src/main.c](core/src/main.c)) that
plays back whatever video/audio was packed into the ROM's filesystem, plus
the `Makefile` that drives the full pipeline end to end:

1. `videoconv64` transcodes an input video into MPEG-1 or H.264 + audio
   (`.m1v`/`.h264`, `.wav64`, `.seek`).
2. `mkdfs` packs those files into the ROM's embedded filesystem (`.dfs`).
3. `n64tool` links the precompiled player `.elf` with the `.dfs` into a
   `.z64` ROM.

This requires the full libdragon MIPS toolchain (`N64_INST`) to build the
player `.elf` — see [libdragon's install docs](https://github.com/DragonMinded/libdragon/wiki).
`core/libdragon` is a git submodule; run `git submodule update --init --recursive`
after cloning.

```bash
cd core
make                
```

## [`app/`](app)

A cross-platform Electron app that runs the *same* conversion pipeline
through a desktop UI, without requiring the end user to install Docker or
the libdragon MIPS toolchain. The player `.elf` is compiled once (from
`core/src/main.c`) and committed as a prebuilt artifact
([resources/rom-assets](app/resources/rom-assets)); the app only
needs the host-native `videoconv64`/`mkdfs`/`n64tool`/`ed64romconfig` binaries
(bundled per-platform) plus `ffmpeg`/`ffprobe` to convert a video end to end.
See [app/README.md](app/README.md) for details, current
status, and how to run it in development.

```bash
cd app
npm install
npm run dev
```

# AI Note 

The application was developed using AI. I’m just an enthusiast who wanted to
generate videos on the N64. In this case, the means used to achieve it are not 
relevant to me.