import { afterEach, describe, expect, it, vi } from 'vitest';
import { Channel } from '../../apps/server/src/channel';
import { AudioQueue, transcribeSegment } from '../../apps/server/src/providers/speech';
import type { Phrase } from '@signcast/shared';
const rooms: Channel[] = [];
afterEach(() => {
  for (const r of rooms.splice(0)) r.dispose();
  vi.useRealTimers();
});
const phrase = (room: Channel, id: string): Phrase => ({
  id,
  text: 'Repeated words.',
  audioStartMs: Date.now() - 1000,
  audioEndMs: Date.now(),
  createdAt: Date.now(),
  epoch: room.epoch,
});
describe('shared scheduler', () => {
  it('allows one in-flight render and pauses signing after three overload drops', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const room = new Channel(
      '100',
      'test',
      {
        preflight: async () => {},
        render: async () => {
          calls++;
          await new Promise<void>((resolve) => (release = resolve));
        },
      },
      true,
    );
    rooms.push(room);
    room.start();
    room.enqueue(phrase(room, 'first'));
    for (let i = 0; i < 7; i++) room.enqueue(phrase(room, String(i)));
    expect(calls).toBe(1);
    expect(room.queue.length).toBeLessThanOrEqual(3);
    expect(room.session.signingPaused).toBe(true);
    expect(room.session.skipped).toBe(3);
    release();
    await new Promise((r) => setTimeout(r, 0));
  });
  it('does not automatically retry a potentially billed render failure', async () => {
    let calls = 0;
    const room = new Channel(
      '100',
      'test',
      {
        preflight: async () => {},
        render: async () => {
          calls++;
          throw new Error('signvrse_interrupted');
        },
      },
      false,
    );
    rooms.push(room);
    room.start();
    room.enqueue(phrase(room, 'one'));
    room.enqueue(phrase(room, 'two'));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(1);
    expect(room.session.signingPaused).toBe(true);
    expect(room.session.providers.signvrse).toBe('error');
  });
  it('final result identity deduplicates while repeated words at a new identity render again', async () => {
    let calls = 0;
    const room = new Channel(
      '100',
      'test',
      {
        preflight: async () => {},
        render: async (clip) => {
          calls++;
          clip.append(Buffer.from('fixture'));
        },
      },
      true,
    );
    rooms.push(room);
    room.start();
    const segment = {
      id: 'a',
      text: 'Hello.',
      final: true,
      audioStartMs: 0,
      audioEndMs: 1000,
      createdAt: Date.now(),
    };
    room.transcript(segment);
    room.transcript(segment);
    room.transcript({ ...segment, id: 'b', audioStartMs: 1000, audioEndMs: 2000 });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
  });
});
describe('AWS streaming boundaries', () => {
  it('keeps interim and final IDs stable for final-only dispatch', () => {
    const partial = transcribeSegment(
      {
        ResultId: 'id',
        IsPartial: true,
        StartTime: 1,
        EndTime: 2,
        Alternatives: [{ Transcript: 'Hello' }],
      },
      1000,
    )!;
    const final = transcribeSegment(
      {
        ResultId: 'id',
        IsPartial: false,
        StartTime: 1,
        EndTime: 2,
        Alternatives: [{ Transcript: 'Hello.' }],
      },
      1000,
    )!;
    expect(partial.id).toBe(final.id);
    expect(partial.final).toBe(false);
    expect(final.final).toBe(true);
    expect(final.audioStartMs).toBe(2000);
    expect(final.audioEndMs).toBe(3000);
  });
  it('rejects more than one second of unsent audio', () => {
    const q = new AudioQueue();
    q.push(Buffer.alloc(32000));
    expect(() => q.push(Buffer.alloc(2))).toThrow('speech_audio_backlog');
    q.end();
  });
  it('streams audio and wakes a pending consumer on close', async () => {
    const q = new AudioQueue(),
      iterator = q[Symbol.asyncIterator]();
    const first = iterator.next();
    q.push(Buffer.alloc(3200));
    expect((await first).value).toHaveProperty('AudioEvent');
    const final = iterator.next();
    q.end();
    expect((await final).done).toBe(true);
  });
});
