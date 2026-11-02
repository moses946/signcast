import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
const root = process.cwd();
let paths = [];
try {
  paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
} catch {
  throw new Error('Initialize this standalone Git repository before scanning.');
}
async function walk(dir) {
  try {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, item.name);
      if (item.isDirectory()) await walk(path);
      else paths.push(relative(root, path));
    }
  } catch {}
}
await walk(resolve('apps/companion/dist'));
await walk(resolve('apps/extension/dist'));
await walk(resolve('apps/server/dist'));
const rules = [
  /sk_live_[A-Za-z0-9_-]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /"private_key"\s*:\s*"-----/,
];
const failures = [];
for (const path of new Set(paths)) {
  if (/(^|[\\/])\.env($|\.)/.test(path) && !path.endsWith('.env.example')) {
    failures.push(path + ' (environment file)');
    continue;
  }
  if (/\.(mp4|png|zip|woff2?)$/.test(path)) continue;
  const content = await readFile(path, 'utf8');
  if (rules.some((rule) => rule.test(content))) failures.push(path);
}
// Inspect patch history too, without printing matching content.
let history = '';
try {
  history = execFileSync('git', ['log', '--all', '-p', '--format='], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
} catch {}
if (rules.some((rule) => rule.test(history))) failures.push('Git history');
if (failures.length) {
  console.error('Secret-like material detected in: ' + failures.join(', '));
  process.exitCode = 1;
} else
  console.log(
    'No matches in tracked/unignored files, built bundles, or available Git history. Heuristic scan; review before publication.',
  );
