async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Localhost only.');
  await page.addInitScript(() => { addEventListener('DOMContentLoaded', () => {
    const state = window.recorderTest;
    state.controlledLoads = 0;
    window.Worker = class extends EventTarget {
      onmessage = null; onerror = null;
      constructor() { super(); state.controlledWorker = this; }
      postMessage(message) {
        if (message.type === 'load') state.controlledLoads++;
        if (message.type === 'transcribe') queueMicrotask(() => this.reply({ type: 'result', id: message.id, text: ' UI fixture words.', words: [{text:' UI fixture words.', start:0, end:1}], ms:1, retried:false, review:false }));
      }
      reply(data) { this.onmessage?.({ data }); }
      terminate() { this.terminated = true; }
    };
    Object.defineProperty(navigator, 'canShare', { configurable:true, value:() => true });
    Object.defineProperty(navigator, 'share', { configurable:true, value:() => new Promise(resolve => { state.resolveShare = resolve; }) });
  }); });
  page.once('dialog', dialog => dialog.accept()); await page.reload();
  const toggle = page.getByRole('checkbox', {name:'Local transcription',exact:true});
  const start = page.getByRole('button',{name:'Start Recording',exact:true});
  const stop = page.getByRole('button',{name:'Stop Recording',exact:true});
  await page.getByRole('checkbox',{name:'Screen',exact:true}).check();
  await toggle.check();
  if (await page.evaluate(() => window.recorderTest.controlledLoads) !== 1) throw new Error('Enable did not prepare exactly once.');
  await start.click();
  await page.getByText('Transcription needs a microphone.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Back to setup',exact:true}).click();
  await page.getByRole('checkbox',{name:'Mic',exact:true}).check();
  const callsBefore = await page.evaluate(() => window.recorderTest.calls.length);
  await start.click();
  await page.getByText('Transcription is still preparing.',{exact:false}).waitFor();
  await page.evaluate(() => window.recorderTest.controlledWorker.reply({type:'ready',ms:1}));
  await page.getByRole('button',{name:'Record with transcription',exact:true}).waitFor();
  if (await page.evaluate(() => window.recorderTest.calls.length) !== callsBefore) throw new Error('Model readiness automatically started capture.');
  await page.getByRole('button',{name:'Record with transcription',exact:true}).click();
  await page.locator('.recording-timer').waitFor();
  await page.waitForTimeout(2500); await stop.click();
  await page.waitForFunction(() => document.querySelector('.speech-title > span')?.textContent === 'Finished');
  await page.locator('.recording-card').first().getByRole('button',{name:'Share',exact:true}).click();
  await start.click(); await page.locator('.recording-timer').waitFor();
  await page.waitForTimeout(2500); await stop.click();
  await page.waitForFunction(() => document.querySelectorAll('.recording-card').length === 4 && document.querySelectorAll('.speech-title > span').length === 2 && [...document.querySelectorAll('.speech-title > span')].every(node => node.textContent === 'Finished'));
  const pending = await page.locator('.recording-card button').evaluateAll(buttons => buttons.filter(b => ['Share','Sharing…'].includes(b.textContent)).map(b => b.disabled));
  if (pending.length !== 4 || !pending.every(Boolean)) throw new Error('Share lock did not cover session history.');
  await page.evaluate(() => window.recorderTest.resolveShare());
  await page.waitForFunction(() => [...document.querySelectorAll('.recording-card button')].filter(b => b.textContent === 'Share').every(b => !b.disabled));
  if (!await page.locator('.session-history').evaluate(node => !node.open)) throw new Error('Previous sessions expanded automatically.');
  await page.locator('.session-history > summary').click();
  const saved = page.waitForEvent('download');
  await page.locator('.session-history .recording-card').first().getByRole('button',{name:'Save',exact:true}).click();
  await (await saved).saveAs('output/playwright/ux5-previous-recording.webm');
  await page.getByRole('button',{name:'Turn off',exact:true}).click();
  if (await toggle.isChecked()) throw new Error('Turn off left checkbox enabled.');
  await toggle.check();
  await page.getByRole('button',{name:'Cancel preparation',exact:true}).click();
  if (await toggle.isChecked()) throw new Error('Cancel left checkbox enabled.');
  await toggle.check();
  await page.evaluate(() => window.recorderTest.controlledWorker.reply({type:'error',message:'Fixture download failure'}));
  await start.click(); await page.getByRole('button',{name:'Try again',exact:true}).click();
  if (await page.evaluate(() => window.recorderTest.controlledLoads) !== 4) throw new Error('Retry did not prepare.');
  await page.evaluate(() => window.recorderTest.controlledWorker.reply({type:'error',message:'Fixture download failure'}));
  const callsBeforeFallback = await page.evaluate(() => window.recorderTest.calls.length);
  await start.click(); await page.getByRole('dialog',{name:'Before you record'}).waitFor();
  if (await page.evaluate(() => window.recorderTest.calls.length) !== callsBeforeFallback) throw new Error('Capture before fallback permission.');
  await page.getByRole('button',{name:'Record without transcription',exact:true}).click();
  await page.locator('.recording-timer').waitFor(); await page.waitForTimeout(2500); await stop.click();
  await page.waitForFunction(() => document.querySelectorAll('.recording-card').length === 6);
  if (await toggle.isChecked() || await page.locator('.transcript-card').count() !== 2) throw new Error('Fallback mislabeled as transcribed.');
  if (!await page.locator('.session-history').evaluate(node => !node.open)) throw new Error('New session did not collapse history.');
  const report = await page.evaluate(async () => {
    const state = window.recorderTest;
    const playback = await Promise.all([...document.querySelectorAll('audio,video')].map(async p => { p.muted=true; await p.play(); p.pause(); return {kind:p.tagName,ready:p.readyState,error:p.error?.message??null}; }));
    state.draws.forEach(clearInterval); await Promise.all(state.contexts.map(c => c.state==='closed'?Promise.resolve():c.close()));
    return {controlledModel:true,loads:state.controlledLoads,recordings:playback,transcripts:document.querySelectorAll('.transcript-card').length,allTracksEnded:state.tracks.every(t => t.readyState==='ended'),displayCalls:state.calls.filter(c => c.type==='display')};
  });
  if (!report.allTracksEnded || report.displayCalls.some(c => !c.userActivation)) throw new Error(JSON.stringify(report));
  await page.evaluate(report => { window.recorderTest.uxResult = report; }, report);
  return report;
}
