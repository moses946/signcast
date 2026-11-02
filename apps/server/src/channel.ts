import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  LIMITS,
  type ChannelSession,
  type FeedEvent,
  type FeedSnapshot,
  type Phrase,
  type TranscriptSegment,
} from '@signcast/shared';
import { MediaStore } from './media.js';
import { PhraseAssembler } from './phrases.js';
import type { SignRenderer } from './providers/signvrse.js';
export class Channel extends EventEmitter {
  readonly media = new MediaStore();
  readonly assembler: PhraseAssembler;
  readonly transcripts: TranscriptSegment[] = [];
  session: ChannelSession;
  epoch = 0;
  queue: Phrase[] = [];
  private controller?: AbortController;
  private inFlight = false;
  private drops: number[] = [];
  private seen = new Set<string>();
  private clock: ReturnType<typeof setInterval>;
  constructor(
    channelId: string,
    displayName: string,
    private renderer: SignRenderer,
    demo: boolean,
  ) {
    super();
    this.setMaxListeners(80);
    this.session = {
      channelId,
      displayName,
      state: 'idle',
      signingPaused: false,
      queued: 0,
      skipped: 0,
      renders: 0,
      viewers: 0,
      demo,
      providers: { speech: demo ? 'demo' : 'missing', signvrse: demo ? 'demo' : 'missing' },
    };
    this.assembler = new PhraseAssembler(
      (p) => this.enqueue(p),
      () => this.epoch,
    );
    this.clock = setInterval(() => this.tick(), 1000);
    this.clock.unref();
  }
  snapshot(): FeedSnapshot {
    this.media.sweep();
    this.prune();
    return {
      serverTime: Date.now(),
      session: { ...this.session },
      clips: [...this.media.clips.values()]
        .filter((c) => c.meta.status !== 'failed')
        .map((c) => ({ ...c.meta })),
      transcripts: this.transcripts.slice(),
    };
  }
  event(event: FeedEvent) {
    this.emit('event', event);
  }
  status() {
    this.session.queued = this.queue.length;
    this.event({ type: 'status', session: { ...this.session } });
  }
  async preflight() {
    await this.renderer.preflight();
    this.session.providers.signvrse = this.session.demo ? 'demo' : 'ready';
  }
  start() {
    if (this.session.state !== 'idle') return;
    this.session.startedAt = Date.now();
    this.session.renders = 0;
    this.session.state = 'running';
    this.session.signingPaused = false;
    this.session.error = undefined;
    this.status();
  }
  pause() {
    this.session.state = 'paused';
    this.queue = [];
    this.assembler.clear();
    this.emit('capture-stop');
    this.status();
  }
  resume() {
    this.session.state = 'running';
    if (!this.session.signingPaused) this.session.error = undefined;
    this.status();
  }
  pauseSigning() {
    this.session.signingPaused = true;
    this.session.providers.signvrse = 'error';
    this.queue = [];
    this.assembler.clear();
    this.error(
      'signing_unavailable',
      'Signing is unavailable. Live captions continue. Retry signing when Signvrse is available.',
    );
  }
  resumeSigning() {
    this.session.signingPaused = false;
    this.session.error = undefined;
    this.drops = [];
    this.status();
  }
  stop() {
    this.epoch++;
    this.controller?.abort();
    this.queue = [];
    this.assembler.clear();
    this.media.clear();
    this.transcripts.splice(0);
    this.seen.clear();
    this.session.state = 'idle';
    this.session.signingPaused = false;
    this.session.error = undefined;
    this.emit('capture-stop');
    this.event({ type: 'reset' });
    this.status();
  }
  transcript(segment: TranscriptSegment) {
    if (this.session.state !== 'running') return;
    this.session.providers.speech = this.session.demo ? 'demo' : 'ready';
    if (segment.final) {
      if (this.seen.has(segment.id)) return;
      this.seen.add(segment.id);
      if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value!);
      this.transcripts.push(segment);
      this.prune();
      if (!this.session.signingPaused) this.assembler.push(segment);
    }
    this.event({ type: 'transcript', segment });
  }
  error(code: string, message: string) {
    this.session.error = { code, message };
    this.status();
  }
  private prune() {
    while (
      this.transcripts.length > 200 ||
      (this.transcripts.length && Date.now() - this.transcripts[0].createdAt > 900_000)
    )
      this.transcripts.shift();
  }
  enqueue(phrase: Phrase) {
    if (
      this.session.state !== 'running' ||
      this.session.signingPaused ||
      phrase.epoch !== this.epoch
    )
      return;
    this.queue.push(phrase);
    while (this.queue.length > LIMITS.maxQueue) this.drop(this.queue.shift()!);
    this.status();
    void this.pump();
  }
  private drop(phrase: Phrase) {
    this.session.skipped++;
    this.drops.push(Date.now());
    this.drops = this.drops.filter((t) => Date.now() - t < 60_000);
    for (const t of this.transcripts)
      if (t.audioStartMs < phrase.audioEndMs && t.audioEndMs > phrase.audioStartMs)
        t.skipped = true;
    if (this.drops.length >= 3) {
      this.session.signingPaused = true;
      this.queue = [];
      this.assembler.clear();
      this.session.error = {
        code: 'signing_overload',
        message:
          'Speech is exceeding signing capacity. Captions continue. Resume signing when ready.',
      };
    }
  }
  private tick() {
    this.media.sweep();
    this.prune();
    let changed = false;
    while (this.queue.length && Date.now() - this.queue[0].createdAt > LIMITS.maxWaitMs) {
      this.drop(this.queue.shift()!);
      changed = true;
    }
    if (changed) this.status();
    if (
      this.session.state !== 'idle' &&
      this.session.startedAt &&
      Date.now() - this.session.startedAt > LIMITS.maxSessionMs
    ) {
      this.stop();
      this.error('session_limit', 'The one-hour session limit was reached. Start a new session.');
    }
  }
  private async pump() {
    if (
      this.inFlight ||
      this.session.state !== 'running' ||
      this.session.signingPaused ||
      !this.queue.length
    )
      return;
    if (this.session.renders >= LIMITS.maxRenders) {
      this.session.signingPaused = true;
      this.queue = [];
      this.error(
        'render_limit',
        'The 300-render session limit was reached. Stop and start a new session.',
      );
      return;
    }
    const phrase = this.queue.shift()!;
    if (Date.now() - phrase.createdAt > LIMITS.maxWaitMs) {
      this.drop(phrase);
      this.status();
      void this.pump();
      return;
    }
    this.inFlight = true;
    this.controller = new AbortController();
    this.session.renders++;
    const clip = this.media.add(phrase, this.session.demo);
    const epoch = this.epoch;
    const changed = () => {
      if (epoch === this.epoch) this.event({ type: 'clip', clip: { ...clip.meta } });
    };
    clip.on('chunk', () => {
      this.media.sweep();
      if (this.media.bytes() > LIMITS.mediaBytes) throw new Error('media_capacity');
    });
    this.session.providers.signvrse = this.session.demo ? 'demo' : 'connecting';
    changed();
    this.status();
    try {
      await this.renderer.render(clip, this.controller.signal, changed);
      if (epoch !== this.epoch) return;
      clip.complete();
      this.media.sweep();
      this.session.providers.signvrse = this.session.demo ? 'demo' : 'ready';
      changed();
    } catch (error) {
      clip.fail();
      if (epoch === this.epoch) {
        this.session.providers.signvrse = 'error';
        const code =
          error instanceof Error && /^[a-z_0-9]+$/.test(error.message)
            ? error.message
            : 'render_failed';
        this.session.signingPaused = true;
        this.queue = [];
        this.error(
          code,
          'Signing is unavailable. Captions continue. Check the provider and resume explicitly; this phrase was not automatically retried.',
        );
        changed();
      }
    } finally {
      this.inFlight = false;
      this.controller = undefined;
      this.status();
      void this.pump();
    }
  }
  demoPhrase(text: string) {
    const now = Date.now();
    this.transcript({
      id: randomUUID(),
      text,
      final: true,
      audioStartMs: now - 2000,
      audioEndMs: now,
      createdAt: now,
    });
  }
  dispose() {
    this.stop();
    clearInterval(this.clock);
    this.removeAllListeners();
  }
}
