# ADR-002: Shared project commands and isolated media workers for Windows parity

Status: **proposed**, September 13, 2026. The user selected full parity; the implementation architecture and backend trial remain to be executed. This does not replace the historical scope of [ADR-001](adr-001-windows-ffmpeg-port.md) or authorize release/spending.

## Context

The alpha proves a two-track Windows workflow with rendered previews. Full parity needs the original project semantics, interactive layered playback, effects/text fidelity, assistant/MCP access and a deliberate substitute for unavailable Apple/private services. The user has no suitable Mac, so verified comparison needs a separately approved reference host.

One-off UI and agent mutations would risk divergent timelines and undo behavior. Expanding the alpha's export graph without a complete model would also entrench incompatible linked-audio and track semantics. Team size, budget and release date are unknown.

## Options

| Option | Advantages | Costs/risks | Decision |
| --- | --- | --- | --- |
| Continue two-track alpha and add more controls/render commands | Small initial changes; existing workflow remains familiar | Inadequate project model and real-time behavior; separate code paths accumulate | Retain as regression baseline, not the parity architecture |
| Complete project/command core with Electron UI and isolated media/inference workers | Shared semantics for UI/agents; reuses current shell; native workloads leave the UI process | IPC/versioning, native builds and worker lifecycle need testing | Proposed architecture |
| Rewrite the complete UI and engine in a new native stack immediately | Potential native ergonomics/runtime benefits | Duplicates proven shell work before measurements show the need | Revisit only if measured requirements defeat the current shell |

## Proposed decision

Retain the useful Electron/React shell, theme, sandboxed renderer, narrow preload and file-safety tests. Evolve the alpha core into a complete versioned project model with transactional commands, validation, revisions and undo. Use this same command implementation behind direct UI edits, the in-app assistant and MCP. Native `.palmier` adapters preserve full package data; alpha migration writes a new copy.

Define a versioned composition specification consumed by preview and export. Use isolated workers for media decoding/audio clock/compositing/encoding, and separate workers for inference. This is a modular desktop process design, not a requirement to deploy a fleet of cloud microservices.

FFmpeg remains a media foundation. Compare MLT against direct libav/FFmpeg plus GPU compositing before selecting the implementation. MLT supplies an existing multimedia composition framework, but its ability to reproduce the required Palmier algorithms/precision is a trial outcome, not assumed. The custom route offers control at the cost of implementing more scheduling, buffering and rendering behavior. [MLT documentation](https://www.mltframework.org/docs/framework/)

The trial must cover layered transforms, representative difficult effects, alpha, text, mixed media timing, audio synchronization, seek/playback, memory and preview/export agreement. Select one production path; avoid maintaining two complete engines without a demonstrated requirement.

Keep cloud model catalogs, account/billing, uploads and generation as separate authenticated service adapters with persistent jobs and explicit spending permission. Do not treat the missing Palmier backend as bundled source. Windows speech/search replacements require quality and compatibility tests.

Crewframe integrates through a scoped, paired companion API and shared asset/job references. It does not load arbitrary native editor privileges through an iframe or a generally accessible localhost listener. One agency retains one CRM; adapters connect the shared Studio experience to the selected edition.

## Consequences and mitigations

- Shared commands reduce UI/agent drift but require a stable contract and replay tests before concurrent implementation.
- Isolated workers improve failure containment but are not automatically OS sandboxes; resource limits and decoder isolation remain security work.
- Reusing Electron saves shell work but retains its footprint. Measure startup/memory/interaction budgets on declared hardware and reconsider only on evidence.
- Functional service replacements enable Windows workflows but do not imply identical Apple speech or private Palmier outputs. Label substitutions and obtain explicit acceptance for material differences.
- Hosted Mac evidence avoids requiring user-owned hardware, but GPU capabilities, artifact privacy and costs need verification/approval. Uncompared features stay visibly unverified.
- Full scope is implemented in stages without lowering the final target. Crewframe's other modules proceed independently.

## Acceptance and revisit triggers

Accept this ADR for implementation after the P1 model/command contract and P2 engine trial establish a viable path. Record the selected engine, package/dependency versions and measured budgets in a follow-on ADR or this decision's dated update.

Revisit if native project fidelity cannot be preserved, preview/export materially diverge, target hardware misses approved budgets, dependency rights prevent the intended distribution, or the chosen engine requires disproportionate patches to emulate the pinned source.

The [implementation plan](../plans/WINDOWS_FULL_PARITY_IMPLEMENTATION_PLAN_2026-09-13.md) owns work packages, dependencies, evidence and release gates. No architecture statement in this ADR is a claim of implemented or verified parity.
