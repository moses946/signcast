import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  type AudioStream,
  type Result,
} from '@aws-sdk/client-transcribe-streaming';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { randomUUID } from 'node:crypto';
import type { TranscriptSegment } from '@signcast/shared';
export interface SpeechStream {
  write(data: Buffer): void;
  close(): void;
}
export type SpeechFactory = (
  onText: (segment: TranscriptSegment) => void,
  onError: (code: string) => void,
) => SpeechStream;
const region = () => process.env.AWS_REGION || 'eu-west-1';
export async function speechPreflight() {
  const client = new STSClient({
    region: region(),
    credentials: fromNodeProviderChain(),
    maxAttempts: 1,
  });
  try {
    await client.send(new GetCallerIdentityCommand({}), {
      abortSignal: AbortSignal.timeout(12_000),
    });
  } finally {
    client.destroy();
  }
}
/** Bounded producer/consumer bridge; at most one second of unsent PCM. */
export class AudioQueue implements AsyncIterable<AudioStream> {
  private items: Buffer[] = [];
  private waiter?: () => void;
  private ended = false;
  private bytes = 0;
  push(data: Buffer) {
    if (this.ended) return;
    if (this.bytes + data.length > 32_000) throw new Error('speech_audio_backlog');
    this.items.push(data);
    this.bytes += data.length;
    this.waiter?.();
    this.waiter = undefined;
  }
  end() {
    this.ended = true;
    this.items = [];
    this.bytes = 0;
    this.waiter?.();
    this.waiter = undefined;
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<AudioStream> {
    while (!this.ended) {
      const data = this.items.shift();
      if (data) {
        this.bytes -= data.length;
        yield { AudioEvent: { AudioChunk: data } };
      } else
        await new Promise<void>((resolve) => {
          this.waiter = resolve;
        });
    }
  }
}
export function transcribeSegment(result: Result, anchor: number): TranscriptSegment | undefined {
  const alternative = result.Alternatives?.[0];
  if (!alternative?.Transcript) return;
  return {
    id: result.ResultId || `${result.StartTime}:${result.EndTime}`,
    text: alternative.Transcript,
    final: !result.IsPartial,
    audioStartMs: anchor + (result.StartTime || 0) * 1000,
    audioEndMs: anchor + (result.EndTime || 0) * 1000,
    createdAt: Date.now(),
  };
}
export class AwsSpeechStream implements SpeechStream {
  private client = new TranscribeStreamingClient({
    region: region(),
    credentials: fromNodeProviderChain(),
    maxAttempts: 1,
  });
  private controller = new AbortController();
  private queue = new AudioQueue();
  private closed = false;
  private anchor = Date.now();
  constructor(
    private onText: (s: TranscriptSegment) => void,
    private onError: (s: string) => void,
  ) {
    void this.run();
  }
  private async run() {
    try {
      const output = await this.client.send(
        new StartStreamTranscriptionCommand({
          LanguageCode: 'en-US',
          MediaEncoding: 'pcm',
          MediaSampleRateHertz: 16000,
          AudioStream: this.queue,
          EnablePartialResultsStabilization: true,
          PartialResultsStability: 'medium',
        }),
        { abortSignal: this.controller.signal },
      );
      if (!output.TranscriptResultStream) throw new Error('speech_empty_stream');
      for await (const event of output.TranscriptResultStream) {
        if (this.closed) break;
        if (
          event.BadRequestException ||
          event.LimitExceededException ||
          event.InternalFailureException ||
          event.ServiceUnavailableException ||
          event.ConflictException
        )
          throw new Error('speech_service_failed');
        for (const result of event.TranscriptEvent?.Transcript?.Results || []) {
          const segment = transcribeSegment(result, this.anchor);
          if (segment) this.onText(segment);
        }
      }
      if (!this.closed) {
        this.onError('speech_stream_ended');
        this.close();
      }
    } catch (error) {
      if (!this.closed) {
        const name = error instanceof Error ? error.name : '';
        this.onError(
          name === 'AccessDeniedException'
            ? 'speech_access_denied'
            : name === 'CredentialsProviderError'
              ? 'speech_credentials_missing'
              : 'speech_connection_failed',
        );
        this.close();
      }
    }
  }
  write(data: Buffer) {
    if (this.closed) throw new Error('speech_closed');
    try {
      this.queue.push(data);
    } catch (error) {
      this.onError('speech_gap');
      this.close();
      throw error;
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.queue.end();
    this.controller.abort();
    this.client.destroy();
  }
}
export class DemoSpeechStream implements SpeechStream {
  private bytes = 0;
  private count = 0;
  private start = Date.now();
  constructor(private onText: (s: TranscriptSegment) => void) {}
  write(data: Buffer) {
    this.bytes += data.length;
    if (this.bytes < 96_000) return;
    this.bytes = 0;
    this.count++;
    const text = [
      'Welcome to SignCast.',
      'This is a demonstration fixture.',
      'Every viewer controls their own replay.',
    ][(this.count - 1) % 3];
    this.onText({
      id: randomUUID(),
      text,
      final: true,
      audioStartMs: this.start + (this.count - 1) * 3000,
      audioEndMs: this.start + this.count * 3000,
      createdAt: Date.now(),
    });
  }
  close() {}
}
