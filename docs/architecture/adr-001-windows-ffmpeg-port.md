# ADR-001: Windows desktop editor with FFmpeg media engine

Status: accepted for a local, limited Windows alpha on September 13, 2026. Broader customer release and Mac format parity are not approved by this decision.

## Context

The user requests a PC offering from their Palmier Pro fork, previously identified as feasible using FFmpeg. The supplied fork is based on `9a3ae50283d8561d3f6834584b79586cf043b8d2`. Its Swift package explicitly targets macOS 26; SwiftUI/AppKit, AVFoundation, Core Image/Metal, Apple speech and CoreML prevent a simple Windows rebuild. Source inspection found roughly 287 application Swift files and 91 Swift test files. Prior laptop planning is not required to begin implementation.

The initial target is the user's existing Windows x64 machine. FFmpeg and FFprobe are already installed. No target budget, release date, customer concurrency, code-signing identity or paid generation authority has been supplied.

## Options

| Approach | Benefit | Trade-off |
| --- | --- | --- |
| Compile original Swift package on Windows | Maximum source reuse if dependencies existed | Apple-only UI/media/framework dependencies remain unavailable; changing the platform declaration does not solve them |
| Native Windows UI with a new compiled media integration | Native platform integration and potentially smaller UI runtime | Rewrites the interface and adds a separate implementation stack from Crewframe |
| Electron renderer plus FFmpeg subprocess jobs | Reuses web engineering, mature decoder/encoder/filter stack, isolates privileged APIs from UI, can build on this PC now | Larger desktop runtime, explicit FFmpeg provisioning, rendered rather than real-time composited timeline preview |

## Decision

Add a separate `windows/` application in the existing fork. Leave original Swift/Mac behavior intact. Use Electron with a sandboxed React renderer, validated main-process IPC, native file dialogs, custom local asset protocols, and shell-free FFprobe/FFmpeg subprocesses. Keep immutable frame-based editing operations in a shared browser/Node core to allow a future UI/MCP command path without maintaining different editing logic.

First acceptance journey: local import → picture/audio timeline → trim/split/move/remove with undo → real composition preview → project save/reopen → MP4 export. Accept one picture track and one audio track, speed 1 and no advanced effects. Reject unsupported features rather than rendering an apparently successful but incorrect result.

## Compatibility boundaries

The original `.palmier` is a directory package with `project.json`, a versioned `media.json`, optional media/generation/chat files and a thumbnail. Clip source trims use project FPS, not source FPS. Track order, audio linking, transforms and keyframes have specific semantics.

The alpha uses `.palmierpc` with `format: palmier-windows` and `version: 1`. It adopts integer project-frame timing, while explicitly differing in native video-audio handling and overlap behavior. Do not claim cross-platform project compatibility. Future native import must preserve unrecognized fields/package files, validate relative paths, relink Mac media paths, avoid double-counting linked audio and block unsupported renders.

## Consequences

- We can implement and verify an actual Windows editing workflow without macOS services or paid APIs.
- FFmpeg replaces import/probe, timeline normalization and export—not the UI or every Metal effect.
- Preview render latency, large runtime size, media cache growth and separate FFmpeg installation are accepted alpha limitations.
- Preserve GPL/upstream notices and review full corresponding source, dependency/codec terms and branding before external distribution.
- Rendering is local. No cloud credentials, MCP listener, telemetry or new external endpoints are activated.
- Crewframe will ultimately use a deliberate local companion/asset exchange API; a desktop port is not automatically a browser embed.

## Follow-on gates

1. Core and real-media tests, sandboxed desktop smoke test and executable launch evidence.
2. Native Mac project fixture and lossless metadata preservation tests.
3. Shared command API/MCP authorization, cancellable jobs and explicit agent approval semantics.
4. Real-time playback/proxy strategy, multitrack compositing and measured feature-by-feature parity.
5. Clean-machine dependency provisioning, signing/update/restore, resource limits, crash recovery and release-license review.

Revisit Electron when measured memory/startup/media latency or required native interaction proves it unsuitable. Revisit render-preview architecture when tested workflows require responsive full-timeline playback beyond source preview.
