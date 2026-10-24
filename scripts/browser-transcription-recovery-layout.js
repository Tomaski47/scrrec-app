async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Localhost only.');
  if (!await page.evaluate(()=>!!window.recorderTest)) throw new Error('Generated source fixture required.');
  if (await page.locator('.recording-card').count()) {
    await page.getByRole('button',{name:'Clear All',exact:true}).click();
    await page.getByRole('dialog',{name:'Clear recordings and transcripts?'}).getByRole('button',{name:'Yes',exact:true}).click();
  }
  await page.reload();
  await page.getByRole('checkbox',{name:'Mic',exact:true}).check();
  await page.getByRole('checkbox',{name:'Local transcription',exact:true}).check();
  await page.getByText('Local model: loaded',{exact:true}).waitFor({timeout:90000});
  await page.getByRole('button',{name:'Start Recording',exact:true}).click();
  await page.locator('.recording-timer').waitFor(); await page.waitForTimeout(1200);
  await page.evaluate(async()=>{
    window.recoveryHidden=true;document.dispatchEvent(new Event('visibilitychange'));
    const context=window.recoveryTapContext;window.savedResume=context.resume.bind(context);
    context.resume=()=>Promise.reject(new Error('Controlled gesture requirement'));
    await context.suspend();
  });
  await page.getByRole('button',{name:'Resume transcription',exact:true}).waitFor();
  await page.evaluate(()=>{window.recoveryHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(150);
  const layouts=[];
  for (const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    if (width===320) await page.getByRole('button',{name:'Switch to light mode',exact:true}).click();
    const layout=await page.evaluate(()=>{
      const title=document.querySelector('#speech-heading').getBoundingClientRect();
      const status=document.querySelector('.speech-model-label').getBoundingClientRect();
      const button=document.querySelector('.speech-interruption button').getBoundingClientRect();
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,titleRight:title.right,statusLeft:status.left,
        resumeLeft:button.left,resumeRight:button.right,settingsHidden:document.querySelector('.speech-setup').hidden};
    });
    if(layout.documentWidth>width||layout.titleRight>layout.statusLeft||layout.resumeLeft<0||layout.resumeRight>width||!layout.settingsHidden) throw new Error(JSON.stringify(layout));
    await page.locator('.transcription-control').screenshot({path:`output/playwright/recovery/paused-${width}.png`});layouts.push(layout);
  }
  await page.evaluate(()=>{window.recoveryTapContext.resume=window.savedResume;});
  await page.getByRole('button',{name:'Resume transcription',exact:true}).click();
  await page.getByRole('button',{name:'Resume transcription',exact:true}).waitFor({state:'hidden',timeout:10000});
  await page.locator('.transcript-card').getByText('Listening',{exact:true}).waitFor();
  await page.waitForTimeout(1200);
  await page.getByRole('button',{name:'Stop Recording',exact:true}).click();
  await page.waitForFunction(()=>window.recoveryTapContext.state==='closed'&&window.recorderTest.resultCount===window.recoverySubmitted,undefined,{timeout:45000});
  for(const name of ['TXT','JSON']){
    const saved=page.waitForEvent('download');await page.getByRole('button',{name:`Save ${name}`,exact:true}).click();
    await(await saved).saveAs(`output/playwright/recovery/manual-resume.${name.toLowerCase()}`);
  }
  const result=await page.evaluate(async(layouts)=>{
    const transcript=await window.recoveryExport;
    await Promise.all(window.recorderTest.contexts.map(c=>c.state==='closed'?Promise.resolve():c.close()));
    return {layouts,manualResume:true,finished:transcript.finished,interruptions:transcript.interruptions,exportMarksMissingSpeech:transcript.text.includes('[Possible missing speech:'),modelStatus:document.querySelector('.speech-model-label').textContent,
      allTracksEnded:window.recorderTest.tracks.every(t=>t.readyState==='ended'),
      microphoneAcquisitions:window.recorderTest.calls.filter(c=>c.type==='user'&&c.audio).length};
  }, layouts);
  if(!result.finished||!result.exportMarksMissingSpeech||!result.allTracksEnded||result.microphoneAcquisitions!==1)throw new Error(JSON.stringify(result));
  return result;
}
