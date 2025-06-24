// Installiert das pg-Paket, wenn es noch nicht installiert ist
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const isPgInstalled = existsSync('./node_modules/pg');

if (!isPgInstalled) {
  console.log('Installiere pg...');
  try {
    execSync('npm install pg @types/pg', { stdio: 'inherit' });
    console.log('pg wurde erfolgreich installiert.');
  } catch (error) {
    console.error('Fehler bei der Installation von pg:', error);
    process.exit(1);
  }
} else {
  console.log('pg ist bereits installiert.');
}

// Starte den Workflow neu
try {
  console.log('Workflow wird neu gestartet...');
  // führe den Befehl aus, den der Workflow auch ausführen würde
  execSync('npm run dev', { stdio: 'inherit' });
} catch (error) {
  console.error('Fehler beim Neustarten des Workflows:', error);
  process.exit(1);
}