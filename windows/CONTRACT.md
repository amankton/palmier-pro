# Windows implementation contract

Local Windows editor alpha. Root owns Electron host/preload, packaging and integration tests. Media worker owns `core/`, `media/`, and their unit tests. UI worker owns `src/` and `index.html`. Do not overwrite another owner's files.

The Windows project uses the original editor's integer, project-FPS frame concepts. It is explicitly NOT the native Mac `.palmier` package. JSON shape:

```js
{ format: 'palmier-windows', version: 1, id: 'uuid', name: 'Untitled',
  timeline: { fps: 30, width: 1920, height: 1080, tracks: [
    { id: 'video-1', type: 'video', muted: false, hidden: false, clips: [] },
    { id: 'audio-1', type: 'audio', muted: false, hidden: false, clips: [] }
  ] },
  media: [{ id: 'uuid', name: 'clip.mp4', path: 'absolute-path',
    type: 'video', duration: 10, width: 1920, height: 1080, hasAudio: true,
    thumbnailUrl: 'palmier-media://asset/token', previewUrl: 'palmier-media://asset/token' }]
}
```

Clips: `{ id, mediaRef, mediaType, startFrame, durationFrames, trimStartFrame: 0, speed: 1, volume: 1 }`. Times are project frames (not source FPS). Images default to 5 seconds. One non-overlapping picture track (video/images) and one non-overlapping audio track; blank picture gaps render black. Native audio in video clips is retained and mixed with the audio track. Arbitrary native Mac projects must not be silently interpreted as compatible.

## Shared core exports (`core/project.mjs`)

- `createProject(name = 'Untitled')`: new independent project.
- `validateProject(project)`: returns validated/normalized independent copy; throws on invalid/unsupported data. Do not silently discard unknown clip effects/features.
- `totalFrames(project)`: end of last clip, 0 when empty.
- `appendMedia(project, assetId, trackId?)`: immutable append at end of matching track.
- `splitClip(project, clipId, frame)`: immutable split at absolute timeline frame; preserves source offsets.
- `trimClip(project, clipId, {trimStartFrame, durationFrames})`: immutable validated source-in and duration edit.
- `moveClip(project, clipId, startFrame)`: immutable move, reject same-track overlaps.
- `deleteClip(project, clipId, ripple = false)`: immutable removal; optional close gap on same track.

## Media exports (`media/ffmpeg.mjs`)

- `discoverTools({ffmpegPath?, ffprobePath?} = {})`: async -> `{ffmpegPath, ffprobePath, version}`; use explicit env `PALMIER_FFMPEG_PATH` / `PALMIER_FFPROBE_PATH` and PATH fallback. Check executable availability.
- `probeMedia(filePath, tools)`: async -> asset shape above (without URLs). Reject unsupported/no usable streams and nonlocal paths. UUID id.
- `createThumbnail(asset, outputPath, tools)`: async -> output path (video/image only).
- `renderProject(project, outputPath, {tools, signal?, onProgress?})`: async -> `{path, duration, width, height}`. Progress numeric 0..1. Output must not overwrite an existing file or any input. Clean partial files on failure/cancel. FFmpeg subprocess shell:false, windowsHide:true; bounded errors and finite/ranged numeric params.

## Sandboxed renderer bridge (`window.palmier`)

All methods promise-based except onRenderProgress (subscription) and mediaFiles (dropped native Files to local paths via webUtils). Main owns paths, access grants and native dialogs.

- `getStatus()` -> `{platform, version, tools: {available, version?, error?}, projectDirectory}`.
- `importMedia()` -> array of assets from native multi-file dialog.
- `importPaths(paths: string[])` -> array of assets; dropped files only; host validates local media.
- `mediaFiles(files: File[])` -> string[] via Electron webUtils.
- `saveProject(project, saveAs = false)` -> `{path}` or null if cancelled.
- `openProject()` -> project or null (host resolves and refreshes asset URLs; missing files result in actionable error).
- `render(project, mode: 'preview' | 'export')` -> `{path, url, duration, width, height}` or null on export dialog cancellation. Preview uses a unique cache output, export a native Save dialog. One active render; UI awaits promise and may cancel.
- `cancelRender()` -> void.
- `onRenderProgress(callback)` -> unsubscribe; events `{progress: number, mode}`.
- `revealFile(path)` -> void for host-produced/saved files only.

Source playback through host-issued media URLs. Final timeline preview must use actual rendered timeline, not imply a selected source is the composition. UI distinguishes Source and Timeline preview, invalidates rendered preview after edits, and labels unsupported features honestly. User edits remain responsive and undoable while error messages are visible. No provider login/telemetry/paid API calls in this alpha.
