# Third-party notices — Windows alpha

Original Palmier Pro: Copyright (C) 2026 Palmier, Inc. Source fork: <https://github.com/amankton/palmier-pro>, upstream <https://github.com/palmier-io/palmier-pro>. Inspected base commit: `9a3ae50283d8561d3f6834584b79586cf043b8d2`.

This Windows port is maintained in the fork, not an official upstream Windows release. The root GNU GPL version 3 license and original attribution are retained. The root `LICENSE` is copied into Windows build output as `PALMIER-LICENSE.txt`. Distribution of a modified GPL-covered application requires the applicable notices and corresponding-source obligations to be met; a compiled executable alone is not a complete public release package. Do not represent this fork as exclusively owned original Palmier code or promise proprietary white labeling without review.

The Windows application uses Electron (MIT), React/React DOM (MIT) and associated runtime dependencies. Electron distribution includes its LICENSE and Chromium third-party license notices; preserve them. Vite, Playwright and electron-builder are build/test tooling. Exact versions and transitive dependencies are pinned in `package-lock.json`. Review installed dependency notices when assembling a release.

FFmpeg and FFprobe are external executables, not bundled in this alpha. FFmpeg licensing varies with build options and linked codecs. The developer machine's existing build reports GPL/version3 enabled and libx264. Before bundling any binary, inventory its exact configuration, license and corresponding-source requirements. See <https://ffmpeg.org/legal.html>. Codec patents and distribution obligations need a release-specific review.

The proprietary Palmier generative-AI processing backend is not supplied by the public editor source and is not included or impersonated. No upstream subscriptions, accounts or API credentials are bundled. Mac-only dependencies are unchanged and not used by this Windows application.
