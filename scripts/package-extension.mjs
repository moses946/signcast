import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { zipSync } from 'fflate';
const root = resolve('apps/extension/dist'),
  files = {};
async function walk(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files[relative(root, path).replaceAll('\\', '/')] = new Uint8Array(await readFile(path));
  }
}
await walk(root);
for (const page of ['viewer.html', 'config.html', 'live.html'])
  if (!files[page]) throw new Error(`Missing ${page}`);
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/signcast-extension.zip',
  zipSync(files, { level: 9, mtime: new Date('2026-01-01T00:00:00Z') }),
);
console.log(
  'Packaged artifacts/signcast-extension.zip. Configure Twitch CSP and test accounts before Hosted Test.',
);
