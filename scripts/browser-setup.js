async (page) => {
  const target = page.url();
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(target)) throw new Error('Synthetic media tests must run on localhost.');
  await page.addInitScript(() => {
    window.audit = { streams: [], requests: [], delay: 0, deny: false };
    const videoStream = () => {
      const canvas = document.createElement('canvas'); canvas.width=640; canvas.height=360;
      const ctx=canvas.getContext('2d'); let n=0;
      setInterval(()=>{ctx.fillStyle=n++%2?'#226688':'#662288';ctx.fillRect(0,0,640,360);ctx.fillStyle='white';ctx.fillText('SYNTHETIC AUDIT '+n,30,30)},50);
      return canvas.captureStream(20);
    };
    navigator.mediaDevices.enumerateDevices = async () => [
      {deviceId:'audit-camera',kind:'videoinput',groupId:'audit',label:'Audit Camera'},
      {deviceId:'default',kind:'audioinput',groupId:'audit',label:'Default Audit Mic'},
      {deviceId:'audit-mic-2',kind:'audioinput',groupId:'audit2',label:'Audit Mic Two'}
    ];
    navigator.mediaDevices.getDisplayMedia = async options => {
      window.audit.requests.push({kind:'screen',options});
      if(window.audit.delay) await new Promise(r=>setTimeout(r,window.audit.delay));
      if(window.audit.deny) throw new DOMException('Synthetic picker cancellation','NotAllowedError');
      const stream=videoStream(); window.audit.streams.push(stream); return stream;
    };
    navigator.mediaDevices.getUserMedia = async options => {
      window.audit.requests.push({kind:'user',options});
      const stream=new MediaStream();
      if(options.video) videoStream().getTracks().forEach(t=>stream.addTrack(t));
      if(options.audio) {const ac=new AudioContext();const osc=ac.createOscillator();const dest=ac.createMediaStreamDestination();osc.connect(dest);osc.start();dest.stream.getTracks().forEach(t=>stream.addTrack(t));}
      window.audit.streams.push(stream); return stream;
    };
  });
  await page.setViewportSize({width:1280,height:900});
  await page.goto(target);
  return {title:await page.title(),browser:await page.evaluate(()=>navigator.userAgent)};
}
