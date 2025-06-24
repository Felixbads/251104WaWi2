// Fix packages script
import { spawnSync } from 'child_process';

// Führe den Workflow neu aus, aber ohne die @/-Pfade
try {
  // Starte die Anwendung direkt
  console.log('Starte die Anwendung...');
  const result = spawnSync('npm', ['run', 'dev'], { 
    stdio: 'inherit',
    shell: true 
  });

  if (result.error) {
    console.error('Fehler beim Starten der Anwendung:', result.error);
    process.exit(1);
  }
} catch (error) {
  console.error('Fehler:', error);
  process.exit(1);
}