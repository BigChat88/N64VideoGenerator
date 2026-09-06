# N64 Video Generator — desktop app

Electron app to convert a video (mp4, etc.) into a `.z64` ROM playable on the
N64, without installing Docker or the libdragon toolchain. See the full
architecture plan in the conversation that started this project (summary below).

## Why it is lightweight

The N64 player `.elf` ([core/src/main.c](../core/src/main.c)) is generic: it
does not depend on the input video, only on the chosen codec. So it is compiled
**once** (with the full MIPS toolchain, via Docker) and committed under
[resources/rom-assets/](resources/rom-assets) — see
[MANIFEST.md](resources/rom-assets/MANIFEST.md). The end-user app only needs
3 native host tools + ffmpeg to convert: `videoconv64` → `mkdfs` → `n64tool`
(+ `ed64romconfig`), exactly the same steps [../core/Makefile](../core/Makefile)
runs by hand today.

## Current status / what's left for a real release

- [x] `core/src/main.c` generalized to support MPEG-1 and H.264 in the same `.elf`.
- [x] `resources/rom-assets/` generated (player.elf.stripped/.sym + libdragon.version).
- [x] Electron app (main/preload/renderer) and conversion pipeline (`src/main/convert.ts`).
- [x] `resources/tools/win32-x64/bin/` with the real `.exe` binaries for `mkdfs`,
      `n64tool`, `videoconv64`, `audioconv64`, `ed64romconfig` — cross-compiled
      from Linux with `mingw-w64` (no MSYS2, no CI), see
      [MANIFEST.md](resources/tools/win32-x64/MANIFEST.md) for the exact
      command. Tested running natively on Windows and with the full pipeline
      (`npm run smoke-test`), with no Docker involved.
- [ ] **Pending / licensing decision**: bundling `ffmpeg.exe`/`ffprobe.exe`.
      This app's `h264` codec runs `ffmpeg -c:v libx264`, which requires an
      ffmpeg build with `libx264` (GPL) — bundling that ties the installer's
      distribution to the GPL. See the details in the MANIFEST above. Until
      this is decided, the app depends on the user already having `ffmpeg`/`ffprobe`
      on their PATH (`tools-path.ts` falls back to that automatically).
- [ ] **Pending**: `electron-builder` (NSIS installer).
- [ ] macOS / Linux: repeat the same, the pipeline (`convert.ts`) does not change.
      The same trick of cross-compiling with Docker should work (mingw-w64
      only applies to Windows; for macOS you have to compile on a macOS
      runner/machine, for Linux native gcc/g++ is enough, no mingw).

`tools-path.ts` resolves the tools in this order: (1) bundled in
`resources/tools/<platform>-<arch>/bin/` (this is what the app uses today), (2)
installed on the system (`$N64_INST/bin` or PATH), (3) the libdragon Docker
container (`ghcr.io/dragonminded/libdragon`) as a last resort for development
if neither (1) nor (2) is available.

## Development

```bash
npm install
npm run dev          # builds and opens the app
npm run smoke-test   # runs the pipeline without UI against ../core/video.mp4
```

## Structure

```
src/main/       main process: window, dialogs, conversion pipeline
src/preload/    secure IPC bridge to the renderer
src/renderer/   UI (plain html/css/js, no framework)
resources/rom-assets/  precompiled player .elf (see MANIFEST.md)
resources/tools/       native per-platform binaries (see MANIFEST.md)
scripts/        build/test utilities
```
