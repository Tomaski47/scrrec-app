async(page)=>{
 if(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(page.url()))throw new Error('Generated-media tests are localhost-only.');
 await page.getByRole('checkbox',{name:'Mic',exact:true}).click();
 await page.getByRole('button',{name:'Refresh mics',exact:true}).waitFor();
 await page.getByRole('checkbox',{name:'Camera',exact:true}).click();
 await page.getByRole('button',{name:'Refresh cameras',exact:true}).waitFor();
 await page.getByRole('combobox',{name:/resolution$/i}).selectOption('360p');
 await page.getByRole('checkbox',{name:'Local transcription',exact:true}).click();
 await page.getByRole('button',{name:'Transcription settings. Model loaded',exact:true}).waitFor({timeout:120000});
 await page.getByRole('button',{name:'Start Recording',exact:true}).click();
 await page.locator('.recording-timer').waitFor();
 return {recording:true,model:'real Tiny/WASM',sources:'generated microphone and camera',storage:'real browser IndexedDB'};
}
