import { MODELS, type Request, type Response } from './protocol';

// Exact runtime version, fetched only after the explicit Load action. Keep this
// external in the experiment; production delivery needs self-hosted assets/CSP QA.
const runtimeURL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
type Recognizer = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string }>;
let recognizer: Recognizer | undefined;
let busy = false;
const send = (message: Response) => self.postMessage(message);
self.addEventListener('message', async (event: MessageEvent<Request>) => {
  if (busy) { send({ type: 'error', message: 'Transcription worker already busy.' }); return; }
  busy = true;
  try {
    const message = event.data;
    const began = performance.now();
    if (message.type === 'load') {
      const { pipeline, env } = await import(/* @vite-ignore */ runtimeURL);
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      // Single threaded baseline also works without cross-origin isolation.
      env.backends.onnx.wasm.numThreads = 1;
      const model = MODELS[message.model];
      recognizer = await pipeline('automatic-speech-recognition', model.id, {
        revision: model.revision, device: message.device, dtype: 'q8',
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status === 'progress') send({ type: 'progress', file: p.file || 'model', loaded: p.loaded || 0, total: p.total || 0 });
        },
      });
      send({ type: 'ready', ms: performance.now() - began });
    } else {
      if (!recognizer) throw new Error('Load a model first.');
      if (message.audio.length > 60 * 16_000) throw new Error('Audio exceeds the experiment limit.');
      const result = await recognizer(message.audio, { chunk_length_s: 25, stride_length_s: 3, max_new_tokens: 128, do_sample: false });
      send({ type: 'result', id: message.id, text: result.text.trim(), ms: performance.now() - began });
    }
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally { busy = false; }
});
