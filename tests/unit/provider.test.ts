import { afterEach, expect, it, vi } from 'vitest';
import { SignvrseRenderer } from '../../apps/server/src/providers/signvrse';
import { readConfig } from '../../apps/server/src/config';
import { Clip } from '../../apps/server/src/media';
const config = () =>
  readConfig({
    NODE_ENV: 'test',
    SIGNVRSE_API_BASE_URL: 'https://provider.invalid',
    SIGNVRSE_API_KEY: 'unit-test-key',
    SIGNVRSE_TRANSPORT: 'http',
  });
const clip = () =>
  new Clip(
    {
      id: 'request-id',
      text: 'Hello.',
      audioStartMs: 0,
      audioEndMs: 1000,
      createdAt: Date.now(),
      epoch: 0,
    },
    false,
  );
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('HTTP compatibility preserves idempotency and explicitly requests ASL', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(Buffer.from('fixture-video'), { headers: { 'Content-Type': 'video/mp4' } }),
    );
  vi.stubGlobal('fetch', fetcher);
  const c = clip();
  await new SignvrseRenderer(config()).render(c, new AbortController().signal, () => {});
  expect(Buffer.concat(c.chunks).toString()).toBe('fixture-video');
  const request = fetcher.mock.calls[0][1];
  expect(request.headers['Idempotency-Key']).toBe(c.meta.id);
  expect(JSON.parse(request.body).signLanguage).toBe('asl');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects untrusted async job origins before forwarding the key', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          statusUrl: 'https://attacker.invalid/status',
          videoUrl: 'https://attacker.invalid/video',
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  const result = new SignvrseRenderer(config()).render(
    clip(),
    new AbortController().signal,
    () => {},
  );
  const rejected = expect(result).rejects.toThrow('untrusted_job_origin');
  await vi.advanceTimersByTimeAsync(2000);
  await rejected;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not silently retry a failed upstream HTTP request', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    new SignvrseRenderer(config()).render(clip(), new AbortController().signal, () => {}),
  ).rejects.toThrow('signvrse_http_503');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
