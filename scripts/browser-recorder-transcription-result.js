async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Generated media is localhost-only.');
  await page.waitForFunction(() => document.querySelector('.speech-title > span')?.textContent === 'Finished', undefined, { timeout: 90000 });
  const sessionDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
  await (await sessionDownload).saveAs('output/transcription-benchmark/integrated-long-transcript.json');
  await page.waitForFunction(() => window.recorderTest.exports.length > 0);
  const result = await page.evaluate(async () => {
    const state = window.recorderTest, session = state.exports.at(-1);
    const media = await Promise.all([...document.querySelectorAll('video,audio')].map(async player => {
      player.muted = true; await player.play(); player.pause();
      return { kind: player.tagName.toLowerCase(), readyState: player.readyState, error: player.error?.message ?? null, width: player.videoWidth ?? null, height: player.videoHeight ?? null };
    }));
    state.sample();
    (state.draws || []).forEach(clearInterval); await Promise.all(state.contexts.map(context => context.close()));
    return { plannedSeconds: state.plannedSeconds, calls: state.calls.slice(state.startCalls), allTracksEnded: state.tracks.every(track => track.readyState === 'ended'),
      samples: state.samples, windows: state.resultCount, lastResults: state.results, frames: state.frames,
      transcript: { words: session.text.trim().split(/\s+/).length, blocks: session.blocks.length, start: session.blocks[0]?.start, end: session.blocks.at(-1)?.end, finished: session.finished, incomplete: session.incomplete, stats: session.stats, textStart: session.text.slice(0,150), textEnd: session.text.slice(-220) }, media };
  });
  if (result.calls.filter(call => call.audio).length !== 1 || result.calls.filter(call => call.video).length !== 1 || result.calls.filter(call => call.type === 'display').length !== 1 || !result.allTracksEnded || result.media.length !== 3 || result.transcript.incomplete || !result.transcript.finished || result.transcript.end < result.plannedSeconds - 15) throw new Error(JSON.stringify(result));
  const evidenceDownload = page.waitForEvent('download');
  await page.evaluate(result => { const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'integrated-long-measurements.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }, result);
  await (await evidenceDownload).saveAs('output/transcription-benchmark/integrated-long-measurements.json');
  for (let index = 0; index < 3; index++) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save', exact: true }).nth(index).click();
    const file = await download;
    await file.saveAs(`output/transcription-benchmark/integrated-long-${index}.${file.suggestedFilename().split('.').at(-1)}`);
  }
  return { ...result, samples: { count: result.samples.length, first: result.samples[0], last: result.samples.at(-1) } };
}
