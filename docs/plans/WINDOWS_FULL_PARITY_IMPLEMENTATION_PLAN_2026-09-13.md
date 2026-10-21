# Palmier Pro Windows — full-parity implementation plan

Prepared September 13, 2026. Status: **planned; execution parked while work returns to Crewframe**. The user selected full parity as the destination and confirmed no access to an Apple Silicon Mac. This plan does not start implementation, provision a runner, authorize spending, publish source, or release a product.

## 1. Objective and baseline

Deliver a Windows editor that reproduces the supported public-editor capabilities and workflows of Palmier Pro at commit `9a3ae50283d8561d3f6834584b79586cf043b8d2`, with native project compatibility, verified rendering, agent access and a separate Crewframe companion integration. Freeze that reference first; track later upstream changes as explicit additions rather than silently moving the target.

The local checkout is `C:\Users\amank\Documents\ChatGPT\CRM\palmier-pro`. Preserve the original Swift application and all existing user changes. Windows work lives under `windows/`; the [alpha ADR](../architecture/adr-001-windows-ffmpeg-port.md) describes its deliberately limited scope. The [full-parity architecture proposal](../architecture/adr-002-windows-full-parity-architecture.md) defines the next architecture and unresolved decisions.

Existing alpha evidence, not a new verification run:

- Electron/React application with local FFmpeg/FFprobe, one picture track and one audio track, frame-based edits, undo/redo, rendered preview, `.palmierpc` save/open and MP4 export.
- September 13 record: 27 automated tests passed; development and packaged-payload editing journeys passed. See the [verification record](../../windows/VERIFICATION.md).
- The portable executable is unsigned, requires external FFmpeg/FFprobe, and has not passed clean-machine distribution acceptance. Native `.palmier`, full multitrack playback, advanced effects and AI are not implemented.
- Passing the alpha tests is a regression baseline, not a percentage of full parity. Preserve those tests while replacing alpha-only limitations through explicit migrations.

## 2. Parity contract

| Dimension | Required outcome | Qualification |
| --- | --- | --- |
| Editing | Same supported commands, track/link semantics, timing, keyframes and undoable outcomes | Compare normalized states against the pinned Mac implementation |
| Projects | Open, save, collect, move and reopen native projects without losing supported information | Preserve unknown fields/files; block unsafe rewrites or unsupported rendering rather than silently drop data |
| Rendering | Equivalent composition, color, alpha, text, animation and audio timing | Use per-feature pixel/audio tolerances; encoded bytes need not match |
| AI and agents | Complete editing/search/transcription/generation workflows with equivalent controls | Clearly identify replacements; private services and nondeterministic AI outputs cannot be promised identical |
| Windows experience | Usable native file handling, shortcuts, installation, recovery and updates | Equivalent behavior, not imitation of unavailable Apple OS services |
| Crewframe | Authorized Studio → Video launch and project/asset/job exchange in both CRM editions | Separate integration gate; editor parity does not imply a working Crewframe connection |

Every feature is tracked as **inventoried → implemented → Windows-tested → Mac-compared**. Record unavailable reference evidence and substitutions separately. A public full-parity claim requires all mandatory editor rows to pass; material substitutions require an explicit product decision and visible disclosure, not a silent scope reduction.

Palmier's [README](../../README.md) explicitly states that generative-AI processing is closed source. Supported backend access or our own provider service is required. Apple speech also needs a Windows replacement. Owning the fork does not supply private server code, credits, credentials or provider redistribution rights.

Do not add requirements merely because other editors have them. The pinned source has per-clip fades but no general clip-to-clip transition model. Multicam, stabilization, arbitrary masks, plugin hosting and HDR grading are not assumed parity features. Existing XML/FCPXML interchange has documented losses; preserve its supported mappings and disclose those losses rather than promise universal lossless interchange.

## 3. Work packages and completion gates

Each package needs an implementation owner and an independent reviewer when scheduled. Ownership below identifies responsibilities, not staffed people or calendar promises. Source paths are relative to this repository; proposed paths are explicitly labeled.

