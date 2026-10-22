async (page) => {
  // Run after browser-setup.js in an isolated Playwright CLI session.
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = {};
  await page.addInitScript(() => {
    const Native = window.MediaRecorder;
    window.auditRecorders = [];
    window.MediaRecorder = class extends Native {
      constructor(stream, options) {
        super(stream, options);
        window.auditRecorders.push({ instance: this, options, audioTracks: stream.getAudioTracks().length });
      }
    };
  });
  const reset = async () => {
    const clear = page.getByRole('button', { name: 'Clear All', exact: true });
    if (await clear.count()) {
      await clear.click();
      await page.getByRole('button', { name: 'Yes', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.recording-library'));
    }
    await page.reload();
  };
  await reset();
  const start = () => page.getByRole('button', { name: 'Start Recording', exact: true });
  const stop = () => page.getByRole('button', { name: 'Stop Recording', exact: true });
  const dismiss = async () => { await page.getByRole('button', { name: 'OK', exact: true }).click(); };
  const finish = async () => {
    await stop().click();
    await page.waitForFunction(() => !document.querySelector('.recording-timer'));
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Start Recording')?.disabled);
  };
  await start().click();
  check(await page.getByRole('dialog').isVisible(), 'No-source notice missing');
  await dismiss();
  await page.getByRole('checkbox', { name: 'Screen', exact: true }).check();
  await start().click();
  await page.waitForTimeout(1300);
  await finish();
  await page.locator('video').waitFor();
  const first = await page.locator('video').getAttribute('src');
  results.firstBytes = await page.evaluate(async url => (await (await fetch(url)).blob()).size, first);
  check(results.firstBytes > 0, 'Empty screen recording');
  await page.evaluate(() => { window.audit.deny = true; });
  await start().click();
  await dismiss();
  check(await page.evaluate(async url => (await fetch(url)).ok, first), 'Prior recording invalidated by cancelled capture');
  await page.getByRole('checkbox', { name: 'Screen', exact: true }).uncheck();
  check(await page.locator('video').count() === 1, 'Changing sources hid completed recording');
  await page.getByRole('checkbox', { name: 'Screen', exact: true }).check();
  await page.evaluate(() => { window.audit.deny = false; window.audit.delay = 600; });
  await start().click();
  check(await start().isDisabled(), 'Start is not locked while acquiring');
  await page.waitForTimeout(1900);
  await finish();
  check(await page.locator('video').count() === 2, 'New recording replaced previous output');
  results.retentionAndStartup = 'pass';
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  const download = await downloadPromise;
  check(await download.failure() === null, 'Download failed');
  check(await page.getByRole('button', { name: 'Download again', exact: true }).count() === 1, 'Download status misleading');
  results.download = download.suggestedFilename();
  await page.getByRole('button', { name: 'Privacy Policy', exact: true }).click();
  check(await page.getByRole('dialog').evaluate(d => d.contains(document.activeElement)), 'Dialog focus not contained');
  await page.keyboard.press('Escape');
  check(await page.getByRole('dialog').count() === 0, 'Escape did not dismiss dialog');
  check(await page.getByRole('button', { name: 'Privacy Policy', exact: true }).evaluate(b => b === document.activeElement), 'Dialog did not restore focus');
  results.dialog = 'pass';
  await page.evaluate(() => { window.audit.delay = 0; });
  await start().click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const tracks = window.audit.streams.flatMap(s => s.getVideoTracks()).filter(t => t.readyState === 'live'); tracks[0].stop(); tracks[0].dispatchEvent(new Event('ended')); });
  await dismiss();
  await page.waitForFunction(() => !document.querySelector('.recording-timer'));
  results.sourceTermination = 'pass';
  await reset();
  await page.getByRole('checkbox', { name: 'Mic', exact: true }).check();
  await start().click();
  await page.waitForTimeout(1200);
  await finish();
  await page.locator('audio').waitFor();
  results.mic = await page.evaluate(async () => ({
    cameraOpened: window.audit.requests.some(r => r.kind === 'user' && r.options.video),
    requestedBitrate: window.auditRecorders[0].options.audioBitsPerSecond,
    bytes: (await (await fetch(document.querySelector('audio').src)).blob()).size,
  }));
  check(!results.mic.cameraOpened && results.mic.requestedBitrate === 256000 && results.mic.bytes > 0, 'Mic permission scope or bitrate regression');
  await reset();
  await page.getByRole('checkbox', { name: 'Screen', exact: true }).check();
  await page.getByRole('button', { name: 'Add screen', exact: true }).click();
  await start().click();
  await page.getByRole('button', { name: 'Choose Screen 2', exact: true }).click();
  await page.waitForTimeout(1300);
  await finish();
  check(await page.locator('video').count() === 2, 'Two-screen acquisition failed');
  results.multiscreen = 'pass';
  await reset();
  const supportsMP4 = await page.evaluate(() => MediaRecorder.isTypeSupported('video/mp4'));
  if (supportsMP4) {
    await page.evaluate(() => { const original = MediaRecorder.isTypeSupported.bind(MediaRecorder); MediaRecorder.isTypeSupported = t => t === 'video/mp4' && original(t); });
    await page.getByRole('checkbox', { name: 'Screen', exact: true }).check();
    await start().click();
    await page.waitForTimeout(1200);
    await finish();
    await page.locator('video').waitFor();
    results.mp4Type = await page.locator('video').evaluate(async video => (await (await fetch(video.src)).blob()).type);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    results.mp4Name = (await pending).suggestedFilename();
    check(results.mp4Type.startsWith('video/mp4') && results.mp4Name.endsWith('.mp4'), 'MP4 container/extension mismatch');
  }
  await page.screenshot({ path: 'output/playwright/release-recording.png' });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/release-mobile-light.png' });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow');
  results.mobileWidth = 'pass';
  await page.evaluate(value => { window.releaseResults = value; }, results);
  return results;
}
