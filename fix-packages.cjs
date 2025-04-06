// Fix packages script
const { execSync } = require('child_process');

// Führe die Anwendung direkt aus ohne die Pfade
try {
  console.log('Starte die Anwendung...');
  execSync('npm run dev', { stdio: 'inherit' });
} catch (error) {
  console.error('Fehler beim Starten der Anwendung:', error);
  process.exit(1);
}