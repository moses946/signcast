import { readFile } from 'node:fs/promises';
import WebSocket from 'ws';
import type { Config } from '../config.js';
import type { Clip } from '../media.js';
export interface SignRenderer {
  preflight(): Promise<void>;
  render(clip: Clip, signal: AbortSignal, changed: () => void): Promise<void>;
}
export class SignvrseRenderer implements SignRenderer {
  constructor(private config: Config) {}
  async preflight() {
    if (!this.config.signvrseKey) throw new Error('signvrse_not_configured');
    const r = await fetch(`${this.config.signvrseUrl}/v1/me`, {
      headers: { 'X-API-Key': this.config.signvrseKey },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) throw new Error(`signvrse_preflight_${r.status}`);
  }
  async render(clip: Clip, signal: AbortSignal, changed: () => void) {
    if (this.config.transport === 'http') return this.http(clip, signal, changed);
    const url = new URL('/ws/render', this.config.signvrseUrl);
    url.protocol = 'wss:';
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: { 'X-API-Key': this.config.signvrseKey },
        handshakeTimeout: 12_000,
        maxPayload: 16 * 1024 * 1024,
      });
      let settled = false;
      const first = setTimeout(() => finish(new Error('signvrse_first_fragment_timeout')), 60_000);
      const total = setTimeout(() => finish(new Error('signvrse_render_timeout')), 120_000);
      const abort = () => finish(new Error('render_cancelled'));
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(first);
        clearTimeout(total);
        signal.removeEventListener('abort', abort);
        ws.removeAllListeners();
        ws.on('error', () => {});
        ws.terminate();
        error ? reject(error) : resolve();
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      ws.on('open', () =>
        ws.send(
          JSON.stringify({
            type: 'render',
            requestId: clip.meta.id,
            sentence: clip.meta.text,
            signLanguage: 'asl',
            characterId: 'Zane',
            width: 960,
            height: 540,
            fps: 30,
            camera: 'upper-body',
            backgroundColor: '#131c1f',
          }),
        ),
      );
      ws.on('message', (data, binary) => {
        try {
          if (binary) {
            clearTimeout(first);
            clip.append(Buffer.from(data as Buffer));
            if (clip.chunks.length === 1) changed();
            return;
          }
          const msg = JSON.parse(data.toString());
          if (msg.requestId && msg.requestId !== clip.meta.id) return;
          if (msg.type === 'accepted' && typeof msg.mimeCodec === 'string') {
            clip.meta.mimeCodec = msg.mimeCodec;
            changed();
          }
          if (msg.type === 'meta') {
            clip.meta.durationSeconds =
              typeof msg.durationSeconds === 'number' ? msg.durationSeconds : undefined;
            clip.meta.signCount =
              typeof msg.usage?.signs === 'number' ? msg.usage.signs : undefined;
            changed();
          }
          if (msg.type === 'complete') {
            if (!clip.meta.bytes) finish(new Error('signvrse_empty_video'));
            else finish();
          }
          if (msg.type === 'error')
            finish(
              new Error(
                msg.code === 'insufficient_credits'
                  ? 'insufficient_credits'
                  : 'signvrse_render_failed',
              ),
            );
        } catch {
          finish(new Error('signvrse_invalid_response'));
        }
      });
      ws.on('error', () => finish(new Error('signvrse_connection_failed')));
      ws.on('close', () => finish(new Error('signvrse_interrupted')));
    });
  }
  private async http(clip: Clip, signal: AbortSignal, changed: () => void) {
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
    const headers = {
      'X-API-Key': this.config.signvrseKey,
      'Content-Type': 'application/json',
      'Idempotency-Key': clip.meta.id,
    };
    let response = await fetch(`${this.config.signvrseUrl}/v1/videos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sentence: clip.meta.text,
        signLanguage: 'asl',
        characterId: 'Zane',
        width: 960,
        height: 540,
        fps: 30,
        camera: 'upper-body',
        backgroundColor: '#131c1f',
      }),
      signal: timeout,
    });
    const trusted = (path: string) => {
      const url = new URL(path, this.config.signvrseUrl);
      if (url.origin !== this.config.signvrseUrl) throw new Error('untrusted_job_origin');
      return url;
    };
    if (response.status === 202) {
      const job = (await response.json()) as any;
      if (typeof job.statusUrl !== 'string' || typeof job.videoUrl !== 'string')
        throw new Error('invalid_async_response');
      let complete = false;
      while (!complete) {
        await new Promise<void>((res, rej) => {
          const timer = setTimeout(done, 2000);
          function done() {
            timeout.removeEventListener('abort', abort);
            res();
          }
          function abort() {
            clearTimeout(timer);
            rej(new Error('render_cancelled'));
          }
          timeout.addEventListener('abort', abort, { once: true });
          if (timeout.aborted) abort();
        });
        const status = await fetch(trusted(job.statusUrl), { headers, signal: timeout });
        if (status.status === 429) {
          const seconds = Math.min(30, Math.max(1, Number(status.headers.get('retry-after')) || 2));
          await new Promise((r) => setTimeout(r, seconds * 1000));
          continue;
        }
        if (!status.ok) throw new Error('signvrse_poll_failed');
        const state = (await status.json()) as any;
        const value = state.status || state.job?.status;
        if (['failed', 'cancelled'].includes(value)) throw new Error('signvrse_render_failed');
        complete = value === 'completed' || value === 'complete';
      }
      response = await fetch(trusted(job.videoUrl), { headers, signal: timeout });
    }
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('video/mp4') ||
      !response.body
    )
      throw new Error(`signvrse_http_${response.status}`);
    clip.meta.signCount = Number(response.headers.get('x-signvrse-signs')) || undefined;
    changed();
    for await (const chunk of response.body as any) {
      clip.append(Buffer.from(chunk));
      if (clip.chunks.length === 1) changed();
    }
    if (!clip.meta.bytes) throw new Error('signvrse_empty_video');
  }
}
export class DemoRenderer implements SignRenderer {
  calls = 0;
  constructor(private fixturePath: string) {}
  async preflight() {
    await readFile(this.fixturePath);
  }
  async render(clip: Clip, signal: AbortSignal, changed: () => void) {
    this.calls++;
    const data = await readFile(this.fixturePath);
    clip.meta.durationSeconds = 2;
    clip.meta.signCount = 0;
    changed();
    for (let offset = 0; offset < data.length; offset += 16_384) {
      if (signal.aborted) throw new Error('render_cancelled');
      clip.append(data.subarray(offset, offset + 16_384));
      await new Promise((r) => setTimeout(r, 15));
    }
    changed();
  }
}
