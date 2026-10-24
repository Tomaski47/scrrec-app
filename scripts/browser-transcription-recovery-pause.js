async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Localhost only.');
  await page.waitForFunction(() => window.recorderTest.resultCount >= 1, undefined, { timeout:45000 });
  await page.evaluate(async () => {
    window.recoveryHidden = true; document.dispatchEvent(new Event('visibilitychange'));
    await window.recoveryTapContext.suspend();
  });
  await page.getByRole('button', {name:'Resume transcription',exact:true}).waitFor();
  if (!await page.locator('.transcript-card').getByText('Paused',{exact:true}).isVisible()) throw new Error('Missing paused state');
  if (await page.getByRole('button',{name:'Stop Recording',exact:true}).isDisabled()) throw new Error('ASR interruption stopped recording');
  if (await page.getByRole('button',{name:/Transcription settings/}).getAttribute('aria-expanded') !== 'false') throw new Error('Settings should remain collapsed');
  await page.waitForTimeout(5500);
  const paused = await page.evaluate(() => ({ timer:document.querySelector('.recording-timer').textContent, resultCount:window.recorderTest.resultCount, contextState:window.recoveryTapContext.state }));
  await page.evaluate(() => { window.recoveryHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button',{name:'Resume transcription',exact:true}).waitFor({state:'hidden',timeout:10000});
  await page.locator('.transcript-card').getByText('Listening',{exact:true}).waitFor();
  return { paused, automaticResume:true, interruptionVisibleWithSettingsCollapsed:true };
}
