/** Print detected toolchain versions as JSON (used by tests and `docker run ... versions`). */
import { loadConfig } from './config.js';
import { detectRuntimes } from './versions.js';

const cfg = loadConfig();

process.stdout.write(JSON.stringify(await detectRuntimes(cfg)), () => process.exit(0));