### P0 — Freeze the inventory and create the reference harness

Owner: parity/QA lead. Dependencies: none for local preparation; approved reference-host access for Mac execution.

- P0.1: Expand the source inventory into a machine-readable feature manifest. Each row records ID, behavior, source path, prerequisites, fixture, expected result, implementation owner, status and evidence links. Proposed location: `windows/parity/features.json`.
- P0.2: Pin source revision, Swift/Xcode/SDK, Windows runtime, FFmpeg build, model weights, fonts and fixture hashes. Record runner image and GPU/driver details for every comparison.
- P0.3: Use synthetic or explicitly authorized media to cover trims, linked A/V, mixed FPS, nonzero timestamps, image orientation, aspect ratios, alpha, captions, color, effects and audio sync. Preserve original assets; no private footage in public CI artifacts.
- P0.4: Build a Mac fixture generator and normalized command/result format; port applicable assertions from the existing Swift test corpus. The repository has 91 Swift test files, not 91 individual tests.
- P0.5: Prove the reference host can build, run representative tests and render a fixture. Probe Metal separately; a successful Swift build is not GPU validation. Capture a small set of interactive workflow recordings on a suitable remote Mac.

Gate: repeatable Windows baseline plus a versioned fixture/evidence format. Mac comparison remains pending until reference execution passes; unrelated local implementation can proceed.

### P1 — Complete project model and shared editing commands

Owner: project/core engineer. Depends on P0 inventory and fixture contracts.

- P1.1: Implement native project/package adapters from `Project/VideoProject.swift` and `Models/Timeline.swift`: tracks, clip IDs, source-time semantics, link groups, transforms, keyframes, effects, media metadata and auxiliary chat/generation files.
- P1.2: Add versioned validation and transactional commands. UI, in-app agent and MCP must invoke the same operations with consistent error results, undo grouping and revision/conflict checks. Record command IDs and resulting revisions for replay tests.
- P1.3: Migrate `.palmierpc` to the full model by creating a new project copy, preserving originals. Explicitly reconcile alpha video-with-audio with Mac's separate linked audio clips to prevent doubled audio.
- P1.4: Preserve unknown JSON fields and opaque supporting files without interpreting them as trusted content. Validate package paths, symlinks/reparse points and collection destinations; prevent traversal and accidental source replacement.
- P1.5: Support offline media, portable relative references, individual/folder relinking and atomic saves. Preserve IDs through save/reopen and undo; conversion of project FPS must retime all frame-based values coherently.

Gate: Mac → Windows → Mac and Windows → Mac → Windows round trips preserve supported state and assets. Offline opening does not destroy references. Migration, concurrent-save, crash-during-save and invalid-package tests pass. Lack of Mac reference execution leaves this gate unverified, not waived.

### P2 — Real-time playback and multitrack timeline

Owners: media engineer and timeline/UI engineer. Depends on P1 command/model contract; rendering trials may run alongside P1.

- P2.1: Run a bounded engine comparison: MLT versus direct libav/FFmpeg plus a GPU compositor. Use the same layered projects and measure seek, playback, memory, audio drift and preview/export agreement. Record effect/alpha/color extensibility and build/distribution obligations. Select the backend in an ADR before broad implementation.
- P2.2: Implement isolated media workers, bounded frame/audio caches, clocking, seeking, frame stepping, continuous composition and cancellable jobs. Keep renderer/Main IPC narrow; an Electron sandbox does not sandbox native decoders.
- P2.3: Implement add/remove/reorder tracks, synchronization locks, multi-selection, linked A/V, drag/trim, snapping, razor, copy/paste/duplicate, overwrite, ripple insert/trim/gap/range deletion and timeline in/out.
- P2.4: Implement transform/crop/opacity/volume keyframes and interpolation, speed, fades, layer order and blend semantics. Match preview handles, source tabs and source/timeline navigation behavior.
- P2.5: Use one composition specification for preview and export. Any reduced-resolution preview must be visible and must not alter full-resolution export. Define hardware decoding/encoding and CPU fallback behavior explicitly.

