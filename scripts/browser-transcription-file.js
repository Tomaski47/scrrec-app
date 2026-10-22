async (page) => {
  // Four generated reference copies exercise the completed-file chunking path.
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Generated reference is localhost-only.');
  await page.locator('#file').setInputFiles('output/transcription-benchmark/reference-four.wav');
  await page.getByRole('button', { name: 'Transcribe selected file locally' }).click();
  await page.waitForFunction(() => {
    const m = JSON.parse(document.querySelector('#metrics').textContent);
    return m.source === 'reference-four.wav' && m.windows.length === 1 && /finished/.test(document.querySelector('#transcript-state').textContent);
  }, null, { timeout: 55_000 });
  const metrics = JSON.parse(await page.locator('#metrics').textContent());
  const canonical = text => text.toLowerCase().replace(/\b9[.:]?30\b/g, 'nine thirty').replace(/\b12\b/g, 'twelve').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const reference = 'Today we are testing local transcription in the screen recorder. The meeting starts at nine thirty on Friday. Please save twelve recordings and send the notes to Thomas. Our next step is to compare the tiny model with the base model.';
  const text = metrics.segments.map(segment => segment.text).join(' ');
  if (canonical(text) !== canonical(Array(4).fill(reference).join(' '))) throw new Error(`Completed file lost reference words: ${text}`);
  if (metrics.incomplete || metrics.segments.some(segment => !segment.final || segment.recognitionReview)) throw new Error('File transcription retained an incomplete or uncertain result.');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download transcript + measurements' }).click();
  await (await pending).saveAs(`output/transcription-benchmark/tiny-file-${metrics.preview}-${/Firefox/.test(metrics.userAgent) ? 'firefox' : 'chromium'}.json`);
  return { duration: metrics.windows[0].end, inferenceMs: metrics.windows[0].inferenceMs, referenceWords: 164, exactMatch: true, runtime: metrics.runtime };
}
