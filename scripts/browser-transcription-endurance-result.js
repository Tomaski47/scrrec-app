async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Generated media is localhost-only.');
  const result = await page.evaluate(() => {
    const state = window.endurance;
    if (!state?.started) throw new Error('Start the endurance fixture first.');
    const metrics = JSON.parse(document.querySelector('#metrics').textContent);
    if (!state.done) return { done: false, elapsed: (performance.now() - state.began) / 1000, windows: metrics.windows.length, maxQueue: metrics.maxQueue, incomplete: metrics.incomplete };
    return {
      done: true, runName: state.runName, metrics, speechRepetitions: state.repetitions, snrDB: state.snrDB, noiseRMS: state.noiseRMS,
      microphoneRequests: state.calls, framesDrawn: state.frames, videoBytes: state.videoBlob.size,
      captureEndedAt: state.captureEndedAt, completedAt: state.completedAt, forcedStop: state.forcedStop,
      error: state.error, samples: state.samples, videoURL: state.videoURL,
      audioURL: document.querySelector('#recording audio')?.src,
      tracksEnded: [...state.audio.getTracks(), ...state.video.getTracks()].every(track => track.readyState === 'ended'),
      status: document.querySelector('#status').textContent,
      workerResults: state.results,
      inputLengths: state.inputs?.map(input => ({ id: input.id, samples: input.audio.length })),
      pcmURL: state.inputs && URL.createObjectURL(new Blob(state.inputs.map(input => input.audio))),
    };
  });
  if (!result.done) return result;
  const canonical = text => text.toLowerCase().replace(/\b9[.:]?30\b/g, 'nine thirty').replace(/\b12\b/g, 'twelve').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().split(' ');
  const sentence = 'Today we are testing local transcription in the screen recorder. The meeting starts at nine thirty on Friday. Please save twelve recordings and send the notes to Thomas. Our next step is to compare the tiny model with the base model.';
  const expected = canonical(Array(result.speechRepetitions).fill(sentence).join(' '));
  const actual = canonical(result.metrics.segments.map(item => item.text).join(' '));
  let distance = Array.from({ length: actual.length + 1 }, (_, i) => i);
  for (let i = 1; i <= expected.length; i++) {
    const next = [i];
    for (let j = 1; j <= actual.length; j++) next[j] = Math.min(distance[j] + 1, next[j - 1] + 1, distance[j - 1] + Number(expected[i - 1] !== actual[j - 1]));
    distance = next;
  }
  result.normalizedWordErrors = distance[actual.length];
  result.expectedWords = expected.length;
  result.recognizedWords = actual.length;
  result.wordErrorRate = result.normalizedWordErrors / expected.length;
  result.captureLifecyclePassed = !result.forcedStop && !result.error && result.microphoneRequests === 1 && result.tracksEnded && !result.metrics.incomplete && result.metrics.maxQueue <= 3;
  const heaps = result.samples.map(item => item.heap).filter(value => value !== null);
  result.mainThreadHeap = { start: heaps[0], max: Math.max(...heaps), end: heaps.at(-1), excludesWorkerWASMAndMedia: true };
  // Save small measurements before large media/PCM exports: a full disk must
  // not erase the accuracy evidence for an otherwise completed test.
  const { videoURL, audioURL, pcmURL, ...report } = result;
  const reportDownload = page.waitForEvent('download');
  await page.evaluate(report => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'endurance-report.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, report);
  await (await reportDownload).saveAs(`output/transcription-benchmark/endurance-${result.runName}-report.json`);
  for (const [url, filename] of [[videoURL, `endurance-${result.runName}-video.webm`], [audioURL, `endurance-${result.runName}-audio.webm`]]) {
    if (!url) throw new Error('Recorded media missing');
    const pending = page.waitForEvent('download');
    await page.evaluate(({ url, filename }) => { const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); }, { url, filename });
    await (await pending).saveAs(`output/transcription-benchmark/${filename}`);
  }
  if (pcmURL) {
    const pending = page.waitForEvent('download');
    await page.evaluate(({ url, name }) => { const link = document.createElement('a'); link.href = url; link.download = name; link.click(); }, { url: pcmURL, name: `endurance-${result.runName}-windows.f32` });
    await (await pending).saveAs(`output/transcription-benchmark/endurance-${result.runName}-windows.f32`);
    await page.evaluate(url => URL.revokeObjectURL(url), pcmURL);
  }
  if (!result.captureLifecyclePassed) throw new Error(`Capture/queue regression; see endurance-${result.runName}-report.json`);
  if (result.snrDB === null && (result.normalizedWordErrors || result.metrics.segments.some(item => !item.final || item.boundaryReview || item.recognitionReview))) throw new Error(`Quiet reference regression; see endurance-${result.runName}-report.json`);
  return {
    done: true, automaticStop: !result.forcedStop, captureSeconds: result.captureEndedAt,
    windows: result.metrics.windows.length, maxQueue: result.metrics.maxQueue, incomplete: result.metrics.incomplete,
    joinsFlagged: result.metrics.segments.filter(item => item.boundaryReview).length,
    recognitionReviews: result.metrics.segments.filter(item => item.recognitionReview).length,
    retriedWindows: result.metrics.windows.filter(item => item.retried).map(item => item.id),
    expectedWords: result.expectedWords, recognizedWords: result.recognizedWords, wordErrorRate: result.wordErrorRate,
    microphoneRequests: result.microphoneRequests, tracksEnded: result.tracksEnded,
    videoBytes: result.videoBytes, framesDrawn: result.framesDrawn, mainThreadHeap: result.mainThreadHeap, error: result.error,
  };
}