Gate: normalized command replay matches Mac results; composited playback stays synchronized and frame stepping matches exported frames. Set numeric seek/drop-frame/memory/audio-drift budgets against named devices and workloads during the trial. Do not call unspecified hardware, track counts or resolutions supported.

### P3 — Effects, text, captions, graphics and audio

Owners: rendering engineer; audio/caption engineer. Depends on P1 and the P2 rendering contract.

- P3.1: Port the 20 registered effects, ordered/enabled effect stacks and 16 blend modes from `Compositing/EffectRegistry.swift`, `Models/BlendMode.swift` and associated kernels. Port algorithms, parameter ranges and order of operations—not merely matching slider names.
- P3.2: Cover adjustments, color wheels, RGB/hue curves, LUT interpolation, grain, vignette, blur/sharpen/noise reduction/motion blur, glow, clarity/dehaze and chroma key. Preserve crop → effects → transform → opacity semantics and defined alpha/color conversions.
- P3.3: Port styled text, font traits, alignment, shadows/backgrounds/outlines, box fitting, the ten active text-animation presets, word highlighting, caption presets, mattes and Lottie JSON/.lottie assets. Specify font provisioning/substitution; typography differences are test results, not automatically acceptable.
- P3.4: Add waveforms, dB controls, envelopes/fades/speed and correlation-based external audio synchronization with lock/collision safeguards. Preserve word/segment/source-timeline mappings for later transcription integration.

Gate: deterministic golden-frame and audio fixtures pass feature-specific tolerances, including parameter extremes, keyframe boundaries, transparent edges, LUT interpolation and text layout. Control random seeds/time for stochastic effects where possible. Audio sync recovers known offsets without changing protected clips. Human visual review supplements automated metrics.

### P4 — Media lifecycle, exports and interchange

Owners: project/export engineer and QA. Depends on P1–P3 for final qualification; library work can run earlier after P1.

- P4.1: Port folder-preserving import, library folders/rename/move/delete with undo, pasted images, source replacement, preview-frame capture, clip/range-to-media, first-clip settings behavior, recents, samples and autosave/recovery.
- P4.2: Add H.264/H.265 MP4 and ProRes MOV, output-resolution/aspect choices, frame-rate behavior, source timecode and collected `.palmier` packages. Detect actual encoder availability; never silently substitute the requested codec.
- P4.3: Port XMEML and FCPXML supported mappings and target/version choices. Publish an explicit unsupported-property report reflecting upstream limitations. Validate with actual intended target applications, not XML parsing alone.
- P4.4: Add cache quotas/cleanup, long-running job recovery and disk-full/missing-drive handling. Resolve the alpha's hard-link filesystem restriction through a safe publication design or an explicit supported-filesystem policy.

Gate: frame counts, duration, stream starts, resolution/aspect, color/alpha where supported, audio timing and encoding pass. Collected projects reopen after relocation. Autosave/recovery preserves user changes. Cancellation/failure leaves sources intact and no apparently successful partial export. Every advertised interchange target has evidence.

### P5 — Assistant, MCP, search and speech

Owners: agent integration and inference engineers. Depends on P1 commands; full tool acceptance also depends on P2–P4.

