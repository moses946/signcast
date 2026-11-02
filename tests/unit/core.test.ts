import { describe, it, expect, vi, afterEach } from 'vitest';
import { PcmResampler } from '../../packages/shared/src/resampler';
import { PhraseAssembler } from '../../apps/server/src/phrases';
import { targetPlaybackTime, type Phrase } from '@signcast/shared';
import { MediaStore } from '../../apps/server/src/media';
const phrase = (id: string): Phrase => ({
  id,
  text: 'Hello.',
  audioStartMs: 1000,
  audioEndMs: 2000,
  createdAt: Date.now(),
  epoch: 0,
});
afterEach(() => vi.useRealTimers());
describe('PCM resampling', () => {
  for (const rate of [44100, 48000])
    it(`preserves one second at ${rate} Hz across irregular blocks`, () => {
      const converter = new PcmResampler(rate);
      const frames: Int16Array[] = [];
      let remaining = rate;
      while (remaining) {
        const n = Math.min(127, remaining);
        frames.push(...converter.push(new Float32Array(n).fill(0.5)));
        remaining -= n;
      }
      expect(frames.flatMap((f) => [...f])).toHaveLength(16000);
      expect(frames[0][0]).toBeCloseTo(16384, 0);
    });
  it('clamps PCM amplitude', () => {
    const converter = new PcmResampler(16000, 16000, 2);
    expect([...converter.push(Float32Array.from([-2, 2]))[0]]).toEqual([-32768, 32767]);
  });
});
describe('final phrase assembly', () => {
  it('ignores interim results and preserves repeated final speech', () => {
    const output: Phrase[] = [];
    const assembler = new PhraseAssembler(
      (p) => output.push(p),
      () => 0,
    );
    const item = {
      id: 'a',
      text: 'Hello.',
      final: false,
      audioStartMs: 0,
      audioEndMs: 1000,
      createdAt: 0,
    };
    assembler.push(item);
    expect(output).toHaveLength(0);
    assembler.push({ ...item, final: true });
    assembler.push({ ...item, id: 'b', final: true, audioStartMs: 1000, audioEndMs: 2000 });
    expect(output.map((p) => p.text)).toEqual(['Hello.', 'Hello.']);
    assembler.clear();
  });
  it('bounds phrase words without deleting spoken words', () => {
    const output: Phrase[] = [];
    const assembler = new PhraseAssembler(
      (p) => output.push(p),
      () => 0,
    );
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
    assembler.push({
      id: 'long',
      text: words.join(' ') + '.',
      final: true,
      audioStartMs: 0,
      audioEndMs: 10000,
      createdAt: 0,
    });
    expect(output.every((p) => p.text.split(' ').length <= 16)).toBe(true);
    expect(output.map((p) => p.text).join(' ')).toBe(words.join(' ') + '.');
  });
  it('coalesces nonterminal final fragments for 600ms', () => {
    vi.useFakeTimers();
    const output: Phrase[] = [];
    const assembler = new PhraseAssembler(
      (p) => output.push(p),
      () => 1,
    );
    assembler.push({
      id: 'a',
      text: 'Hello there',
      final: true,
      audioStartMs: 0,
      audioEndMs: 1000,
      createdAt: 0,
    });
    expect(output).toHaveLength(0);
    vi.advanceTimersByTime(600);
    expect(output[0].text).toBe('Hello there');
    expect(output[0].epoch).toBe(1);
  });
});
describe('media lifecycle', () => {
  it('enforces the global byte cap before accepting a fragment', () => {
    const store = new MediaStore();
    const clip = store.add(phrase('capacity'), false);
    vi.spyOn(store, 'bytes').mockReturnValue(128 * 1024 * 1024);
    expect(() => clip.append(Buffer.alloc(1))).toThrow('media_capacity');
    expect(clip.meta.bytes).toBe(0);
    expect(clip.chunks).toHaveLength(0);
  });
  it('keeps init bytes and all fragments for late joins and replay', () => {
    const store = new MediaStore();
    const clip = store.add(phrase('a'), false);
    clip.append(Buffer.from('init'));
    clip.append(Buffer.from('fragment'));
    clip.complete();
    expect(Buffer.concat(store.get('a')!.chunks).toString()).toBe('initfragment');
  });
  it('expires unprotected old clips', () => {
    const store = new MediaStore();
    const clip = store.add(phrase('old'), false);
    clip.complete();
    store.sweep(Date.now() + 120001);
    expect(store.get('old')).toBeUndefined();
  });
});
it('schedules viewers independently without mutating clip timing', () => {
  const clip = { audioEndMs: 1000 };
  expect(targetPlaybackTime(clip, 2, 0)).toBe(3000);
  expect(targetPlaybackTime(clip, 5, 1)).toBe(7000);
  expect(clip.audioEndMs).toBe(1000);
});
