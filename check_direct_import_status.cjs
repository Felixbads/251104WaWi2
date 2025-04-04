/**
 * Überprüft den Status des direkten Excel-Imports
 * 
 * Dieses Skript zeigt den aktuellen Status des inkrementellen direkten 
 * Excel-Imports an und gibt Empfehlungen für die nächsten Schritte.
 */

const fs = require('fs');
const path = require('path');

// Konfiguration
const CONFIG = {
  statusFilePath: './direct_import_status.json',
  logFilePath: './direct_import.log',
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
    currentRow: 0,
    totalRows: 0,
    processedCount: 0,
    skippedCount: 0,
    lastProcessed: null,
    running: false
  };
}

// Letzten Logeintrag anzeigen
function getLastLogEntries(count = 5) {
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
  console.log(`=== DIREKTER EXCEL-IMPORT STATUS ===`);
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
  
  if (status.totalRows === 0) {
    console.log(`Import wurde noch nicht gestartet oder Status zurückgesetzt.`);
  } else {
    const progress = ((status.currentRow / status.totalRows) * 100).toFixed(2);
    const processState = status.running ? "Aktiv" : "Inaktiv";
    
    console.log(`Status: ${status.currentRow >= status.totalRows ? 'Abgeschlossen' : 'In Bearbeitung'}`);
    console.log(`Fortschritt: ${status.currentRow}/${status.totalRows} Zeilen (${progress}%)`);
    console.log(`Importierte Datensätze: ${status.processedCount}`);
    console.log(`Übersprungene Datensätze: ${status.skippedCount}`);
    console.log(`Letzte Verarbeitung: ${status.lastProcessed || 'Noch nicht gestartet'}`);
    console.log(`Prozess-Status: ${processState}`);
    
    // Startzeit anzeigen, falls vorhanden
    if (status.startTime) {
      const startTime = new Date(status.startTime);
      const now = new Date();
      const durationMs = now - startTime;
      const durationMinutes = Math.floor(durationMs / 60000);
      const durationSeconds = Math.floor((durationMs % 60000) / 1000);
      
      console.log(`Startzeit: ${status.startTime}`);
      console.log(`Laufzeit: ${durationMinutes} Minuten, ${durationSeconds} Sekunden`);
      
      // Geschwindigkeit und Schätzung der verbleibenden Zeit
      if (status.currentRow > 0 && status.startTime) {
        const rowsPerSecond = status.currentRow / (durationMs / 1000);
        const remainingRows = status.totalRows - status.currentRow;
        const remainingSeconds = Math.ceil(remainingRows / rowsPerSecond);
        
        const remainingHours = Math.floor(remainingSeconds / 3600);
        const remainingMinutes = Math.floor((remainingSeconds % 3600) / 60);
        const remainingSecs = remainingSeconds % 60;
        
        console.log(`Verarbeitungsgeschwindigkeit: ${rowsPerSecond.toFixed(2)} Zeilen/Sekunde`);
        
        if (status.currentRow < status.totalRows) {
          console.log(`Geschätzte verbleibende Zeit: ${remainingHours}h ${remainingMinutes}m ${remainingSecs}s`);
        }
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
  } else if (status.totalRows === 0) {
    console.log(`→ Import starten mit "node run_incremental_direct_import.cjs"`);
  } else if (status.currentRow < status.totalRows) {
    if (status.running) {
      console.log(`→ Import läuft bereits. Bitte warten Sie, bis der aktuelle Durchlauf abgeschlossen ist.`);
    } else {
      console.log(`→ Import fortsetzen mit "node run_incremental_direct_import.cjs"`);
    }
  } else {
    console.log(`→ Import abgeschlossen! Alle ${status.totalRows} Zeilen wurden verarbeitet.`);
    console.log(`  Importiert: ${status.processedCount}, Übersprungen: ${status.skippedCount}`);
  }
}

// Skript ausführen
main();