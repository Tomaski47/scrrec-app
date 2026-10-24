# Transcription interruption recovery checkpoint

October 24, 2026. Work in progress on `codex/transcription-interruption-recovery`, based on the v0.3.0 main release. Not deployed. The owner may restart their computer; resume from this checkpoint rather than restarting the investigation.

## Report and cause

The owner recorded microphone audio on iPhone, locked the screen, then saw transcription stop after unlocking. The recording UI continued and the microphone indicator remained visible, but the saved locked-screen audio was not checked. No further physical-phone test is required at this checkpoint.

`MicrophoneTap` treated every non-running AudioContext state as a fatal tap failure. The controller aborted that tap permanently. Its load/inference watchdogs could also expire across a suspended page. [MDN documents iOS interruptions on screen lock and resuming AudioContext](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state#resuming_interrupted_play_states_in_ios_safari).

## Prepared changes

- Retain the original tap through suspended/interrupted audio states. Try resume on visibility, focus and pageshow; offer a visible Resume transcription button if a gesture is required. Claim recovery only when PCM returns.
- Flush the preceding phrase, start a fresh utterance after recovery, shift the sample timeline past the interruption, and include possible gaps in session metadata, on-screen output and JSON exports. Existing text survives. Missed speech is **not** reconstructed from the recording.
- Keep interruption/error feedback visible with transcription settings collapsed. Preserve the compact source row.
- Suspend model/inference failure deadlines while hidden and give work a fresh foreground deadline on return. Foreground hangs still time out.
- Leave media acquisition, track ownership, microphone gain/routing and MediaRecorder unchanged. No new getUserMedia calls for resuming transcription.

## Verification so far

`npm run check` passes: lint, 47 tests, application/test types and production build. Nine new tests exercise interrupted/resumed contexts, gesture denial, stopping while locked, stalled PCM on return, input muting, timestamp gaps, worker deadlines, retained text and stale callbacks. These are deterministic simulations, not physical-iPhone background validation.

A dedicated localhost browser (`scrrec-recovery`) loaded the actual Tiny/WASM model and started generated-microphone recording. The native-context pause/resume run was **not completed** before the restart checkpoint. Do not claim real-engine recovery has passed yet. The test browser was closed to stop generated capture. The production site remains v0.3.0.

## Resume

1. Finish reviewing recovery and deadline races. In particular, check finish/abort during interruption, queued results and large event-loop delays. Confirm gap labels remain explicit and no media path is changed.
2. Serve the compiled candidate on localhost, e.g. port 5191. Use the Playwright CLI skill. The wrapper attempted a registry download and hit ENOSPC; an installed CLI was available at `/Users/tomassadilek/.npm/_npx/31e32ef8478fbf80/node_modules/@playwright/cli/playwright-cli.js`. Use Node 24. Recheck paths after restart.
3. Install `scripts/browser-recorder-transcription.js` **only on localhost** for generated audio. In `/private/tmp/`, `scrrec-recovery-browser-{init,start,pause,result}.js` prepare native AudioContext suspend/resume plus controlled document visibility and a real worker. Temporary files may not survive restart; recreate if missing. Their visibility override is a deterministic fixture, not proof of genuine background execution.
4. Verify recognition before/after interruption, a marked gap, one microphone acquisition, playable retained audio and cleanup. Also check visible recovery UI at 390/320 px with settings collapsed. Save evidence under `output/playwright/recovery/`.
5. Refresh the tracked bundle with source revision metadata, run experiment build/audit and hosted checks, and open a focused PR. No PR, merge or deployment for this fix has happened yet.

The local machine briefly ran out of disk space. Duplicate generated WASM files in `dist/assets/` were SHA-verified and replaced with APFS clones from the matching `node_modules/onnxruntime-web/dist/` files. This preserves identical bytes while saving space. Keep existing untracked `output/` and `portfolio-cockpit/`. Do not clean user files.
