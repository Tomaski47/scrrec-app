async (page) => {
  // Run after browser-setup.js. Canvas and oscillator sources; native MediaRecorder.
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const results = {};
  const clear = page.getByRole('button', { name: 'Clear All', exact: true });
  if (await clear.count()) {
    await clear.click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.recording-library'));
  }
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    const Native = MediaRecorder;
    window.combinationRecorders = [];
    window.MediaRecorder = class extends Native {
      constructor(stream, options) {
        super(stream, options);
        window.combinationRecorders.push({ video: stream.getVideoTracks().length, audio: stream.getAudioTracks().length });
      }
    };
    navigator.canShare = () => true;
    navigator.share = async () => { throw new DOMException('User cancelled', 'AbortError'); };
  });
  const start = page.getByRole('button', { name: 'Start Recording', exact: true });
  await page.getByRole('checkbox', { name: 'Camera', exact: true }).check();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Start Recording')?.disabled);
  await page.getByRole('checkbox', { name: 'Mic', exact: true }).check();
  const secondMic = page.getByRole('checkbox', { name: /Audit Mic Two/ });
  if (!await secondMic.isChecked()) await secondMic.check();
  const defaultMic = page.getByRole('checkbox', { name: /Default Audit Mic/ });
  if (!await defaultMic.isChecked()) await defaultMic.check();
  await start.click();
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: 'Stop Recording', exact: true }).click();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Start Recording')?.disabled);
  check(await page.locator('video').count() === 1, 'Camera output missing');
  check(await page.locator('audio').count() === 2, 'Independent mic outputs missing');
  results.tracks = await page.evaluate(() => window.combinationRecorders);
  check(results.tracks.every(r => r.audio === 1), 'Each output must contain one audio track');
  results.bytes = await page.locator('video, audio').evaluateAll(async media => Promise.all(media.map(async item => (await (await fetch(item.src)).blob()).size)));
  check(results.bytes.every(size => size > 0), 'Empty combination output');
  results.playback = await page.locator('video, audio').evaluateAll(media => Promise.all(media.map(item => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Playback did not finish')), 10000);
    item.onended = () => { clearTimeout(timeout); resolve('ended'); };
    item.onerror = () => { clearTimeout(timeout); reject(new Error('Playback decode failed')); };
    item.muted = true;
    item.currentTime = 0;
    item.play().catch(error => { clearTimeout(timeout); reject(error); });
  }))));
  await page.getByRole('button', { name: 'Share', exact: true }).first().click();
  check(await page.getByText('Share cancelled. Your recording is still available.', { exact: true }).isVisible(), 'Share cancellation lost or hidden');
  results.shareCancellation = 'pass';
  await clear.click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.recording-library'));
  await page.reload();
  await page.getByRole('checkbox', { name: 'Screen', exact: true }).check();
  await page.getByRole('button', { name: 'Add screen', exact: true }).click();
  await start.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel capture', exact: true }).click();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Start Recording')?.disabled);
  check(await page.evaluate(() => window.audit.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), 'Earlier screen leaked after cancellation');
  check(await page.locator('.recording-card').count() === 0, 'Cancelled startup created output');
  results.cancelSecondPicker = 'pass';
  return results;
}
