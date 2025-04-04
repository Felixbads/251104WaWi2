/**
 * Inkrementeller direkter Import von Excel-Daten
 * 
 * Dieses Skript importiert Daten direkt aus der Excel-Datei in die Datenbank,
 * verarbeitet aber nur eine kleine Anzahl von Zeilen pro Durchlauf, um Timeouts zu vermeiden.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const xlsx = require('xlsx');

// PostgreSQL Verbindung einrichten
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Konfiguration
const CONFIG = {
  batchSize: 10,           // Anzahl der Zeilen pro Batch für die große Datei
  excelFilePath: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  statusFilePath: './direct_import_status_large.json',
  logFilePath: './direct_import_large.log'
};

// Maschinen-IDs Mapping
const MACHINE_MAPPING = {
  "Bad Schandau, Nationalparkbahnhof": 52,
  "Pfaffendorf": 51,
  "Rathen": 53,
  // Fügen Sie hier weitere Mappings hinzu, wenn nötig
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
  
  // Standard-Status, wenn keine Datei existiert oder ein Fehler auftritt
  return {
    currentRow: 0,
    totalRows: 0,
    processedCount: 0,
    skippedCount: 0,
    lastProcessed: null,
    running: false,
    startTime: new Date().toISOString(),
    lastUpdate: new Date().toISOString()
  };
}

function saveStatus(status) {
  status.lastUpdate = new Date().toISOString();
  fs.writeFileSync(CONFIG.statusFilePath, JSON.stringify(status, null, 2));
}

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(CONFIG.logFilePath, logMessage);
}

// Überprüfen, ob eine Transaktion bereits existiert
async function transactionExists(transactionId) {
  const query = 'SELECT COUNT(*) FROM transactions WHERE vendon_id = $1';
  const result = await pool.query(query, [transactionId.toString()]);
  return parseInt(result.rows[0].count) > 0;
}

// Excel-Daten verarbeiten
async function processExcelFile() {
  // Status laden oder initialisieren
  let status = getStatus();
  
  // Wenn der Prozess bereits läuft, abbrechen
  if (status.running) {
    log('Ein anderer Prozess läuft bereits. Abbruch.');
    return;
  }
  
  status.running = true;
  saveStatus(status);
  
  try {
    log(`Starte Verarbeitung der Excel-Datei: ${CONFIG.excelFilePath}`);
    
    // Excel-Datei lesen
    const workbook = xlsx.readFile(CONFIG.excelFilePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Daten in ein JSON-Array konvertieren
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    // Gesamtzahl der Zeilen aktualisieren, falls diese sich geändert hat
    if (status.totalRows !== data.length) {
      status.totalRows = data.length;
      saveStatus(status);
      log(`Excel-Datei enthält ${data.length} Zeilen.`);
    }
    
    // Wenn bereits alle Zeilen verarbeitet wurden
    if (status.currentRow >= status.totalRows) {
      log('Alle Daten wurden bereits verarbeitet.');
      status.running = false;
      saveStatus(status);
      return;
    }
    
    // Berechne Batches für diesen Durchlauf
    const endRow = Math.min(status.currentRow + CONFIG.batchSize, status.totalRows);
    const rowsToProcess = data.slice(status.currentRow, endRow);
    
    log(`Verarbeite Batch: Zeilen ${status.currentRow + 1} bis ${endRow} von ${status.totalRows}`);
    
    // Batchverarbeitung
    let importCount = 0;
    let skipCount = 0;
    
    for (const row of rowsToProcess) {
      try {
        // Extraktion der relevanten Daten basierend auf dem Format der 1.xlsx
        const transactionData = {
          transaction_id: parseInt(row['Telemetrieeinheit']) || null, // Verwende Telemetrieeinheit als eindeutige ID
          datetime: new Date(row['Date / Time']).toISOString(),
          machine_id: 52, // Bad Schandau Bahnhof
          machine_name: row['Automatenname'] || '',
          price: parseFloat(row['Preis (inkl. MwSt.)']) || 0,
          name: row['Produktname'] || '',
          payment_method: row['Transaktionstyp'] || '',
          quantity: parseInt(row['Menge']) || 1
        };
        
        // Wenn keine gültige transaction_id vorhanden ist, überspringen
        if (!transactionData.transaction_id) {
          log(`Überspringe Zeile ${status.currentRow + 1}: Keine gültige Transaktions-ID`);
          skipCount++;
          continue;
        }
        
        // Überprüfen, ob die Transaktion bereits existiert
        const exists = await transactionExists(transactionData.transaction_id);
        if (exists) {
          log(`Überspringe Transaktion ${transactionData.transaction_id}: Bereits in der Datenbank vorhanden`);
          skipCount++;
          continue;
        }
        
        // Einfügen in die Datenbank
        const insertQuery = `
          INSERT INTO transactions (
            vendon_id, datetime, machine_id, machine_name, 
            price, product_name, payment_method, quantity
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `;
        
        const values = [
          transactionData.transaction_id.toString(), // vendon_id ist ein Text-Feld
          transactionData.datetime,
          transactionData.machine_id,
          transactionData.machine_name,
          transactionData.price,
          transactionData.name,                    // product_name statt name
          transactionData.payment_method,
          transactionData.quantity
        ];
        
        const result = await pool.query(insertQuery, values);
        log(`Transaktion ${transactionData.transaction_id} (ID: ${result.rows[0].id}) importiert`);
        importCount++;
        
      } catch (error) {
        log(`Fehler bei Zeile ${status.currentRow + 1}: ${error.message}`);
        skipCount++;
      }
    }
    
    // Status aktualisieren
    status.currentRow = endRow;
    status.processedCount += importCount;
    status.skippedCount += skipCount;
    status.lastProcessed = new Date().toISOString();
    
    const progress = ((status.currentRow / status.totalRows) * 100).toFixed(2);
    log(`Batch abgeschlossen. ${importCount} importiert, ${skipCount} übersprungen.`);
    log(`Fortschritt: ${status.currentRow}/${status.totalRows} (${progress}%)`);
    
    // Prüfen, ob alle Daten verarbeitet wurden
    if (status.currentRow >= status.totalRows) {
      log('Alle Daten wurden erfolgreich verarbeitet!');
    }
    
  } catch (error) {
    log(`Kritischer Fehler: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
  } finally {
    // In jedem Fall den Status aktualisieren und speichern
    status.running = false;
    saveStatus(status);
  }
}

// Hauptfunktion
async function main() {
  try {
    await processExcelFile();
    process.exit(0);
  } catch (error) {
    log(`Unbehandelter Fehler: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Skript ausführen
main();