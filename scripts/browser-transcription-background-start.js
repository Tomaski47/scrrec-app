async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Generated-media tests are localhost-only.');
  await page.bringToFront();
  await page.getByRole('checkbox', { name: 'Mic', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh mics', exact: true }).waitFor();
  await page.getByRole('checkbox', { name: 'Noise suppression', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Echo cancellation', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Auto gain', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Camera', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh cameras', exact: true }).waitFor();
  await page.getByRole('combobox', { name: /resolution$/i }).selectOption('360p');
  await page.getByRole('checkbox', { name: 'Local transcription', exact: true }).click();
  await page.getByText('Local model: loaded', { exact: true }).waitFor({ timeout: 120000 });
  await page.getByRole('button', { name: 'Start Recording', exact: true }).click();
  await page.locator('.recording-timer').waitFor();
  await page.waitForFunction(() => window.backgroundTest.pcm.voiced > 10, undefined, { timeout: 10000 });
  const other = await page.context().newPage(); await other.goto('about:blank'); await other.bringToFront();
  await page.waitForFunction(() => document.hidden);
  return page.evaluate(() => {
    const state = window.backgroundTest;
    state.hiddenStart = Date.now(); state.beforeHidden = state.results.length;
    return { hidden: document.hidden, pcm: state.pcm, results: state.beforeHidden, recorders: state.recorders.length, tap: state.tap.state };
  });
}
