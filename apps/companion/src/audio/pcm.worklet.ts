import { PcmResampler } from '@signcast/shared/resampler';
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
class PcmProcessor extends AudioWorkletProcessor {
  private resampler = new PcmResampler(sampleRate);
  private count = 0;
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0]?.[0];
    if (input) {
      let sum = 0;
      for (const sample of input) sum += sample * sample;
      for (const frame of this.resampler.push(input)) {
        const buffer = new ArrayBuffer(frame.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < frame.length; i++) view.setInt16(i * 2, frame[i], true);
        this.port.postMessage({ type: 'pcm', buffer }, [buffer]);
      }
      if (this.count++ % 16 === 0)
        this.port.postMessage({ type: 'level', value: Math.sqrt(sum / input.length) });
    }
    for (const output of outputs) for (const channel of output) channel.fill(0);
    return true;
  }
}
registerProcessor('signcast-pcm', PcmProcessor);
