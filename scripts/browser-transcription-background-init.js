async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Background instrumentation is localhost-only. Launch with generated browser devices.');
  await page.addInitScript(() => {
    if (!['127.0.0.1', 'localhost'].includes(location.hostname)) return;
    const state = window.backgroundTest = { results: [], requests: [], tracks: [], recorders: [], visibility: [], contexts: [], destinations: [], pcm: { blocks: 0, hiddenBlocks: 0, voiced: 0, maxDelayMs: 0, lastAt: 0 } };
    const mark = () => state.visibility.push({ at: Date.now(), state: document.visibilityState });
    document.addEventListener('visibilitychange', mark); mark();
    // Observe real browser APIs; do not replace visibility, audio or inference.
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      state.requests.push({ constraints, at: Date.now() });
      const stream = await getUserMedia(constraints); state.tracks.push(...stream.getTracks()); return stream;
    };
    const NativeContext = window.AudioContext;
    window.AudioContext = new Proxy(NativeContext, { construct(target, args) {
      const context = Reflect.construct(target, args); state.contexts.push(context);
      const module = context.audioWorklet.addModule.bind(context.audioWorklet);
      context.audioWorklet.addModule = (url, ...rest) => {
        if (String(url).includes('capture.worklet')) state.tap = context;
        return module(url, ...rest);
      };
      const destination = context.createMediaStreamDestination.bind(context);
      context.createMediaStreamDestination = () => { const node = destination(); state.destinations.push(node.stream); return node; };
      return context;
    } });
    const NativeRecorder = window.MediaRecorder;
    window.MediaRecorder = new Proxy(NativeRecorder, { construct(target, args) {
      const recorder = Reflect.construct(target, args), entry = { recorder, chunks: [] }; state.recorders.push(entry);
      recorder.addEventListener('dataavailable', event => entry.chunks.push({ at: Date.now(), hidden: document.hidden, bytes: event.data.size }));
      return recorder;
    } });
    const NativeWorklet = window.AudioWorkletNode;
    window.AudioWorkletNode = new Proxy(NativeWorklet, { construct(target, args) {
      const node = Reflect.construct(target, args);
      node.port.addEventListener('message', ({ data }) => {
        if (!(data instanceof Float32Array)) return;
        const now = Date.now(), pcm = state.pcm;
        pcm.blocks++; pcm.hiddenBlocks += Number(document.hidden);
        if (pcm.lastAt) pcm.maxDelayMs = Math.max(pcm.maxDelayMs, now - pcm.lastAt);
        pcm.lastAt = now;
        if (data.some(sample => Math.abs(sample) > 0.02)) pcm.voiced++;
      });
      return node;
    } });
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, ...rest) {
      if (message.type === 'load') this.addEventListener('message', ({ data }) => {
        if (data.type === 'result') state.results.push({ at: Date.now(), hidden: document.hidden, id: data.id, text: data.text });
      });
      return post.call(this, message, ...rest);
    };
    const createURL = URL.createObjectURL;
    URL.createObjectURL = function(blob) {
      if (blob.type === 'application/json') state.export = blob.text().then(JSON.parse);
      return createURL.call(this, blob);
    };
  });
  await page.reload();
  // Attach via a CLI cdpEndpoint (noDefaults) to an isolated browser launched
  // without background-throttling exemptions. A normally launched Playwright
  // browser forces focus emulation and cannot validate native tab visibility.
  return { visibility: await page.evaluate(() => document.visibilityState), userAgent: await page.evaluate(() => navigator.userAgent), realVisibility: true };
}
