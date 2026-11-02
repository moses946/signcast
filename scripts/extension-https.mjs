import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
    '--host',
    'localhost',
    '--port',
    '5174',
  ],
  {
    cwd: new URL('../apps/extension/', import.meta.url),
    env: { ...process.env, SIGNCAST_LOCAL_HTTPS: 'true' },
    stdio: 'inherit',
  },
);
child.on('exit', (code) => process.exit(code || 0));
