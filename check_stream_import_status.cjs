/**
 * Überprüft den Status des Stream-basierten Excel-Imports
 * 
 * Dieses Skript zeigt den aktuellen Status des Stream-basierten Excel-Imports an
 * und gibt Informationen über den Fortschritt und die letzten Log-Einträge.
 */

const fs = require('fs');
const path = require('path');

// Konfiguration
const CONFIG = {
  statusFilePath: './stream_import_large_status.json',
  logFilePath: './stream_import_large.log',
  excelFilePath: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx'
};

// Status-Management
function getStatus() {
  try {
    if (fs.existsSync(CONFIG.statusFilePath)) {
      return JSON.parse(fs.readFileSync(CONFIG.statusFilePath, 'utf8'));
    }
  } catch (error) {
    console.error('Fehler beim Lesen der Status-Datei:', error);
  }
  
  return {
    importedCount: 0,
    skippedCount: 0,
    lastProcessed: null,
    startTime: null,
    lastUpdate: null
  };
}

// Letzte Log-Einträge anzeigen
function getLastLogEntries(count = 20) {
  try {
    if (fs.existsSync(CONFIG.logFilePath)) {
      const log = fs.readFileSync(CONFIG.logFilePath, 'utf8');
      const lines = log.split('\n').filter(line => line.trim() !== '');
      
      // Rückgabe der letzten X Einträge oder weniger
      return lines.slice(-count);
    }
  } catch (error) {
    console.error('Fehler beim Lesen der Log-Datei:', error);
  }
  
  return ['Keine Log-Einträge gefunden'];
}

// Hauptfunktion
function main() {
  console.log(`=== STREAM-BASIERTER EXCEL-IMPORT STATUS ===`);
  console.log(`Zeitstempel: ${new Date().toISOString()}\n`);
  
  // Prüfen, ob die Excel-Datei existiert
  const excelExists = fs.existsSync(CONFIG.excelFilePath);
  console.log(`=== EXCEL-DATEI STATUS ===`);
  if (excelExists) {
    const stats = fs.statSync(CONFIG.excelFilePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`Excel-Datei gefunden: ${path.basename(CONFIG.excelFilePath)}`);
    console.log(`Dateigröße: ${fileSizeMB} MB`);
  } else {
    console.log(`Excel-Datei nicht gefunden: ${CONFIG.excelFilePath}`);
    console.log(`Bitte stellen Sie sicher, dass die Datei existiert.`);
  }
  
  console.log(`\n=== IMPORT STATUS ===`);
  const status = getStatus();
  
  if (!status.startTime) {
    console.log(`Import wurde noch nicht gestartet oder Status zurückgesetzt.`);
  } else {
    const processState = status.lastUpdate && (new Date() - new Date(status.lastUpdate) < 60000) ? "Aktiv" : "Inaktiv";
    
    console.log(`Status: ${processState}`);
    console.log(`Importierte Datensätze: ${status.importedCount}`);
    console.log(`Übersprungene Datensätze: ${status.skippedCount}`);
    console.log(`Letzte Verarbeitung: ${status.lastProcessed || 'Noch nicht gestartet'}`);
    
    // Startzeit anzeigen
    const startTime = new Date(status.startTime);
    const now = new Date();
    const durationMs = now - startTime;
    const durationHours = Math.floor(durationMs / 3600000);
    const durationMinutes = Math.floor((durationMs % 3600000) / 60000);
    const durationSeconds = Math.floor((durationMs % 60000) / 1000);
    
    console.log(`Startzeit: ${status.startTime}`);
    console.log(`Letzte Aktualisierung: ${status.lastUpdate}`);
    console.log(`Laufzeit: ${durationHours}h ${durationMinutes}m ${durationSeconds}s`);
    
    // Wenn Log-Datei existiert, zeige weitere Informationen an
    if (fs.existsSync(CONFIG.logFilePath)) {
      try {
        const logStats = fs.statSync(CONFIG.logFilePath);
        const logSizeKB = (logStats.size / 1024).toFixed(2);
        console.log(`Log-Dateigröße: ${logSizeKB} KB`);
      } catch (error) {
        console.error(`Fehler beim Lesen der Log-Datei: ${error.message}`);
      }
    }
  }
  
  // Letzte Log-Einträge anzeigen
  console.log(`\n=== LETZTE LOG-EINTRÄGE ===`);
  const lastLogs = getLastLogEntries();
  lastLogs.forEach(line => console.log(line));
  
  // Empfehlungen anzeigen
  console.log(`\n=== EMPFEHLUNGEN ===`);
  if (!excelExists) {
    console.log(`→ Excel-Datei bereitstellen`);
  } else if (!status.startTime) {
    console.log(`→ Import starten mit "node run_stream_import_large.cjs"`);
  } else {
    const lastUpdateTime = new Date(status.lastUpdate || 0);
    const timeSinceLastUpdate = (new Date() - lastUpdateTime) / 1000;
    
    if (timeSinceLastUpdate > 300) { // 5 Minuten
      console.log(`→ Import scheint inaktiv zu sein (letzte Aktualisierung vor ${Math.floor(timeSinceLastUpdate / 60)} Minuten)`);
      console.log(`→ Import neu starten mit "node run_stream_import_large.cjs"`);
    } else {
      console.log(`→ Import läuft oder wurde kürzlich aktualisiert`);
      console.log(`→ Status regelmäßig mit diesem Skript überprüfen`);
    }
  }
}

// Skript ausführen
main();