async (page) => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw new Error('Localhost only.');
  const result = await page.evaluate(async () => {
    const audio = document.querySelector('audio');
    const transcript = await window.recoveryExport;
    if (!transcript?.interruptions?.length) throw new Error('Run the recovery export check first.');
    const gap = transcript.interruptions[0];
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(await (await fetch(audio.src)).arrayBuffer());
      const samples = buffer.getChannelData(0);
      const rms = (start,end) => {
        const chunk = samples.subarray(Math.floor(start*buffer.sampleRate), Math.floor(end*buffer.sampleRate));
        return Math.sqrt(chunk.reduce((sum,value)=>sum+value*value,0)/chunk.length);
      };
      return { duration:buffer.duration, channels:buffer.numberOfChannels, sampleRate:buffer.sampleRate,
        expectedEnd:Math.max(gap.end,...transcript.blocks.map(block=>block.end)),
        before:rms(Math.max(0,gap.start-5),gap.start), during:rms(gap.start,gap.end),
        after:rms(gap.end,Math.min(buffer.duration,gap.end+5)), end:rms(Math.max(0,buffer.duration-5),buffer.duration) };
    } finally { await context.close(); }
  });
  if (result.duration<result.expectedEnd-0.5 || [result.before,result.during,result.after,result.end].some(value=>!Number.isFinite(value)||value<0.003)) throw new Error(JSON.stringify(result));
  return result;
}
