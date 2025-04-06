// Restart server without using the workflow system
import { execSync } from 'child_process';

console.log('Starte die Anwendung...');
execSync('npx tsx server/index.ts', { stdio: 'inherit' });