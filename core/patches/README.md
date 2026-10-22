# Local libdragon patches

Fixes this project needs in `core/libdragon` that aren't upstream
(`n64brew/libdragon`). The submodule stays pinned to an unmodified upstream
commit; these patches are applied on top of it before building the host
tools (`build-desktop-tools.yml` does it in every job).

| Patch | Why |
| --- | --- |
| `0001-tools-subprocess-only-inherit-child-stdio-handles.patch` | Windows: videoconv64 failed with "failed to postprocess MPEG-1 stream (SAR user_data)" because the ffmpeg it spawns from its audio/subtitle threads inherited the open `video.m1v` handle, so it couldn't be renamed. |

## Building by hand

From the repository root, on a clean submodule:

```bash
for p in core/patches/*.patch; do git -C core/libdragon apply "$PWD/$p"; done
```

Then build the tools as described in
`app/resources/tools/<platform>/MANIFEST.md`. To undo it:
`git -C core/libdragon checkout -- .`

## Updating libdragon

The patches target the pinned submodule commit. After moving the submodule
to a newer commit, check each one still applies
(`git -C core/libdragon apply --check "$PWD/core/patches/<patch>"`); refresh
it if not, and delete it once upstream includes the fix.
