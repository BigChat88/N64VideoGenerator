# tools/darwin-x64

Native macOS (Intel) host binaries (`mkdfs`, `n64tool`, `videoconv64`,
`audioconv64`, `ed64romconfig`) that `app` uses to convert video -> `.z64`
without Docker or a local `N64_INST` toolchain installed on the end user's
machine. Same role as `tools/win32-x64` / `tools/linux-x64`, see those
folders' `MANIFEST.md` for why they live in `bin/` and how `N64_INST` is set
when invoking them.

## Status: pending

`bin/` is not populated yet — no macOS build machine was available to
generate and verify these binaries. Until it is, the app on macOS falls back
to the libdragon Docker container (development only) or a local `N64_INST`
toolchain, per the main `README.md`.

## How to generate them

Built natively (no cross-compilation) with the Xcode command-line tools:

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
on `macos-13`, an Intel runner) automates this build — trigger it and commit
its artifact's contents here to fill in `bin/`. Apple Silicon (`darwin-arm64`)
would need the same treatment on an ARM runner (e.g. `macos-14`) and is not
covered yet.

## `libdragon` sources to use

Whatever is checked out under `core/libdragon` at generation time (see
`core/libdragon/libdragon.version`) — regenerate if that changes.