- P5.1: Port the streamed agent/tool loop, chat persistence, mentions, history, context, cancellation and errors. The source already contains a direct Anthropic BYOK path; preserve provider separation without requiring Palmier's account service for local editing.
- P5.2: Preserve original tool names, schemas and supported result contracts. Current inventory: 42 shared definitions, 45 MCP tools including project navigation, and 43 in-app tools including `read_skill`; regenerate counts from the pinned source rather than hard-code them as a release assertion.
- P5.3: Add local MCP pairing/authentication, strict origin/host checks where applicable, permission-scoped files and separate approvals for external uploads, spending and destructive actions. Do not expose an unauthenticated local editor-control listener to Crewframe or arbitrary websites.
- P5.4: Replace CoreML visual search with a Windows runtime using compatible public SigLIP 2 weights. Preserve preprocessing, tokenizer/padding, normalized vectors and ranking. Reuse `models/siglip2` conversion guidance and search fixtures; reindex if vector representation changes.
- P5.5: Evaluate Windows speech engines against Apple speech results. Preserve words, segments, source timestamps, language and supported speaker metadata. Test accuracy, word cuts, captions, language coverage, latency and download/privacy behavior; do not claim another engine produces identical Apple transcripts.

Gate: every supported tool has success/failure/permission/replay tests; complete assistant editing journeys agree with direct UI commands. Search passes pinned embedding and ranking fixtures. Speech meets explicitly approved quality budgets. Mock provider tests are separated from real authorized end-to-end evidence.

### P6 — Generation services and accounts

Owner: service/provider engineer. Depends on provider/access decision and P1 media/job model; can progress in parallel after contracts stabilize.

- P6.1: Inventory calls to model catalog, generation/upscale, uploads, transcription, credits, billing and account functions. Record which are supplied by the public client and which require the absent Clerk/Convex-backed service.
- P6.2: Choose supported Palmier service access or a separately owned provider backend. Record supported models, commercial terms, customer/provider account ownership, authentication, retention and cost responsibility. Exact proprietary-service access is an unresolved external dependency.
- P6.3: Implement adapters, persistent jobs, placeholders, input references, progress, retries/reconciliation, cancellation, result import and recovery after app restart. Use durable idempotency and spending caps; do not repeat a potentially charged job merely because the response was lost.
- P6.4: Keep secrets outside renderer/project exports. Require user approval before uploading local media or incurring costs. Preserve an offline/local editor when a cloud service is unavailable.

Gate: each advertised provider/model workflow has a real authorized acceptance run and traceable outcome/cost; failure/restart tests pass. Any functional replacement is labeled and explicitly accepted. If exact backend access is unavailable, document that limitation rather than declare identical Palmier-cloud parity.

### P7 — Product qualification and distribution

Owners: release/security engineer and independent QA. Final gate depends on P0–P6; security and reliability work begins in P1.

- P7.1: Qualify a declared Windows OS/architecture/device matrix, including Intel/AMD/NVIDIA GPU paths where advertised and CPU fallback. The current machine proves only its own tested configuration; Windows 10/ARM support must not be inferred from a build option.
- P7.2: Test representative long timelines, large libraries, mixed codecs/FPS, malformed media, Unicode/long paths, repeated imports, low disk/memory, suspend/resume and device removal. Measure cold start, seek, playback, export throughput, memory and crash-free soak runs on recorded fixtures.
- P7.3: Threat-model local decoders, projects, downloaded models, agent tools, cloud uploads and update paths. Isolate native workers, bound resource usage, verify downloads/signatures, protect credentials and test malicious inputs. Dependency audit output is only one check.
- P7.4: Implement dependency provisioning, signed installer/update path, rollback, source/license notices, reproducible builds and clean-machine install/uninstall. Review corresponding-source, codec/model/dependency and branding obligations before redistribution; licensing decisions need appropriate review.
- P7.5: Deliver user/admin/developer guides, shortcuts, troubleshooting, project compatibility, AI substitutions, privacy/cost controls and release notes. Keep source, manifest, installer and capability claims aligned.

Gate: all mandatory parity rows have evidence, no unaccepted data-loss/security blockers remain, recovery and clean-machine tests pass, and release artifacts carry approved support/compatibility statements. No release deadline is committed before P0–P2 establish effort and performance risk.

### P8 — Crewframe Studio → Video integration

Owners: Crewframe integration engineer and editor API owner. Contract design follows P1; implementation requires shared Crewframe Apps/assets/identity contracts and a usable editor. This is additional integration work, not a prerequisite for other Crewframe modules.

