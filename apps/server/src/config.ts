import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { config as dotenv } from 'dotenv';
dotenv({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
export interface Config {
  port: number;
  publicUrl: string;
  production: boolean;
  mock: boolean;
  sessionSecret: string;
  overlaySecret: string;
  viewerSecret: string;
  signvrseUrl: string;
  signvrseKey: string;
  transport: 'websocket' | 'http';
  twitchClientId: string;
  twitchSecret: string;
  twitchRedirect: string;
  extensionClientId: string;
  extensionSecret: string;
  origins: string[];
  fixturePath: string;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production',
    publicUrl = env.PUBLIC_BASE_URL || 'http://localhost:3000';
  const secret = (name: string) => {
    const value = env[name];
    if (production && (!value || value.length < 32))
      throw new Error(`${name} must have at least 32 characters`);
    return value || randomBytes(32).toString('hex');
  };
  const origin = new URL(publicUrl);
  if (production && origin.protocol !== 'https:') throw new Error('Production requires HTTPS');
  const api = new URL(env.SIGNVRSE_API_BASE_URL || 'https://api.signvrse.com');
  if (
    api.protocol !== 'https:' ||
    api.username ||
    api.password ||
    api.pathname !== '/' ||
    api.search ||
    api.hash
  )
    throw new Error('SIGNVRSE_API_BASE_URL must be an HTTPS origin');
  if (!['websocket', 'http', undefined].includes(env.SIGNVRSE_TRANSPORT))
    throw new Error('Invalid SIGNVRSE_TRANSPORT');
  return {
    port: Number(env.PORT || 3000),
    publicUrl: origin.origin,
    production,
    mock: env.MOCK_PROVIDERS === 'true',
    sessionSecret: secret('SESSION_SECRET'),
    overlaySecret: secret('OVERLAY_TOKEN_SECRET'),
    viewerSecret: secret('VIEWER_SESSION_SECRET'),
    signvrseUrl: api.origin,
    signvrseKey: env.SIGNVRSE_API_KEY || '',
    transport: env.SIGNVRSE_TRANSPORT === 'http' ? 'http' : 'websocket',
    twitchClientId: env.TWITCH_CLIENT_ID || '',
    twitchSecret: env.TWITCH_CLIENT_SECRET || '',
    twitchRedirect: env.TWITCH_REDIRECT_URI || `${origin.origin}/auth/twitch/callback`,
    extensionClientId: env.TWITCH_EXTENSION_CLIENT_ID || '',
    extensionSecret: env.TWITCH_EXTENSION_SECRET || '',
    origins: [
      origin.origin,
      ...(env.TWITCH_EXTENSION_ALLOWED_ORIGINS || '').split(','),
      ...(!production
        ? (
            env.DEV_ALLOWED_ORIGINS ||
            'http://localhost:5173,http://localhost:5174,https://localhost:5174'
          ).split(',')
        : []),
    ]
      .map((x) => x.trim())
      .filter(Boolean),
    fixturePath: resolve(process.cwd(), 'fixtures/demo.mp4'),
  };
}
