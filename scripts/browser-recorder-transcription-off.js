async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Generated media is localhost-only.');
  const speechRequests = () => page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /worker-|transformers|\.wasm|huggingface/.test(entry.name)).map(entry => entry.name));
  if (await page.getByRole('checkbox', { name: 'Local transcription Optional' }).isChecked()) throw new Error('Transcription must default off.');
  if ((await speechRequests()).length) throw new Error('Unexpected speech asset download while off.');
  await page.getByRole('checkbox', { name: 'Mic', exact: true }).check();
  await page.getByRole('button', { name: 'Start Recording', exact: true }).click();
  await page.locator('.recording-timer').waitFor();
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: 'Stop Recording', exact: true }).click();
  await page.getByRole('button', { name: 'Start Recording', exact: true }).waitFor({ state: 'visible' });
  await page.locator('audio').waitFor();
  const first = await page.locator('audio').evaluate(async audio => { await audio.play(); audio.pause(); return { ready: audio.readyState, src: audio.src }; });
  await page.getByRole('checkbox', { name: 'Local transcription Optional' }).check();
  await page.getByRole('button', { name: 'Start Recording', exact: true }).click();
  await page.locator('.recording-timer').waitFor();
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: 'Stop Recording', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('audio').length === 2 && ![...document.querySelectorAll('button')].find(button => button.textContent === 'Start Recording').disabled);
  const result = { first, recordings: await page.locator('audio').count(), transcripts: await page.locator('.transcript-card').count(), speechRequests: await speechRequests(), status: await page.locator('.speech-status').textContent(), calls: await page.evaluate(() => window.recorderTest.calls) };
  if (result.recordings !== 2 || result.transcripts || result.speechRequests.length || !result.status.includes('without transcription')) throw new Error(JSON.stringify(result));
  await page.evaluate(async () => { const state = window.recorderTest; (state.draws || []).forEach(clearInterval); await Promise.all(state.contexts.map(context => context.close())); });
  return result;
}
