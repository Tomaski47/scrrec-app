# Local transcription preview 2

October 21, 2026. English-first experiment; separate from the production v0.2.0 recorder.

## Boundary repair

The original live test lost words when eight-second windows were appended independently. Preview 2 retains three seconds of real PCM between windows and 200 ms before speech onset. Windows remain bounded at approximately eight seconds; Stop and speech pauses flush a final tail.

Results from the same utterance revise one transcript entry. The ending is visibly marked as draft until the final window completes. The reconciler aligns monotonic matching words in the early overlap using both text and actual model word timings, retains the stable prefix, then replaces the previous ending with the next window's better-context text. Time proximity prevents later intentional repetitions from being treated as duplicate overlap. Tests cover repeated phrases/words, missing endings, and corrections to trailing words.

A join without a trustworthy anchor falls back to a temporal boundary and is visibly flagged “check join.” Empty overlapping results retain the prior text and flag review instead of silently deleting it. Word timings are approximate model alignments, not a claim of exact word boundaries. Recognition errors remain possible; compare against saved audio.

The TTS/STT app's draft/final callbacks, bounded PCM, pre-roll and session cancellation were used as references. Its behavior of stopping capture when its ASR queue fills was not adopted: Screen Recorder continues recording if transcription fails, is cancelled, or becomes too slow.

## Runtime and model compatibility

The first `onnx-community` export lacks the cross-attention outputs required for word timings with this runtime. Preview 2 uses the companion app's compatible model family, with exact revisions:

