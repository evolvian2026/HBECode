import { createApp } from './bootstrap.js';
import { loadConfig } from './config.js';

const cfg = loadConfig();
const app = await createApp();
await app.listen({ port: cfg.PORT, host: cfg.HOST });
