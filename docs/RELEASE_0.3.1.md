# 0.3.1 — background transcription and interruption recovery

October 24, 2026. [PR #12](https://github.com/Tomaski47/scrrec-app/pull/12) improves microphone transcription during app switching and screen lock, and makes browser audio interruptions recoverable.

## Changes

- Transcription uses a private audio sink with no speaker connection, preserving WebKit's eligibility for processing-only background audio. A hidden page does not disable capture or prevent recovery attempts.
- Keep the tap and existing text after an audio interruption. Resume automatically when possible, or use the visible Resume transcription control if a user gesture is needed. Recognition resumes only when microphone samples actually return.
- Mark possible missing speech with timestamps in the transcript, clipboard, TXT and JSON. Flush the preceding phrase and avoid joining words across a missing interval. Speech processing tolerates suspended browser deadlines; Stop and stale callbacks cannot restart a finished session.
- Transcription errors remain visible while settings are collapsed. Microphone acquisition, recorder streams, gain and device audio-session routing are unchanged. The optional transcription tap releases only its own audio sink.
- Patch the development lint dependency Zod to 4.6.7 for GHSA-mrhx-c7xc-m3w5. The speech engine and model remain pinned to their existing versions.
- Retire recovery previews A and B with explicit 404 responses. Existing recorder previews, transcription experiments, release checks and Whisper test routes remain retired. The production image excludes copied preview files.

## Validation and limits

All 50 unit tests, lint, application/test types, production/experiment builds, dependency audit and hosted container checks pass for the recovery candidate. The final container check also covers the retired recovery preview URLs.

The owner confirmed a physical-iPhone Safari test of Preview B: the transcript includes speech while another app was open and while the phone was locked, and playback was clean continuous audio. This validates those intervals in that session; exact inference latency, extended phone endurance and iPhone Chrome/Brave were not measured. Personal transcript/audio is not published in this repository.

Automated checks include real-model native audio interruption recovery, a 116.76-second generated recording with 116.124 seconds of genuine hidden-tab time, preserved playable audio/video, timestamped gap exports, gesture-required recovery and narrow-screen controls. See [evidence and reproduction](experiments/TRANSCRIPTION_INTERRUPTION_RECOVERY.md).

The app cannot force the operating system to keep speech processing scheduled. Missing speech is identified but is not reconstructed from encoded recordings. Phone camera background restrictions are separate from microphone transcription.

## Deployment

Deploy the merged main revision through Dokploy with BUILD_REVISION set to that exact commit, then restore the previous build arguments. Preserve the previous production image for rollback. Verify health/version metadata, public assets and model readiness, and confirm all retired preview/test routes return 404.
