import { randomUUID } from 'node:crypto';
import { LIMITS, type Phrase, type TranscriptSegment } from '@signcast/shared';
/** Final results are deltas. Do not deduplicate equal text spoken at different times. */
export class PhraseAssembler {
  private pending: TranscriptSegment[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private emit: (phrase: Phrase) => void,
    private epoch: () => number,
  ) {}
  push(segment: TranscriptSegment) {
    if (!segment.final || !segment.text.trim()) return;
    this.pending.push(segment);
    if (this.timer) clearTimeout(this.timer);
    if (/[.!?]["']?$/.test(segment.text.trim())) this.flush();
    else this.timer = setTimeout(() => this.flush(), 600);
  }
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const parts = this.pending.splice(0);
    if (!parts.length) return;
    const text = parts.map((p) => p.text).join(' ');
    const clauses = text.match(/[^.!?;,]+[.!?;,]*/g) || [text];
    const groups: string[] = [];
    let current: string[] = [];
    for (const clause of clauses) {
      const words = clause.trim().split(/\s+/);
      while (words.length) {
        const take = words.splice(0, LIMITS.maxWords - current.length);
        current.push(...take);
        if (current.length === LIMITS.maxWords || /[.!?]$/.test(current.at(-1) || '')) {
          groups.push(current.join(' '));
          current = [];
        }
      }
    }
    if (current.length) groups.push(current.join(' '));
    const start = parts[0].audioStartMs,
      end = parts.at(-1)!.audioEndMs;
    const total = groups.reduce((n, g) => n + g.split(/\s+/).length, 0);
    let consumed = 0;
    for (const group of groups) {
      const count = group.split(/\s+/).length;
      this.emit({
        id: randomUUID(),
        text: group,
        audioStartMs: start + ((end - start) * consumed) / total,
        audioEndMs: start + ((end - start) * (consumed + count)) / total,
        createdAt: Date.now(),
        epoch: this.epoch(),
      });
      consumed += count;
    }
  }
  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = [];
  }
}
