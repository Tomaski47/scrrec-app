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

On October 21, 2026, in response to the Safari/iPhone test request for Preview 2, the user reported: “worked really nicely. perfect transcription.” Record this as a successful user test of live English transcription. No timing report or reference audio was supplied, and audio playback was not separately confirmed in the reply. Longer sessions, noisy speech, interruptions/backgrounding, and video-concurrent capture remain further checks.