| Model | Revision |
|---|---|
| [`Xenova/whisper-tiny.en`](https://huggingface.co/Xenova/whisper-tiny.en) | `79fb389fc764e7c395bd330e9531d9d32ada7049` |
| [`Xenova/whisper-base.en`](https://huggingface.co/Xenova/whisper-base.en) | `95bf40a508535962c6483ead40270b2e32267508` |

Both model cards label the weights Apache-2.0. Tiny's model card explicitly documents word-level timestamps. The pinned Transformers.js 3.8.1 browser bundle and q8/single-threaded WASM baseline remain unchanged. The newer runtime/self-hosting production gate in [the first experiment](LOCAL_TRANSCRIPTION_01.md) still applies. Base and WebGPU remain comparison options, not verified iPhone configurations.

## Verification

The original 12.701-second generated English reference was replayed through a real AudioWorklet, MediaRecorder, and Tiny/WASM inference in Chrome 155 on Mac arm64:

- Three overlapping windows took 2.163 s, 1.788 s, and 1.506 s of inference. Maximum observed queue depth: two, within the one-active/two-waiting bound.
- First draft ended “and send.” The next window recovered “send the notes to Thomas”; the final reconciled transcript matched every reference word with no duplicated overlap, normalizing only number formatting/punctuation.
- Final utterance had three revisions, no unresolved join, and all reference text. One getUserMedia request supplied both recording and PCM; owned tracks stopped and recorded audio remained playable.
- Cancelling ASR in a subsequent recording left that recording running and preserved both completed audio files.
- Tiny model assets reported 42,985,755 bytes, excluding runtime/WASM and HTTP overhead. Word timing and overlap increase total work compared with the earlier baseline.
- Unit checks cover exact retained PCM overlap, bounded windows, final flushing, revising omitted/incorrect endings, repetitions, separate utterances, and flagged uncertain/empty joins. The real-model browser fixture now compares its final text to the reference rather than merely checking that text appeared.

Raw generated-audio test evidence is local under `output/transcription-benchmark/overlap-*`, not committed. These automated measurements do not quantify physical iPhone performance or human-speech accuracy; the first user phone result is recorded below.

## iPhone delivery and test

The [published preview](https://screc.sadilekinnovation.com/transcription-preview/iphone-2/) uses a dedicated HTTPS directory, with the visible badge **IPHONE TRANSCRIPTION PREVIEW 2**. Its code revision is `a5ec1fd28c36182d41d01f83f178f04a0c829a5e`. It is a temporary test deployment and may need republishing after a future production container replacement. Preview assets and source revision are separate from the production root and production version metadata.

The worklet is emitted as a self-hosted JS file rather than an inline data URL. Safari audio-context resume starts within the Record button gesture, before awaiting microphone permission; a bounded resume failure disables ASR while retaining ordinary recording. Copy test report includes the preview ID, browser, secure-context flag, status, window timings, transcript revisions and model revision. Audio/text are not automatically uploaded.

On Safari, use Tiny and CPU/WASM, load the model, then speak continuously for 25–40 seconds so the test crosses several windows. Stop, wait for text to finish, and compare the ending and joins against audio playback. Test report export/copy is explicit. Keep the tab foregrounded; the live experiment still caps recording at two minutes, with the file path capped separately at 20 MB/60 seconds.

Public verification passed: all 12 package files matched their build hashes, JS/CSS had the expected MIME types, HTTPS and the HTTP-to-HTTPS redirect worked, and the worker loaded Tiny successfully. The public AudioWorklet registered without microphone access. After model loading, completed-file inference succeeded with browser networking disabled (2.112 s for the 12.701-second reference). This verifies inference in an already-loaded page, not offline startup.

Production `/version.json` stayed at v0.2.0/revision `3f7e97fbd6f1e6f474c44a8a509d15c339298ee7`, and the production root HTML hash was identical before/after preview publication. Hosted source/container checks passed.

### First user iPhone result

On October 21, 2026, in response to the Safari/iPhone test request for Preview 2, the user reported: “worked really nicely. perfect transcription.” The user then clarified that it was a 40-second test and that both playback and transcription sounded perfect. Record this as a successful user test of live English transcription and audio playback. No instrumented timing report or reference audio was supplied.

The user does not want additional manual tests in this round. Continue the checks that can be automated locally; device-specific interruptions/backgrounding remain unverified without blocking this experiment on more user testing.

### Automated two-minute checks

The extended CLI fixture replays nine copies of the generated reference (369 normalized reference words), then leaves a short tail before the app's two-minute automatic stop. A separate native 640×360/15 fps VP8+Opus encoder records moving generated video with the same audio track. This checks concurrent encoding load; it is not an integrated camera/screen transcript-panel test or a physical iPhone endurance test.

Both the quiet control and steady synthetic white noise at a target 18 dB signal-to-noise ratio (injected after capture processing) completed without capture/encoder failure:

| Condition | Automatic stop | ASR windows | Maximum queue | Normalized word errors |
|---|---|---|---|---|
| Quiet | 120.10 s | 23 | 1 | 78 / 369 (21.14%) |
| 18 dB noise | 120.10 s | 24 | 2 | 112 / 369 (30.35%) |

All owned tracks ended. Both audio/video recordings decoded through their full duration; each video contained 1,801 decoded frames. The noisy run finished ASR at 121.70 s. Observed main-thread JS heap peaked around 34 MB in both runs; this excludes worker, WASM, encoder and media memory and does not establish a total memory bound.

Recognition quality failed in both conditions, including omissions and invented text. Word error rate uses Levenshtein distance against the nine reference copies, normalizing punctuation and number forms (`9.30`, `9:30`, `930`, `12`); it is a regression measurement on generated speech, not a representative accuracy estimate. Each run flagged one join. The fixed energy gate also treated the noise-only tail as speech, and the model returned a non-speech annotation. A completed queue and a “finished” transcript do not establish complete or accurate recognition.

Raw inference results already omit speech before reconciliation. For example, an approximately eight-second quiet window beginning at 25.14 s returned only “model.” The saved encoded audio was decoded locally and three problem ranges were replayed directly through the same pinned Tiny/q8 model with Transformers.js 3.8.1 and the companion app's installed 4.3.0 browser runtime. The older runtime again stopped after short fragments; the newer runtime recognized subsequent sentences in all three ranges. Removing the explicit 128-token limit alone did not fix 3.8.1. This narrows the investigation to generation/runtime behavior rather than queue overload, but the comparison is diagnostic: encoded replay differs from original PCM, and no full-session accuracy or iPhone validation of 4.3.0 has been completed.

Next: reproducibly bundle/pin the newer browser runtime and its WASM assets, replay the complete reference through word-timed reconciliation, then rerun concurrent capture and noise checks. Keep this as a draft experiment until it passes. The published Preview 2 remains unchanged; retain the successful 40-second user result without generalizing it to longer sessions. Device interruptions/backgrounding remain unverified and are deferred; the user is not being asked for more manual checks this round.

The repeatable fixtures are `scripts/browser-transcription-endurance.js` and `scripts/browser-transcription-endurance-result.js`. They require localhost, the loaded real model, and the generated reference WAV. Set `window.enduranceQuiet = true` before starting for the quiet control. Generated media and reports are retained locally under `output/transcription-benchmark/endurance-*`; none are committed or uploaded.

Follow-up: [Preview 3](LOCAL_TRANSCRIPTION_03.md) records the newer runtime, extended context, bounded repair and full-reference validation. The results above describe the older Preview 2 baseline.