- P8.1: Register a versioned optional desktop module with compatible editions, prerequisites, capability discovery and honest installed/connected/available states. Disabling access must not delete projects.
- P8.2: Pair the local companion to the intended agency/user with scoped, revocable access. Do not assume a remote browser can safely control arbitrary localhost services or forward broad credentials.
- P8.3: Define a versioned launch/project/asset/job exchange: agency and client references, project ID/revision, permitted media handles, export metadata, job receipts and conflict/failure states. CRM-specific adapters remain separate; one agency still uses one CRM.
- P8.4: Verify launch/open, authorized asset import, editing/export, return to the correct Crewframe project, reconnect and disable in both Twenty and Odoo editions. Exported assets may feed SimpliGen or Social through shared asset contracts, not private file-path assumptions.

Gate: both edition journeys pass with cross-agency denial, expired pairing, unavailable editor, wrong version, duplicate import and project-conflict tests. Keep local project access available after disconnect. No automatic publishing, billing or destructive uninstall is part of pairing.

## 4. Dependency order and parallel work

Critical foundation: **P0 inventory/contracts → P1 complete model/commands → P2 engine decision/playback → P3 rendering fidelity → P4 final export qualification → P7 release**.

After P1 interfaces stabilize, P5 agent/search/speech, P6 service adapters and P4 library work may proceed independently. P8 contract work can proceed alongside Crewframe Apps/assets design. P7 security, documentation and measurement run throughout; the final release gate depends on all advertised capabilities, including P5/P6 and Mac comparison. Parallelism must not create competing project models or renderer semantics.

## 5. Reference testing without an owned Mac

