/**
 * Dieses Skript erstellt die Datenbanktabellen basierend auf dem Schema in shared/schema.ts.
 * Es verwendet Drizzle für eine zuverlässige Migration.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

async function main() {
  try {
    console.log('Führe Drizzle-Migration aus, um Datenbanktabellen zu erstellen...');
    
    // Drizzle-Migration ausführen
    const { stdout, stderr } = await execPromise('npm run db:push');
    
    console.log('Drizzle-Ausgabe:');
    console.log(stdout);
    
    if (stderr) {
      console.error('Fehler bei der Migration:');
      console.error(stderr);
    }
    
    console.log('Datenbankinitialisierung abgeschlossen.');
  } catch (error) {
    console.error('Fehler bei der Datenbankinitialisierung:', error.message);
    process.exit(1);
  }
}

main();