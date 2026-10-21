# Palmier Pro — Windows alpha

A Windows desktop port in the user's Palmier Pro fork. Original Mac source is unchanged. This is the first editing slice, **not feature parity with the Mac editor** and not an official Palmier Windows release.

## Run from source

Requirements: Windows 10/11 x64, Node.js 24+, FFmpeg and FFprobe installed locally. The installed FFmpeg build needs the `libx264` encoder, AAC encoder and standard scale/pad/concat/audio filters.

```powershell
cd C:\Users\amank\Documents\ChatGPT\CRM\palmier-pro\windows
npm ci
npm start
```

FFmpeg/FFprobe are discovered from PATH. Explicit executable paths may be provided with `PALMIER_FFMPEG_PATH` and `PALMIER_FFPROBE_PATH`. The renderer reports a missing-tool error; it does not download executables or contact a generation service. Development uses Electron and Vite; the packaged editor does not require Node to be separately installed.

## First workflow

1. Import local video, image and/or audio files.
2. Append media to the picture or audio track.
3. Select a clip to set its source in-point, duration, timeline position or volume. Split at the playhead, delete/ripple-delete and undo/redo.
4. Render a Timeline preview to inspect the actual composition. Source playback is identified separately; an edit invalidates the previous timeline preview.
5. Save a `.palmierpc` project, reopen it, and export H.264/AAC MP4.

One picture track and one audio track are supported in this alpha, with at most 64 clips in a render. Picture gaps are black; audio gaps are silent. Source video audio is included unless muted/zero-volume, and is mixed with the separate audio track. This is a documented Windows-alpha convention; the native Mac editor instead extracts source audio into linked audio clips. Delayed source streams and non-square-pixel footage have dedicated export regression tests.

Projects reference source files in their existing local locations; they do not yet collect/copy the media. Keep source files in place. Missing files, incompatible source types and shortened source durations produce errors; the alpha does not fingerprint source content, so replacing a file with similar metadata is not detected. Save As and export require a new filename. Normal Save updates the opened/saved project and detects externally modified files. Closing with unsaved changes prompts for confirmation. Export/new-project publication requires a local filesystem supporting hard links (such as NTFS); unsupported filesystems fail explicitly without replacing files. Cached thumbnails and rendered previews are under the Electron user-data `media-cache` directory; cache cleanup/quotas remain release work.

## Deliberate boundaries

- `.palmierpc` is a Windows-specific JSON format using frame-based concepts from upstream. It is **not** the Mac `.palmier` directory package. Mac project import/export needs dedicated preservation and parity tests before it is enabled.
- Multi-layer compositing, transitions, keyframes, color grading, text/captions, Lottie, speed changes, semantic search, transcription, generative-AI services and MCP transport are not ported in this slice.
- Timeline preview is an explicit FFmpeg render, not a real-time GPU compositor. Source codecs unsupported by Chromium may not play directly; rendering the timeline to H.264 is the supported fallback.
- Local media only: no network shares, URLs, playlists, remote generation or bundled provider credentials.
- The renderer is sandboxed with context isolation, a narrow validated preload bridge, restrictive app/media protocols and denied permissions/navigation. This is not a full security audit or an OS sandbox for FFmpeg's decoder process.
- This build is unsigned. Code signing, installer/updater, clean-machine dependency provisioning, performance tests, crash recovery, packaging licenses and customer release review remain necessary before distribution.
- Crewframe integration is a later companion/API task. This work does not install an iframe or register a new Crewframe app yet.

## Verify and package

```powershell
npm test
npm run test:desktop
npm run package:win
npm run package:portable
```

`release/win-unpacked/Palmier Pro Windows Alpha.exe` is the unpacked build. Keep its neighboring resources. The portable package, when built, is `release/Palmier-Pro-Windows-Alpha-0.1.0-x64.exe`. Neither package bundles FFmpeg: recipients need permitted compatible FFmpeg/FFprobe installations until dependency provisioning is implemented.

See [architecture and port boundaries](../docs/architecture/adr-001-windows-ffmpeg-port.md), [third-party notices](THIRD_PARTY_NOTICES.md) and [verification record](VERIFICATION.md). Build recipes do not by themselves establish that every target has been verified.

## Full-parity roadmap

The user selected full Mac-editor parity as the destination. The [implementation plan](../docs/plans/WINDOWS_FULL_PARITY_IMPLEMENTATION_PLAN_2026-09-13.md) records the complete project model, real-time multitrack engine, rendering, AI/service replacements, remote Mac reference testing and release gates. The [architecture proposal](../docs/architecture/adr-002-windows-full-parity-architecture.md) separates shared editing commands from media/inference workers; backend selection still requires a trial. Further editor implementation is parked while work returns to Crewframe. These plans do not change this alpha's capabilities or verification status.
