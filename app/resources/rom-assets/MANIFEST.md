# rom-assets

Artifacts of the N64 player (`core/src/main.c`), compiled **once** with the
full libdragon toolchain. The desktop app never recompiles this: it only
combines these files with the `.dfs` produced by conversion (see plan in
`app/README.md`).

## Contents

- `player.elf.stripped` — the player ELF, already stripped of debug symbols and
  compressed (equivalent to `build/video.elf.stripped`, which `n64.mk` produces
  in its `%.z64:` rule).
- `player.elf.sym` — symbol table produced by `n64sym --all` (included in the
  rompak so that crash backtraces stay readable).
- `libdragon.version`, `toolchain.version` — rompak metadata files. `n64.mk`'s
  `N64_TOOLFILES = $(wildcard $(N64_INCLUDEDIR)/*.version)` picks up every
  `*.version` file installed under the toolchain's include dir, not just
  `libdragon.version` — `toolchain.version` (binutils/gcc/newlib versions) is
  a second one that n64brew's fork added; `convert.ts`'s `n64tool` call passes
  both, required for `n64tool` to build the TOC correctly.

## How they were generated

As of the migration to `n64brew/libdragon` (see the top-level `.gitmodules`),
`ghcr.io/n64brew/libdragon:latest` only had the bare MIPS toolchain in it (no
libdragon library/headers/`n64.mk` installed), unlike the old
`ghcr.io/dragonminded/libdragon:latest`, and wasn't confirmed reachable
without auth — it was built locally instead, straight from the submodule's
own `Dockerfile` (`docker build -t ghcr.io/n64brew/libdragon:latest
core/libdragon`), then the library was built and installed into it before
building the player:

```
# <repo> below is the top-level repo (not just core/): the submodule's gitlink
# needs the real .git/modules to generate libdragon.version via git.
docker run --rm -v "<repo>:/repo_root" -w /repo_root/core/libdragon \
  ghcr.io/n64brew/libdragon:latest bash -lc "
    make -j\$(nproc) && make install &&
    cd ../ && make"
# copy build/video.elf.stripped and build/video.elf.sym
# copy /n64_toolchain/mips64-elf/include/*.version from the container
```

`make` here also needs `mkdfs`/`videoconv64`/`audioconv64` (not part of the
toolchain image, see `app/resources/tools/*/MANIFEST.md`) and `n64sym`/
`n64elfcompress` (built from `core/libdragon/tools`, same image) on
`$N64_INST/bin`, plus `ffmpeg` on `PATH`, to get through the `video.z64`
target's full dependency chain (it needs *some* `core/video.mp4` to drive
`videoconv64` — content is irrelevant, it's discarded; only
`build/video.elf.stripped`/`.sym` are kept).

- Image: built locally from `n64brew/libdragon`'s own `Dockerfile` (tagged
  `ghcr.io/n64brew/libdragon:latest`)
- `libdragon` submodule commit used: `f26e1c16145e4d6ad7e391e1306513d684083c02`
  (`preview` branch)
- Generated: 2026-10-12

## When to regenerate

Only if `core/src/main.c` changes or the `libdragon` submodule is updated (new
toolchain commit/version). The user's input video **never** requires
regenerating these files.

## History

- **2026-09-04**: regenerated after fixing a real bug in `find_video_filename()`
  (`core/src/main.c`): `dfs_rom_size()` is the native DFS API and does **not**
  accept the `"rom:/"` prefix (only the POSIX layer used by `fopen`/`fmv_play`
  understands that prefix; libdragon itself does `dfs_rom_addr(name+5)` in
  `model64.c`/`lzh5.c` to skip it). Passing `"rom:/video.m1v"` as-is made codec
  detection always fail and fall back to the first candidate (`video.m1v`)
  regardless of which codec was used — that is why the `mpeg1` codec worked
  (it matched by chance) but `h264` failed with "No such file or directory"
  looking for `video.m1v` in a ROM that only had `video.h264`. Fixed by passing
  the path without the prefix to `dfs_rom_size()`, keeping the prefix only for
  the final `fmv_play()`.
