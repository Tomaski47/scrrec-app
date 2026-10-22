async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url()) && page.url() !== 'chrome-error://chromewebdata/') throw new Error('Generated media is localhost-only.');
  await page.route('**/__speech.wav', route => route.fulfill({ path: 'output/transcription-benchmark/reference.wav', contentType: 'audio/wav' }));
  await page.addInitScript(() => {
    if (!['127.0.0.1', 'localhost'].includes(location.hostname)) return;
    const state = window.recorderTest = { calls: [], tracks: [], contexts: [], samples: [], results: [], frames: 0, exports: [], duration: 0, faults: [] };
    const createURL = URL.createObjectURL;
    URL.createObjectURL = function(blob) {
      const url = createURL.call(this, blob);
      if (blob.type === 'application/json') void blob.text().then(text => { state.exports.push(JSON.parse(text)); });
      return url;
    };
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, ...rest) {
      if (message.type === 'load') {
        state.worker = this; state.loads = (state.loads || 0) + 1;
        this.addEventListener('message', ({ data }) => { if (data.type === 'result') {
          state.resultCount = (state.resultCount || 0) + 1;
          // Keep diagnostics bounded; no PCM or complete window history retained.
          state.results.push({ id: data.id, text: data.text, ms: data.ms, review: data.review, retried: data.retried });
          state.results = state.results.slice(-4);
        } });
      }
      return post.call(this, message, ...rest);
    };
    const own = stream => { state.tracks.push(...stream.getTracks()); return stream; };
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: 'audioinput', deviceId: 'fixture-mic', groupId: 'mic', label: 'Generated speech microphone', toJSON() {} },
      { kind: 'videoinput', deviceId: 'fixture-camera', groupId: 'camera', label: 'Generated camera', toJSON() {} },
    ];
    navigator.mediaDevices.getUserMedia = async constraints => {
      state.calls.push({ type: 'user', audio: !!constraints.audio, video: !!constraints.video, at: performance.now() });
      if (constraints.audio) {
        const context = new AudioContext(); state.contexts.push(context); await context.resume();
        const bytes = await (await fetch('/__speech.wav')).arrayBuffer();
        const buffer = await context.decodeAudioData(bytes);
        const destination = context.createMediaStreamDestination();
        const input = context.createBufferSource(); input.buffer = buffer; input.loop = true; input.connect(destination); input.start(context.currentTime + .2);
        state.speechInput = input; state.referenceDuration = buffer.duration;
        return own(destination.stream);
      }
      return video();
    };
    function video() {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const graphics = canvas.getContext('2d');
      const draw = setInterval(() => {
        graphics.fillStyle = '#162a32'; graphics.fillRect(0, 0, 640, 360);
        graphics.fillStyle = '#14cbb5'; graphics.fillRect((state.frames * 7) % 600, 150, 40, 40);
        graphics.fillStyle = '#fff'; graphics.fillText(`Generated frame ${++state.frames}`, 20, 30);
      }, 1000 / 15);
      const stream = own(canvas.captureStream(15));
      stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(draw));
      // stop() doesn't dispatch ended; collect explicitly during fixture cleanup.
      state.draws = [...(state.draws || []), draw];
      return stream;
    }
    navigator.mediaDevices.getDisplayMedia = async () => { state.calls.push({ type: 'display', at: performance.now(), userActivation: navigator.userActivation.isActive }); return video(); };
  });
  const target = page.url().startsWith('http://') ? new URL(page.url()).origin : 'http://127.0.0.1:5190';
  await page.goto(target);
  return { fixture: 'localhost generated screen, camera and microphone; transcription defaults off', requests: await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name)) };
}
