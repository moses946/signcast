import { parse } from 'dotenv';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const env = parse(await readFile('.env'));
const keys = [
  'SIGNVRSE_API_KEY',
  'SESSION_SECRET',
  'OVERLAY_TOKEN_SECRET',
  'VIEWER_SESSION_SECRET',
  'TWITCH_CLIENT_ID',
  'TWITCH_CLIENT_SECRET',
  'TWITCH_EXTENSION_CLIENT_ID',
  'TWITCH_EXTENSION_SECRET',
  'TWITCH_EXTENSION_ALLOWED_ORIGINS',
];
const secret = Object.fromEntries(
  keys.map((key) => [
    key,
    env[key] ||
      (['SESSION_SECRET', 'OVERLAY_TOKEN_SECRET', 'VIEWER_SESSION_SECRET'].includes(key)
        ? randomBytes(32).toString('hex')
        : ''),
  ]),
);
if (!secret.SIGNVRSE_API_KEY)
  throw new Error('Supply the independent Signvrse API key in .env first.');
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/aws-runtime.private.json', JSON.stringify(secret));
await writeFile(
  'artifacts/aws-public-config.json',
  JSON.stringify({ signvrseUrl: env.SIGNVRSE_API_BASE_URL || 'https://api.signvrse.com' }),
);
console.log(
  'Prepared private deployment input under ignored artifacts. No credential values printed.',
);
