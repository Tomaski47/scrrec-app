# Local transcription preview 3

October 21–22, 2026. English-first, separate from production. This updates [Preview 2](LOCAL_TRANSCRIPTION_02.md); no additional manual phone test is required from the user this round.

## Repair and delivery

Pin Transformers.js **4.3.0** and matching ONNX Runtime Web **1.31.0-dev.20260914-8d85527a0** in the npm lockfile. Bundle the browser runtime, matching WASM/module assets and redistribution notices with the lab. Only model assets are fetched from Hugging Face, at the unchanged exact Tiny/Base revisions. Audio/text are processed locally, without automatic uploads.

Use word-timestamp generation for both live and completed-file inference. The old runtime could stop after an initial phrase even when more speech followed. The newer runtime's timestamp seek loop can continue generation; an explicit `max_new_tokens` would disable it, so the experiment no longer sets that option.

Live windows now contain up to **12 seconds with four seconds of PCM overlap**. Eight-second windows with the newer engine alone still produced a repeated-word result. More context removed that failure in the quiet regression. First text consequently takes about 12 seconds plus processing time. Stop and speech pauses still flush the tail; the one-active/two-waiting queue remains bounded.

For an overlapping live window with fewer than three word chunks, no words, or no aligned word in its first two seconds, retry once with up to four seconds of actual preceding audio. Exclude audio already present in the overlap. Remove prefix words and shift remaining times onto the original window's clock. Retain only the original window as the next context source, without accumulating a session. If coverage still looks suspicious, retain the original result and show **check recognition**. This conservative hint is not an accuracy score or a learned speech detector and cannot detect every omission.

Clamp approximate word alignments to the actual audio duration: Whisper sometimes aligns trailing words into its padded 30-second input. Keep draft/final reconciliation and **check join** warnings rather than automatically deleting potentially intentional repetitions. Model failure, cancellation, timeout and backlog still leave recording running.

CPU/WASM uses the plain single-threaded build for compatibility with older Safari; optional WebGPU uses a separate asyncify build. CPU mode downloads approximately 14.3 MB of WASM and 0.6 MB of bundled runtime JS, plus model and application assets (uncompressed sizes). GPU WASM is emitted separately and is not fetched by CPU mode. Emit module glue as `.js` for existing nginx MIME handling. The normal production build excludes the lab and all its runtime assets.

## Measurements

Chrome 155, Mac arm64, Tiny/q8, single-threaded CPU/WASM. Nine copies of the generated 12.701-second reference yield 369 normalized words in a two-minute recording. Normalize punctuation and number formatting only. These are regression measurements, not representative human-speech accuracy estimates.

| Configuration | Quiet word edits | 18 dB white-noise word edits |
|---|---|---|
| Preview 2, 3.8.1, 8 s / 3 s overlap | 78 / 369 (21.14%) | 112 / 369 (30.35%) |
| 4.3.0 alone, 8 s / 3 s | 15 / 369 (4.07%) | 64 / 369 (17.34%) |
| 4.3.0, 12 s / 4 s, before retry | 0 / 369 | 35 / 369 (9.49%) |
| Final worker, exact saved PCM replay with retry | **0 / 369** | **2 / 369 (0.54%)** |

The 12-second quiet live run had 14 windows, maximum queue depth one, no unresolved join and automatic stop at 120.11 s. All 369 normalized words remained, including intentional repetitions. Its corresponding noisy capture had 15 windows and maximum queue depth one. Both audio/video recordings remained present and owned tracks ended.

Exact replay uses the PCM originally transferred to the worker, original window times and overlap. The final worker preserved the quiet transcript without retries/review flags. It retried noisy windows 4 and 13 once each, recovering the large missing passages. One missing word (“recorder”), one extra word (“model”) and one flagged join remain in noise. Do not describe noisy recognition as perfect.

Firefox passed the 50.8055-second completed-file regression: all 164 normalized words across multiple model chunks, in 8.394 seconds of inference. Its short live regression preserved every reference word; cancelling ASR during another recording kept both recordings playable and released owned tracks. The automated WebKit runner stalled on launch in headless and visible modes and was stopped. This is not a Safari pass or a physical iPhone retest. The earlier successful 40-second iPhone result belongs to Preview 2.

