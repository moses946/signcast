import { z } from 'zod';
export const channelIdSchema = z.string().regex(/^\d{1,24}$/);
export const feedAuthSchema = z.object({
  type: z.literal('auth'),
  token: z.string().min(20).max(8192),
});
