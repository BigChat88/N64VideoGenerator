# tools/win32-x64

Native Windows host binaries (`mkdfs.exe`, `n64tool.exe`, `videoconv64.exe`,
`audioconv64.exe`, `ed64romconfig.exe`) that `app` uses to convert
video -> `.z64` without Docker or MSYS2 installed on the end user's machine.

They live in `bin/` (not directly in this folder) because `videoconv64.exe`
looks for `audioconv64` at `"$N64_INST/bin/audioconv64(.exe)"` — see
`core/libdragon/tools/videoconv64/vconv_audio.cpp:audioconv64_path()` — so we
mimic that layout and pass `N64_INST=resources/tools/win32-x64` when invoking
it (see `tools-path.ts` / `convert.ts`).

## How they were generated (no CI, no MSYS2)

Cross-compiled **from Linux** with `mingw-w64`, running inside an ephemeral
Docker container (it needs no libdragon MIPS toolchain at all: these 5 tools
do not depend on `DECOMP_STUBS`/`n64elfcompress`).

```bash
docker run --rm -v "<repo>:/repo" -w /repo/core/libdragon/tools ubuntu:22.04 bash -lc '
  set -e
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \
    g++-mingw-w64-x86-64 gcc-mingw-w64-x86-64 binutils-mingw-w64-x86-64 make
  update-alternatives --set x86_64-w64-mingw32-gcc /usr/bin/x86_64-w64-mingw32-gcc-posix
  update-alternatives --set x86_64-w64-mingw32-g++ /usr/bin/x86_64-w64-mingw32-g++-posix
  CC="x86_64-w64-mingw32-gcc -static" \
  CXX="x86_64-w64-mingw32-g++ -static -static-libgcc -static-libstdc++" \
  AR="x86_64-w64-mingw32-ar" \
    make mkdfs n64tool videoconv64 audioconv64 ed64romconfig
'
```

Notes:
- The **posix** variant of mingw-w64 is used (not win32) because `videoconv64`
  uses `std::thread`/`std::mutex`, which the win32-threads variant does not
  support.
- `-static -static-libgcc -static-libstdc++` avoids depending on MinGW's
  runtime DLLs on the end user's machine (the `.exe` files run standalone).
- The `Makefile` in `core/libdragon/tools` already knows how to detect mingw
  (`--dumpmachine` contains "mingw") and adds `-lntdll` + the `.exe` suffix
  automatically.
- Verified by running the 5 `.exe` files natively on Windows (no missing DLLs)
  and with the full `convert.ts` pipeline end to end.

## `libdragon` submodule commit used

`cbc66918f0673097a26408a061a3d1a90a9d0b0f` (`preview` branch) — same as the
one used for `resources/rom-assets/`. Regenerate if the submodule changes.

## Pending: `ffmpeg.exe` / `ffprobe.exe`

They are **not** bundled here yet. `videoconv64` looks for them via
`--ffmpeg-path`/`--ffprobe-path` (default: `ffmpeg`/`ffprobe` on PATH), and
today the app depends on the user already having them installed. Before
bundling them there is a pending licensing decision: this app's `h264` codec
invokes `ffmpeg -c:v libx264`, which requires an ffmpeg build compiled with
`libx264` (GPL) — redistributing that ties the installer's distribution to the
GPL. Alternatives: bundle a GPL build (e.g. gyan.dev "full") accepting that
condition, or bundle only an LGPL build and disable the `h264` codec in the
"distributable" build.
