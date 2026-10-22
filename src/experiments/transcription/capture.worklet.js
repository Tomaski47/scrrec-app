// Downmix and transfer small PCM batches. Never retain the whole recording here.
class TranscriptionTap extends AudioWorkletProcessor {
  constructor() {
    super(); this.buffer = new Float32Array(2048); this.offset = 0;
    this.port.onmessage = () => {
      if (this.offset) this.send();
      this.port.postMessage('flushed');
    };
  }
  send() {
    const block = this.buffer.slice(0, this.offset);
    this.port.postMessage(block, [block.buffer]); this.offset = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (channels?.length) for (let i = 0; i < channels[0].length; i++) {
      this.buffer[this.offset++] = channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length;
      if (this.offset === this.buffer.length) this.send();
    }
    return true;
  }
}
registerProcessor('transcription-tap', TranscriptionTap);
