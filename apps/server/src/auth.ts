import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Config } from './config.js';
export interface Owner {
  channelId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  validatedAt: number;
  csrf: string;
  createdAt: number;
}
export interface ReadAccess {
  channelId: string;
  kind: 'viewer' | 'overlay';
}
export class Auth {
  owners = new Map<string, Owner>();
  constructor(readonly config: Config) {}
  newOwner(data: Omit<Owner, 'csrf' | 'createdAt'>) {
    const id = randomBytes(32).toString('hex');
    const owner = { ...data, csrf: randomBytes(24).toString('hex'), createdAt: Date.now() };
    this.owners.set(id, owner);
    return { id, owner };
  }
  owner(id?: string) {
    const value = id ? this.owners.get(id) : undefined;
    if (value && Date.now() - value.createdAt > 86_400_000) {
      this.owners.delete(id!);
      return undefined;
    }
    return value;
  }
  viewer(channelId: string) {
    return jwt.sign({ channelId, kind: 'viewer' }, this.config.viewerSecret, {
      algorithm: 'HS256',
      expiresIn: '5m',
      audience: 'signcast-read',
      issuer: 'signcast',
    });
  }
  overlay(channelId: string) {
    return jwt.sign({ channelId, kind: 'overlay' }, this.config.overlaySecret, {
      algorithm: 'HS256',
      noTimestamp: true,
      audience: 'signcast-overlay',
      issuer: 'signcast',
    });
  }
  verifyRead(token: string): ReadAccess {
    for (const kind of ['viewer', 'overlay'] as const) {
      try {
        const data = jwt.verify(
          token,
          kind === 'viewer' ? this.config.viewerSecret : this.config.overlaySecret,
          {
            algorithms: ['HS256'],
            audience: kind === 'viewer' ? 'signcast-read' : 'signcast-overlay',
            issuer: 'signcast',
          },
        ) as jwt.JwtPayload;
        if (
          data.kind !== kind ||
          !/^\d{1,24}$/.test(data.channelId) ||
          (kind === 'viewer' && typeof data.exp !== 'number')
        )
          continue;
        return { channelId: data.channelId, kind };
      } catch {
        /* Try the other strictly scoped token type. */
      }
    }
    throw new Error('Invalid or expired read token');
  }
  extension(token: string) {
    if (!this.config.extensionSecret) throw new Error('Extension is not configured');
    const data = jwt.verify(token, Buffer.from(this.config.extensionSecret, 'base64'), {
      algorithms: ['HS256'],
      clockTolerance: 5,
    }) as jwt.JwtPayload;
    if (
      typeof data.exp !== 'number' ||
      !/^\d{1,24}$/.test(data.channel_id) ||
      !['viewer', 'moderator', 'broadcaster'].includes(data.role) ||
      typeof data.opaque_user_id !== 'string'
    )
      throw new Error('Invalid extension claims');
    // Extension client identity is bound to its unique signing secret, not a client-supplied channel.
    return { channelId: data.channel_id as string, role: data.role as string };
  }
  state() {
    return randomBytes(24).toString('hex');
  }
}
export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function csrfToken(secret: string, id: string) {
  return createHmac('sha256', secret).update(id).digest('hex');
}
