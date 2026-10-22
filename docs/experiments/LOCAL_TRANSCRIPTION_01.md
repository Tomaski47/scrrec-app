# Local transcription experiment 01

October 21, 2026. Development experiment; excluded from the normal production build. The shipped app remains v0.2.0.

## Try it

With the repository's Node 24 environment, run `npm run dev` and open `/experiments/transcription.html`. To test compiled assets, run `npm run build:experiments`, then `npm run preview -- --outDir output/transcription-lab`. The lab is a separate page and does not modify existing recordings in the main app.

Choose Load model explicitly, then either select a short file or record one microphone. Live recording is capped at two minutes. File input is capped at 20 MB and 60 seconds; longer recordings need an incremental decoder before they can be supported safely. Whole-file decoding can use substantially more memory than the encoded file size. A two-minute lab recording cannot currently be retried in the one-minute file path without trimming it externally.

The page provides audio playback/download, timestamped phrase text, JSON export with timings, model unload/cancellation, and deletion of the experiment's model cache. Audio and transcripts remain in the tab until explicitly exported. The model/runtime download is from Hugging Face/jsDelivr; there is no remote speech service or audio upload. The user confirmed English first for the initial experiment.

The lab displays one transcript at a time: starting a new live/file test replaces its text, so export first. Completed lab audio is retained across tests until explicitly cleared or the tab closes. This is an experiment, not the planned per-recording transcript library.

## Implementation boundaries

- Adapted the worker/PCM approach reviewed in the companion TTS/STT app. The lab reuses Screen Recorder's `RecordingSession` resource ownership and format negotiation.
- One acquired microphone stream feeds both MediaRecorder and an AudioWorklet. No second/default microphone is opened by ASR. This is not yet connected to the main app's microphone mixing or video capture.
- Worklet downmixes channels. A stateful resampler converts the actual AudioContext rate to 16 kHz. Its initial linear interpolation needs anti-aliasing/quality evaluation before shipping.
- An energy gate emits phrases on silence or after approximately eight seconds. It is not a learned VAD. Silence contributes to the sample-based timestamps. Stop flushes pending PCM and a short final phrase.
- One job runs and two may wait. Overload stops accepting new ASR phrases, marks the transcript incomplete, and drains retained work. The recording continues. No encoded MediaRecorder fragments are decoded as standalone clips.
- Worker termination cancels inference; worker identity/session generation prevents stale results from updating a new run. Model loading and inference have timeouts. Errors, cancellation, and queue overflow do not stop the media session.
- Transcript entries describe audio windows, not word-level timestamps. This first version produces phrase results rather than a continuously revised token stream. It intentionally exposes the hard-boundary quality issue before implementing overlap/reconciliation.

## Measured baseline

Mac arm64, Chrome 155, single-threaded WASM, q8 Whisper Tiny English. Input: a locally synthesized Samantha voice at 165 words/minute, 16 kHz mono WAV, 12.701375 seconds. This is a repeatable smoke test, not representative speech accuracy or a sustained-performance claim.

Reference:

> Today we are testing local transcription in the screen recorder. The meeting starts at nine thirty on Friday. Please save twelve recordings and send the notes to Thomas. Our next step is to compare the tiny model with the base model.

| Check | Observed result |
|---|---|
| First Tiny load in fresh test-origin model cache | 6.70 s, including runtime/model startup; not an isolated network benchmark |
| Warm Tiny worker startup | 1.11 s |
| Reported model asset bytes | 43,536,374 bytes, including tokenizer/config files; excludes runtime/WASM and HTTP overhead |
| Completed-file inference | 1.895 s for 12.701 s of audio; real-time factor 0.149 |
| Live phrase 1 | 8.019 s audio, 1.907 s inference; factor 0.238 |
| Live phrase 2 | 5.291 s audio including trailing silence, 1.792 s inference; factor 0.339 |
| Maximum observed queue depth | 1 |
| Live input rate | 48 kHz, resampled to 16 kHz |
| Capture independence | One getUserMedia request; owned tracks ended on Stop; two nonempty recordings remained playable after ASR cancellation |
| File text | Matched reference wording, with numbers formatted as “9.30” and “12” |
| Live text | Dropped “the” at a forced phrase boundary (“send” / “notes to Thomas”) |
| Offline worker restart after model caching | Failed: worker/runtime delivery still needs the network in this setup |
| Compiled-page file inference with networking disabled after model load | Passed; 2.404 s inference, factor 0.189. Does not establish an offline page reload/restart. |
| Compiled-page live/cancellation check | Passed; phrase factors 0.204 and 0.267, one microphone request, two playable recordings. Boundary omitted “send the” in this run. |
| Narrow model cache deletion | Removed the seven model files for the pinned revision; unrelated/runtime caches were retained. |

