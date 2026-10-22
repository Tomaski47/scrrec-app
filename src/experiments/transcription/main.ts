import './lab.css';
import { BoundedQueue, Resampler, SAMPLE_RATE, Segmenter } from './audio';
import { MODELS, type Device, type Model, type Response, type Transcript } from './protocol';
import { RecordingSession } from '../../recorder/session';
import { isAppleMobile } from '../../recorder/cameras';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => element<HTMLButtonElement>(id);
const status = (text: string) => { element('status').textContent = text; };
let worker: Worker | undefined;
let ready = false, loading = false, decoding = false, capturing = false, incomplete = false;
let generation = 0;
let queue: BoundedQueue | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
let captureLimit: ReturnType<typeof setTimeout> | undefined;
let transcript: Transcript[] = [];
let maxQueue = 0;
let source = '';
let loadMs = 0;
let contextRate = 0;
let model: Model = 'tiny';
let device: Device = 'wasm';
const files = new Map<string, { loaded: number; total: number }>();

function controls() {
  const busy = loading || decoding || !!queue?.depth;
  button('start').disabled = !ready || capturing || busy;
  button('stop').disabled = !capturing;
  button('transcribe').disabled = !ready || capturing || busy || !element<HTMLInputElement>('file').files?.length;
  button('load').disabled = capturing || busy || ready;
  button('clear-cache').disabled = capturing || busy || ready;
  element<HTMLSelectElement>('model').disabled = capturing || busy || ready;
  element<HTMLSelectElement>('device').disabled = capturing || busy || ready;
  element<HTMLSelectElement>('microphone').disabled = capturing;
  element<HTMLInputElement>('file').disabled = capturing || busy;
  element('transcript-state').textContent = incomplete ? '· incomplete' : queue?.depth ? '· processing' : capturing ? '· listening' : transcript.length ? '· finished' : '';
  element('metrics').textContent = JSON.stringify({ model: MODELS[model], runtime: 'transformers.js 3.8.1', device, dtype: 'q8', source, contextRate, loadMs, maxQueue,
    modelFiles: Object.fromEntries(files), reportedModelBytes: [...files.values()].reduce((sum, file) => sum + file.total, 0),
    segments: transcript.map(t => ({ ...t, realTimeFactor: t.inferenceMs / ((t.end - t.start) * 1000) })), incomplete }, null, 2);
}
function fail(message: string) {
  incomplete = true;
  unload();
  status(`${message} Transcription stopped. Any active recording continues; save it below for a later retry.`);
}
function unload() {
  ++generation;
  clearTimeout(timeout); worker?.terminate(); worker = undefined;
  ready = false; loading = false; decoding = false; queue = undefined;
  controls();
}
function newTranscript(label: string) {
  transcript = []; incomplete = false; source = label; maxQueue = 0;
  element('transcript').replaceChildren();
  queue = new BoundedQueue(segment => {
    if (!worker || !ready) return;
    clearTimeout(timeout);
    timeout = setTimeout(() => fail('The speech model took too long.'), 90_000);
    worker.postMessage({ type: 'transcribe', id: segment.id, audio: segment.audio }, [segment.audio.buffer]);
  }, () => {
    incomplete = true;
    status('Transcription fell behind and has paused. Recording continues. Save the audio to retry later.');
    controls();
  });
}
button('load').onclick = () => {
  unload(); loading = true; files.clear();
  model = element<HTMLSelectElement>('model').value as Model;
  device = element<HTMLSelectElement>('device').value as Device;
  status('Loading runtime and speech model. The first download may take a few minutes…');
  controls();
  const current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker = current;
  timeout = setTimeout(() => fail('Model loading timed out.'), 180_000);
  current.onerror = event => { if (worker === current) fail(event.message || 'Speech worker failed.'); };
  current.onmessage = (event: MessageEvent<Response>) => {
    if (worker !== current) return;
    const message = event.data;
    if (message.type === 'progress') {
      files.set(message.file, { loaded: message.loaded, total: message.total });
      const loaded = [...files.values()].reduce((sum, file) => sum + file.loaded, 0);
      status(`Loading model: ${(loaded / 1_000_000).toFixed(1)} MB read (may include cached assets)…`);
    } else if (message.type === 'ready') {
      clearTimeout(timeout); ready = true; loading = false; loadMs = message.ms;
      status(`Model ready in ${(loadMs / 1000).toFixed(1)} seconds. Inference runs locally; asset caching does not guarantee this whole page works offline.`);
    } else if (message.type === 'result') {
      clearTimeout(timeout);
      const segment = queue?.complete(message.id);
      if (segment) {
        const item = { id: segment.id, start: segment.start, end: segment.end, text: message.text, inferenceMs: message.ms };
        transcript.push(item);
        const row = document.createElement('li');
        row.textContent = `${item.start.toFixed(1)}–${item.end.toFixed(1)}s · ${item.text || '[No text detected]'}`;
        element('transcript').append(row);
      }
      if (!queue?.depth && !capturing && !incomplete) status('Transcript finished. Review the text against your recording.');
    } else { fail(message.message); }
    controls();
  };
  current.postMessage({ type: 'load', model, device });
};
button('cancel').onclick = () => {
  if (capturing || queue?.depth || decoding) incomplete = true;
  unload(); status('Model unloaded. Active recordings continue; completed audio and transcript text are kept in this tab.');
};
button('clear-cache').onclick = async () => {
  try {
    // Only this experiment's exact model revisions; do not clear unrelated caches.
    let removed = 0;
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        if (url.hostname === 'huggingface.co' && Object.values(MODELS).some(m => url.pathname.startsWith(`/${m.id}/resolve/${m.revision}/`))) {
          if (await cache.delete(request)) removed++;
        }
      }
    }
    status(`Removed ${removed} cached model files for this experiment. Browser-managed runtime caching is separate.`);
  } catch (error) { status(`Could not clear model cache: ${String(error)}`); }
};