- **2026-09-04 (2)**: regenerated again after adding `wav64_init_compression(2)`
  and `wav64_init_compression(3)` in `core/src/main.c`. Per `wav64.h`: audio
  compression levels 0 (uncompressed) and 1 (VADPCM, the app default) need no
  initialization, but 2 (ULC) and 3 (Opus) do — without that call, the mixer
  decodes with uninitialized state. With Opus this showed up as a hard assert
  on real hardware ("compression level 3 not initialized"). libdragon's
  official `videoplayer` example does not need this call because it only uses
  VADPCM; since this app lets you pick all 4 formats, the ones that require it
  must be initialized up front, without knowing which one the user picked when
  converting.
- **2026-09-04 (3)**: regenerated again after adding `mixer_ch_set_limits(0, 16, 48000, 0)`
  in `core/src/main.c`. Cause: `audioconv64` **always** forces Opus to 48000 Hz
  (`conv_wav64.cpp: OPUS_SAMPLE_RATE`), no matter what rate the app requested
  when converting (the UI's 32000 Hz limit only applies to
  VADPCM/ULC/uncompressed, which do honor the requested rate). By default the
  mixer limits each channel to the output rate configured in `audio_init`
  (32000 Hz here) and asserts on real hardware if it is exceeded
  ("frequency 48000.0 exceeds configured limit 31995.0"). `mixer.h` documents
  that raising that per-channel limit is supported (the mixer *downsamples* the
  wav64's 48kHz to the 32kHz output), so we raise channel 0's limit (the one
  `fmv_play` uses for audio, `fmv_parms_t.audio_mixer_channel` default 0) to
  48000 Hz before playback.
- **2026-09-05**: regenerated after adding to `core/src/main.c` video pause
  (A button during playback: toggles `ctrl->pause()`, stops and re-syncs the
  audio, and draws a pause icon with `rdpq`) and the "pause between videos"
  screen (`wait_for_replay()`: when `fmv_play` finishes it shows a play icon
  and waits for the A button before playing again in the `for(;;)` loop).
  Neither function showed up when running the ROM because
  `player.elf.stripped`/`player.elf.sym` were still the 2026-09-04 20:33 build
  (without those changes): the app **never recompiles `core/src/main.c`**, it
  only links this precompiled ELF with the conversion's `.dfs`, so editing
  `main.c` has no effect until these artifacts are regenerated. Verified with
  `mips64-elf-nm`/`objdump` that the new ELF contains `video_osd_callback`
  with the calls to `joypad_*`, `mixer_ch_stop` and `__rdpq_fill_rectangle`
  (`draw_pause_icon` was inlined). You have to re-convert the video in the app
  to get a ROM with these changes; already-generated `.z64` files do not change
  on their own.
- **2026-09-05 (2)**: regenerated after fixing the
  `"Master time went backwards"` assert (`core/libdragon/src/video/video_sync.c:103`)
  that fired when resuming after a pause. The previous pause version resumed
  with `wav64_play()` + `wav64_seek()` by hand, which left `fmv_play`'s
  internal `video_sync` controller with `last_master_time` frozen at the audio
  position from before the pause. Since video normally runs behind the audio,
  repositioning the audio to the paused frame's time made the "master time" go
  backwards and the `assertf` in `video_sync_step()` aborted. The fix resumes
  via `ctrl->seek_time(paused_time_sec, exact=true)` (`fmv_control_t` API),
  which repositions video + audio + subtitles and also calls
  `video_sync_reset()` (sets `last_master_time = 0`). `exact=true` decodes
  forward from the previous keyframe to resume on the exact frame, with no
  visible jump to the last keyframe. It depends on the `.seek` index
  (videoconv64 `--seek`, which the app passes by default with a 5 s interval);
  without that index `video_seek()` returns -1 and pause could not resume
  without risking the same assert.
- **2026-09-05 (3)**: regenerated after halving the size of the play and pause
  icons in `core/src/main.c` (`PLAY_ICON_SIZE` 40→20, `PAUSE_BAR_W` 10→5,
  `PAUSE_BAR_H` 40→20, `PAUSE_BAR_GAP` 10→5). `PAUSE_BOTTOM_MARGIN` was left
  unchanged: it is the gap from the bottom edge, not part of the symbol.
- **2026-09-05 (4)**: regenerated after a second (failed) attempt to fix
  `"Master time went backwards"`. Attempt (3) resumed via
  `ctrl->seek_time(..., exact=true)` believing it reset `video_sync`; but
  `mpeg1_codec` **implements neither `seekfast` nor `seek`** (only `rewind`),
  so `video_seek()` returns -1, `ctrl_seek_frame` bails before touching the
  audio or calling `video_sync_reset()`, and the assert kept firing. Also the
  app's VADPCM audio only has *skip points* at the video keyframes (every 5 s
  with `--seek 5`), so `wav64_seek` never lands exactly on the pause point.
  Definitive fix: `fmv_parms_t.disable_frame_skipping = true` in `main()`'s
  `fmv_play` call. Without frame-skipping, `fmv_play` **does not create** the
  `video_sync` controller (`fmv.c:176`), so its `assertf` in `video_sync_step`
  (`video_sync.c:103`) is unreachable. Video is then synced by
  `display_set_fps_limit(framerate)` instead of by the audio; on resume, video
  stays exact on the frozen frame and audio is repositioned to the nearest
  skip point (up to ~2.5 s off with the default interval, which does not
  self-correct but also does not grow). General trade-off: on long videos, if
  the N64 cannot decode in real time, audio and video can drift apart
  gradually.
