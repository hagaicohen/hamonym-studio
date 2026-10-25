'use strict';
// Both triggers exercise the same engine against dedicated local PostgreSQL.
// Children block external providers and explicitly select their local database.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const file of ['test-fin11-dedicated-simulation.cjs', 'test-fin11-single-clock-scheduler.cjs']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
