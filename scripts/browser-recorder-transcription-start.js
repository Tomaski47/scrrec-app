async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Generated media is localhost-only.');
  const plannedSeconds = await page.evaluate(() => window.recorderTest.duration || 1805);
  await page.getByRole('button', { name: 'Model ready', exact: true }).waitFor({ timeout: 120000 });
  await page.getByRole('checkbox', { name: 'Mic', exact: true }).check();
  await page.getByRole('combobox', { name: 'Microphone quality', exact: true }).selectOption('low');
  await page.getByRole('checkbox', { name: 'Camera', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Screen', exact: true }).check();
  await page.evaluate(() => { window.recorderTest.startCalls = window.recorderTest.calls.length; });
  await page.getByRole('button', { name: 'Start Recording', exact: true }).click();
  await page.getByRole('button', { name: 'Stop transcription', exact: true }).waitFor();
  await page.evaluate(seconds => {
    const state = window.recorderTest;
    state.began = performance.now();
    state.plannedSeconds = seconds;
    state.sample = () => {
      state.samples.push({ elapsed: (performance.now() - state.began) / 1000, heap: performance.memory?.usedJSHeapSize ?? null,
        windows: state.resultCount || 0, lastResults: state.results, frames: state.frames,
        recording: document.querySelector('.recording-timer')?.textContent, mediaBytesText: document.querySelector('.recording-size')?.textContent,
        draftChars: document.querySelector('.speech-draft')?.textContent.length || 0, visibleParagraphs: document.querySelectorAll('.transcript-text p').length,
        status: document.querySelector('.speech-status')?.textContent });
    };
    state.sample(); state.monitor = setInterval(state.sample, 60000);
    state.deadline = setTimeout(() => {
      state.speechInput.stop();
      document.querySelectorAll('button').forEach(button => { if (button.textContent === 'Stop Recording') button.click(); });
      state.sample(); clearInterval(state.monitor);
    }, seconds * 1000);
  }, plannedSeconds);
  return { started: true, plannedSeconds, calls: await page.evaluate(() => window.recorderTest.calls.slice(window.recorderTest.startCalls)) };
}
