import { MODELS, type Request, type Response } from './protocol';
import { precedingContext, suspectCoverage, timedWords } from './inference';
import wasmURL from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmModuleURL from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import gpuWasmURL from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import gpuModuleURL from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';

// The pinned browser runtime and matching WASM assets are built with the lab.
// This worker is created only after the explicit Load action.
type Recognizer = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }>;
let recognizer: Recognizer | undefined;
let previousAudio: Float32Array | undefined;
let busy = false;
const send = (message: Response) => self.postMessage(message);
self.addEventListener('message', async (event: MessageEvent<Request>) => {
  if (busy) { send({ type: 'error', message: 'Transcription worker already busy.' }); return; }
  busy = true;
  try {
    const message = event.data;
    const began = performance.now();
    if (message.type === 'load') {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      // Single threaded baseline also works without cross-origin isolation.
      const wasm = env.backends.onnx!.wasm!;
      wasm.numThreads = 1;
      // Plain WASM supports older iPhone Safari as well as desktop browsers.
      // Asyncify is needed only for the optional WebGPU execution path.
      wasm.wasmPaths = message.device === 'webgpu'
        ? { mjs: new URL(gpuModuleURL, self.location.href).href, wasm: new URL(gpuWasmURL, self.location.href).href }
        : { mjs: new URL(wasmModuleURL, self.location.href).href, wasm: new URL(wasmURL, self.location.href).href };
      const model = MODELS[message.model];
      recognizer = await pipeline('automatic-speech-recognition', model.id, {
        revision: model.revision, device: message.device, dtype: 'q8',
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status === 'progress') send({ type: 'progress', file: p.file || 'model', loaded: p.loaded || 0, total: p.total || 0 });
        },
      }) as unknown as Recognizer;
      send({ type: 'ready', ms: performance.now() - began });
    } else {
      if (!recognizer) throw new Error('Load a model first.');
      if (message.audio.length > 60 * 16_000) throw new Error('Audio exceeds the experiment limit.');
      // Timestamp generation lets Whisper finish speech after an initial phrase.
      // An explicit max_new_tokens disables the runtime's timestamp seek loop.
      // Use it for files too: long file chunks can otherwise end prematurely.
      const options = { chunk_length_s: 25, stride_length_s: 3, do_sample: false, return_timestamps: 'word' };
      let result = await recognizer(message.audio, options);
      const duration = message.audio.length / 16_000;
      let words = timedWords(result.chunks || [], duration);
      const prefix = precedingContext(previousAudio, message.overlap);
      previousAudio = message.audio;
      let retried = false;
      // One retry with real earlier PCM, not a text prompt. This can repair an
      // early end-of-sentence result without inventing words to fill the gap.
      if (prefix.length && suspectCoverage(words, duration)) {
        retried = true;
        const audio = new Float32Array(prefix.length + message.audio.length);
        audio.set(prefix); audio.set(message.audio, prefix.length);
        const retry = await recognizer(audio, options);
        const candidate = timedWords(retry.chunks || [], audio.length / 16_000, prefix.length / 16_000);
        if (!suspectCoverage(candidate, duration)) { result = retry; words = candidate; }
      }
      if (result.text.trim() && (!words.length || words.some(word => !Number.isFinite(word.start) || !Number.isFinite(word.end)))) throw new Error('Word timings unavailable; save the recording and retry file transcription.');
      send({ type: 'result', id: message.id, text: words.map(word => word.text).join('').trim(), words, retried,
        review: message.overlap > 0 && suspectCoverage(words, duration), ms: performance.now() - began });
    }
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally { busy = false; }
});
