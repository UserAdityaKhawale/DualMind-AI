import { debateApp as app } from './debate-app.js';
import { config } from './config.js';

const server = app.listen(config.PORT, () => console.log(`DualMind API listening on port ${config.PORT}`));

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
