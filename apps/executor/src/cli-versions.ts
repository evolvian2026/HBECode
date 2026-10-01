/** Print detected toolchain versions as JSON (used by tests and `docker run ... versions`). */
import { detectRuntimes } from './versions.js';

process.stdout.write(JSON.stringify(await detectRuntimes()));
