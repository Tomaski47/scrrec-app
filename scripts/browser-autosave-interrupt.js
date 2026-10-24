async(page)=>{
 if(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(page.url()))throw new Error('Localhost only.');
 // Invoke after the intentional active-recording reload; keeping navigation
 // separate prevents a CLI unload-dialog yield from losing this result.
 await page.getByRole('region',{name:'Recordings and transcripts',exact:true}).waitFor();
 await page.getByText(/Recovered after the page closed/).first().waitFor();
 const result=await page.evaluate(async()=>{
  const audio=document.querySelector('audio');audio.muted=true;let playable=true;
  try{await audio.play();audio.pause();}catch{playable=false;}
  return {media:document.querySelectorAll('audio,video').length,partialWarnings:Array.from(document.querySelectorAll('[role=status]')).filter(el=>el.textContent.startsWith('Partial recording.')).length,recording:!!document.querySelector('.recording-timer'),deviceRequests:window.recorderTest.calls.length,workerLoads:window.recorderTest.loads??0,text:document.querySelector('.transcript-text')?.textContent,audioPlayable:playable};
 });
 if(result.media!==2||result.partialWarnings!==2||result.recording||result.deviceRequests||result.workerLoads||!result.text?.includes('testing local transcription'))throw new Error(JSON.stringify(result));
 await page.getByRole('button',{name:'Save JSON',exact:true}).click();await page.waitForFunction(()=>window.recorderTest.exports.length===1);
 const exportWarning=await page.evaluate(()=>window.recorderTest.exports[0].text.startsWith('[Recovered transcript:'));
 if(!exportWarning)throw new Error('Recovered text export missing warning');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/autosave/partial-390.png',fullPage:true});
 await page.getByRole('button',{name:'Clear All',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();
 await page.getByRole('region',{name:'Recordings and transcripts',exact:true}).waitFor({state:'hidden'});
 return {...result,exportWarning};
}
