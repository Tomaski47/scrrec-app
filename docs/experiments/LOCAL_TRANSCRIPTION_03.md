# Local transcription preview 3

October 21, 2026. English-first, separate from production. This updates [Preview 2](LOCAL_TRANSCRIPTION_02.md); no additional manual phone test is required from the user this round.

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

Publication and the final concurrent-recording check are recorded below after verification.
