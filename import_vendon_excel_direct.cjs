/**
 * Script zur direkten Verarbeitung und Import von Vendon-Transaktionen aus Excel-Dateien
 * mit verbesserten Fehlerbehandlung und detaillierter Zuordnung zu Datenbankfeldern
 */

const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Konfigurierbare Einstellungen
const CONFIG = {
  // API-Endpunkt für den Import
  apiEndpoint: 'http://localhost:3000/api/vendon/import/excel',
  // Spaltenzuordnung von Excel zu Datenbank
  columnMapping: {
    'Date / Time': 'datetime',
    'Automatenname': 'machineName',
    'Automaten-ID': 'machineId',
    'Telemetrieeinheit': 'telemetryUnitId',
    'Produktname': 'productName',
    'Produktnr.': 'productId',
    'Produktkategorie(n)': 'productCategory',
    'Menge': 'quantity',
    'Preis (inkl. MwSt.)': 'price',
    'Preis (ohne MwSt.)': 'priceWoVat',
    'MwSt. %': 'vat',
    'VAT sum': 'vatAmount',
    'Pfand Preis': 'depositPrice',
    'Pfand MwSt.': 'depositVat',
    'Einnahmen': 'amount',
    'Transaktionstyp': 'paymentType',
    'Source': 'source',
    'Währung': 'currency'
  }
};

/**
 * Funktion zum direkten Importieren von Excel-Daten über die API
 */
