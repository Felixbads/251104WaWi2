/**
 * Analyse der Excel-Datei für Vendon-Transaktionen
 * 
 * Dieses Skript analysiert die Excel-Datei und zeigt grundlegende Informationen an,
 * ohne die gesamte Datei zu verarbeiten. Dies ist hilfreich, um einen Überblick über 
 * die Daten zu erhalten, bevor ein vollständiger Import gestartet wird.
 */

const fs = require('fs');
const xlsx = require('xlsx');

// Konfiguration
const config = {
  inputExcelFile: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  sampleSize: 5 // Anzahl der Beispielzeilen
};

/**
 * Analysiert die Excel-Datei und zeigt grundlegende Informationen an
 */
function analyzeExcelFile() {
  console.log('=== EXCEL-DATEI ANALYSE ===');
  
  try {
    // Prüfen, ob die Datei existiert
    if (!fs.existsSync(config.inputExcelFile)) {
      console.error(`Datei nicht gefunden: ${config.inputExcelFile}`);
      return;
    }
    
    // Dateigröße ermitteln
    const stats = fs.statSync(config.inputExcelFile);
    console.log(`Datei: ${config.inputExcelFile}`);
    console.log(`Größe: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    
    // Excel-Datei mit optimierten Optionen öffnen
    console.log('\nLese Excel-Datei mit optimierten Einstellungen...');
    
    const workbook = xlsx.readFile(config.inputExcelFile, {
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      cellNF: false,
      cellDates: true,
      dense: true,
      raw: true
    });
    
    // Arbeitsblätter analysieren
    console.log(`\nAnzahl Arbeitsblätter: ${workbook.SheetNames.length}`);
    console.log(`Arbeitsblätter: ${workbook.SheetNames.join(', ')}`);
    
    // Das erste Arbeitsblatt analysieren
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Bereich ermitteln
    if (worksheet['!ref']) {
      const range = xlsx.utils.decode_range(worksheet['!ref']);
      const rowCount = range.e.r;
      const colCount = range.e.c - range.s.c + 1;
      
      console.log(`\nArbeitsblatt '${sheetName}':`);
      console.log(`Anzahl Zeilen: ${rowCount}`);
      console.log(`Anzahl Spalten: ${colCount}`);
      
      // Header-Zeile analysieren
      console.log('\nSpaltenüberschriften:');
      const headers = [];
      
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c });
        if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
          headers[c] = worksheet[cellAddress].v;
          console.log(`  ${c + 1}. ${headers[c]}`);
        }
      }
      
      // Beispielzeilen anzeigen
      console.log(`\nBeispielzeilen (${config.sampleSize}):`);
      
      // Konvertiere die ersten Zeilen für die Anzeige
      const sampleData = [];
      
      for (let r = range.s.r + 1; r <= Math.min(range.s.r + config.sampleSize, range.e.r); r++) {
        const rowData = {};
        let hasData = false;
        
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellAddress = xlsx.utils.encode_cell({ r, c });
          if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
            if (headers[c]) {
              rowData[headers[c]] = worksheet[cellAddress].v;
              hasData = true;
            }
          }
        }
        
        if (hasData) {
          sampleData.push(rowData);
        }
      }
      
      // Zeige die wichtigsten Felder der Beispielzeilen
      const keyFields = ['Date / Time', 'Automatenname', 'Telemetrieeinheit', 'Produktname', 'Preis (inkl. MwSt.)', 'Menge'];
      
      sampleData.forEach((row, index) => {
        console.log(`\nZeile ${index + 1}:`);
        keyFields.forEach(field => {
          if (row[field] !== undefined) {
            console.log(`  ${field}: ${row[field]}`);
          }
        });
      });
      
      // Anzahl eindeutiger Werte für bestimmte Spalten
      console.log('\nStatistik:');
      
      const uniqueMachines = new Set();
      const uniqueTelemetry = new Set();
      const uniqueProducts = new Set();
      
      // Begrenzte Anzahl von Zeilen für die Statistik verarbeiten
      const maxStatRows = 500;
      const statRows = Math.min(maxStatRows, rowCount);
      
      console.log(`Analysiere ${statRows} Zeilen für Statistik...`);
      
      for (let r = range.s.r + 1; r <= range.s.r + statRows; r++) {
        let machineName = '';
        let telemetryUnit = '';
        let productName = '';
        
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellAddress = xlsx.utils.encode_cell({ r, c });
          if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
            if (headers[c] === 'Automatenname') {
              machineName = worksheet[cellAddress].v;
            } else if (headers[c] === 'Telemetrieeinheit') {
              telemetryUnit = worksheet[cellAddress].v;
            } else if (headers[c] === 'Produktname') {
              productName = worksheet[cellAddress].v;
            }
          }
        }
        
        if (machineName) uniqueMachines.add(machineName);
        if (telemetryUnit) uniqueTelemetry.add(telemetryUnit);
        if (productName) uniqueProducts.add(productName);
      }
      
      console.log(`Anzahl unterschiedlicher Automaten: ${uniqueMachines.size}`);
      console.log(`Anzahl unterschiedlicher Telemetrieeinheiten: ${uniqueTelemetry.size}`);
      console.log(`Anzahl unterschiedlicher Produkte: ${uniqueProducts.size}`);
      
      // Liste der Telemetrieeinheiten anzeigen
      console.log('\nGefundene Telemetrieeinheiten:');
      console.log(Array.from(uniqueTelemetry).join(', '));
      
      // Liste der Automaten anzeigen
      console.log('\nGefundene Automaten:');
      Array.from(uniqueMachines).forEach(machine => {
        console.log(`  - ${machine}`);
      });
    } else {
      console.log('Konnte keinen gültigen Bereich in der Excel-Datei finden.');
    }
  } catch (error) {
    console.error(`Fehler bei der Analyse: ${error.message}`);
    console.error(error.stack);
  }
}

// Führe die Analyse aus
analyzeExcelFile();