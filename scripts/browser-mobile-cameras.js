async (page) => {
  // Run after browser-setup.js, last in this isolated browser session.
  // Simulates an iPad desktop user agent and two real camera IDs.
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  await page.reload();
  await page.getByRole('button', { name: 'Start Recording', exact: true }).waitFor();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15' });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    navigator.mediaDevices.enumerateDevices = async () => [
      { deviceId: 'front-real-id', kind: 'videoinput', groupId: 'front', label: 'Audit Front Camera' },
      { deviceId: 'rear-real-id', kind: 'videoinput', groupId: 'rear', label: 'Audit Rear Camera' },
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
  await page.getByRole('button', { name: 'Start Recording', exact: true }).click();
  await page.locator('.recording-timer').waitFor();
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: 'Stop Recording', exact: true }).click();
  await ready();
  check(await page.locator('video').count() === 1, 'Mobile selection did not produce exactly one camera recording');
  const result = await page.locator('video').evaluate(async video => ({ type: (await (await fetch(video.src)).blob()).type, bytes: (await (await fetch(video.src)).blob()).size }));
  check(result.bytes > 0, 'Mobile camera output was empty');
  return { singleCameraSelection: 'pass', iPadDesktopUserAgent: 'pass', recording: result };
}
