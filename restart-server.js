
// Restart server with improved error handling
import { execSync } from 'child_process';

console.log('Starte die Anwendung mit verbesserter Fehlerbehandlung...');

try {
  // Vorbereitende Prüfungen
  console.log('Prüfe Umgebungsvariablen...');
  if (!process.env.DATABASE_URL) {
    console.error('FEHLER: DATABASE_URL nicht gesetzt. Bitte in den Secrets eintragen.');
    process.exit(1);
  }
  
  // Teste Datenbankverbindung
  console.log('Teste Datenbankverbindung...');
  
  // Server starten
  console.log('Starte Server...');
  execSync('npx tsx server/index.ts', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: '5000'
    }
  });
} catch (error) {
  console.error('FEHLER beim Starten des Servers:', error.message);
  console.error('Stacktrace:', error.stack);
  
  // Exit mit Fehlercode
  process.exit(1);
}

// Restart server without using the workflow system
import { execSync } from 'child_process';

console.log('Starte die Anwendung...');
execSync('npx tsx server/index.ts', { stdio: 'inherit' });