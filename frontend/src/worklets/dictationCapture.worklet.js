/* global AudioWorkletProcessor, registerProcessor */
// Two bounded mono blocks at most. No recording, storage, or network access.
class LocalDictationCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(4096);
    this.used = 0;
    this.inFlight = false;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'ack') this.inFlight = false;
      if (data?.type === 'stop') {
        this.stopped = true;
        // Port messages are ordered: already-sent audio, final block, barrier.
        if (this.used) this.send();
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }
  send() {
    const samples = this.samples.slice(0, this.used);
    this.port.postMessage({ type: 'audio', samples }, [samples.buffer]);
    this.inFlight = true;
    this.used = 0;
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    if (this.stopped) return false;
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      this.samples[this.used++] = sample;
      if (this.used === this.samples.length) {
        if (this.inFlight) {
          this.stopped = true;
          this.port.postMessage({ type: 'overflow' });
          return false;
        }
        this.send();
      }
    }
    return true;
  }
}
registerProcessor('local-dictation-capture', LocalDictationCapture);