The user has no suitable Mac. Prepare the harness locally and use an approved hosted/borrowed Apple Silicon Mac for execution. GitHub currently lists `macos-26` arm64 runners; pin the runner/Xcode image and confirm actual resources before scheduling. Standard CI can provide build/test evidence, but Metal-dependent rendering and interactive UI comparisons require capability checks and possibly a different GPU-capable remote host. [GitHub runner documentation](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

Before enabling any remote workflow: confirm repository/artifact visibility, permitted uploads, credentials, account eligibility, usage budget and retention. No runner has been provisioned or dispatched by this plan. If access remains unavailable, continue Windows work but leave Mac-compared status pending. Do not substitute Windows-generated goldens for evidence from the reference implementation.

## 6. Acceptance and evidence protocol

- Command fixtures: compare normalized project state, IDs/link preservation, revisions, operation effects and undo/redo. Define intentional platform-specific fields rather than ignoring unexplained differences.
- Render fixtures: compare selected boundary/intermediate frames with explicit color-space/alpha treatment and documented absolute/perceptual tolerances. Image metrics do not replace targeted checks for timing, text geometry or missing layers.
- Audio fixtures: compare onset, sample alignment, channel mapping, envelope/level, clipping and synchronization. Account for codec priming in the test specification, not by silently trimming discrepancies.
- AI fixtures: deterministic mocks for integration contracts; pinned models/settings and separately authorized live jobs for quality. Record service/model versions and stochastic limitations.
- Proposed evidence layout: `windows/parity/fixtures/`, `windows/parity/reports/` and per-feature evidence references. These paths are planned, not created by this document.
- Store revision, fixture hash, toolchain, hardware, expected/actual result and reviewer disposition. Tolerances and performance budgets are proposed before measurements are judged, not widened afterward to make failures disappear.
- Run existing alpha tests plus new package-specific tests on every relevant change. Rerun packaged end-to-end tests for host/IPC/renderer/media changes. Never describe old evidence as a fresh run.

## 7. Risks and decisions to resolve

| Risk/decision | Response | Gate affected |
| --- | --- | --- |
| MLT cannot reproduce particular Metal effects or precision | Prototype hardest cases, allow a custom compositor, decide from evidence | P2/P3 |
| Native project migration loses data or doubles audio | Full schema preservation, copied migration, linked-audio fixtures, Mac round trips | P1 |
| No owned Mac / unsuitable hosted GPU | Approved remote reference host and explicit capability probe; leave comparisons pending | P0/P7 |
| Private generation service unavailable | Supported upstream access or owned adapters; disclose/approve replacements | P6/parity claim |
| Different fonts/speech/search runtime | Pin distributable assets/models; quality tests and explicit substitutions | P3/P5 |
| Distribution rights or codec/model terms unresolved | Dependency/license inventory and appropriate review before bundling or customer promises | P6/P7/P8 |
| Full editor work delays Crewframe | Keep this separately scheduled; Crewframe Studio/Apps/contracts proceed independently | Scheduling |
| Unknown team capacity, budget and deadline | Assign owners and estimate after the foundation trial; no unsupported completion date | Scheduling |

## 8. First implementation session when resumed

1. Read this plan, both ADRs, repository instructions and current git status. Preserve uncommitted Mac/Windows/Crewframe work.
2. Recheck the pinned reference and alpha evidence; rerun `npm test` from `windows/` to establish the current baseline before code changes.
3. Start P0.1 feature manifest and P1.1 schema/fixture specification. Identify Mac-only evidence separately from local tests.
4. Specify the shared command contract and migration behavior before expanding the timeline UI.
5. Prepare the P2.1 trial and a reference-runner workflow draft locally. Do not publish/dispatch it or incur provider costs without authority.
6. Deliver the first milestone: inventory, complete model/command design, native package round-trip tests, multitrack playback trial and reference-host evidence or an explicit pending dependency. Use results to schedule the remaining packages.

## 9. Handoff back to Crewframe

Palmier remains a separately planned Studio → Video component, not a blocker for Crewframe's main foundation. Resume the [Crewframe roadmap](../../../crewframe-app/docs/plans/CREWFRAME_PRODUCT_ROADMAP_2026-09-13.md) with Studio naming/taxonomy and Apps module contracts. Keep VoiceStudio in Audio, SimpliGen and the future editor in Video, and defer voice-sample ingestion until the user supplies mastered files. Preserve the intentionally paused email sync and existing Bacca/Solo personal identities.

## Source map

Source inspection is pinned to the baseline above. Paths in this table are existing source/test directories, not claims that their Windows equivalents are complete.

| Area | Existing source and tests |
| --- | --- |
| Project/timeline | [Models](../../Sources/PalmierPro/Models), [editor operations](../../Sources/PalmierPro/Editor), [project lifecycle](../../Sources/PalmierPro/Project), [timeline tests](../../Tests/PalmierProTests/Timeline), [project round trips](../../Tests/PalmierProTests/Media/ProjectRoundTripTests.swift) |
| Rendering/effects/text | [Compositing](../../Sources/PalmierPro/Compositing), [Preview](../../Sources/PalmierPro/Preview), [rendering tests](../../Tests/PalmierProTests/Rendering) |
| Audio/captions | [Audio](../../Sources/PalmierPro/Audio), [caption tests](../../Tests/PalmierProTests/Captions), [audio tests](../../Tests/PalmierProTests/Audio) |
| Exports/interchange | [Export](../../Sources/PalmierPro/Export), [export tests](../../Tests/PalmierProTests/Export) |
| Agents/search | [Agent](../../Sources/PalmierPro/Agent), [Search](../../Sources/PalmierPro/Search), [SigLIP conversion assets](../../models/siglip2), [agent tests](../../Tests/PalmierProTests/Agent), [search tests](../../Tests/PalmierProTests/Search) |

External technical references: [MLT framework](https://www.mltframework.org/docs/framework/), [FFmpeg documentation](https://ffmpeg.org/documentation.html), [ONNX Runtime for Node](https://onnxruntime.ai/docs/get-started/with-javascript/node.html), [Google SigLIP 2 model](https://huggingface.co/google/siglip2-base-patch16-256), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). These are candidates/reference contracts, not a record of installed runtimes or approved model/provider spending.
