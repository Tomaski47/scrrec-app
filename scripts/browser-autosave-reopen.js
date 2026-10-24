async(page)=>{
 if(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(page.url()))throw new Error('Localhost only.');
 const origin=new URL(page.url()).origin,context=page.context();
 const next=await context.newPage();
 await next.addInitScript(()=>{window.unexpectedCapture=0;window.unexpectedWorker=0;navigator.mediaDevices.getUserMedia=async()=>{window.unexpectedCapture++;throw new Error('Restore must never request hardware');};const NativeWorker=window.Worker;window.Worker=new Proxy(NativeWorker,{construct(target,args){window.unexpectedWorker++;return Reflect.construct(target,args);}});});
 await page.close(); await next.goto(origin);
 await next.getByRole('region',{name:'Recordings and transcripts',exact:true}).waitFor();
 const restored=await next.evaluate(()=>({files:document.querySelectorAll('audio,video').length,textCharacters:document.querySelector('.transcript-text')?.textContent.length??0,captureRequests:window.unexpectedCapture,workers:window.unexpectedWorker,recording:!!document.querySelector('.recording-timer')}));
 if(restored.files!==2||restored.textCharacters<40||restored.captureRequests||restored.workers||restored.recording)throw new Error(JSON.stringify(restored));
 await next.setViewportSize({width:390,height:844});
 const overflow=await next.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw new Error('Mobile overflow');
 await next.screenshot({path:'output/playwright/autosave/restored-390.png',fullPage:true});
 await next.getByRole('button',{name:'Clear All',exact:true}).click();await next.getByRole('button',{name:'Yes',exact:true}).click();
 await next.getByRole('region',{name:'Recordings and transcripts',exact:true}).waitFor({state:'hidden'});await next.reload();
 const afterClear=await next.evaluate(()=>({files:document.querySelectorAll('audio,video').length,texts:document.querySelectorAll('.transcript-card').length,captureRequests:window.unexpectedCapture,workers:window.unexpectedWorker}));
 if(afterClear.files||afterClear.texts||afterClear.captureRequests||afterClear.workers)throw new Error(JSON.stringify(afterClear));
 return {closedOldTabBeforeReopen:true,restored,mobileOverflow:overflow,afterClear};
}
