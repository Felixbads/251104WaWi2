/**
 * Umfassendes Datenimport-Skript
 * 
 * Dieses Skript importiert Wetter- und Feiertagsdaten für alle deutschen Bundesländer
 * seit 2022 und erstellt eine vollständige Datengrundlage für Analysen.
 * 
 * Verwendung:
 *   node import_comprehensive_data.js [--start-year=2022] [--end-year=2025] [--weather] [--holidays] [--all-states]
 * 
 * Beispiele:
 *   node import_comprehensive_data.js --all-states
 *   node import_comprehensive_data.js --start-year=2022 --end-year=2024 --weather --holidays
 *   node import_comprehensive_data.js --holidays --states=SN,BY,BW
 */

import { comprehensiveDataService } from './server/services/comprehensiveDataService.js';
import dotenv from 'dotenv';

// Lade Umgebungsvariablen
dotenv.config();

/**
 * Kommandozeilenargumente parsen
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const options = {
    startYear: 2022,
    endYear: new Date().getFullYear() + 1,
    includeWeather: false,
    includeHolidays: false,
    allStates: false,
    states: null,
    help: false
  };

  for (const arg of args) {
    if (arg.startsWith('--start-year=')) {
      options.startYear = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--end-year=')) {
      options.endYear = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--states=')) {
      options.states = arg.split('=')[1].split(',').map(s => s.trim().toUpperCase());
    } else if (arg === '--weather') {
      options.includeWeather = true;
    } else if (arg === '--holidays') {
      options.includeHolidays = true;
    } else if (arg === '--all-states') {
      options.allStates = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  // Wenn weder Wetter noch Feiertage spezifiziert sind, beide aktivieren
  if (!options.includeWeather && !options.includeHolidays) {
    options.includeWeather = true;
    options.includeHolidays = true;
  }

  // Wenn alle Bundesländer gewünscht sind, überschreibe states
  if (options.allStates) {
    options.states = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'];
  }

  // Standard: nur Sachsen, wenn nichts anderes angegeben
  if (!options.states) {
    options.states = ['SN'];
  }

  return options;
}

/**
 * Hilfefunktion anzeigen
 */
function showHelp() {
  console.log(`
Umfassendes Datenimport-Skript für Wetter- und Feiertagsdaten

Verwendung:
  node import_comprehensive_data.js [Optionen]

Optionen:
  --start-year=JAHR         Startjahr für den Import (Standard: 2022)
  --end-year=JAHR          Endjahr für den Import (Standard: aktuelles Jahr + 1)
  --weather                Wetterdaten importieren
  --holidays               Feiertagsdaten importieren
  --all-states             Alle 16 deutschen Bundesländer
  --states=SN,BY,BW        Spezifische Bundesländer (Komma-getrennt)
  --help, -h               Diese Hilfe anzeigen

Bundesländer-Codes:
  BW=Baden-Württemberg, BY=Bayern, BE=Berlin, BB=Brandenburg,
  HB=Bremen, HH=Hamburg, HE=Hessen, MV=Mecklenburg-Vorpommern,
  NI=Niedersachsen, NW=Nordrhein-Westfalen, RP=Rheinland-Pfalz,
  SL=Saarland, SN=Sachsen, ST=Sachsen-Anhalt, SH=Schleswig-Holstein,
  TH=Thüringen

Beispiele:
  node import_comprehensive_data.js --all-states
    → Importiert Wetter- und Feiertagsdaten für alle Bundesländer seit 2022

  node import_comprehensive_data.js --holidays --states=SN,BY
    → Importiert nur Feiertagsdaten für Sachsen und Bayern

  node import_comprehensive_data.js --start-year=2020 --end-year=2023 --weather
    → Importiert nur Wetterdaten für den Zeitraum 2020-2023

Hinweise:
  - Für Wetterdaten wird ein OpenWeather API-Key benötigt (OPENWEATHER_API_KEY)
  - Der Import kann je nach Zeitraum und Anzahl der Bundesländer mehrere Minuten dauern
  - Bereits vorhandene Daten werden aktualisiert, nicht doppelt eingefügt
`);
}

/**
 * Hauptfunktion
 */