Raw local evidence lives under `output/transcription-benchmark/` and is intentionally not committed with generated audio or browser profiles. The browser fixture uses generated speech and native MediaRecorder/AudioWorklet/Whisper inference; it does not represent a physical microphone or iPhone test. No Base, Moonshine, WebGPU, iPhone, video-concurrent, noise, multilingual, or endurance result is claimed here.

## Pinned assets and licenses

- Browser baseline: [`@huggingface/transformers` 3.8.1](https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/package.json), Apache-2.0; self-contained `dist/transformers.min.js` bundle. That package pins ONNX Runtime Web `1.22.0-dev.20250409-89f8206ba4` (MIT).
- Tiny: [`onnx-community/whisper-tiny.en`](https://huggingface.co/onnx-community/whisper-tiny.en/tree/2575352d61be1bf7225cf8f8b268a4678025fc58), revision `2575352d61be1bf7225cf8f8b268a4678025fc58`.
- Base comparison option: [`onnx-community/whisper-base.en`](https://huggingface.co/onnx-community/whisper-base.en/tree/51eefc0af78b103839eda9e7e4f4186acc6517fe), revision `51eefc0af78b103839eda9e7e4f4186acc6517fe`. Not benchmarked yet.
- The corresponding [Tiny](https://huggingface.co/openai/whisper-tiny.en) and [Base](https://huggingface.co/openai/whisper-base.en) upstream model cards label weights Apache-2.0. Preserve licenses/notices for exact downloaded assets when preparing a self-hosted distribution.

The current 4.3.1 direct `dist/transformers.web.js` CDN entry failed in a module worker because of bare `onnxruntime-web/webgpu` imports. The companion app bundles its 4.x dependency through its build system. For this dependency-free spike, the older self-contained browser bundle supplies a working baseline. Before production integration, bundle/self-host the current compatible runtime and WASM assets, review their dependencies/licenses/hosting policy, and rerun the measurements. Do not treat this lab's runtime choice as a production upgrade decision.

## Next gates

1. Add overlapping audio windows, word-boundary reconciliation, and final/provisional revision semantics. Preserve timeline/session IDs and make omissions observable.
2. Compare Tiny/Base and Moonshine on consented human speech: names, numbers, quiet speech, background noise, intended languages. Host storage was near capacity during this pass, so additional model downloads were deferred after the Tiny baseline.
3. Measure actual model/runtime network bytes, cold/warm startup, final-result latency, sustained queue behavior, memory trend, and media continuity while recording camera/screen. Use the same audio and reference for each model.
4. Test the physical iPhone, including interruptions/backgrounding and thermal/resource limits. WebGPU selection is an unverified experiment option, not a capability promise.
5. Self-host and cache app/worker/runtime/model assets deliberately. Distinguish model cache verification from fully offline readiness; retain narrow deletion controls.
6. Integrate an opt-in transcript panel into the main recorder after these gates. Add a long-recording decoder/retry path, TXT/JSON export, and transcript retention semantics. Keep any LLM assistant as a separate opt-in subscriber to finalized text.

`npm run check` covers the main app and transcription TypeScript. Unit checks cover resampling across worklet boundaries, silence/timestamps/final flushing, and queue overload. `scripts/browser-transcription-live.js` uses the real model on localhost and verifies stream reuse, playback, and recording continuity after cancellation. Load a model first and provide a nonempty generated reference WAV at `output/transcription-benchmark/reference.wav` before running that fixture with Playwright CLI.
