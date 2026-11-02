/** Stateful area-average resampler. Input blocks may end between output samples. */
export class PcmResampler {
  private sum = 0;
  private weight = 0;
  private output: number[] = [];
  constructor(
    private inputRate: number,
    private outputRate = 16000,
    private frameSamples = 1600,
  ) {
    if (inputRate < outputRate) throw new Error('Input sample rate must be at least 16 kHz');
  }
  push(input: Float32Array): Int16Array[] {
    const frames: Int16Array[] = [];
    const ratio = this.inputRate / this.outputRate;
    for (const value of input) {
      let remaining = 1;
      while (remaining > 1e-9) {
        const take = Math.min(remaining, ratio - this.weight);
        this.sum += value * take;
        this.weight += take;
        remaining -= take;
        if (this.weight >= ratio - 1e-9) {
          const sample = Math.max(-1, Math.min(1, this.sum / ratio));
          this.output.push(Math.round(sample * (sample < 0 ? 32768 : 32767)));
          this.sum = 0;
          this.weight = 0;
          if (this.output.length === this.frameSamples) {
            frames.push(Int16Array.from(this.output));
            this.output = [];
          }
        }
      }
    }
    return frames;
  }
}