async function main() {
  const options = parseArguments();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log('='.repeat(80));
  console.log('🔄 UMFASSENDER DATENIMPORT GESTARTET');
  console.log('='.repeat(80));
  
  console.log('📋 Konfiguration:');
  console.log(`   Zeitraum: ${options.startYear} - ${options.endYear}`);
  console.log(`   Bundesländer: ${options.states.join(', ')} (${options.states.length} Stück)`);
  console.log(`   Wetterdaten: ${options.includeWeather ? '✅' : '❌'}`);
  console.log(`   Feiertagsdaten: ${options.includeHolidays ? '✅' : '❌'}`);
  console.log('');

  const startTime = Date.now();

  try {
    // Prüfe API-Schlüssel wenn Wetterdaten gewünscht sind
    if (options.includeWeather && !process.env.OPENWEATHER_API_KEY) {
      console.warn('⚠️  WARNUNG: Kein OpenWeather API-Key gefunden. Wetterdaten werden übersprungen.');
      console.warn('   Setze OPENWEATHER_API_KEY in der .env-Datei um Wetterdaten zu importieren.');
      options.includeWeather = false;
    }

    // Starte umfassende Datensynchronisation
    console.log('🚀 Starte Datensynchronisation...');
    const result = await comprehensiveDataService.syncAllData({
      startYear: options.startYear,
      endYear: options.endYear,
      includeWeather: options.includeWeather,
      includeHolidays: options.includeHolidays,
      states: options.states
    });

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    console.log('');
    console.log('='.repeat(80));
    
    if (result.success) {
      console.log('✅ IMPORT ERFOLGREICH ABGESCHLOSSEN');
      console.log('='.repeat(80));
      console.log(`⏱️  Gesamtdauer: ${duration} Sekunden`);
      console.log('');
      
      if (result.data) {
        console.log('📊 Importstatistiken:');
        
        if (result.data.calendar) {
          console.log(`   📅 Kalendertage: ${result.data.calendar.synced} synchronisiert, ${result.data.calendar.errors} Fehler`);
        }
        
        if (result.data.holidays) {
          console.log(`   🎉 Gesetzliche Feiertage: ${result.data.holidays.synced} synchronisiert, ${result.data.holidays.errors} Fehler`);
        }
        
        if (result.data.schoolHolidays) {
          console.log(`   🏫 Schulferien: ${result.data.schoolHolidays.synced} synchronisiert, ${result.data.schoolHolidays.errors} Fehler`);
        }
        
        if (result.data.weather) {
          console.log(`   🌤️  Wetterdaten: ${result.data.weather.synced} synchronisiert, ${result.data.weather.errors} Fehler`);
        }
        
        const totalSynced = Object.values(result.data).reduce((sum, category) => {
          return sum + (category.synced || 0);
        }, 0);
        
        const totalErrors = Object.values(result.data).reduce((sum, category) => {
          return sum + (category.errors || 0);
        }, 0);
        
        console.log('');
        console.log(`🎯 Gesamt: ${totalSynced} Datensätze synchronisiert, ${totalErrors} Fehler`);
      }
      
      console.log('');
      console.log('💡 Nächste Schritte:');
      console.log('   - Die Daten sind nun für Analysen und Prognosen verfügbar');
      console.log('   - Prüfe die Datenqualität über die API: /api/comprehensive-data/status');
      console.log('   - Führe regelmäßige Updates durch für aktuelle Wetterdaten');
      
    } else {
      console.log('❌ IMPORT FEHLGESCHLAGEN');
      console.log('='.repeat(80));
      console.log(`⏱️  Dauer bis Fehler: ${duration} Sekunden`);
      console.log('');
      console.log('🔍 Fehlermeldung:');
      console.log(`   ${result.message}`);
      
      if (result.errors && result.errors.length > 0) {
        console.log('');
        console.log('📋 Detaillierte Fehler:');
        result.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error}`);
        });
      }
      
      console.log('');
      console.log('💡 Lösungsvorschläge:');
      console.log('   - Überprüfe die Internetverbindung');
      console.log('   - Stelle sicher, dass alle API-Schlüssel korrekt konfiguriert sind');
      console.log('   - Prüfe die Datenbankverbindung');
      console.log('   - Reduziere den Zeitraum oder die Anzahl der Bundesländer');
      
      process.exit(1);
    }
    
  } catch (error) {
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log('');
    console.log('='.repeat(80));
    console.log('💥 KRITISCHER FEHLER');
    console.log('='.repeat(80));
    console.log(`⏱️  Dauer bis Fehler: ${duration} Sekunden`);
    console.log('');
    console.log('🔍 Fehlermeldung:');
    console.log(`   ${error.message}`);
    console.log('');
    console.log('🔧 Stack Trace:');
    console.log(error.stack);
    
    console.log('');
    console.log('💡 Lösungsvorschläge:');
    console.log('   - Überprüfe die .env-Konfiguration');
    console.log('   - Stelle sicher, dass die Datenbank läuft');
    console.log('   - Prüfe die Netzwerkverbindung zu externen APIs');
    console.log('   - Kontaktiere den Support mit dieser Fehlermeldung');
    
    process.exit(1);
  }
}

// Skript nur ausführen, wenn direkt aufgerufen
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unbehandelter Fehler:', error);
    process.exit(1);
  });
}

export { main, parseArguments, showHelp };