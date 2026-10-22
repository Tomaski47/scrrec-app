async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Synthetic audio is localhost-only.');
  await page.getByRole('button', { name: 'Record + transcribe' }).waitFor();
  if (await page.getByRole('button', { name: 'Record + transcribe' }).isDisabled()) throw new Error('Load the real model first.');
  await page.locator('#file').setInputFiles('output/transcription-benchmark/reference.wav');
  await page.evaluate(async () => {
    const bytes = await document.querySelector('#file').files[0].arrayBuffer();
    window.transcriptionFixture = { requests: 0, contexts: [], streams: [] };
    navigator.mediaDevices.getUserMedia = async () => {
      window.transcriptionFixture.requests++;
      const context = new AudioContext(); await context.resume();
      const buffer = await context.decodeAudioData(bytes.slice(0));
      const input = context.createBufferSource(); input.buffer = buffer;
      const destination = context.createMediaStreamDestination(); input.connect(destination); input.start(context.currentTime + 0.1);
      window.transcriptionFixture.contexts.push(context); window.transcriptionFixture.streams.push(destination.stream);
      return destination.stream;
    };
  });
  await page.getByRole('button', { name: 'Record + transcribe' }).click();
  await page.waitForTimeout(14_000);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page.waitForFunction(() => /finished|incomplete/.test(document.querySelector('#transcript-state').textContent), null, { timeout: 45_000 });
  const live = JSON.parse(await page.locator('#metrics').textContent());
  if (!live.segments.length || live.incomplete || live.maxQueue > 3) throw new Error(`Live transcription failed: ${await page.locator('#status').innerText()}`);
  const canonical = text => text.toLowerCase().replace(/\b9[.:]30\b/g, 'nine thirty').replace(/\b12\b/g, 'twelve').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const expected = 'Today we are testing local transcription in the screen recorder. The meeting starts at nine thirty on Friday. Please save twelve recordings and send the notes to Thomas. Our next step is to compare the tiny model with the base model.';
  const recognized = live.segments.map(item => item.text).join(' ');
  if (canonical(recognized) !== canonical(expected)) throw new Error(`Reference words changed at a boundary: ${recognized}`);
  if (live.segments.some(item => !item.final || item.boundaryReview)) throw new Error('Transcript retained a draft or uncertain boundary after Stop.');
  if (!live.windows.some(item => item.overlap > 0)) throw new Error('The test did not exercise overlapping inference.');
  const fixture = await page.evaluate(() => ({ requests: window.transcriptionFixture.requests, ended: window.transcriptionFixture.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')) }));
  if (fixture.requests !== 1 || !fixture.ended) throw new Error('Transcription opened another microphone or leaked media tracks.');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download transcript + measurements' }).click();
  await (await pending).saveAs('output/transcription-benchmark/tiny-live.json');
  // Cancel the model during a second recording: MediaRecorder must keep running.
  await page.getByRole('button', { name: 'Record + transcribe' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Unload / cancel transcription' }).click();
  if (await page.getByRole('button', { name: 'Stop recording', exact: true }).isDisabled()) throw new Error('Cancelling transcription stopped recording.');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#recording audio').length === 2);
  const audio = await page.locator('#recording audio').evaluateAll(items => Promise.all(items.map(async item => {
    const blob = await (await fetch(item.src)).blob();
    item.muted = true; await item.play();
    return { bytes: blob.size, type: blob.type };
  })));
  if (audio.some(file => file.bytes < 1000)) throw new Error('Recording was empty after ASR cancellation.');
  await page.evaluate(() => Promise.all(window.transcriptionFixture.contexts.map(c => c.close())));
  return { live, fixture, cancellationKeepsRecording: true, retainedRecordings: audio };
}
