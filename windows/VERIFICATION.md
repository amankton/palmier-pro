# Windows alpha verification — September 13, 2026

## Delivered

Local Windows x64 editor alpha, version 0.1.0, built from the Palmier fork at base commit `9a3ae50283d8561d3f6834584b79586cf043b8d2` plus the new uncommitted Windows source. No GitHub push or upstream PR was made. Original Swift source is unchanged.

- Portable executable: `release/Palmier-Pro-Windows-Alpha-0.1.0-x64.exe`.
- Unpacked application: `release/win-unpacked/Palmier Pro Windows Alpha.exe`; keep adjacent resources.
- Portable size: 394,620,363 bytes (fast, uncompressed alpha packaging).
- Portable SHA-256: `2A2022A34BB12B3A0167844727FD8A86B55621E67A11066257CA23A9B6F4B094`.
- Authenticode inspection: **NotSigned**. Do not describe this as a signed public release.
- Neither package bundles FFmpeg/FFprobe. They are required externally; Node is not required for the packaged application.

## Tests performed

Environment: Windows x64 build 26200, Node 24.14.0, Electron 44.3.0, local FFmpeg `N-123074-g4e32fb4c2a-20260228` with libx264 and GPL/version3 enabled.

`npm test`: **27 passed, 0 failed, 0 skipped**. Includes:

- Immutable timeline edits, frame/source bounds, split offsets, trim/move/delete/ripple semantics and unsupported-feature rejection.
- Actual rendered pixel checks for picture ordering, source trims, still images and black gaps.
- Audio spectrum/level checks for retained source audio, separate music, simultaneous mixing, relative volume, 44.1→48 kHz resampling and final AAC audio duration.
- Delayed audio and delayed video source timing, including source trims before/across/after onset.
- Non-square-pixel display-aspect preservation in thumbnails and exports.
- Cancellation, source hashes unchanged, no-clobber exports, output staging cleanup, literal percent-sign image filenames and bounded local media input.
- Project persistence, Save As protection, external modification detection and simultaneous-save exclusion.
- GET/HEAD/Range byte serving and input-path policy.
- All renderer CSS variables resolving to the central AppTheme.

`npm run build`: passed. `npm audit`: zero reported vulnerabilities at verification time; this is not a comprehensive security audit.

`npm run package:portable`: passed. The build also produces the unpacked executable.

## Running desktop evidence

The development app and **packaged unpacked executable** were both launched with Playwright/Electron on this Windows machine. Native file dialogs were replaced in the test process with deterministic fixture paths; the real renderer, preload, IPC, file handling, media engine, source playback and rendered playback ran unchanged. Synthetic media was used, not private user footage. Windows stayed hidden during automation.

Successful development evidence: [result JSON](test-results/desktop-AChXO0/result.json), [screenshot](test-results/desktop-AChXO0/editor.png).

Successful packaged-app evidence: [result JSON](test-results/desktop-BCXbus/result.json), [screenshot](test-results/desktop-BCXbus/editor.png), [project](test-results/desktop-BCXbus/Smoke%20project.palmierpc), [actual 1280×720 MP4 export](test-results/desktop-BCXbus/Smoke%20export.mp4).

Both workflows verified sandbox/context isolation, no renderer Node access, native-dialog import, thumbnails, source metadata, media byte-range handling, append, split, undo/redo, mixed picture/audio tracks, project save, decoded timeline preview playback, MP4 export and project reopen. Failed project-open testing preserved the previous asset registry. Closing during an active export cancelled the job and removed staging output.

The portable self-extracting wrapper was built and hashed; its extraction/bootstrap was not separately automated. The executable inside its packaged payload was tested through the full workflow above. No clean second machine or Windows 10 machine was available.

## Issues found and fixed during verification

Internal file-serving requests were separated from the renderer's network-deny policy. Media Range responses now return correct partial-content status/headers. Failed project opens stage assets before committing the registry. Save completion no longer clears dirty state for newer edits. Concurrent project saves are serialized. Close waits for render cancellation cleanup. Fractional frame controls and undefined CSS variables were fixed. Real-media review found and fixed delayed A/V alignment and anamorphic scaling errors.

One packaged-app test initially timed out while requesting a screenshot of a hidden window. The test now uses Electron's documented hidden-window capture API; the complete packaged workflow then passed.

## Not verified or not implemented

This is one picture track and one audio track, up to 64 clips/render. It is not native Mac `.palmier` package compatibility or full editing parity. Advanced effects/transitions/keyframes, text/captions, Lottie, speed changes, semantic search, transcription, MCP/agent transport and proprietary generation services remain unported. Crewframe integration remains future work.

No clean-machine installer/dependency provisioning, signing/updater, broad codec/device matrix, long-project/performance stress test, cache quota, crash recovery, source-content fingerprinting, macOS regression run or production security/license acceptance was performed. Export/new-project publication needs hard-link support; NTFS was used. These limits are recorded rather than presented as completed product capabilities.
