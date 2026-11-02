import { EventEmitter } from 'node:events';
import { LIMITS, type ClipMetadata, type Phrase } from '@signcast/shared';
export class Clip extends EventEmitter {
  chunks: Buffer[] = [];
  readers = 0;
  meta: ClipMetadata;
  beforeAppend?: (bytes: number) => void;
  constructor(phrase: Phrase, demo: boolean) {
    super();
    this.meta = {
      ...phrase,
      status: 'rendering',
      mimeCodec: 'video/mp4; codecs="avc1.4D4028"',
      bytes: 0,
      demo,
    };
    this.setMaxListeners(60);
  }
  append(data: Buffer) {
    if (this.meta.status !== 'rendering') return;
    if (this.meta.bytes + data.length > LIMITS.clipBytes) throw new Error('clip_too_large');
    this.beforeAppend?.(data.length);
    this.meta.bytes += data.length;
    this.meta.firstFragmentAt ??= Date.now();
    this.chunks.push(data);
    this.emit('chunk', data);
  }
  complete() {
    if (this.meta.status !== 'rendering') return;
    this.meta.status = 'complete';
    this.meta.completedAt = Date.now();
    this.emit('done');
  }
  fail() {
    if (this.meta.status !== 'rendering') return;
    this.meta.status = 'failed';
    this.emit('failed');
  }
}
export class MediaStore {
  clips = new Map<string, Clip>();
  add(phrase: Phrase, demo: boolean) {
    this.sweep();
    const clip = new Clip(phrase, demo);
    clip.beforeAppend = (bytes) => {
      this.sweep(Date.now(), bytes);
      if (this.bytes() + bytes > LIMITS.mediaBytes) throw new Error('media_capacity');
    };
    this.clips.set(phrase.id, clip);
    return clip;
  }
  get(id: string) {
    this.sweep();
    return this.clips.get(id);
  }
  sweep(now = Date.now(), incomingBytes = 0) {
    for (const [id, c] of this.clips)
      if (
        c.meta.status !== 'rendering' &&
        !c.readers &&
        now - (c.meta.completedAt || c.meta.createdAt) > LIMITS.mediaTtlMs
      )
        this.clips.delete(id);
    const completed = () => [...this.clips.values()].filter((c) => c.meta.status !== 'rendering');
    while (
      completed().length > LIMITS.maxClips ||
      this.bytes() + incomingBytes > LIMITS.mediaBytes
    ) {
      const victim = completed().find((c) => !c.readers);
      if (!victim) break;
      this.clips.delete(victim.meta.id);
    }
  }
  bytes() {
    return [...this.clips.values()].reduce((n, c) => n + c.meta.bytes, 0);
  }
  clear() {
    for (const c of this.clips.values()) c.fail();
    this.clips.clear();
  }
}
