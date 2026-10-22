async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Generated media is localhost-only.');
  await page.unroute('**/worker-*.js');
  page.once('dialog', dialog => dialog.accept()); await page.reload();
  await page.getByRole('checkbox', { name: 'Local transcription' }).check();
  await page.getByText('Ready to transcribe', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('checkbox', { name: 'Mic', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Camera', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Screen', exact: true }).check();
  await page.getByRole('combobox', {name:'Microphone quality', exact:true}).selectOption('low');
  await page.getByRole('button', {name:'Start Recording', exact:true}).click();
  await page.locator('.recording-timer').waitFor(); await page.waitForTimeout(14000);
  await page.getByRole('button', {name:'Stop Recording', exact:true}).click();
  await page.waitForFunction(() => document.querySelector('.speech-title > span')?.textContent === 'Finished', undefined, { timeout: 60000 });
  const firstDownload = page.waitForEvent('download'); await page.getByRole('button', {name:'Save JSON',exact:true}).click();
  await (await firstDownload).saveAs('output/transcription-benchmark/integrated-short-transcript.json');
  const firstText = await page.locator('.transcript-text').textContent();
  if (!firstText.includes('send the notes to Thomas') || !firstText.includes('tiny model with the base model')) throw new Error(`Boundary regression: ${firstText}`);
  await page.getByRole('button', {name:'Start Recording',exact:true}).click();
  await page.locator('.recording-timer').waitFor(); await page.waitForTimeout(3000);
  await page.getByRole('button', {name:'Stop transcription',exact:true}).click();
  if (!await page.locator('.recording-timer').count() || await page.getByRole('button',{name:'Stop Recording',exact:true}).isDisabled()) throw new Error('Cancelling ASR stopped recording.');
  await page.waitForTimeout(1500); await page.getByRole('button',{name:'Stop Recording',exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll('.recording-card').length === 6 && ![...document.querySelectorAll('button')].find(button => button.textContent === 'Start Recording').disabled);
  const result = await page.evaluate(async () => {
    const state = window.recorderTest;
    const media = await Promise.all([...document.querySelectorAll('audio,video')].map(async player => { player.muted=true; await player.play(); player.pause(); return { kind:player.tagName,ready:player.readyState,error:player.error?.message??null }; }));
    (state.draws||[]).forEach(clearInterval); await Promise.all(state.contexts.map(context=>context.state==='closed'?Promise.resolve():context.close()));
    return { media, calls:state.calls, allTracksEnded:state.tracks.every(track=>track.readyState==='ended'), transcriptStates:[...document.querySelectorAll('.speech-title > span')].map(node=>node.textContent), transcriptLinks:[...document.querySelectorAll('.recording-library a')].map(link=>link.hash), speechAssets:performance.getEntriesByType('resource').filter(entry=>/worker-|capture.worklet|transformers/.test(entry.name)).map(entry=>entry.name) };
  });
  if (result.transcriptStates.join(',') !== 'Incomplete,Finished' || new Set(result.transcriptLinks).size !== 2 || !result.allTracksEnded || result.media.some(file=>file.error)) throw new Error(JSON.stringify(result));
  const report = page.waitForEvent('download');
  await page.evaluate(result=>{const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='integrated-cancellation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},result);
  await (await report).saveAs('output/transcription-benchmark/integrated-cancellation.json');
  return result;
}
