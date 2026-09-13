# tools/linux-x64

Native Linux host binaries (`mkdfs`, `n64tool`, `videoconv64`, `audioconv64`,
`ed64romconfig`) that `app` uses to convert video -> `.z64` without Docker or
a local `N64_INST` toolchain installed on the end user's machine. Same role
as `tools/win32-x64`, see that folder's `MANIFEST.md` for why they live in
`bin/` and how `N64_INST` is set when invoking them.

## How they were generated

Built natively (no cross-compilation needed) inside an ephemeral
`ubuntu:20.04` container, so the resulting glibc dependency (2.31) stays
compatible with distros far newer than that without rebuilding:

```bash
docker run --rm -v "<repo>:/repo" -w /repo/core/libdragon/tools ubuntu:20.04 bash -lc '
  set -e
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends g++ gcc make
  CXX="g++ -static-libgcc -static-libstdc++" CC="gcc" \
    make -B mkdfs n64tool videoconv64 audioconv64 ed64romconfig
'
```

Then the five binaries are copied into `bin/`, stripped (`strip <binary>`),
and marked executable (`chmod +x`).

Notes:
- `-static-libgcc -static-libstdc++` avoids depending on a `libstdc++.so.6`
  newer than what the container shipped, without going fully static (musl):
  they still dynamically link `libc`/`libpthread`/`libm`, which is standard
  and expected for Linux binaries.
- Like on Windows, these 5 tools do not depend on the MIPS `N64_INST`
  toolchain (`DECOMP_STUBS`/`n64elfcompress` do; these don't), so no libdragon
  toolchain image or MIPS cross-compiler is needed to build them.
- Verified by running all 5 binaries (`--help` / no-args usage) in a clean
  `ubuntu:20.04` container.
- The `.github/workflows/build-desktop-tools.yml` `build-tools-linux` job
  automates this same build for future updates (e.g. after bumping the
  `libdragon` submodule); download its artifact and replace `bin/` here.

## `libdragon` sources used

Built from whatever is checked out under `core/libdragon` at generation time
(see `core/libdragon/libdragon.version`) — regenerate if that changes.