async function importExcelFile(filePath, options = {}) {
  console.log(`\nImportiere Excel-Datei: ${filePath}`);
  
  try {
    // Excel-Datei lesen mit optimierten Einstellungen
    console.log('Lese Excel-Datei...');
    const workbook = xlsx.readFile(filePath, { 
      cellDates: true, // Wichtig für korrekte Datumsbehandlung
      dateNF: 'yyyy-mm-dd',
      cellNF: true // Zahlenformatierung beibehalten
    });
    
    // Name des ersten Arbeitsblatts
    const sheetName = options.sheetName || workbook.SheetNames[0];
    console.log(`Verwende Arbeitsblatt: ${sheetName}`);
    
    if (!workbook.SheetNames.includes(sheetName)) {
      throw new Error(`Arbeitsblatt "${sheetName}" nicht in der Excel-Datei gefunden.`);
    }
    
    // Lese das Arbeitsblatt
    const worksheet = workbook.Sheets[sheetName];
    
    // Konvertiere in JSON für einfachere Verarbeitung
    console.log('Konvertiere Daten in JSON-Format...');
    const jsonData = xlsx.utils.sheet_to_json(worksheet, {
      raw: false, // Konvertiere Werte in native Typen
      dateNF: 'yyyy-mm-dd' // Datumsformat
    });
    
    const totalRows = jsonData.length;
    console.log(`Insgesamt ${totalRows} Zeilen gefunden (ohne Kopfzeile)`);
    
    if (totalRows === 0) {
      console.log('Keine Daten zum Importieren gefunden.');
      return { success: false, message: 'Keine Daten gefunden' };
    }
    
    // Ermittle die Maschinen-IDs aus den ersten Datensätzen
    console.log('\nPrüfe Automaten-IDs in den Daten...');
    const machineNames = new Set();
    const missingIds = [];
    
    jsonData.slice(0, Math.min(10, totalRows)).forEach((row, idx) => {
      machineNames.add(row['Automatenname']);
      
      // Wenn keine Automaten-ID vorhanden ist, muss eine Zuordnung erfolgen
      if (!row['Automaten-ID'] || row['Automaten-ID'] === '') {
        missingIds.push({ index: idx, name: row['Automatenname'] });
      }
    });
    
    console.log(`Gefundene Automaten: ${Array.from(machineNames).join(', ')}`);
    
    if (missingIds.length > 0) {
      console.log('Hinweis: In einigen Zeilen fehlen Automaten-IDs. Diese müssen zugeordnet werden.');
      console.log('Fehlende IDs in den ersten Zeilen:', missingIds);
    }
    
    // Manuelles Mapping von Automatennamen zu internen IDs (falls bekannt)
    const machineMapping = {
      'Pfaffendorf': 51, // Vendon-ID: 323780
      'Bahnhof Bad Schandau': 52, // Vendon-ID: 323959
      'Bad Schandau, Nationalparkbahnhof': 52, // Vendon-ID: 323959 (Alternative Schreibweise)
      'Rathen': 53 // Vendon-ID: 325762
    };
    
    // Vorverarbeitung der Daten für den Import
    console.log('\nVerarbeite Daten für den Import...');
    
    // Mappe und bereinige die Daten für den Import
    const processedData = jsonData.map((row, index) => {
      // Neues Objekt mit gemappten Feldern erstellen
      const mappedRow = {};
      
      // Eindeutige Transaktions-ID erzeugen, falls nicht vorhanden
      // Im realen Fall sollte diese aus externen Quellen kommen
      if (!row['Transaction ID']) {
        // Erzeuge eine eindeutige ID basierend auf Datum und anderen verfügbaren Daten
        const date = row['Date / Time'] || new Date().toISOString();
        const productName = row['Produktname'] || 'unknown';
        const price = row['Preis (inkl. MwSt.)'] || '0';
        mappedRow['vendonId'] = `imported-${date}-${productName}-${price}`.replace(/[^a-zA-Z0-9]/g, '-');
      } else {
        mappedRow['vendonId'] = row['Transaction ID'];
      }
      
      // Datum korrekt formatieren
      if (row['Date / Time']) {
        // Verschiedene Datumsformate berücksichtigen
        let dateValue = row['Date / Time'];
        
        if (typeof dateValue === 'string') {
          // String-Datum parsen
          mappedRow['datetime'] = new Date(dateValue).toISOString();
        } else if (dateValue instanceof Date) {
          // Date-Objekt direkt verwenden
          mappedRow['datetime'] = dateValue.toISOString();
        } else {
          // Fallback
          mappedRow['datetime'] = new Date().toISOString();
        }
      } else {
        mappedRow['datetime'] = new Date().toISOString();
      }
      
      // Automatische Zuordnung von Automatennamen zu IDs, falls die ID fehlt
      if ((!row['Automaten-ID'] || row['Automaten-ID'] === '') && row['Automatenname']) {
        const machineName = row['Automatenname'];
        if (machineMapping[machineName]) {
          mappedRow['machineId'] = machineMapping[machineName];
          console.log(`Zeile ${index+1}: Automatische Zuordnung von "${machineName}" zu ID ${mappedRow['machineId']}`);
        } else {
          console.log(`Zeile ${index+1}: Keine ID-Zuordnung für "${machineName}" gefunden`);
        }
      } else if (row['Automaten-ID']) {
        // Verwende die vorhandene ID
        mappedRow['machineId'] = Number(row['Automaten-ID']);
      }
      
      // Maschinenname
      mappedRow['machineName'] = row['Automatenname'] || null;
      
      // Produktinformationen
      mappedRow['productId'] = row['Produktnr.'] ? String(row['Produktnr.']) : null;
      mappedRow['productName'] = row['Produktname'] || null;
      
      // Preis und Mengeninformationen
      mappedRow['quantity'] = row['Menge'] ? Number(row['Menge']) : 1;
      mappedRow['price'] = row['Preis (inkl. MwSt.)'] ? Number(row['Preis (inkl. MwSt.)']) : 0;
      mappedRow['priceWoVat'] = row['Preis (ohne MwSt.)'] ? Number(row['Preis (ohne MwSt.)']) : null;
      mappedRow['vat'] = row['MwSt. %'] ? Number(row['MwSt. %']) : null;
      mappedRow['currency'] = row['Währung'] || 'EUR';
      
      // Zahlungsinformationen
      if (row['Transaktionstyp']) {
        const paymentTypeMap = {
          'BAR': 'CASH',
          'BARGELDLOS': 'CASHLESS'
        };
        mappedRow['paymentMethod'] = paymentTypeMap[row['Transaktionstyp']] || row['Transaktionstyp'];
        mappedRow['paymentType'] = row['Transaktionstyp'];
      }
      
      // Metadaten
      mappedRow['source'] = 'excel-import';
      mappedRow['metadata'] = JSON.stringify({
        importedFromExcel: true,
        importDate: new Date().toISOString(),
        originalRow: index + 1
      });
      
      // Status und Verarbeitung
      mappedRow['status'] = 'completed';
      mappedRow['processingStatus'] = 'processed';
      mappedRow['syncedAt'] = new Date().toISOString();
      mappedRow['createdAt'] = new Date().toISOString();
      
      return mappedRow;
    });
    
    // Zeige eine Beispielzeile zur Überprüfung
    console.log('\nBeispiel für verarbeitete Daten (erste Zeile):');
    console.log(JSON.stringify(processedData[0], null, 2));
    
    // Jetzt können die Daten entweder direkt in die Datenbank eingefügt
    // oder über die API importiert werden
    
    console.log(`\nBereite Import von ${processedData.length} Transaktionen vor...`);
    
    // Batching verwenden, um die Daten in Paketen zu verarbeiten
    const batchSize = options.batchSize || 100;
    const batches = [];
    
    for (let i = 0; i < processedData.length; i += batchSize) {
      batches.push(processedData.slice(i, i + batchSize));
    }
    
    console.log(`Daten in ${batches.length} Batches aufgeteilt (${batchSize} Zeilen pro Batch)`);
    
    // Option zum direkten Ausführen des Imports (kann deaktiviert werden für Testläufe)
    if (options.dryRun) {
      console.log('\nTestlauf abgeschlossen. Kein Import durchgeführt.');
      return { 
        success: true, 
        message: 'Testlauf abgeschlossen',
        totalRows: processedData.length
      };
    }
    
    // Variante 1: Import über die API
    if (options.useApi) {
      console.log(`\nImportiere Daten über API-Endpunkt: ${CONFIG.apiEndpoint}`);
      
      try {
        // Importiere jedes Batch separat
        let totalImported = 0;
        let totalDuplicates = 0;
        let totalErrors = 0;
        
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          console.log(`Importiere Batch ${i+1}/${batches.length} (${batch.length} Transaktionen)...`);
          
          const response = await axios.post(CONFIG.apiEndpoint, {
            transactions: batch,
            skipExistingCheck: false // Duplikate prüfen
          });
          
          if (response.data && response.data.status === 'success') {
            console.log(`Batch ${i+1} erfolgreich importiert: ${response.data.stats.saved} gespeichert, ${response.data.stats.duplicates} Duplikate`);
            totalImported += response.data.stats.saved;
            totalDuplicates += response.data.stats.duplicates;
            totalErrors += response.data.stats.errors;
          } else {
            console.error(`Fehler beim Import von Batch ${i+1}:`, response.data);
            totalErrors += batch.length;
          }
        }
        
        console.log('\nAPI-Import abgeschlossen');
        console.log(`Insgesamt: ${totalImported} Transaktionen importiert, ${totalDuplicates} Duplikate übersprungen, ${totalErrors} Fehler`);
        
        return { 
          success: true, 
          message: 'Import über API abgeschlossen',
          stats: {
            totalProcessed: processedData.length,
            imported: totalImported,
            duplicates: totalDuplicates,
            errors: totalErrors
          }
        };
      } catch (error) {
        console.error('Fehler beim API-Import:', error.message);
        return { success: false, message: `API-Fehler: ${error.message}` };
      }
    }
    // Variante 2: Rückgabe der verarbeiteten Daten für manuelle Weiterverarbeitung
    else {
      console.log('\nDaten für manuellen Import vorbereitet');
      
      // Speichere verarbeitete Daten in JSON-Datei für Backup/Debugging
      if (options.saveJson) {
        const jsonOutputPath = options.jsonOutputPath || 
          path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}_processed.json`);
        
        fs.writeFileSync(jsonOutputPath, JSON.stringify(processedData, null, 2));
        console.log(`Verarbeitete Daten in JSON-Datei gespeichert: ${jsonOutputPath}`);
      }
      
      return { 
        success: true, 
        message: 'Daten erfolgreich verarbeitet',
        data: processedData,
        batches: batches
      };
    }
    
  } catch (error) {
    console.error(`Fehler beim Importieren der Excel-Datei:`, error);
    return { success: false, message: error.message };
  }
}

// Hauptfunktion
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Bitte geben Sie den Pfad zur Excel-Datei an.');
    console.log('Verwendung: node import_vendon_excel_direct.cjs <dateipfad> [--dry-run] [--api] [--save-json] [--batch=100]');
    return;
  }
  
  const filePath = args[0];
  
  // Optionen aus den Kommandozeilenargumenten extrahieren
  const options = {
    dryRun: args.includes('--dry-run'),
    useApi: args.includes('--api'),
    saveJson: args.includes('--save-json'),
    batchSize: 100
  };
  
  // Batchgröße parsen
  const batchArg = args.find(arg => arg.startsWith('--batch='));
  if (batchArg) {
    options.batchSize = parseInt(batchArg.split('=')[1], 10);
  }
  
  if (!fs.existsSync(filePath)) {
    console.error(`Die Datei ${filePath} existiert nicht.`);
    return;
  }
  
  console.log(`Datei gefunden: ${filePath}`);
  console.log(`Optionen: ${JSON.stringify(options)}`);
  
  // Excel-Datei importieren
  const result = await importExcelFile(filePath, options);
  
  if (result.success) {
    console.log(`\nImport erfolgreich: ${result.message}`);
    
    // Für den Fall, dass es ein Testlauf war oder Daten zurückgegeben wurden
    if (options.dryRun) {
      console.log(`Es wurden ${result.totalRows} Zeilen für den Import vorbereitet.`);
    } else if (!options.useApi && result.data) {
      console.log(`Es wurden ${result.data.length} Zeilen für den Import vorbereitet.`);
      console.log(`Um den Import zu starten, verwenden Sie die Option --api`);
    }
  } else {
    console.error(`\nImport fehlgeschlagen: ${result.message}`);
  }
}

// Ausführen der Hauptfunktion, wenn das Skript direkt aufgerufen wird
if (require.main === module) {
  main().catch(err => {
    console.error('Unbehandelte Ausnahme:', err);
    process.exit(1);
  });
}

// Export für die Verwendung in anderen Skripten
module.exports = { importExcelFile };