- **2026-09-06**: regenerated after aligning the end-of-video play icon with the
  pause icon in `core/src/main.c`. `fmv_play()` sets the display to the video's
  own resolution/aspect ratio, but `wait_for_replay()` hardcoded
  `RESOLUTION_320x240`, so on any video that is not exactly 320x240 the play icon
  was drawn in a different coordinate space and VI scaling than the pause icon —
  landing at a different on-screen height and a different apparent size even
  though both use `PAUSE_BAR_H` / `PAUSE_BOTTOM_MARGIN`. Fixed by probing the
  video once with `video_open`/`video_get_info`/`video_close` in `main()` and
  passing that `resolution_t` (width, height, aspect ratio) to
  `wait_for_replay()`, which now calls `display_init()` with the same parameters
  fmv used (also switched to `DEPTH_32_BPP` / `FILTERS_RESAMPLE` to match). Both
  icons now share the video's coordinate space, so the play triangle sits at the
  same height and scale as the pause bars.
- **2026-09-05 (5)**: regenerated after refining pause resume. Previously it
  saved `time_sec` (the **video** frame's time, which runs behind the audio)
  and did `wav64_seek` to that value; with **uncompressed** audio that leaves
  the audio a few tenths of a second before where it was. Now it saves the
  channel's real position (`mixer_ch_get_pos() / wave.frequency`) on pause and
  does `wav64_seek` to that position on resume: uncompressed, the audio
  continues exactly where it was cut; with VADPCM/Opus it still lands on the
  nearest skip point (a format limitation). `disable_frame_skipping` is kept
  for robustness with the compressed formats.
- **2026-10-12**: regenerated after migrating the `libdragon` submodule from
  the archived `DragonMinded/libdragon` to its continuation,
  `n64brew/libdragon` (`preview` branch) — see the top-level `.gitmodules`.
  `core/src/main.c` did not change; this is purely a toolchain/library bump.
  Verified by running `videoconv64`/`mkdfs`/`n64tool`/`ed64romconfig`
  end-to-end (both the bundled `win32-x64` tools via
  `npm run smoke-test` and the rebuilt `linux-x64` tools in a container) and
  checking the resulting `.z64`'s magic header. Also added `toolchain.version`
  (see Contents) and had `convert.ts` pass it to `n64tool`, matching
  `n64.mk`'s `N64_TOOLFILES` wildcard.

## Flags `n64tool` combines them with (reference, see `convert.ts`)

They replicate `core/libdragon/n64.mk`'s defaults exactly:

```
n64tool --toc --title "<user-chosen title>" --category N \
  --output <output>.z64.tmp --align 256 \
  player.elf.stripped player.elf.sym <video>.dfs libdragon.version toolchain.version

ed64romconfig --savetype none --regionfree <output>.z64.tmp
```
