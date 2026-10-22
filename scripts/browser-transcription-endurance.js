async (page) => {
  // CLI fixture: load the real model first. Poll window.endurance after starting;
  // the fixture stops this two-minute comparison. Never access physical devices.
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Generated media is localhost-only.');
  if (await page.getByRole('button', { name: 'Record + transcribe' }).isDisabled()) throw new Error('Load the model first.');
  await page.locator('#file').setInputFiles('output/transcription-benchmark/reference.wav');
  await page.evaluate(async () => {
    const bytes = await document.querySelector('#file').files[0].arrayBuffer();
    const quiet = window.enduranceQuiet === true;
    const runName = window.enduranceLabel || (quiet ? 'quiet' : 'noise');
    if (!/^[a-z0-9-]+$/.test(runName)) throw new Error('Use a simple unique evidence label.');
    const state = window.endurance = { runName, started: false, calls: 0, frames: 0, repetitions: 9, snrDB: quiet ? null : 18, samples: [], videoChunks: [], videoBytes: 0, forcedStop: false, done: false, error: null };
    // Optional generated-PCM evidence allows exact inference replay without
    // another two-minute capture. Never enable this on a physical recording.
    const post = Worker.prototype.postMessage;
    if (window.enduranceTrace === true) {
      state.inputs = []; state.results = [];
      Worker.prototype.postMessage = function(message, ...rest) {
        if (message.type === 'transcribe') {
          state.inputs.push({ id: message.id, audio: message.audio.slice() });
          if (!state.worker) {
            state.worker = this;
            state.listener = ({ data }) => { if (data.type === 'result' || data.type === 'error') state.results.push(data); };
            this.addEventListener('message', state.listener);
          }
        }
        return post.call(this, message, ...rest);
      };
    }
    navigator.mediaDevices.getUserMedia = async () => {
      if (++state.calls !== 1) throw new Error('Unexpected second microphone acquisition');
      const context = state.context = new AudioContext(); await context.resume();
      const speech = await context.decodeAudioData(bytes.slice(0));
      const samples = speech.getChannelData(0);
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
      const noiseRMS = state.noiseRMS = quiet ? 0 : rms / (10 ** (state.snrDB / 20));
      const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      let seed = 47;
      const noiseData = noise.getChannelData(0);
      for (let i = 0; i < noise.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        noiseData[i] = (seed / 0xffffffff * 2 - 1) * Math.sqrt(3) * noiseRMS;
      }
      const destination = context.createMediaStreamDestination();
      state.audio = destination.stream;
      const began = context.currentTime + 0.25;
      for (let i = 0; i < state.repetitions; i++) {
        const input = context.createBufferSource(); input.buffer = speech; input.connect(destination); input.start(began + i * speech.duration);
      }
      const background = context.createBufferSource(); background.buffer = noise; background.loop = true; background.connect(destination); background.start(began);
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const graphics = canvas.getContext('2d');
      state.draw = setInterval(() => {
        graphics.fillStyle = '#172934'; graphics.fillRect(0, 0, 640, 360);
        graphics.fillStyle = '#3edac2'; graphics.fillRect((state.frames * 7) % 600, 150, 40, 40);
        graphics.fillStyle = '#ffffff'; graphics.fillText(`Generated frame ${++state.frames}`, 20, 30);
      }, 1000 / 15);
      const video = state.video = canvas.captureStream(15);
      const combined = new MediaStream([...video.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      const recorder = state.recorder = new MediaRecorder(combined, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 400_000, audioBitsPerSecond: 64_000 });
      recorder.ondataavailable = event => { if (event.data.size) { state.videoChunks.push(event.data); state.videoBytes += event.data.size; } };
      recorder.onerror = () => { state.error = 'Concurrent video recorder error'; };
      recorder.onstop = () => {
        state.videoBlob = new Blob(state.videoChunks, { type: recorder.mimeType });
        state.videoURL = URL.createObjectURL(state.videoBlob);
        state.videoChunks = [];
        clearInterval(state.draw); video.getTracks().forEach(track => track.stop());
        void context.close();
      };
      recorder.start(1000);
      state.started = true; state.began = performance.now();
      state.monitor = setInterval(() => {
        const elapsed = (performance.now() - state.began) / 1000;
        if (elapsed >= (state.samples.length * 5)) {
          const metrics = JSON.parse(document.querySelector('#metrics').textContent);
          state.samples.push({ elapsed, heap: performance.memory?.usedJSHeapSize ?? null, windows: metrics.windows.length, queueMax: metrics.maxQueue, incomplete: metrics.incomplete, videoBytes: state.videoBytes });
        }
        if (destination.stream.getAudioTracks().every(track => track.readyState === 'ended') && recorder.state !== 'inactive') {
          state.captureEndedAt = elapsed; recorder.stop();
        }
        if (state.videoBlob && /finished|incomplete/.test(document.querySelector('#transcript-state').textContent)) {
          state.done = true; state.completedAt = elapsed; clearInterval(state.monitor); clearTimeout(state.deadline);
          if (state.inputs) {
            Worker.prototype.postMessage = post;
            state.worker?.removeEventListener('message', state.listener);
          }
        }
      }, 100);
      state.deadline = setTimeout(() => {
        state.forcedStop = true;
        document.querySelector('#stop').click();
        if (recorder.state !== 'inactive') recorder.stop();
      }, 150_000);
      state.plannedStop = setTimeout(() => document.querySelector('#stop').click(), 120_000);
      return destination.stream;
    };
  });
  await page.getByRole('button', { name: 'Record + transcribe' }).click();
  return { started: true, plannedSeconds: 120, speechRepetitions: 9, backgroundNoiseSNR: await page.evaluate(() => window.endurance.snrDB), concurrentVideo: '640x360 / 15 fps / VP8+Opus', physicalDevices: false };
}
