# tools/darwin-arm64

Native macOS (Apple Silicon) host binaries (`mkdfs`, `n64tool`,
`videoconv64`, `audioconv64`, `ed64romconfig`) that `app` uses to convert
video -> `.z64` without Docker or a local `N64_INST` toolchain installed on
the end user's machine. Same role as `tools/win32-x64` / `tools/linux-x64`,
see those folders' `MANIFEST.md` for why they live in `bin/` and how
`N64_INST` is set when invoking them.

arm64 (Apple Silicon) rather than x64 (Intel) because every Mac Apple has
sold since 2020 is Apple Silicon, Apple stopped making Intel Macs, and
GitHub has said hosted Intel macOS runners go away entirely once the macOS
15 image itself retires (planned fall 2027) — Intel would need constant
relabeling for a shrinking, EOL install base.

## Status: pending

`bin/` is not populated yet — no macOS build machine was available to
generate and verify these binaries. Until it is, the app on macOS falls back
to the libdragon Docker container (development only) or a local `N64_INST`
toolchain, per the main `README.md`.

## How to generate them

Built natively (no cross-compilation) with the Xcode command-line tools, on
Apple Silicon hardware (or an Apple Silicon CI runner):

```bash
cd core/libdragon/tools
make mkdfs n64tool videoconv64 audioconv64 ed64romconfig
```

Like on Windows/Linux, these 5 tools do not depend on the MIPS `N64_INST`
toolchain (`DECOMP_STUBS`/`n64elfcompress` do; these don't), so no libdragon
toolchain image or MIPS cross-compiler is needed.

Then copy the 5 binaries into `bin/`, `strip` them, and `chmod +x` them.
Verify by running each with `--help` (or no args) in a clean checkout.

The `.github/workflows/build-desktop-tools.yml` `build-tools-macos` job (runs
on `macos-15`, an Apple Silicon runner) automates this build — trigger it and
commit its artifact's contents here to fill in `bin/`.

## `libdragon` sources to use

Whatever is checked out under `core/libdragon` at generation time (see
`core/libdragon/libdragon.version`) — regenerate if that changes.
