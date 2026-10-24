async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Localhost only.');
  const background = await page.evaluate(() => {
    const s = window.backgroundTest;
    return { hidden: document.hidden, seconds: (Date.now() - s.hiddenStart) / 1000, pcm: s.pcm,
      recognizedWhileHidden: s.results.filter(result => result.hidden && result.text.trim()).length,
      encoders: s.recorders.map(entry => ({ state: entry.recorder.state, hiddenChunks: entry.chunks.filter(chunk => chunk.hidden && chunk.bytes > 0).length })),
      visibility: s.visibility };
  });
  if (!background.hidden || background.seconds < 60 || background.recognizedWhileHidden < 3 || background.pcm.maxDelayMs > 3000 || background.encoders.some(encoder => encoder.state !== 'recording' || encoder.hiddenChunks < 40)) throw new Error(JSON.stringify(background));
  await page.bringToFront();
  await page.getByRole('button', { name: 'Stop Recording', exact: true }).click();
  await page.locator('.speech-title > span').getByText('Finished', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
  return page.evaluate(async background => {
    const state = window.backgroundTest, transcript = await state.export;
    if (!transcript.finished || transcript.incomplete || transcript.interruptions.length || !transcript.blocks.length) throw new Error(JSON.stringify(transcript));
    const context = new AudioContext(), audio = document.querySelector('audio');
    const decoded = await context.decodeAudioData(await (await fetch(audio.src)).arrayBuffer());
    const samples = decoded.getChannelData(0), levels = [];
    for (let start = 0; start + 5 < decoded.duration; start += 10) {
      const chunk = samples.subarray(Math.floor(start * decoded.sampleRate), Math.floor((start + 5) * decoded.sampleRate));
      levels.push({ start, rms: Math.sqrt(chunk.reduce((sum, value) => sum + value * value, 0) / chunk.length) });
    }
    await context.close();
    if (levels.some(level => level.rms < 0.005)) throw new Error('Saved audio is silent: ' + JSON.stringify(levels));
    const video = document.querySelector('video'); video.muted = true;
    await video.play(); video.pause();
    const result = { background, finished: transcript.finished, windows: transcript.stats.windows, interruptions: transcript.interruptions,
      transcriptEnd: Math.max(...transcript.blocks.map(block => block.end)), audio: { duration: decoded.duration, sampleRate: decoded.sampleRate, levels },
      video: { width: video.videoWidth, height: video.videoHeight, error: video.error?.message ?? null },
      inputTracksReleased: state.tracks.every(track => track.readyState === 'ended'),
      privateSinksReleased: state.destinations.every(stream => stream.getTracks().every(track => track.readyState === 'ended')) };
    if (!result.inputTracksReleased || !result.privateSinksReleased || result.video.error || !result.video.width) throw new Error(JSON.stringify(result));
    return result;
  }, background);
}
