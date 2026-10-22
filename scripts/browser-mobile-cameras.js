async (page) => {
  // Run after browser-setup.js, last in this isolated browser session.
  // Simulates an iPad desktop user agent and two real camera IDs.
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const clear = page.getByRole('button', { name: 'Clear All', exact: true });
  if (await clear.count()) {
    await clear.click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.recording-library'));
  }
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15' });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Start Recording', exact: true }).waitFor();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15' });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    navigator.mediaDevices.enumerateDevices = async () => [
      { deviceId: 'front-real-id', kind: 'videoinput', groupId: 'front', label: 'Audit Front Camera' },
      { deviceId: 'rear-real-id', kind: 'videoinput', groupId: 'rear', label: 'Audit Rear Camera' },
      { deviceId: 'default', kind: 'audioinput', groupId: 'mic', label: 'Default Audit Mic' },
    ];
  });
  const ready = () => page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Start Recording')?.disabled);
  await page.getByRole('checkbox', { name: 'Camera', exact: true }).click();
  await page.getByRole('checkbox', { name: /Front Camera/ }).waitFor();
  await ready();
  await page.getByRole('checkbox', { name: /Rear Camera/ }).click();
  await ready();
  check(!await page.getByRole('checkbox', { name: /Front Camera/ }).isChecked(), 'Selecting rear kept the front camera active');
  await page.getByRole('checkbox', { name: /Front Camera/ }).click();
  await ready();
  check(!await page.getByRole('checkbox', { name: /Rear Camera/ }).isChecked(), 'Selecting front kept the rear camera active');
  await page.getByRole('checkbox', { name: 'Mic', exact: true }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('label')).find(label => label.textContent.trim() === 'Mic')?.querySelector('input')?.checked);
  await page.getByRole('button', { name: 'Start Recording', exact: true }).click();
  await page.locator('.recording-timer').waitFor();
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: 'Stop Recording', exact: true }).click();
  await ready();
  check(await page.locator('video').count() === 1, 'Mobile selection did not produce exactly one camera recording');
  const result = await page.locator('video').evaluate(async video => ({ type: (await (await fetch(video.src)).blob()).type, bytes: (await (await fetch(video.src)).blob()).size }));
  check(result.bytes > 0, 'Mobile camera output was empty');
  check(result.type.startsWith('video/mp4'), 'Apple mobile video did not prefer MP4');
  check(await page.locator('audio').count() === 1, 'Separate mobile microphone output missing');
  const files = [];
  for (const card of await page.locator('.recording-card').all()) {
    const pending = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    const download = await pending;
    const path = `output/playwright/mobile-${download.suggestedFilename()}`;
    await download.saveAs(path);
    check(await download.failure() === null, 'Native mobile container download failed');
    files.push(path);
  }
  check(files.some(path => path.endsWith('.mp4')) && files.some(path => path.endsWith('.m4a')), 'Mobile download extensions mismatch');
  const playback = await page.locator('video,audio').evaluateAll(media => Promise.all(media.map(item => new Promise((resolve, reject) => {
    item.muted = true;
    item.onended = () => resolve('ended');
    item.onerror = () => reject(new Error('Mobile container playback failed'));
    item.play().catch(reject);
  }))));
  return { singleCameraSelection: 'pass', iPadDesktopUserAgent: 'pass', recording: result, files, playback };
}
