async(page)=>{
 if(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(page.url()))throw new Error('Localhost only.');
 await page.getByRole('checkbox',{name:'Mic',exact:true}).click();await page.getByRole('button',{name:'Refresh mics',exact:true}).waitFor();
 await page.getByRole('button',{name:'Start Recording',exact:true}).click();await page.locator('.recording-timer').waitFor();
 await page.waitForFunction(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('scrrec-local-sessions',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction(['recordings','transcripts'],'readonly'),filesRequest=tx.objectStore('recordings').getAll(); tx.oncomplete=()=>{const files=filesRequest.result; db.close();resolve(files.length>0);};tx.onabort=()=>{db.close();reject(tx.error);};};}));
 await page.evaluate(()=>{window.simulateStorageFull=true;const transact=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,mode,...rest){if(window.simulateStorageFull&&mode==='readwrite')throw new DOMException('Generated quota test','QuotaExceededError');return transact.call(this,stores,mode,...rest);};});
 await page.getByText(/Browser storage is full/).first().waitFor({timeout:10000});
 const recordingSurvived=await page.getByRole('button',{name:'Stop Recording',exact:true}).isEnabled();if(!recordingSurvived)throw new Error('Storage failure stopped media');
 await page.getByRole('button',{name:'Stop Recording',exact:true}).click();await page.locator('audio').waitFor();
 const playback=await page.locator('audio').evaluate(async player=>{player.muted=true;await player.play();player.pause();return !player.error;});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save',exact:true}).click();await(await download).saveAs('output/playwright/autosave/quota-recording.webm');
 await page.setViewportSize({width:320,height:800});await page.getByRole('button',{name:'Switch to light mode',exact:true}).click();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.site-intro p')).color==='rgb(21, 27, 40)');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw new Error('Error UI overflows');
 await page.screenshot({path:'output/playwright/autosave/quota-320-light.png',fullPage:true});
 await page.evaluate(()=>{window.simulateStorageFull=false;});
 await page.getByRole('button',{name:'Clear All',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();await page.locator('audio').waitFor({state:'hidden'});
 await page.addInitScript(()=>{indexedDB.open=()=>{throw new DOMException('Generated blocked-storage test','SecurityError');};});await page.reload();
 await page.getByText(/Automatic local saving is unavailable or failed/).first().waitFor();
 await page.getByRole('checkbox',{name:'Mic',exact:true}).click();await page.getByRole('button',{name:'Refresh mics',exact:true}).waitFor();
 await page.getByRole('button',{name:'Start Recording',exact:true}).click();await page.locator('.recording-timer').waitFor();
 await page.waitForTimeout(2500);await page.getByRole('button',{name:'Stop Recording',exact:true}).click();await page.locator('audio').waitFor();
 const unavailablePlayback=await page.locator('audio').evaluate(async player=>{player.muted=true;await player.play();player.pause();return !player.error;});
 return {quota:{recordingSurvived,playback,downloaded:true,overflow},unavailableStorage:{recordingAndPlayback:unavailablePlayback,warningVisible:await page.getByText(/Automatic local saving is unavailable or failed/).first().isVisible()}};
}
