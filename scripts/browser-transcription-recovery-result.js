async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Localhost only.');
  await page.waitForTimeout(14500);
  await page.getByRole('button',{name:'Stop Recording',exact:true}).click();
  await page.waitForFunction(() => window.recoveryTapContext.state === 'closed' && window.recorderTest.resultCount === window.recoverySubmitted, undefined, {timeout:45000});
  await page.locator('.speech-title > span').getByText('Incomplete',{exact:true}).waitFor();
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Save JSON',exact:true}).click();
  await (await download).saveAs('output/playwright/recovery/native-context-transcript.json');
  const audio = page.locator('audio'); await audio.evaluate(async player => {player.muted=true;await player.play();player.pause();});
  const saved = page.waitForEvent('download');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await (await saved).saveAs('output/playwright/recovery/native-context-recording.webm');
  const result = await page.evaluate(async () => {
    const transcript = await window.recoveryExport;
    const gaps = transcript.interruptions;
    if (!transcript.finished || !transcript.incomplete || gaps.length !== 1 || gaps[0].end-gaps[0].start<5) throw new Error(JSON.stringify(transcript));
    if (!transcript.blocks.some(block=>block.start>gaps[0].end-0.1)) throw new Error('No recognized speech after resume');
    window.recorderTest.draws?.forEach(clearInterval);
    await Promise.all(window.recorderTest.contexts.map(c=>c.state==='closed'?Promise.resolve():c.close()));
    return { nativeContextSuspendResume:true, controlledVisibility:true, realModel:true,
      gaps, blocks:transcript.blocks.map(b=>({start:b.start,end:b.end,text:b.text})), finished:transcript.finished,
      incomplete:transcript.incomplete, allTracksEnded:window.recorderTest.tracks.every(t=>t.readyState==='ended'),
      microphoneAcquisitions:window.recorderTest.calls.filter(c=>c.type==='user'&&c.audio).length,
      windows:transcript.stats.windows, audio:{duration:document.querySelector('audio').duration,error:document.querySelector('audio').error?.message??null} };
  });
  if (!result.allTracksEnded || result.microphoneAcquisitions!==1 || result.audio.error) throw new Error(JSON.stringify(result));
  return result;
}
