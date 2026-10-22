# Local transcription 04: longer sessions and main-recorder integration

October 22, 2026. Feature on the transcription branch; production deployment remains v0.2.0. Builds include the engine assets, but they are requested only after enabling the option. This extends [Preview 3](LOCAL_TRANSCRIPTION_03.md) without changing its pinned speech engine/model.

## Use

Select Mic in the main recorder, enable **Local transcription**, wait for **Ready to transcribe**, then record normally. Enabling the option starts model preparation automatically; canceling preparation turns the option off. Tiny English / CPU is the main-recorder baseline. The first preparation downloads approximately 60 MB of runtime/model assets; model caches are reused when available. Audio and transcript text are processed locally. Loading/using the speech model does not send audio for recognition.

Each capture session has one transcript associated with all its media outputs. Its source label names the selected microphones. Copy or export TXT/JSON before closing the tab. JSON includes timestamped paragraphs, draft/incomplete status, source, model pin, build revision and aggregate measurements. Native recording Save/Share behavior is unchanged. Clear All explicitly removes recordings and transcripts and unloads the model. Unloading transcription alone retains text and keeps recording. New captures collapse earlier recordings and transcripts under **Previous sessions**; nothing is automatically deleted. One native-share lock covers both current and previous results.

## Longer-session behavior

- Removed the lab's automatic two-minute stop. The main recorder never had that stop.
- Shared 12-second PCM windows, 4-second overlap, resampling, timing/retry logic and reconciliation between the main recorder and research lab.
- One active recognition job plus two waiting jobs. A slow engine stops only the PCM tap, drains accepted work and labels the transcript incomplete; it never stops capture tracks.
- Only the recent text that a following overlap can revise stays in alignment memory. Earlier words become timestamped paragraphs, capped by duration/text length. Continuous speech cannot grow one ever-larger alignment problem.
- The transcript view initially renders the latest 20 paragraphs. Earlier text remains exportable and can be revealed. The latest text follows automatically unless the user scrolls back.
- Globally unique job IDs and per-capture IDs route delayed results to the correct transcript even when another recording has begun.
- No extra microphone acquisition. An optional AudioWorklet taps the already-owned, post-gain microphone streams, averaging selected inputs into one ASR bus. Video output audio is not transcribed a second time.
- AudioContext resume is initiated in the Start gesture. The tap activates only after all media recorders start. Setup and shutdown waits are bounded; cancellation, source failure and engine failure release only resources they own.
- Model preparation starts when the option is enabled. If it is still loading, failed, missing a microphone, or draining an overloaded queue, Start asks before any source acquisition. The user can wait/retry or explicitly record without transcription, which turns the option off. Finishing preparation does not automatically open a source picker; starting capture requires a fresh button press. No silent switch to a remote speech provider.

There is no fixed live duration cutoff, but this is **not unlimited storage**: transcript text and encoded recordings remain in tab memory. The existing large-recording warning still applies. Save regularly and keep the tab open/foregrounded. Long imported files remain a separate problem: the lab's whole-file decode path still caps input at 20 MB / 60 seconds. Incremental decoding/persistent recovery is future work.

## Checks

- Regression tests simulate three hours of continuous timed words, preserving every word while keeping the working tail at one window. Separate cases cover intentional repeats, numeric token joins, paragraph breaks, uncertain/empty overlaps, session routing, cancelled acquisition, overload, stale responses, worker-send failure, tap failure, and loading/inference timeouts.
- Default-off capture retains playable recordings without speech requests. Model preparation/failure and explicit fallback checks are described in the Preview 5 follow-up below.
- Phone-width layout checked at 390 × 844 with no horizontal overflow. This is desktop Chrome layout emulation, not a physical iPhone test.
- A 30:05 real-engine run completed with generated screen + camera + microphone, Tiny / CPU, 640 × 360 video at approximately 15 fps and the Low audio preset. One microphone acquisition fed recording and ASR; all source tracks ended on Stop. All three files play in the browser and fully decode: screen 1,805.014 s / 27,076 frames; camera 1,804.906 s / 27,074 frames; microphone 1,804.906 s. Decoding with the source time base produced no errors, duplicated or dropped output frames.
- The looped reference retained **5,822 / 5,822 normalized words** in 142 complete repetitions, zero word edits or review flags. The deliberately cut final phrase (“Today we are testing low.”) is reported separately and excluded from that score. This is generated-reference behavior, not a human-speech accuracy estimate.
- 225 recognition windows completed, three retried once, maximum queue depth one. Inference totaled 579.3 s for 1,805 s capture. Thirty-three text blocks were retained; maximum revisable working text was 212 words. Initial rendering remains limited to the most recent 20 blocks.
- Main-thread heap ranged 4.5–48.9 MiB (12.0 MiB at final export); it excludes worker/WASM/media memory. Summed test-browser process RSS ranged 1.41–2.34 GiB, ending near 2.02 GiB versus 1.71 GiB at the first sample. RSS includes shared pages counted per process, capture buffers and export overhead; other build/public checks ran on the same host. This is **not** a flat-memory or phone-endurance claim. PCM/queue/alignment bounds are verified separately; finished media/text intentionally accumulate.
- The final source build's short real-model regression and a second capture with ASR cancellation retained six playable media files and two correctly associated transcript sessions. Stopping ASR marked only the second transcript incomplete; recording continued. The final self-hosted worklet path was used.
- Lint, type checks, 37 unit tests, normal/experiment builds and dependency audit pass. Fresh hosted source and production-container checks pass for feature source `05490ea`. All 18 public preview assets match their build hashes, including JS/CSS/WASM response types; HTTPS redirects, model readiness and worklet registration pass. Production root version and HTML hash remain unchanged.

