import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
import { loadConfig } from './config.mjs';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const app = createApp(config);

  app.listen(config.port, config.host, () => {
    console.log(`Dashboard API ouvindo em http://${config.host}:${config.port}`);
  });
}
