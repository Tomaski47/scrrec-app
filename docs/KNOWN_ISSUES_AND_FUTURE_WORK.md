# Known Issues and Future Work

Last updated: October 21, 2026

## Audit Follow-up: October 21

The September reliability work is implemented in `07d45d9` on `codex/reliability-maintenance`. Its [hosted CI run](https://github.com/Tomaski47/scrrec-app/actions/runs/35703455792) passed on September 22, including the build, lifecycle tests, dependency check, and production container smoke test. That is historical evidence, not a fresh dependency clearance.

Remote `main` still points to `65fb9e4`. The live site still serves the previous `index-DalnzIdF.js` bundle, and `/version.json` returns the HTML fallback rather than release metadata. The maintenance candidate has not reached this production deployment. The physical-device/browser matrix and 30-minute recording remain unchecked in the [release acceptance checklist](RELEASE_0.2.0.md).

A fresh October 21 lockfile audit reports nine affected development/build packages (seven high, two moderate); the production-only audit reports zero. These are affected package counts, including transitive dependents, rather than nine separate exploitable production flaws. Refresh and triage the Vite/Tailwind tooling before release; some suggested fixes cross a major version, so review changes rather than applying a forced blanket update. CI's audit step must pass again after that work. Monthly Dependabot configuration is on the candidate branch and needs to reach the default branch to provide ongoing update PRs.

Local transcription and later live meeting/stream assistance are now a requested product direction. The [local transcription roadmap](LOCAL_TRANSCRIPTION_ROADMAP.md) adds a bounded feasibility experiment, a useful recorded-audio fallback, live transcription, and optional LLM assistance after the reliability release.

Release execution later on October 21 clears the dependency findings with Vite 6.4.5, source-map-js 1.2.2, and removal of unused Tailwind tooling, preserving identical generated CSS. Acceptance also reproduced and fixed Firefox's video-only Opus finalization stall and an nginx directory redirect that downgraded the preview from HTTPS to HTTP. The latter disabled browser capture APIs despite valid OS permissions. See [release verification](RELEASE_0.2.0.md) for current results and remaining gates; the earlier snapshot above remains historical.

## Locked Baseline

- Screen capture supports one or more screen slots, with each slot using the browser display picker and saving as a separate recording when the browser exposes `getDisplayMedia`.
- Desktop microphone capture supports the OS default input, named physical inputs, gain, input metering, echo cancellation, noise suppression, and auto gain controls.
- Camera capture supports browser-exposed camera devices, with one active camera at a time on iPhone/iPad regardless of stable device IDs; fallback camera choices are also exclusive.

## Implementation Notes

### Media Device Normalization

The June 2026 functional pass found that copying `MediaDeviceInfo` objects with object spread can drop important browser-provided fields such as `deviceId`, `kind`, and `groupId`. Those fields are not guaranteed to behave like normal enumerable object properties in every browser. The app now uses explicit field copying when normalizing media devices so labels can be improved without losing the stable IDs needed for exact mic and camera selection.

### Microphone Selection

The stable microphone flow separates three concepts that should not be collapsed together:

- OS/system default input.
- Named physical or virtual inputs with real browser `deviceId` values.
- Browser-default fallback input for cases where the browser can open audio but does not expose a stable per-device ID.

This is why the app keeps `Refresh mics` as a quiet enumeration action and `Scan inputs` as an optional stronger probe that briefly opens mic access. Exact device IDs remain the preferred path. Browser-default fallback stays available, but it should not be used to pretend that multiple unresolved devices are individually selectable.

### Screen and Camera Decisions

Browsers do not enumerate screens the same way they enumerate cameras and microphones. The app uses screen slots instead: each selected slot opens the browser display picker, and each chosen display records as a separate file. Screen capture is capability-based rather than viewport-based: mobile-sized layouts still show the screen controls if the browser exposes `getDisplayMedia`, but many actual mobile browsers do not expose that API. Front/rear camera choices are single-choice on iPhone and iPad, including the iPad desktop browser identity and real camera device IDs. Opening a second camera during phone acceptance muted the first. Fallback camera choices are also exclusive.

## Future Work

### Apple Continuity and iPhone Microphones

During the June 2026 functional pass, Chrome/macOS temporarily exposed iPhone Continuity microphones as audio input rows, and those devices could visibly ping when the browser opened audio access. We were not able to keep those devices reliably exposed as stable, selectable `deviceId` values while also preserving the working desktop mic flow.

Current behavior keeps the stable path first:

- Exact browser-exposed mic IDs are selectable.
- The OS/browser default mic is selectable.
- `Scan inputs` can briefly reopen microphone access to see whether Continuity, USB, or phone inputs become available.
- Devices that appear without a selectable browser ID should not be treated as exact inputs.

The likely future direction is to investigate whether macOS Continuity devices can be made consistently available through browser settings, OS input selection, Chrome flags, or a native wrapper. If they only appear through the OS default input, the browser app can use them through `Browser default microphone` but cannot reliably target them as independent mic sources.

### Multi-Camera Mobile Capture

iPhone Safari/Chrome may expose front and rear camera choices, but mobile browsers often allow only one active camera stream at a time. The release candidate keeps every iPhone/iPad camera choice mutually exclusive, including real IDs. Fallback cameras also remain mutually exclusive. Future work can revisit simultaneous front/rear capture if browser support improves or if this becomes a native-app feature.

### Native Share Recovery

The app permits only one native share attempt at a time, restores sharing after cancellation, and displays results beside each recording. Save remains usable while a share is pending. Some browser/OS share failures can leave the browser's own share promise unresolved; after 15 seconds the app explains how to Save and share from Files/Downloads instead. There is no web API to cancel/reset that native share operation. Save every wanted file before reloading; do not treat a pending share as a successful export. Front-camera plus microphone capture passed the phone retest. Sharing and video saved/opened outside the page still failed, while audio playback worked. The next candidate prefers MP4/H.264/AAC video and M4A/AAC audio on Apple mobile devices; physical export rechecking is pending. Do not mark the release ready on the basis of in-page playback alone.

### Reliability Baseline (0.2.0)

The release candidate retains completed files independently of selected sources and new capture attempts, locks startup while permissions are pending, finalizes all recorders when a source ends, and releases tracks and audio contexts on failure. Downloads follow the actual encoder container. Multiple microphones are mixed to one track per video and still saved individually. Files remain in memory; a reload, closed tab, crash, or explicit Clear All loses them. A download confirmation means the browser started the download, not that disk persistence has been verified.

### Prioritized Roadmap

1. **Ship the reliability release:** refresh newly affected build dependencies, rerun CI, complete physical screen/camera/mic capture across Chrome, Firefox, Safari and iPhone Safari, and finish a 30-minute recording with playback/audio-sync checks. Then merge, deploy, verify release metadata, and tag. See [release checklist](RELEASE_0.2.0.md).
2. **Local transcription feasibility:** benchmark quantized Whisper Tiny/Base through Transformers.js against a streaming-oriented alternative; compare post-recording and live capture while video recording continues. Reuse the existing speech app's worker/audio-capture patterns and measure latency, accuracy, resource use, language support, and download size. See [phases and acceptance criteria](LOCAL_TRANSCRIPTION_ROADMAP.md).
3. **Recording resilience and audio separation:** measure memory growth, introduce explicit limits and useful warnings, evaluate incremental local recovery, and extract a reusable selected-audio bus from `App.tsx`. Both long recordings and live inference depend on this work. Preserve existing source selection and independent exports.
4. **Local transcript delivery:** add an opt-in transcript associated with a recording, editing/copy/TXT export, timestamped segments, model download/cache controls, and cancellation/retry. The same engine/event contract should support an experimental live panel once benchmarks pass; recorded-audio transcription remains the fallback.
5. **Live transcription:** add bounded PCM buffering, speech detection, stable versus provisional text, timestamp alignment, and graceful catch-up. Transcription failures must preserve recording. Verify sustained concurrent video/audio capture and transcription before advertising real-time support.
6. **Meeting audio and optional assistance:** support explicitly selected tab/system audio where the browser provides it, with clear mic-only fallback; then consume finalized transcript events for rolling notes, action items, suggested questions, or livestream prompts. Keep LLM routing a separate opt-in choice with a visible data destination. This does not require adding an LLM to the transcription milestone.
7. **Remaining maintenance and polish:** extract device enumeration/metering/camera capability logic, consolidate duplicate CSS using visual comparisons, and add opt-in redacted capability diagnostics. Composed screen-plus-camera output, speaker diarization, Continuity targeting, and simultaneous mobile cameras stay later work.

Continuity microphones and simultaneous mobile cameras remain exploratory work rather than release guarantees.
