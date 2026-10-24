# Known Issues and Future Work

Last updated: October 21, 2026

## Audit Follow-up: October 21

The reliability release is merged in [PR #1](https://github.com/Tomaski47/scrrec-app/pull/1) and deployed at [the live app](https://screc.sadilekinnovation.com/). Hosted build, 16 lifecycle/format/camera-policy tests, dependency audit, and production container checks pass. Production reports version 0.2.0 with its approved source revision; health, public asset hashes, HTTPS redirects, security headers, and a real combined-source recording/playback smoke test pass. See [release verification](RELEASE_0.2.0.md) and the [v0.2.0 publication record](https://github.com/Tomaski47/scrrec-app/releases/tag/v0.2.0).

The dependency refresh updates Vite to 6.4.5 and source-map-js to 1.2.2, and removes unused Tailwind tooling. Production and full dependency audits report zero findings. Removing Tailwind preserved the generated CSS; separate mobile source-row styling and empty-notice fixes are intentional UI changes. Monthly Dependabot configuration is now on the default branch. CI runs on pushes and pull requests; it is not a periodic recording monitor.

Acceptance reproduced and fixed Firefox's video-only Opus finalization stall and an nginx directory redirect that downgraded the preview from HTTPS to HTTP. The latter disabled browser capture APIs despite valid OS permissions. iPhone/iPad camera selection is now exclusive, and Apple mobile exports prefer MP4/H.264/AAC video and M4A/AAC audio. Chrome and Firefox automated encoding/playback checks pass. Real Chrome tab + named microphone + camera capture also passes, along with a 30-minute concurrent three-source recording, full-stream decoding, downloads, and end-of-file browser playback.

The owner additionally reported an approximately three-hour audio-only recording on a physical iPhone, successfully saved and played from the phone. The labelled Release check 5 interface and `audio/mp4` metadata are confirmed. Front-camera + microphone MP4 recording, Photos saving, repeated video/audio sharing, success feedback, and Save → View browser playback subsequently passed on that labelled candidate. Direct Save → Download MP4 playback from Downloads in the browser also passes; earlier export failures did not identify the candidate version. Desktop Safari automation was unavailable, so that is not counted as a pass. See the [release acceptance checklist](RELEASE_0.2.0.md) for precise evidence and coverage limits.

Local transcription and later live meeting/stream assistance are a requested product direction. The [local transcription roadmap](LOCAL_TRANSCRIPTION_ROADMAP.md) adds a bounded feasibility experiment, a useful recorded-audio fallback, live transcription, and optional LLM assistance after the reliability release.

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

iPhone Safari/Chrome may expose front and rear camera choices, but mobile browsers often allow only one active camera stream at a time. The release candidate keeps every iPhone/iPad camera choice mutually exclusive, including real IDs. Fallback cameras also remain mutually exclusive. Safari can expose physical lenses and virtual combinations separately; browser-provided camera names are preserved so these remain distinguishable. Future work can revisit simultaneous front/rear capture if browser support improves or if this becomes a native-app feature.

### Native Share Recovery

The app permits only one native share attempt at a time, restores sharing after cancellation, and displays results beside each recording. Save remains usable while a share is pending. Some browser/OS share failures can leave the browser's own share promise unresolved; after 15 seconds the app explains how to Save and share from Files/Downloads instead. There is no web API to cancel/reset that native share operation. Save every wanted file before reloading; do not treat a pending share as a successful export. The labelled candidate prefers MP4/H.264/AAC video and M4A/AAC audio on Apple mobile devices. Phone audio recording, saving, and saved-file playback passed a reported three-hour test. MP4 video export to Photos, repeated video/audio sharing, and browser viewing on the labelled candidate now pass. Direct MP4 downloading and playback from Downloads in the browser also pass; earlier failures did not identify the candidate version. Do not mark the release ready on the basis of in-page playback alone.

### Reliability Baseline (0.2.0)

The reliability baseline retains completed files independently of selected sources and new capture attempts, locks startup while permissions are pending, finalizes all recorders when a source ends, and releases tracks and audio contexts on failure. Downloads follow the actual encoder container. Multiple microphones are mixed to one track per video and still saved individually. The original baseline kept files only in memory. The v0.4.0 candidate adds IndexedDB checkpoints and finalized media/transcript storage across refresh/reopen; see [local saving](LOCAL_AUTOSAVE.md). An abrupt close can still lose an unsaved tail or leave an unfinished container. A download confirmation means the browser started the download, not that an exported disk copy has been verified.

### Prioritized Roadmap

1. **Reliability release shipped:** dependency cleanup, hosted CI, public production checks, real combined-source playback, phone Photos/download/sharing checks, a 30-minute concurrent recording, and the reported three-hour phone audio test pass. Carry forward the documented browser-coverage limits. See [release verification](RELEASE_0.2.0.md).
2. **Shipped transcription and recovery:** v0.3.0 integrated Tiny/CPU speech recognition, session-associated TXT/JSON exports and model controls. v0.3.1 added processing-only background audio and recoverable interruptions, with an owner-confirmed Safari app-switch/screen-lock pass. Broader speech/noise comparisons, other phone browsers and extended endurance remain useful validation.
3. **Automatic local saving candidate:** v0.4.0 checkpoints incoming media chunks, stores finalized files and transcript snapshots, restores sessions and reports storage errors. Finish candidate review and deployment before calling this live. Per-session deletion, library size management and reducing retained in-memory media remain follow-ups.
4. **Saved-audio catch-up and editing:** process retained audio to fill missed recognition intervals with bounded decoding, explicit coverage, progress and cancellation. Add transcript editing when prioritized. Storage recovery alone does not reconstruct unrecognized speech.
5. **Audio separation and composition:** extract reusable device/audio routing from `App.tsx` without changing selected microphone capture, independent exports or recording stability.
6. **Meeting audio and optional assistance:** support explicitly selected tab/system audio where the browser provides it, with clear mic-only fallback; then consume finalized transcript events for rolling notes, action items, suggested questions, or livestream prompts. Keep LLM routing a separate opt-in choice with a visible data destination. This does not require adding an LLM to the transcription milestone.
7. **Remaining maintenance and polish:** extract device enumeration/metering/camera capability logic, consolidate duplicate CSS using visual comparisons, and add opt-in redacted capability diagnostics, and automatically pass the source revision through future VPS deployments. Composed screen-plus-camera output, speaker diarization, Continuity targeting, and simultaneous mobile cameras stay later work.

Continuity microphones and simultaneous mobile cameras remain exploratory work rather than release guarantees.

## Local transcription and retained sessions (October 24, 2026)

v0.3.1 is deployed at the public app, revision `1fbc67763b9b0e72824d560bb87b701d7d2335b7`. All 18 published files matched the successful main build, all 18 retired test URLs returned 404, the live model and inline license loaded, and production stayed healthy. The owner confirmed continuous microphone audio and transcript coverage while another app was open and the iPhone was locked in Safari. Exact inference timing while locked and other mobile browsers were not measured.

The v0.4.0 local-saving candidate is implemented separately from that deployed release. It adds persistent browser session storage and refresh/reopen recovery, not automatic continuation of recording or encoded-audio transcription after a crash. Broader human speech comparisons, offline startup, transcript editing, bounded long-file decoding and resource limits remain follow-ups. The lab's 20 MB / 60-second file limit is separate from live capture.
