async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Localhost only.');
  await page.addInitScript(() => {
    if (!['localhost','127.0.0.1'].includes(location.hostname)) return;
    window.recoveryHidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.recoveryHidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.recoveryHidden ? 'hidden' : 'visible' });
    const createURL = URL.createObjectURL;
    window.recoveryExport = undefined;
    URL.createObjectURL = function(blob) {
      if (blob.type === 'application/json') window.recoveryExport = blob.text().then(JSON.parse);
      return createURL.call(this, blob);
    };
    const NativeContext = window.AudioContext;
    window.AudioContext = new Proxy(NativeContext, { construct(target, args) {
      const context = Reflect.construct(target, args);
      const addModule = context.audioWorklet.addModule.bind(context.audioWorklet);
      context.audioWorklet.addModule = (url, ...rest) => {
        if (String(url).includes('capture.worklet')) window.recoveryTapContext = context;
        return addModule(url, ...rest);
      };
      return context;
    } });
    const post = Worker.prototype.postMessage;
    window.recoverySubmitted = 0;
    Worker.prototype.postMessage = function(message, ...rest) {
      if (message.type === 'transcribe') window.recoverySubmitted++;
      return post.call(this, message, ...rest);
    };
  });
  await page.reload();
  return { fixture: 'Native AudioContext suspend/resume; controlled document visibility; real speech worker. Localhost only.' };
}
