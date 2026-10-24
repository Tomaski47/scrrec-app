# Local transcription interruption recovery

October 24, 2026. Recovery candidate v0.3.1, based on v0.3.0. No new physical-iPhone result is claimed.

## Report and cause

An iPhone microphone session kept showing Recording after screen lock, but transcription stopped on return. The microphone indicator remained visible; the saved locked-screen audio was not checked. This report is consistent with a concrete failure in the original tap lifecycle: every non-running AudioContext state was fatal, permanently closing the transcription tap. Model/inference deadlines could also expire across a suspended page.

[Safari interrupts AudioContext when leaving a page or turning off the screen](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state#resuming_interrupted_play_states_in_ios_safari). Recovery requires handling that state; visibility alone does not prove whether processing actually stopped.

## Behavior

- Keep transcription running when the page becomes hidden. Use a private MediaStreamAudioDestinationNode rather than a zero-gain connection to the speakers. WebKit's [AudioContext background restriction override](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/webaudio/AudioContext.cpp) explicitly checks that the default destination is unconnected. This removes an avoidable obstacle to background processing; it is not proof of continuous execution on a particular iPhone.
- Retain the existing tap through suspended/interrupted audio states. Try resuming immediately, including while hidden, and on return, focus and pageshow. Show Resume transcription outside collapsed settings if Safari needs a user gesture. Claim recovery only when PCM returns. Detect stalled PCM on return even if the browser still reports a running context. Release the private sink's tracks on cleanup without stopping microphone tracks or changing the device's audio-session type/routing.
- Flush the preceding phrase, clear cross-gap overlap and advance the sample timeline past the interruption. Preserve existing text and mark possible missing intervals in the transcript, copies, TXT and JSON exports. Never join later words as if the gap did not happen.
- Keep model/inference deadlines paused while hidden and give work a fresh foreground deadline on return. Foreground hangs still time out. Stop/abort cancels listeners and prevents pending resumes from restarting a finished tap. Stale callbacks cannot affect a later session.
- Show speech-worker errors outside collapsed settings. A recognition failure or interruption leaves MediaRecorder, stream acquisition, microphone gain/routing and track ownership unchanged. Resuming never calls getUserMedia again.

## Verification

- Lint, application/test types, production build and 50 unit tests pass. Interruption cases cover native-state simulations, gesture denial, stopping during interruption, stale callbacks, timestamp gaps, input muting, suspended deadlines, a pending resume racing Stop, background recovery and ownership of the private sink.
- A real Tiny/WASM run recorded generated microphone audio for **149.04 seconds**. Transcription resumed after a native AudioContext suspension with controlled document visibility. Eighteen recognition windows retained speech before and after a marked gap from **82.816 to 88.408 seconds**. This is a recovery check, not a general accuracy benchmark or proof of genuine iOS background execution.
- The exported audio played and fully decoded in the browser at 48 kHz. Signal checks before, during and after the transcription pause and near the end retained generated speech. Exactly one microphone acquisition was used; all source tracks ended on Stop.
- A controlled worker failure was visible with settings collapsed; media kept recording and both generated session files played afterward.
- A denied automatic resume remained recoverable via the visible Resume button. At 390 px dark and 320 px light, collapsed settings stayed collapsed; status/title did not overlap, controls remained within the viewport and there was no horizontal overflow. TXT and JSON downloads identify possible missing speech. Native-source and resumed transcript output were retained through Stop.

Local generated media, transcript exports, measurements and screenshots are kept under `output/playwright/recovery/`, outside Git. No personal audio was used.

### Background regression after the processing-only change

Chrome 155 on macOS recorded browser-generated microphone speech and camera video for 116.76 seconds, with the recorder genuinely hidden for 116.124 seconds. Thirteen nonempty recognition results arrived while hidden. The PCM callback's maximum delay was 44 ms; both encoders emitted 114 nonempty chunks while hidden. The finalized transcript had 15 windows, no interruption and text through 116.736 seconds. The saved audio fully decoded with speech signal throughout; video played at 640 × 360. Stop released both capture inputs and the private transcription sink.

This check used an isolated browser profile, the browser's fake camera/microphone, a known WAV fixture and normal background scheduling. The test browser required `--no-sandbox` to read that WAV; otherwise it silently supplied zero-valued audio. No physical devices were opened. The CLI attached through `browser.cdpEndpoint` (`noDefaults`) because a normal Playwright launch forces focus emulation and reports even background tabs as visible. No visibility getter was replaced and no background-throttling exemptions were enabled. The localhost-only `browser-transcription-background-{init,start,result}.js` helpers and results in `output/playwright/background/` document the check. Failed setup attempts with fake visibility or silent input are not counted as passes.

Desktop behavior is a regression check, not a substitute for mobile validation. Automated WebKit again failed to reach a usable page in this workspace; no Safari/iPhone or Brave background pass is claimed for this candidate. Further desktop checks were stopped after the owner's clarification that mobile microphone/transcription is the priority.

The initial hosted source check passed tests/builds but failed its dependency audit on Zod. The lint plugin's transitive Zod dependency is updated from 4.6.5 to 4.6.7, fixing [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). It is a development lint dependency; the recorder's pinned speech engine/model are unchanged. The local dependency audit then reports zero vulnerabilities.

## Reproduce

Use Node 24 and the Playwright CLI skill with a compiled build served on localhost. Prepare the generated `output/transcription-benchmark/reference.wav` fixture described in [Preview 3](LOCAL_TRANSCRIPTION_03.md). Install `scripts/browser-recorder-transcription.js`, then run these localhost-only helpers with the CLI's run-code command:

1. `browser-transcription-recovery-init.js` instruments the native audio context and controlled visibility. Its JSON-export promise avoids relying on the timing of a test hook.
2. `browser-transcription-recovery-start.js` prepares the real model and starts generated microphone recording.
3. `browser-transcription-recovery-pause.js` waits for recognition, suspends the tap for about 5.5 seconds and checks automatic resume with settings collapsed.
4. `browser-transcription-recovery-result.js` stops, saves the transcript/audio and checks resumed words, the gap and cleanup. `browser-transcription-recovery-audio.js` decodes this generated file and checks signal before, during and after the exported interruption interval.
5. `browser-transcription-recovery-layout.js` checks a gesture-required resume, dark/light phone layouts and warning-bearing exports in a fresh generated session. `browser-transcription-recovery-error.js` checks visible worker-failure feedback and preserved playable recordings.

The fixtures must never be installed on public URLs or a session containing personal recordings. Controlled visibility is a deterministic test input, not a background-endurance result.

## Limits and next work

The target is continuous microphone capture and local transcription during app switching and screen lock wherever the browser permits it. This patch removes the speaker connection that can defeat WebKit's processing-only exemption and restores transcription after a transient interruption without requiring visibility. It does **not** force iOS to schedule JavaScript/Whisper while locked, recover audio the OS did not record, or transcribe the missed interval from encoded recordings. Native microphone recording and JavaScript inference are separate pipelines, so the saved microphone file may contain audio that live recognition missed. A microphone indicator alone does not establish either pipeline's coverage.

Phone camera background capture is separate: [Apple documents background camera interruption](https://developer.apple.com/documentation/avfoundation/avcapturesession/interruptionreason/videodevicenotavailableinbackground?changes=_2). Desktop camera results cannot establish phone camera support. Safari, Chrome and Brave on iPhone need actual device checks; sharing an underlying engine does not make their app lifecycle behavior identical.

Complete transcripts for screen-off sessions need a separate catch-up path from retained audio, with bounded decoding, progress/cancellation and explicit source coverage. This remains a priority on the [roadmap](../LOCAL_TRANSCRIPTION_ROADMAP.md). A physical phone check is deferred at the owner's preference; further automatic checks cannot establish actual locked-screen behavior on that device.