[Recorder transcription preview 4](https://screc.sadilekinnovation.com/recorder-preview/local-4-05490ea/) runs feature source `05490ea`. Normal recorder controls include the optional transcription panel; there is no separate lab workflow to learn. This temporary preview may need republishing after a production container replacement.

The rebuilt deployment bundle is included in draft PR #10. GitHub's finding for the dependency's public `Mistral3ForConditionalGeneration` model-class registration was reviewed and explicitly approved as a false positive; it is not a credential. Repository push protection remains enabled.

## Reproduce browser checks

Use Node 24 and Playwright CLI. Serve a compiled main build on localhost and provide the generated `output/transcription-benchmark/reference.wav` fixture documented in Preview 3. Run `scripts/browser-recorder-transcription.js` to install **localhost-only** generated sources and inspect default-off behavior. `scripts/browser-recorder-transcription-off.js` checks ordinary capture with the option off and explicit fallback after preparation failure. Enable the option and wait for readiness before `scripts/browser-recorder-transcription-start.js`; its fixture, rather than the app, stops the 30-minute run. `scripts/browser-recorder-transcription-result.js` exports the measurements, session JSON and three generated media outputs. `scripts/score-recorder-long.mjs` scores complete reference repetitions separately from the cut final phrase. `scripts/browser-recorder-transcription-cancel.js` checks the final real-model path, capture independence and session links. Browser process RSS is a separate measurement; main-thread heap excludes worker/WASM and media memory.

No new physical iPhone result is claimed. The prior user-confirmed 40-second phone test used Preview 2. Longer-phone endurance, interruptions/thermal limits, broader speech/noise/model comparisons, fully offline startup, long-file decoding and durable recovery remain follow-up gates. Manual phone testing is deferred at the user's request.

## Recorder UX follow-up

[Recorder transcription preview 6](https://screc.sadilekinnovation.com/recorder-preview/local-6-8c2f4c4/) runs source `8c2f4c4`. Production remains v0.2.0.

Enabling transcription now prepares Tiny automatically. Starting while preparation is pending or failed, while no microphone is selected, or while an overloaded queue is draining opens an explicit choice before any capture prompt. Waiting for readiness does not start capture automatically. Choosing **Record without transcription** turns the option off. Preparation cancellation also turns it off; retry is available after errors. Completed text is retained.

Transcription uses the same source-row dimensions, spacing and theme styles as Screen/Mic/Camera. The copy is shorter and the confusing note about tab/system audio has been removed. Download size, model source, license notices and model removal are grouped inside a collapsed About transcription section; no Optional/Beta label is shown. Removing cached model files first unloads transcription and turns its checkbox off, preserving unrelated caches and all media/text. Media acquisition and audio routing are unchanged. New captures collapse earlier media and text under **Previous sessions**. A single share lock covers both sections, and previous recordings remain downloadable. Clear All remains explicit.

Validation: 37 unit tests, lint, types and the production build pass. A controlled-model browser fixture covers loading, missing microphone, readiness without automatic capture, cancellation, retry, explicit fallback, retained-session downloads, global sharing coordination and resource cleanup. A separate actual worker-download failure verifies the default-off path and explicit fallback. The real Tiny/WASM regression retains six playable media files, a finished transcript and a second correctly marked incomplete transcript after cancellation; every track ends. Phone-width (390 px) dark/light measurements show matching 50 px label heights, padding, borders and colors with no horizontal overflow. This remains desktop layout emulation, not a new physical-phone result.

Use `scripts/browser-recorder-transcription-ux.js` after installing the localhost source fixture for the controlled lifecycle check; it simulates recognition responses and makes no accuracy claim. The separate real-model cancellation check tests recognition with the actual pinned engine.
