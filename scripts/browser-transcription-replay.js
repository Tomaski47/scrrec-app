async (page) => {
  // Set replayRun to a saved endurance label and replayWorkerURL to the current
  // built worker URL. Exact generated PCM, not an encoded-audio approximation.
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Generated PCM replay is localhost-only.');
  const run = await page.evaluate(() => window.replayRun);
  if (!/^[a-z0-9-]+$/.test(run)) throw new Error('Choose a saved generated test label.');
  await page.locator('#file').evaluate(input => { input.multiple = true; });
  await page.locator('#file').setInputFiles([
    `output/transcription-benchmark/endurance-${run}-windows.f32`,
    `output/transcription-benchmark/endurance-${run}-report.json`,
  ]);
  await page.evaluate(async () => {
    if (!/^\/assets\/worker-[\w-]+\.js$/.test(window.replayWorkerURL)) throw new Error('Choose the current local built worker.');
    const selected = [...document.querySelector('#file').files];
    const pcm = new Float32Array(await selected.find(file => file.name.endsWith('.f32')).arrayBuffer());
    const report = JSON.parse(await selected.find(file => file.name.endsWith('.json')).text());
    const jobs = []; let offset = 0;
    for (const input of report.inputLengths) {
      const window = report.metrics.windows.find(window => window.id === input.id);
      jobs.push({ type: 'transcribe', id: input.id, overlap: window.overlap, audio: pcm.slice(offset, offset + input.samples) });
      offset += input.samples;
    }
    if (offset !== pcm.length || jobs.length > 30) throw new Error('Invalid generated trace');
    const state = window.replay = { results: [], done: false, error: null, baseline: report };
    const worker = new Worker(window.replayWorkerURL, { type: 'module' });
    let timer;
    const fail = message => { clearTimeout(timer); state.error = message; state.done = true; worker.terminate(); };
    worker.onerror = error => fail(error.message);
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') return;
      clearTimeout(timer);
      if (data.type === 'error') { fail(data.message); return; }
      if (data.type === 'result') state.results.push(data);
      const next = jobs.shift();
      if (!next) { state.done = true; worker.terminate(); return; }
      timer = setTimeout(() => fail('Replay inference timed out'), 45_000);
      worker.postMessage(next, [next.audio.buffer]);
    };
    timer = setTimeout(() => fail('Replay model load timed out'), 90_000);
    worker.postMessage({ type: 'load', model: 'tiny', device: 'wasm' });
  });
  await page.waitForFunction(() => window.replay.done, null, { timeout: 55_000 });
  const error = await page.evaluate(() => window.replay.error);
  if (error) throw new Error(error);
  const pending = page.waitForEvent('download');
  await page.evaluate(() => {
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([JSON.stringify({ baseline: window.replay.baseline, results: window.replay.results })], { type: 'application/json' }));
    link.href = url; link.download = 'generated-replay.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
  await (await pending).saveAs(`output/transcription-benchmark/replay-${run}.json`);
  return await page.evaluate(() => ({ completed: window.replay.results.length, retries: window.replay.results.filter(item => item.retried).length, reviews: window.replay.results.filter(item => item.review).length }));
}
