import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { LIMITS, type FeedEvent } from '@signcast/shared';
import { feedAuthSchema } from '@signcast/shared/validation';
import { Auth, safeEqual, type Owner } from './auth.js';
import type { Config } from './config.js';
import { Channel } from './channel.js';
import { policyPage } from './policies.js';
import { DemoRenderer, SignvrseRenderer, type SignRenderer } from './providers/signvrse.js';
import {
  DemoSpeechStream,
  AwsSpeechStream,
  speechPreflight,
  type SpeechFactory,
} from './providers/speech.js';
export function createApplication(
  config: Config,
  overrides: { renderer?: SignRenderer; speech?: SpeechFactory } = {},
) {
  const app = express(),
    server = createServer(app),
    auth = new Auth(config);
  const channels = new Map<string, Channel>();
  let active: Channel | undefined;
  let starting = false;
  const renderer =
    overrides.renderer ||
    (config.mock ? new DemoRenderer(config.fixturePath) : new SignvrseRenderer(config));
  const speechFactory =
    overrides.speech ||
    ((text, error) =>
      config.mock ? new DemoSpeechStream(text) : new AwsSpeechStream(text, error));
  const ownerSockets = new Map<string, Set<WebSocket>>();
  app.disable('x-powered-by');
  app.set('trust proxy', config.production ? 1 : false);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          mediaSrc: ["'self'", 'blob:'],
          imgSrc: ["'self'", 'data:'],
          workerSrc: ["'self'", 'blob:'],
          frameAncestors: ["'self'"],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || config.origins.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    }),
  );
  app.use(express.json({ limit: '16kb' }), cookieParser());
  app.use(
    '/api',
    rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use(
    '/auth',
    rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  function getChannel(owner: Owner) {
    let channel = channels.get(owner.channelId);
    if (!channel) {
      if (channels.size >= 20) {
        const victim = [...channels.entries()].find(
          ([, c]) => c !== active && c.session.viewers === 0,
        );
        if (!victim) throw new Error('channel_capacity');
        victim[1].dispose();
        channels.delete(victim[0]);
      }
      channel = new Channel(owner.channelId, owner.displayName, renderer, config.mock);
      channels.set(owner.channelId, channel);
    }
    return channel;
  }
  const fail = (res: Response, status: number, code: string, message: string) =>
    res.status(status).json({ error: { code, message } });
  function owner(req: Request, res: Response, next: NextFunction) {
    const value = auth.owner(req.cookies.owner);
    if (!value) return void fail(res, 401, 'sign_in_required', 'Connect your Twitch account.');
    res.locals.owner = value;
    next();
  }
  function mutation(req: Request, res: Response, next: NextFunction) {
    const value = res.locals.owner as Owner;
    if (
      !req.headers.origin ||
      !config.origins.includes(req.headers.origin) ||
      !safeEqual(String(req.headers['x-csrf-token'] || ''), value.csrf)
    )
      return void fail(res, 403, 'invalid_origin', 'Reload the dashboard and try again.');
    next();
  }
  function read(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
      res.locals.access = auth.verifyRead(token);
      next();
    } catch {
      fail(res, 401, 'invalid_read_token', 'Refresh authorization to continue.');
    }
  }
  async function twitchOwner(accessToken: string) {
    const validation = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${accessToken}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!validation.ok) throw new Error('twitch_validation_failed');
    const valid = (await validation.json()) as any;
    if (valid.client_id !== config.twitchClientId) throw new Error('wrong_twitch_app');
    const response = await fetch('https://api.twitch.tv/helix/users', {
      headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': config.twitchClientId },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error('twitch_identity_failed');
    const user = ((await response.json()) as any).data?.[0];
    if (!user || user.id !== valid.user_id) throw new Error('invalid_twitch_identity');
    return { channelId: user.id, displayName: user.display_name };
  }
  const cookie = { httpOnly: true, secure: config.production, sameSite: 'lax' as const, path: '/' };
  app.get('/healthz', (_req, res) => res.json({ ok: true, mode: config.mock ? 'demo' : 'live' }));
  app.get('/privacy', (_req, res) => res.type('html').send(policyPage('privacy')));
  app.get('/terms', (_req, res) => res.type('html').send(policyPage('terms')));
  app.get('/auth/twitch', (_req, res) => {
    if (!config.twitchClientId)
      return void fail(
        res,
        503,
        'twitch_not_configured',
        'Configure the Twitch OAuth application first.',
      );
    const state = auth.state();
    res.cookie('oauth_state', state, { ...cookie, maxAge: 600_000 });
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.search = new URLSearchParams({
      client_id: config.twitchClientId,
      redirect_uri: config.twitchRedirect,
      response_type: 'code',
      state,
    }).toString();
    res.redirect(url.href);
  });
  app.get('/auth/twitch/callback', async (req, res) => {
    const state = String(req.query.state || '');
    if (!state || !req.cookies.oauth_state || !safeEqual(state, req.cookies.oauth_state))
      return void fail(res, 403, 'oauth_state', 'OAuth state did not match. Start sign-in again.');
    res.clearCookie('oauth_state', cookie);
    try {
      if (typeof req.query.code !== 'string') throw new Error();
      const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: config.twitchClientId,
          client_secret: config.twitchSecret,
          code: req.query.code,
          grant_type: 'authorization_code',
          redirect_uri: config.twitchRedirect,
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error();
      const tokens = (await response.json()) as any;
      const identity = await twitchOwner(tokens.access_token);
      const { id } = auth.newOwner({
        ...identity,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        validatedAt: Date.now(),
      });
      res.cookie('owner', id, { ...cookie, maxAge: 86_400_000 });
      res.redirect(config.publicUrl + '/');
    } catch {
      fail(
        res,
        502,
        'oauth_failed',
        'Twitch sign-in failed. Verify the app and exact redirect URI.',
      );
    }
  });
  // Demo authentication is completely absent in live mode. No provider calls occur in demo mode.
  if (config.mock)
    app.post('/auth/demo', (req, res) => {
      if (!req.headers.origin || !config.origins.includes(req.headers.origin))
        return void fail(res, 403, 'invalid_origin', 'Origin required.');
      const { id } = auth.newOwner({
        channelId: '100',
        displayName: 'Demo broadcaster',
        accessToken: '',
        refreshToken: '',
        expiresAt: Infinity,
        validatedAt: Date.now(),
      });
      res.cookie('owner', id, { ...cookie, maxAge: 86_400_000 });
      res.json({ ok: true });
    });
  app.post('/auth/logout', owner, mutation, (req, res) => {
    const value = res.locals.owner as Owner;
    channels.get(value.channelId)?.stop();
    auth.owners.delete(req.cookies.owner);
    for (const ws of ownerSockets.get(req.cookies.owner) || []) ws.close(1008, 'Signed out');
    res.clearCookie('owner', cookie);
    res.json({ ok: true });
  });
  app.get('/api/session', owner, (_req, res) => {
    const value = res.locals.owner as Owner;
    const channel = getChannel(value);
    res.json({
      snapshot: channel.snapshot(),
      csrf: value.csrf,
      overlayUrl: `${config.publicUrl}/overlay/${value.channelId}#${auth.overlay(value.channelId)}`,
      captureConnected: channel.listenerCount('capture-stop') > 0,
    });
  });
  app.post('/api/session/start', owner, mutation, async (_req, res) => {
    const value = res.locals.owner as Owner;
    const channel = getChannel(value);
    if (starting || (active && active !== channel && active.session.state !== 'idle'))
      return void fail(res, 409, 'deployment_busy', 'This MVP supports one active broadcaster.');
    if (channel.session.state !== 'idle') return res.json({ snapshot: channel.snapshot() });
    starting = true;
    try {
      if (!config.mock) {
        await speechPreflight();
      }
      let signingAvailable = true;
      try {
        await channel.preflight();
      } catch {
        signingAvailable = false;
      }
      active = channel;
      channel.start();
      if (!signingAvailable) channel.pauseSigning();
      res.json({ snapshot: channel.snapshot() });
    } catch {
      channel.error(
        'preflight_failed',
        'Speech recognition could not start. Check the independent AWS credentials and service availability.',
      );
      fail(
        res,
        503,
        'preflight_failed',
        'Speech preflight failed; microphone capture was not started.',
      );
    } finally {
      starting = false;
    }
  });
  app.post('/api/session/signing/resume', owner, mutation, async (_req, res) => {
    const channel = getChannel(res.locals.owner);
    if (channel !== active || channel.session.state !== 'running')
      return void fail(res, 409, 'not_running', 'Start or resume microphone capture first.');
    try {
      await channel.preflight();
      channel.resumeSigning();
      res.json({ snapshot: channel.snapshot() });
    } catch {
      channel.pauseSigning();
      fail(
        res,
        503,
        'signing_unavailable',
        'Signvrse is still unavailable. Live captions continue.',
      );
    }
  });
  for (const action of ['pause', 'resume', 'stop'] as const)
    app.post(`/api/session/${action}`, owner, mutation, (_req, res) => {
      const channel = getChannel(res.locals.owner);
      if (action !== 'stop' && (channel !== active || channel.session.state === 'idle'))
        return void fail(res, 409, 'not_started', 'Start a session first.');
      channel[action]();
      res.json({ snapshot: channel.snapshot() });
    });
  if (config.mock) {
    app.post('/api/demo/phrase', owner, mutation, (req, res) => {
      const parsed = z.object({ text: z.string().trim().min(1).max(300) }).safeParse(req.body);
      if (!parsed.success)
        return void fail(res, 400, 'invalid_phrase', 'Use a short demonstration phrase.');
      const channel = getChannel(res.locals.owner);
      if (channel.session.state !== 'running')
        return void fail(res, 409, 'not_running', 'Start the demo first.');
      channel.demoPhrase(parsed.data.text);
      res.json({ ok: true });
    });
    app.post('/api/demo/viewer', owner, mutation, (_req, res) =>
      res.json({
        token: auth.viewer((res.locals.owner as Owner).channelId),
        expiresIn: 300,
        demo: true,
      }),
    );
  }
  app.post('/api/extension/session', (req, res) => {
    try {
      const value = auth.extension(req.headers.authorization?.replace(/^Bearer /, '') || '');
      res.json({
        token: auth.viewer(value.channelId),
        channelId: value.channelId,
        expiresIn: 300,
        demo: config.mock,
      });
    } catch {
      fail(
        res,
        401,
        'extension_authorization_failed',
        'Extension authorization is missing, invalid, or expired.',
      );
    }
  });
  app.get('/api/feed', read, (_req, res) => {
    const channel = channels.get(res.locals.access.channelId);
    if (!channel) return res.json({ snapshot: null, serverTime: Date.now(), demo: config.mock });
    res.json({ snapshot: channel.snapshot() });
  });
  app.get('/api/clips/:clipId', read, (req, res) => {
    const channel = channels.get(res.locals.access.channelId),
      clip = channel?.media.get(String(req.params.clipId));
    if (!clip || clip.meta.status === 'failed')
      return void fail(
        res,
        410,
        'clip_expired',
        'This phrase is no longer available. Return to live.',
      );
    if (clip.readers >= LIMITS.maxViewers)
      return void fail(res, 429, 'media_readers', 'Too many media readers.');
    clip.readers++;
    res.status(200).set({
      'Content-Type': 'video/mp4',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.flushHeaders();
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clip.readers--;
      clip.off('chunk', chunk);
      clip.off('done', done);
      clip.off('failed', failed);
    };
    const chunk = (data: Buffer) => {
      if (closed) return;
      if ((res.writableLength || 0) + data.length > 4 * 1024 * 1024) {
        cleanup();
        res.destroy();
        return;
      }
      res.write(data);
    };
    const done = () => {
      cleanup();
      res.end();
    };
    const failed = () => {
      cleanup();
      res.destroy();
    };
    res.on('close', cleanup);
    clip.on('chunk', chunk);
    clip.once('done', done);
    clip.once('failed', failed);
    for (const data of clip.chunks) chunk(data);
    if (clip.meta.status === 'complete') done();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32_768, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url || '/', config.publicUrl).pathname;
    if (!['/ws/capture', '/ws/control', '/ws/feed'].includes(path)) {
      socket.destroy();
      return;
    }
    if (!req.headers.origin || !config.origins.includes(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws, req) => {
    const path = new URL(req.url || '/', config.publicUrl).pathname;
    let cleanup = () => {};
    let initialized = false;
    let expiration: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    ws.on('pong', () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 20_000);
    const send = (data: unknown) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > 4 * 1024 * 1024) {
        ws.close(1008, 'Slow consumer');
        return;
      }
      ws.send(JSON.stringify(data));
    };
    const timeout = setTimeout(() => ws.close(1008, 'Authenticate within five seconds'), 5000);
    const close = () => {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      if (expiration) clearTimeout(expiration);
      cleanup();
    };
    ws.once('close', close);
    ws.on('error', () => ws.close());
    ws.once('message', (raw, binary) => {
      clearTimeout(timeout);
      try {
        if (binary) throw new Error();
        const message = JSON.parse(raw.toString());
        if (path === '/ws/feed') {
          const value = feedAuthSchema.parse(message);
          const access = auth.verifyRead(value.token);
          const decoded = JSON.parse(
            Buffer.from(value.token.split('.')[1], 'base64url').toString(),
          );
          if (decoded.exp)
            expiration = setTimeout(
              () => ws.close(1008, 'Read token expired'),
              Math.max(0, decoded.exp * 1000 - Date.now()),
            );
          let joined: Channel | undefined;
          let listener: ((e: FeedEvent) => void) | undefined;
          const join = () => {
            const channel = channels.get(access.channelId);
            if (channel === joined) return;
            if (joined && listener) {
              joined.off('event', listener);
              joined.session.viewers--;
              joined.status();
            }
            joined = channel;
            if (!channel) return;
            if (channel.session.viewers >= LIMITS.maxViewers) {
              ws.close(1013, 'Viewer capacity');
              return;
            }
            channel.session.viewers++;
            listener = (e) => send(e);
            channel.on('event', listener);
            send({ type: 'snapshot', snapshot: channel.snapshot() });
            channel.status();
          };
          join();
          if (!joined) send({ type: 'waiting', demo: config.mock, serverTime: Date.now() });
          const poll = setInterval(join, 1000);
          cleanup = () => {
            clearInterval(poll);
            if (joined && listener) {
              joined.off('event', listener);
              joined.session.viewers--;
              joined.status();
            }
          };
        } else {
          const cookies = Object.fromEntries(
            (req.headers.cookie || '').split(';').map((x) => x.trim().split('=')),
          );
          const ownerId = cookies.owner;
          const value = auth.owner(ownerId);
          if (!value) throw new Error();
          const channel = getChannel(value);
          const set = ownerSockets.get(ownerId) || new Set();
          ownerSockets.set(ownerId, set);
          set.add(ws);
          const removeOwner = () => {
            set.delete(ws);
            if (!set.size) ownerSockets.delete(ownerId);
          };
          if (path === '/ws/control') {
            const listener = (event: FeedEvent) => send(event);
            channel.on('event', listener);
            send({ type: 'snapshot', snapshot: channel.snapshot() });
            cleanup = () => {
              removeOwner();
              channel.off('event', listener);
            };
          } else {
            if (
              !safeEqual(String(message.csrf || ''), value.csrf) ||
              channel.session.state !== 'running' ||
              channel.listenerCount('capture-stop') > 0
            ) {
              removeOwner();
              throw new Error();
            }
            let samples = 0;
            let lastFrame = Date.now();
            let stopped = false;
            const captureId = randomUUID();
            let speech;
            try {
              speech = speechFactory(
                (segment) => channel.transcript({ ...segment, id: `${captureId}:${segment.id}` }),
                (code) => {
                  channel.session.providers.speech = 'error';
                  channel.error(
                    code,
                    code === 'speech_gap'
                      ? 'Transcription stopped with a gap. Resume microphone capture.'
                      : 'Speech connection interrupted. Check AWS Transcribe permissions and resume microphone capture.',
                  );
                  ws.close(1011, 'Speech unavailable');
                },
              );
            } catch {
              removeOwner();
              throw new Error();
            }
            const stop = () => {
              if (stopped) return;
              stopped = true;
              speech.close();
              ws.close(1000, 'Capture stopped');
            };
            channel.on('capture-stop', stop);
            const idle = setInterval(() => {
              if (Date.now() - lastFrame > 10_000) {
                channel.session.providers.speech = 'error';
                channel.error(
                  'capture_gap',
                  'Microphone connection was interrupted. Resume capture.',
                );
                stop();
              }
            }, 1000);
            ws.on('message', (data, isBinary) => {
              if (!isBinary || stopped) return;
              const frame = Buffer.from(data as Buffer);
              if (
                frame.length % 2 ||
                frame.length > 6400 ||
                samples > (16000 * LIMITS.maxSessionMs) / 1000
              ) {
                ws.close(1008, 'Invalid audio frame');
                return;
              }
              samples += frame.length / 2;
              lastFrame = Date.now();
              try {
                speech.write(frame);
              } catch {
                channel.error(
                  'speech_failed',
                  'Speech recognition failed. Restart microphone capture.',
                );
                stop();
              }
            });
            send({ type: 'capture-ready' });
            channel.session.providers.speech = config.mock ? 'demo' : 'connecting';
            channel.status();
            cleanup = () => {
              removeOwner();
              clearInterval(idle);
              channel.off('capture-stop', stop);
              speech.close();
            };
          }
        }
        initialized = true;
      } catch {
        ws.close(1008, 'Authorization or session rejected');
      }
    });
    ws.on('message', (raw, binary) => {
      if (!initialized || binary) return;
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'ping' && typeof message.sentAt === 'number')
          send({ type: 'pong', sentAt: message.sentAt, serverTime: Date.now() });
      } catch {
        ws.close(1008, 'Invalid message');
      }
    });
  });
  const validation = setInterval(() => {
    if (config.mock) return;
    void Promise.all(
      [...auth.owners.entries()].map(async ([id, value]) => {
        try {
          if (value.expiresAt - Date.now() < 300_000) {
            const response = await fetch('https://id.twitch.tv/oauth2/token', {
              method: 'POST',
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: value.refreshToken,
                client_id: config.twitchClientId,
                client_secret: config.twitchSecret,
              }),
              signal: AbortSignal.timeout(12_000),
            });
            if (!response.ok) throw new Error();
            const tokens = (await response.json()) as any;
            value.accessToken = tokens.access_token;
            value.refreshToken = tokens.refresh_token || value.refreshToken;
            value.expiresAt = Date.now() + tokens.expires_in * 1000;
          }
          if (Date.now() - value.validatedAt >= 3_600_000) {
            await twitchOwner(value.accessToken);
            value.validatedAt = Date.now();
          }
        } catch {
          auth.owners.delete(id);
          channels.get(value.channelId)?.stop();
          for (const ws of ownerSockets.get(id) || []) ws.close(1008, 'Twitch authorization ended');
        }
      }),
    );
  }, 60_000);
  validation.unref();
  const web = resolve(process.cwd(), 'apps/companion/dist'),
    extension = resolve(process.cwd(), 'apps/extension/dist');
  if (existsSync(extension)) app.use('/extension-preview', express.static(extension));
  if (existsSync(web)) {
    app.use(express.static(web));
    app.get(['/', '/overlay/:channelId'], (_req, res) => res.sendFile(resolve(web, 'index.html')));
  }
  app.use((_req, res) => fail(res, 404, 'not_found', 'Route not found.'));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (!res.headersSent) fail(res, 500, 'request_failed', 'The request could not be completed.');
  });
  function dispose() {
    clearInterval(validation);
    for (const c of channels.values()) c.dispose();
    for (const client of wss.clients) client.terminate();
    wss.close();
    server.close();
  }
  return { app, server, auth, channels, renderer, dispose };
}