const session = new RecordingSession({
  state: state => {
    capturing = state !== 'idle'; controls();
    if (state === 'idle') { clearTimeout(captureLimit); element('capture-status').textContent = 'Recording stopped. Save the audio below; transcript processing may finish afterward.'; }
  },
  bytes: bytes => { element('capture-status').textContent = `Recording · ${(bytes / 1_000_000).toFixed(1)} MB · automatic stop at 2 minutes`; },
  message: text => { element('capture-status').textContent = text; },
  recordings: recordings => {
    const panel = element('recording'); panel.replaceChildren();
    for (const recording of recordings) {
      const player = document.createElement('audio'); player.controls = true; player.src = recording.url;
      const save = document.createElement('a'); save.href = recording.url; save.download = recording.filename;
      save.textContent = `Save audio · ${(recording.blob.size / 1_000_000).toFixed(1)} MB`; save.className = 'download';
      panel.append(player, save);
    }
  },
}, { preferMP4: isAppleMobile(navigator) });

button('start').onclick = async () => {
  if (!ready || capturing || queue?.depth) return;
  newTranscript('selected microphone');
  const current = generation;
  const began = await session.start(async owner => {
    const id = element<HTMLSelectElement>('microphone').value;
    const stream = owner.ownStream(await navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id } } : true }));
    // Reuse this same stream for PCM and MediaRecorder. No second microphone.
    try {
      const context = new AudioContext();
      const cleanup: { finishTap?: () => Promise<void> } = {};
      owner.ownCleanup(async () => { await cleanup.finishTap?.(); await context.close(); });
      await context.resume();
      contextRate = context.sampleRate;
      await context.audioWorklet.addModule(new URL('./capture.worklet.js', import.meta.url));
      if (owner.signal.aborted) return [];
      const tap = new AudioWorkletNode(context, 'transcription-tap');
      const input = context.createMediaStreamSource(stream);
      const mute = context.createGain(); mute.gain.value = 0;
      input.connect(tap); tap.connect(mute); mute.connect(context.destination);
      const resampler = new Resampler(context.sampleRate);
      const segmenter = new Segmenter(segment => { if (current === generation) { queue?.add(segment); maxQueue = Math.max(maxQueue, queue?.depth || 0); controls(); } });
      let flushed: (() => void) | undefined;
      tap.port.onmessage = event => {
        if (event.data === 'flushed') { flushed?.(); return; }
        if (current === generation && queue?.accepting) segmenter.push(resampler.push(event.data));
      };
      // Flush before closing context; a dropped ack must never block the recording.
      cleanup.finishTap = async () => {
        await Promise.race([new Promise<void>(resolve => { flushed = resolve; tap.port.postMessage('flush'); }), new Promise(resolve => setTimeout(resolve, 250))]);
        if (current === generation && queue?.accepting) segmenter.flush();
        tap.port.close(); input.disconnect(); tap.disconnect(); mute.disconnect();
      };
    } catch (error) { fail(`Audio tap unavailable: ${String(error)}`); }
    return [{ label: 'Microphone', kind: 'mic', stream }];
  }, 'mid');
  if (began) captureLimit = setTimeout(() => void session.stop(), 120_000);
  controls();
};
button('stop').onclick = () => { void session.stop(); };
element<HTMLInputElement>('file').onchange = controls;
button('transcribe').onclick = async () => {
  const file = element<HTMLInputElement>('file').files?.[0];
  if (!file || !ready || capturing || decoding || queue?.depth) return;
  if (file.size > 20_000_000) { status('Choose a file under 20 MB for this experiment.'); return; }
  decoding = true; controls();
  const current = generation;
  const context = new AudioContext();
  try {
    status('Decoding the selected file locally…');
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (current !== generation) return;
    if (decoded.duration > 60) throw new Error('Choose a recording no longer than 60 seconds.');
    // The file-size cap limits encoded input, not decoder memory. This is a short-
    // clip feasibility path; long recordings require an incremental decoder.
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
    const input = offline.createBufferSource(); input.buffer = decoded; input.connect(offline.destination); input.start();
    const rendered = await offline.startRendering();
    if (current !== generation) return;
    newTranscript(file.name);
    queue!.add({ id: 1, start: 0, end: decoded.duration, audio: rendered.getChannelData(0).slice() });
    maxQueue = 1; status('Transcribing selected file locally…');
  } catch (error) { if (current === generation) status(String(error)); }
  finally { await context.close(); if (current === generation) { decoding = false; controls(); } }
};
button('export').onclick = () => {
  const blob = new Blob([JSON.stringify({ transcript, measurements: JSON.parse(element('metrics').textContent || '{}') }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = 'local-transcript-experiment.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
const clear = document.createElement('button'); clear.textContent = 'Clear completed lab recordings';
clear.onclick = () => { if (!capturing) session.clear(); };
element('recording').before(clear);
void navigator.mediaDevices?.enumerateDevices().then(devices => {
  const select = element<HTMLSelectElement>('microphone');
  for (const mic of devices.filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default')) {
    const option = document.createElement('option'); option.value = mic.deviceId; option.textContent = mic.label || 'Microphone'; select.append(option);
  }
});
window.addEventListener('pagehide', () => { unload(); void session.dispose(); });
controls();
