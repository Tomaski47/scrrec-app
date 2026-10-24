async(page)=>{
 if(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(page.url()))throw new Error('Localhost only.');
 await page.waitForFunction(()=>window.recorderTest?.resultCount>=2,undefined,{timeout:60000});
 await page.getByRole('button',{name:'Stop Recording',exact:true}).click();
 await page.locator('.speech-title > span').getByText('Finished',{exact:true}).waitFor({timeout:60000});
 await page.waitForFunction(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('scrrec-local-sessions',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction(['recordings','transcripts'],'readonly'),filesRequest=tx.objectStore('recordings').getAll();const textsRequest=tx.objectStore('transcripts').getAll(); tx.oncomplete=()=>{const files=filesRequest.result;const texts=textsRequest.result; db.close();resolve(files.length===2&&files.every(file=>file.finished)&&texts[0]?.finished);};tx.onabort=()=>{db.close();reject(tx.error);};};}));
 const before=await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('scrrec-local-sessions',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const tx=db.transaction(['recordings','chunks','transcripts'],'readonly');
  const read=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const [files,chunks,texts]=await Promise.all([read(tx.objectStore('recordings').getAll()),read(tx.objectStore('chunks').getAll()),read(tx.objectStore('transcripts').getAll())]); db.close();
  const media=await Promise.all(files.map(async file=>({id:file.id,sessionId:file.sessionId,kind:file.kind,bytes:file.blob.size,finished:file.finished,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')})));
  window.autosaveExpected={media,text:texts[0].blocks.map(b=>b.text).join('')+texts[0].draft};
  window.recorderTest.draws?.forEach(clearInterval); await Promise.all(window.recorderTest.contexts.map(context=>context.close()));
  return {media,chunkRows:chunks.length,transcripts:texts.length,textCharacters:window.autosaveExpected.text.length,windows:texts[0].stats.windows,finished:texts[0].finished};
 });
 if(before.media.length!==2||before.chunkRows||before.transcripts!==1||!before.finished||before.textCharacters<40)throw new Error(JSON.stringify(before));
 await page.reload();
 await page.getByRole('region',{name:'Recordings and transcripts',exact:true}).waitFor();
 const after=await page.evaluate(async()=>{
  const media=await Promise.all(Array.from(document.querySelectorAll('audio,video')).map(async player=>({type:player.tagName,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch(player.src)).arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')})));
  const audio=document.querySelector('audio');audio.muted=true;await audio.play();audio.pause();const video=document.querySelector('video');video.muted=true;await video.play();video.pause();
  return {media,text:document.querySelector('.transcript-text')?.textContent,deviceRequests:window.recorderTest.calls.length,workerLoads:window.recorderTest.loads??0,model:document.querySelector('.speech-expand')?.getAttribute('aria-label'),partialWarnings:document.body.innerText.includes('Partial recording.'),videoWidth:video.videoWidth,audioError:audio.error?.message??null};
 });
 if(after.deviceRequests||after.workerLoads||after.partialWarnings||!after.videoWidth||after.audioError||after.media.some(file=>!before.media.some(original=>original.hash===file.hash)))throw new Error(JSON.stringify(after));
 // Compare exported text after restoring, avoiding timestamps and draft UI labels.
 await page.getByRole('button',{name:'Save JSON',exact:true}).click();
 await page.waitForFunction(()=>window.recorderTest.exports.length===1);
 const restoredText=await page.evaluate(()=>window.recorderTest.exports[0].text);
 const expected=await page.evaluate(async()=>{const r=indexedDB.open('scrrec-local-sessions',1);return await new Promise((resolve,reject)=>{r.onsuccess=()=>{const db=r.result,request=db.transaction('transcripts','readonly').objectStore('transcripts').getAll();request.onsuccess=()=>{const t=request.result[0];db.close();resolve((t.blocks.map(b=>b.text).join('')+t.draft).trim());};request.onerror=()=>reject(request.error);};});});
 if(restoredText!==expected)throw new Error('Restored transcript text differs');
 return {before,after,restoredTextMatches:true};
}
