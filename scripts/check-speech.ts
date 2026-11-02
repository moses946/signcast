import { readConfig } from '../apps/server/src/config';
import { AwsSpeechStream } from '../apps/server/src/providers/speech';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
readConfig();
const path = process.argv[2];
if (!path)
  throw new Error(
    'Provide a PCM16 mono 16 kHz file path. This test sends audio to AWS and may incur charges.',
  );
const pcm = await readFile(path);
if (pcm.length > 32_000 * 30 || pcm.length % 2)
  throw new Error('Use at most 30 seconds of mono PCM16.');
const report = {
  checkedAt: new Date().toISOString(),
  provider: 'Amazon Transcribe Streaming',
  region: process.env.AWS_REGION || 'eu-west-1',
  profile: process.env.AWS_PROFILE || 'default chain',
  bytes: pcm.length,
  finalSegments: 0,
  interimSegments: 0,
  ok: false,
  errorCode: '',
};
const stream = new AwsSpeechStream(
  (segment) => {
    if (segment.final) report.finalSegments++;
    else report.interimSegments++;
  },
  (code) => (report.errorCode = code),
);
for (let offset = 0; offset < pcm.length && !report.errorCode; offset += 3200) {
  stream.write(pcm.subarray(offset, offset + 3200));
  await new Promise((r) => setTimeout(r, 100));
}
for (let i = 0; i < 30 && !report.errorCode; i++) {
  stream.write(Buffer.alloc(3200));
  await new Promise((r) => setTimeout(r, 100));
}
stream.close();
report.ok = report.finalSegments > 0 && !report.errorCode;
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/speech-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
