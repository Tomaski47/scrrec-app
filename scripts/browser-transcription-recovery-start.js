async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Localhost only.');
  await page.getByRole('checkbox', { name:'Mic', exact:true }).check();
  await page.getByRole('checkbox', { name:'Local transcription', exact:true }).check();
  await page.getByText('Local model: loaded', { exact:true }).waitFor({ timeout:90000 });
  await page.getByRole('button', { name:'Start Recording', exact:true }).click();
  await page.locator('.recording-timer').waitFor();
  return { recording:true, model:'real Tiny/WASM', hardware:'generated source; no physical microphone acquired' };
}
