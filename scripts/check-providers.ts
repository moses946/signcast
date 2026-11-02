import { readConfig } from '../apps/server/src/config';
import { SignvrseRenderer } from '../apps/server/src/providers/signvrse';
import { speechPreflight } from '../apps/server/src/providers/speech';
import { Clip } from '../apps/server/src/media';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const config = readConfig();
const report: { checkedAt: string; signvrse?: unknown; aws?: unknown; render?: unknown } = {
  checkedAt: new Date().toISOString(),
};
const headers = { 'X-API-Key': config.signvrseKey };
if (!config.signvrseKey) report.signvrse = { ok: false, code: 'key_missing' };
else
  try {
    const response = await fetch(`${config.signvrseUrl}/v1/me`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    report.signvrse = { ok: response.ok, httpStatus: response.status, origin: config.signvrseUrl };
  } catch {
    report.signvrse = { ok: false, code: 'network_failure', origin: config.signvrseUrl };
  }
if (process.argv.includes('--aws')) {
  try {
    await speechPreflight();
    report.aws = {
      ok: true,
      region: process.env.AWS_REGION || 'eu-west-1',
      note: 'Identity only; Transcribe permission requires a live stream test.',
    };
  } catch {
    report.aws = { ok: false, code: 'aws_identity_failed' };
  }
}
if (process.argv.includes('--render') && (report.signvrse as any)?.ok) {
  const start = Date.now();
  const clip = new Clip(
    {
      id: randomUUID(),
      text: 'Hello. Welcome to the stream.',
      audioStartMs: start - 2000,
      audioEndMs: start,
      createdAt: start,
      epoch: 0,
    },
    false,
  );
  try {
    await new SignvrseRenderer(config).render(clip, AbortSignal.timeout(120000), () => {});
    clip.complete();
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/live-asl-smoke.mp4', Buffer.concat(clip.chunks));
    report.render = {
      ok: true,
      firstFragmentMs: (clip.meta.firstFragmentAt || start) - start,
      totalMs: Date.now() - start,
      bytes: clip.meta.bytes,
      signs: clip.meta.signCount,
      note: 'Playback and ASL-fluent review remain separate checks.',
    };
  } catch {
    report.render = { ok: false, code: 'render_failed' };
  }
}
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/provider-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
