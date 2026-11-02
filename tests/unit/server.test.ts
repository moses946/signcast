import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';
import { readConfig } from '../../apps/server/src/config';
import { createApplication } from '../../apps/server/src/app';
import type { SignRenderer } from '../../apps/server/src/providers/signvrse';
import { resolve } from 'node:path';
const origin = 'http://localhost:3000';
const config = () => ({
  ...readConfig({
    NODE_ENV: 'test',
    MOCK_PROVIDERS: 'true',
    PUBLIC_BASE_URL: origin,
    TWITCH_EXTENSION_SECRET: Buffer.from('unique-extension-secret-for-unit-tests').toString(
      'base64',
    ),
  }),
  fixturePath: resolve('fixtures/demo.mp4'),
});
const services: ReturnType<typeof createApplication>[] = [];
function make(mock = true, renderer?: SignRenderer) {
  const app = createApplication({ ...config(), mock }, { renderer });
  services.push(app);
  return app;
}
afterEach(() => {
  services.splice(0).forEach((s) => s.dispose());
});
async function login(service: ReturnType<typeof make>) {
  const agent = request.agent(service.app);
  await agent.post('/auth/demo').set('Origin', origin).expect(200);
  const { body } = await agent.get('/api/session').expect(200);
  return { agent, csrf: body.csrf, overlay: body.overlayUrl };
}
describe('authorization boundaries', () => {
  it('cannot bypass the one-broadcaster limit through pause and resume', async () => {
    const s = make();
    const { agent, csrf } = await login(s);
    await agent
      .post('/api/session/start')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    const { id, owner } = s.auth.newOwner({
      channelId: '200',
      displayName: 'Second',
      accessToken: '',
      refreshToken: '',
      expiresAt: Infinity,
      validatedAt: Date.now(),
    });
    for (const route of ['pause', 'resume', 'start'])
      await request(s.app)
        .post(`/api/session/${route}`)
        .set('Cookie', `owner=${id}`)
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .expect(409);
    expect(s.channels.get('100')!.session.state).toBe('running');
  });
  it('has no demo authentication endpoint in live mode', async () => {
    await request(make(false).app).post('/auth/demo').set('Origin', origin).expect(404);
  });
  it('blocks unauthenticated and cross-origin mutations', async () => {
    const s = make();
    await request(s.app).post('/api/session/start').expect(401);
    const { agent, csrf } = await login(s);
    await agent
      .post('/api/session/start')
      .set('Origin', 'https://attacker.invalid')
      .set('X-CSRF-Token', csrf)
      .expect(403);
  });
  it('viewer tokens cannot control capture or submit phrases', async () => {
    const s = make();
    const { agent, csrf } = await login(s);
    const { body } = await agent
      .post('/api/demo/viewer')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    await request(s.app)
      .post('/api/session/start')
      .set('Authorization', `Bearer ${body.token}`)
      .expect(401);
    await request(s.app)
      .post('/api/demo/phrase')
      .set('Authorization', `Bearer ${body.token}`)
      .send({ text: 'Bad' })
      .expect(401);
  });
  it('rejects forged and expired extension claims', async () => {
    const s = make();
    await request(s.app)
      .post('/api/extension/session')
      .set('Authorization', 'Bearer fake')
      .expect(401);
    const token = jwt.sign(
      { channel_id: '100', role: 'viewer', opaque_user_id: 'Aopaque', exp: 1 },
      Buffer.from(s.auth.config.extensionSecret, 'base64'),
      { algorithm: 'HS256' },
    );
    await request(s.app)
      .post('/api/extension/session')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
  it('uses the signed extension channel and ignores supplied channel ids', async () => {
    const s = make();
    const token = jwt.sign(
      { channel_id: '200', role: 'viewer', opaque_user_id: 'Aopaque' },
      Buffer.from(s.auth.config.extensionSecret, 'base64'),
      { algorithm: 'HS256', expiresIn: 60 },
    );
    const { body } = await request(s.app)
      .post('/api/extension/session')
      .set('Authorization', `Bearer ${token}`)
      .send({ channelId: '100' })
      .expect(200);
    expect(body.channelId).toBe('200');
    const access = s.auth.verifyRead(body.token);
    expect(access.channelId).toBe('200');
  });
});
describe('shared media and replay', () => {
  it('keeps captions running during a signing outage and requires a successful explicit retry', async () => {
    let available = false,
      renders = 0;
    const s = make(true, {
      async preflight() {
        if (!available) throw new Error('provider_unavailable');
      },
      async render() {
        renders++;
      },
    });
    const { agent, csrf } = await login(s);
    const mutate = (path: string) =>
      agent.post(path).set('Origin', origin).set('X-CSRF-Token', csrf);
    const started = await mutate('/api/session/start').expect(200);
    expect(started.body.snapshot.session.state).toBe('running');
    expect(started.body.snapshot.session.signingPaused).toBe(true);
    const channel = [...s.channels.values()][0];
    channel.transcript({
      id: 'outage-caption',
      text: 'These captions are available.',
      final: true,
      audioStartMs: Date.now() - 1000,
      audioEndMs: Date.now(),
      createdAt: Date.now(),
    });
    expect(channel.snapshot().transcripts.at(-1)?.text).toBe('These captions are available.');
    expect(renders).toBe(0);
    await mutate('/api/session/pause').expect(200);
    await mutate('/api/session/resume').expect(200);
    expect(channel.session.signingPaused).toBe(true);
    await mutate('/api/session/signing/resume').expect(503);
    expect(channel.session.signingPaused).toBe(true);
    available = true;
    await mutate('/api/session/signing/resume').expect(200);
    expect(channel.session.signingPaused).toBe(false);
    expect(channel.session.providers.signvrse).toBe('demo');
    expect(channel.snapshot().transcripts).toHaveLength(1);
    expect(renders).toBe(0);
  });
  it('renders once and serves identical bytes to ten viewers without new renders', async () => {
    let calls = 0;
    const data = await readFile(resolve('fixtures/demo.mp4'));
    const s = make(true, {
      preflight: async () => {},
      render: async (clip) => {
        calls++;
        clip.append(data);
      },
    });
    const { agent, csrf } = await login(s);
    await agent
      .post('/api/session/start')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    await agent
      .post('/api/demo/phrase')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({ text: 'Welcome.' })
      .expect(200);
    await new Promise((r) => setTimeout(r, 10));
    const channel = s.channels.get('100')!;
    const clip = [...channel.media.clips.values()][0];
    const token = s.auth.viewer('100');
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(s.app)
          .get(`/api/clips/${clip.meta.id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200),
      ),
    );
    expect(results.every((r) => Buffer.compare(r.body, data) === 0)).toBe(true);
    await request(s.app)
      .get(`/api/clips/${clip.meta.id}`)
      .set('Authorization', `Bearer ${s.auth.viewer('200')}`)
      .expect(410);
    expect(calls).toBe(1);
  });
  it('stop removes retained video', async () => {
    const s = make();
    const { agent, csrf } = await login(s);
    await agent.post('/api/session/start').set('Origin', origin).set('X-CSRF-Token', csrf);
    await agent
      .post('/api/demo/phrase')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({ text: 'Hello.' });
    await agent
      .post('/api/session/stop')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    expect(s.channels.get('100')!.media.clips.size).toBe(0);
  });
});
