async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Localhost only.');
  await page.getByRole('button',{name:'Start Recording',exact:true}).click();
  await page.locator('.recording-timer').waitFor();await page.waitForTimeout(1200);
  await page.evaluate(()=>window.recorderTest.worker.onerror({message:'Controlled engine failure'}));
  await page.getByRole('alert').filter({hasText:'Controlled engine failure'}).waitFor();
  if(await page.getByRole('button',{name:'Stop Recording',exact:true}).isDisabled())throw new Error('Worker error stopped recording');
  if(!await page.locator('.speech-setup').evaluate(node=>node.hidden))throw new Error('Settings unexpectedly expanded');
  await page.getByRole('button',{name:'Stop Recording',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.recording-card').length===2&&[...document.querySelectorAll('button')].find(b=>b.textContent==='Start Recording').disabled===false);
  const result=await page.evaluate(async()=>{
    await Promise.all(window.recorderTest.contexts.map(c=>c.state==='closed'?Promise.resolve():c.close()));
    const playback=await Promise.all([...document.querySelectorAll('audio')].map(async p=>{p.muted=true;await p.play();p.pause();return p.error?.message??null;}));
    return {errorVisibleWithSettingsCollapsed:true,recordingSurvivedWorkerError:true,playback,
      allTracksEnded:window.recorderTest.tracks.every(t=>t.readyState==='ended')};
  });
  if(!result.allTracksEnded||result.playback.some(Boolean))throw new Error(JSON.stringify(result));
  return result;
}
