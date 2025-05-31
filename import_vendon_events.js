/**
 * Vendon Events Import Script
 * 
 * Dieses Skript importiert Events von der Vendon API in die Datenbank.
 * Es nutzt die VendonEventsSync Klasse für eine robuste Synchronisation.
 * 
 * Verwendung:
 *   node import_vendon_events.js [Optionen]
 * 
 * Beispiele:
 *   node import_vendon_events.js
 *   node import_vendon_events.js --from-days=30 --batch-size=50
 *   node import_vendon_events.js --machine-id=123 --state=active,resolved
 *   node import_vendon_events.js --force-update
 */

const { importVendonEvents } = require('./server/services/vendonEventsSync.ts');

// Kommandozeilenargumente parsen
function parseArguments() {
  const args = process.argv.slice(2);
  const options = {};
  
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      
      switch (key) {
        case 'from-days':
          // Tage zurück in Unix-Timestamp umwandeln
          const days = parseInt(value) || 7;
          options.fromTimestamp = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
          break;
        case 'to-days':
          // Tage zurück für End-Datum
          const toDays = parseInt(value) || 0;
          options.toTimestamp = Math.floor((Date.now() - toDays * 24 * 60 * 60 * 1000) / 1000);
          break;
        case 'from-timestamp':
          options.fromTimestamp = parseInt(value);
          break;
        case 'to-timestamp':
          options.toTimestamp = parseInt(value);
          break;
        case 'machine-id':
          options.machineId = parseInt(value);
          break;
        case 'warehouse-id':
          options.warehouseId = parseInt(value);
          break;
        case 'location-id':
          options.locationId = parseInt(value);
          break;
        case 'client-id':
          options.clientId = parseInt(value);
          break;
        case 'state':
          options.state = value.split(',').map(s => s.trim());
          break;
        case 'location-type':
          options.locationType = value;
          break;
        case 'timeframe-filter-type':
          options.timeframeFilterType = value;
          break;
        case 'ignored':
          options.ignored = value;
          break;
        case 'min-duration':
          options.minDuration = parseInt(value);
          break;
        case 'max-duration':
          options.maxDuration = parseInt(value);
          break;
        case 'batch-size':
          options.batchSize = parseInt(value);
          break;
        case 'max-events':
          options.maxEvents = parseInt(value);
          break;
        case 'force-update':
          options.forceUpdate = true;
          break;
        case 'machine-tags':
          options.machineTags = value.split(',').map(s => s.trim());
          break;
        case 'event-tags':
          options.eventTags = value.split(',').map(s => s.trim());
          break;
      }
    }
  });
  
  return options;
}

// Hilfe anzeigen
function showHelp() {
  console.log(`
Vendon Events Import Script

Verwendung:
  node import_vendon_events.js [Optionen]

Zeitraum-Optionen:
  --from-days=N          Events der letzten N Tage importieren (Standard: 7)
  --to-days=N            Bis vor N Tagen importieren (Standard: 0 = heute)
  --from-timestamp=TS    Start-Zeitstempel (Unix-Timestamp)
  --to-timestamp=TS      End-Zeitstempel (Unix-Timestamp)
  --timeframe-filter-type=TYPE  Filter-Typ: received_at oder resolved_at (Standard: received_at)

Filter-Optionen:
  --machine-id=ID        Nur Events für bestimmte Maschine
  --warehouse-id=ID      Nur Events für bestimmtes Lager
  --location-id=ID       Nur Events für bestimmten Standort
  --client-id=ID         Nur Events für bestimmten Client
  --location-type=TYPE   Nur Events für bestimmten Standort-Typ
  --state=STATUS         Event-Status (kommagetrennt): resolved,active,info,unknown
  --ignored=MODE         Ignorierte Events: exclude,include,only (Standard: exclude)
  --min-duration=SEC     Minimale Event-Dauer in Sekunden
  --max-duration=SEC     Maximale Event-Dauer in Sekunden
  --machine-tags=TAGS    Maschinen-Tags (kommagetrennt)
  --event-tags=TAGS      Event-Tags (kommagetrennt)

Import-Optionen:
  --batch-size=N         Events pro API-Request (Standard: 100, Max: 100)
  --max-events=N         Maximale Anzahl Events zu importieren (Standard: 10000)
  --force-update         Bestehende Events aktualisieren

Beispiele:
  node import_vendon_events.js
  node import_vendon_events.js --from-days=30 --batch-size=50
  node import_vendon_events.js --machine-id=123 --state=active,resolved
  node import_vendon_events.js --warehouse-id=4 --from-days=14
  node import_vendon_events.js --force-update --state=resolved

Hinweis: Benötigt VENDON_API_KEY Umgebungsvariable.
`);
}

// Hauptfunktion
async function main() {
  const args = process.argv.slice(2);
  
  // Hilfe anzeigen
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  console.log('🚀 Vendon Events Import gestartet');
  console.log('📅', new Date().toLocaleString());
  
  try {
    // API-Key prüfen
    if (!process.env.VENDON_API_KEY) {
      console.error('❌ Fehler: VENDON_API_KEY Umgebungsvariable ist nicht gesetzt.');
      console.error('   Bitte setzen Sie Ihren Vendon API-Key:');
      console.error('   export VENDON_API_KEY="ihr_api_key_hier"');
      process.exit(1);
    }
    
    // Optionen parsen
    const options = parseArguments();
    
    console.log('⚙️ Import-Optionen:');
    console.log('   📊', JSON.stringify(options, null, 2));
    
    // Zeitraum anzeigen
    if (options.fromTimestamp) {
      console.log('   📅 Von:', new Date(options.fromTimestamp * 1000).toLocaleString());
    }
    if (options.toTimestamp) {
      console.log('   📅 Bis:', new Date(options.toTimestamp * 1000).toLocaleString());
    }
    
    console.log('');
    
    // Import starten
    const result = await importVendonEvents(options);
    
    console.log('');
    console.log('📊 Import-Ergebnis:');
    console.log(`   ✅ Erfolgreich: ${result.success}`);
    console.log(`   📦 Verarbeitet: ${result.totalProcessed}`);
    console.log(`   🔄 Duplikate: ${result.duplicates}`);
    console.log(`   ❌ Fehler: ${result.errors}`);
    
    if (result.errorMessage) {
      console.log(`   🚨 Fehlermeldung: ${result.errorMessage}`);
    }
    
    if (result.success) {
      console.log('');
      console.log('✅ Vendon Events Import erfolgreich abgeschlossen!');
      process.exit(0);
    } else {
      console.log('');
      console.log('❌ Vendon Events Import mit Fehlern beendet.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('');
    console.error('❌ Kritischer Fehler beim Import:');
    console.error('   ', error.message);
    
    if (error.message.includes('VENDON_API_KEY')) {
      console.error('');
      console.error('💡 Hilfe:');
      console.error('   Stellen Sie sicher, dass Sie einen gültigen Vendon API-Key haben.');
      console.error('   Setzen Sie die Umgebungsvariable: export VENDON_API_KEY="ihr_key"');
    }
    
    process.exit(1);
  }
}

// Graceful shutdown bei SIGINT/SIGTERM
process.on('SIGINT', () => {
  console.log('');
  console.log('⏹️ Import durch Benutzer abgebrochen');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('');
  console.log('⏹️ Import beendet');
  process.exit(0);
});

// Unbehandelte Fehler abfangen
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unbehandelter Promise-Fehler:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Unbehandelter Fehler:', error);
  process.exit(1);
});

// Script ausführen
if (require.main === module) {
  main();
}

module.exports = { main, parseArguments, showHelp };