Lint, type checks, 26 unit tests and production/experiment builds pass. Coverage includes exact preceding PCM selection, no context inherited by a new utterance/file, timestamp clamping/context removal, overlap preservation and recording safety. Full offline startup, physical phone validation of this engine, Base/WebGPU performance and representative human/noisy speech remain separate gates before production integration.

## Reproduction

Use Node 24, localhost and the real Tiny model. Reference generation is described in earlier experiment notes. `reference-four.wav` concatenates four original WAV copies with unchanged PCM format.

- `scripts/browser-transcription-endurance.js`: set `window.enduranceQuiet`, a unique `window.enduranceLabel`, and optionally `window.enduranceTrace = true`. It supplies generated audio only and concurrently encodes generated video.
- `scripts/browser-transcription-endurance-result.js`: collect after completion. Quiet tests fail on differing words or review flags. Capture/queue failures fail either condition; noise accuracy is reported separately.
- Tracing saves sequential 16 kHz mono Float32 windows as `.f32`, with lengths, raw worker outputs and timing in the JSON report. These fixtures never use microphone audio.
- `scripts/browser-transcription-replay.js`: unload the UI model; set `window.replayRun` to the saved label and `window.replayWorkerURL` to the current built `/assets/worker-….js`. Replay exact windows, then run `node scripts/score-transcription-replay.mjs <label>` to apply the production reconciler and score it. Replay validates recognition/reconciliation; it does not replace concurrent recording checks.
- `scripts/browser-transcription-file.js` and `scripts/browser-transcription-live.js`: exact-word file/live regressions and recording preservation after cancellation.

Detailed evidence stays local in `output/transcription-benchmark/`; generated media/PCM are not committed or uploaded. Fresh hosted npm/container checks verify the lockfile. The low-space local machine reused identical installed 4.3.0/ONNX packages via APFS clones; CI/container builds skip unrelated native ONNX GPU downloads because inference runs in the browser.

## Final concurrent recording check

A fresh two-minute live run with the final repair and 18 dB noise reproduced the two word edits (0.54%). It stopped automatically at 120.101 s; all 15 windows completed, maximum queue depth was one, and windows 4/13 each retried once. No recognition-review flag remained; the uncertain join stayed visibly flagged. Exactly one microphone acquisition was supplied by the fixture, and all owned tracks ended. Full decoding of both saved files passed; video contained 1,801 decoded frames through approximately 120 seconds. Main-thread JS heap ranged from roughly 6.4 to 30.3 MB, excluding worker/WASM/encoder/media memory; this is not a total memory-bound claim.

An earlier final capture retained playable media but its large trace export failed during local disk exhaustion. Its live ASR measurements were not retained or counted as a pass. The repeated run above saved measurements before media, and tracing was disabled to reduce disk use.

## HTTPS preview

The immutable [Preview 3 URL](https://screc.sadilekinnovation.com/transcription-preview/iphone-3-8e1d25a/) shows **IPHONE TRANSCRIPTION PREVIEW 3**, from source `8e1d25a47ddee7ba9f92673acac175512f97ceb4`. Use this versioned address: an early asset request at the unversioned `iphone-3/` path received a missing-file response cached by the delivery edge. No cache changes to the production site were needed.

The publication script verified all 22 package files inside the serving container. Production version metadata stayed v0.2.0/revision `3f7e97fbd6f1e6f474c44a8a509d15c339298ee7`, and production root HTML remained SHA-256 `83b398796e190958e98d41f7a275504728b14672f3beabc03403db069bb882ac`. Preview 2 remains available. This is a temporary directory deployment and may need republishing after a production container replacement.

Fresh hosted source and container checks both passed for the exact deployed source revision. All 22 public files matched their SHA-256 build hashes; JavaScript/CSS/WASM MIME types, HTTPS and HTTP-to-HTTPS redirects passed. The public browser showed the correct badge and revision, loaded Tiny in 4.353 s, and registered the HTTPS AudioWorklet without acquiring a microphone. With networking disabled after loading, the completed reference transcribed exactly in 2.241 s. CPU mode requested neither jsDelivr code nor the optional GPU WASM. This verifies inference in an already-loaded page, not offline startup or physical iPhone behavior.
