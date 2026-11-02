export const LIMITS = {
  maxWords: 16,
  maxQueue: 3,
  maxWaitMs: 20_000,
  mediaBytes: 128 * 1024 * 1024,
  clipBytes: 16 * 1024 * 1024,
  mediaTtlMs: 120_000,
  maxClips: 10,
  maxViewers: 25,
  maxSessionMs: 3_600_000,
  maxRenders: 300,
} as const;
export type SessionState = 'idle' | 'running' | 'paused';
export type ProviderStatus = 'ready' | 'missing' | 'connecting' | 'error' | 'demo';
export interface ApplicationError {
  code: string;
  message: string;
}
export interface TranscriptSegment {
  id: string;
  text: string;
  final: boolean;
  audioStartMs: number;
  audioEndMs: number;
  createdAt: number;
  skipped?: boolean;
}
export interface Phrase {
  id: string;
  text: string;
  audioStartMs: number;
  audioEndMs: number;
  createdAt: number;
  epoch: number;
}
export interface ClipMetadata extends Phrase {
  status: 'rendering' | 'complete' | 'failed';
  mimeCodec: string;
  bytes: number;
  durationSeconds?: number;
  signCount?: number;
  firstFragmentAt?: number;
  completedAt?: number;
  demo: boolean;
}
export interface ChannelSession {
  channelId: string;
  displayName: string;
  state: SessionState;
  signingPaused: boolean;
  queued: number;
  skipped: number;
  renders: number;
  viewers: number;
  demo: boolean;
  providers: { speech: ProviderStatus; signvrse: ProviderStatus };
  error?: ApplicationError;
  startedAt?: number;
}
export interface FeedSnapshot {
  serverTime: number;
  session: ChannelSession;
  clips: ClipMetadata[];
  transcripts: TranscriptSegment[];
}
export type FeedEvent =
  | { type: 'snapshot'; snapshot: FeedSnapshot }
  | { type: 'transcript'; segment: TranscriptSegment }
  | { type: 'clip'; clip: ClipMetadata }
  | { type: 'status'; session: ChannelSession }
  | { type: 'reset' }
  | { type: 'pong'; serverTime: number; sentAt: number };
export interface ViewerPlaybackState {
  enabled: boolean;
  replaying: boolean;
  adjustmentSeconds: number;
  latencySeconds: number;
}
export function targetPlaybackTime(
  clip: Pick<ClipMetadata, 'audioEndMs'>,
  latencySeconds: number,
  adjustmentSeconds: number,
) {
  return (
    clip.audioEndMs +
    Math.max(0, Math.min(60, latencySeconds)) * 1000 +
    Math.max(-5, Math.min(15, adjustmentSeconds)) * 1000
  );
}
