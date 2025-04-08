#!/usr/bin/env node

/**
 * Ausführungsskript für die automatische Ausbuchung abgelaufener Chargen
 */

require('esbuild').buildSync({
  entryPoints: ['server/jobs/remove-expired-batches.ts'],
  bundle: true,
  outfile: 'temp/remove-expired-batches.js',
  platform: 'node',
  target: 'node16',
  format: 'cjs',
  external: ['pg-native', 'better-sqlite3', 'mysql2', 'sqlite3', 'tedious', 'oracledb', 'mysql'],
});

console.log('Führe Job zur Ausbuchung abgelaufener Chargen aus...');
require('./temp/remove-expired-batches.js');