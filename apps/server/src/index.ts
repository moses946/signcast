import { readConfig } from './config.js';
import { createApplication } from './app.js';
const config = readConfig();
const service = createApplication(config);
service.server.listen(config.port, '0.0.0.0', () =>
  console.log(
    `SignCast listening on port ${config.port} (${config.mock ? 'DEMO DATA' : 'live providers'})`,
  ),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    service.dispose();
    setTimeout(() => process.exit(0), 3000).unref();
  });
