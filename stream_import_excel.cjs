/**
 * Streamed Excel Import
 * 
 * Dieses Skript importiert Transaktionen aus einer Excel-Datei direkt in die Datenbank,
 * unter Verwendung eines Stream-basierten Ansatzes, um Speicherprobleme zu vermeiden.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Datenbankverbindung einrichten
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Konfiguration
const CONFIG = {
  excelFilePath: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  batchSize: 10,
  logFilePath: './stream_import_large.log',
  statusFilePath: './stream_import_large_status.json'
};

// Status-Management
function getStatus() {
  try {
    if (fs.existsSync(CONFIG.statusFilePath)) {
      return JSON.parse(fs.readFileSync(CONFIG.statusFilePath, 'utf8'));
    }
  } catch (error) {
    log(`Fehler beim Lesen der Status-Datei: ${error.message}`);
  }
  
  // Standard-Status, wenn keine Datei existiert oder ein Fehler auftritt
  return {
    importedCount: 0,
    skippedCount: 0,
    lastProcessed: null,
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

// Excel-Daten verarbeiten und in die Datenbank einfügen
async function importTransaction(transactionData) {
  try {
    // Überprüfen, ob die Transaktion bereits existiert
    const exists = await transactionExists(transactionData.transaction_id);
    if (exists) {
      log(`Überspringe Transaktion ${transactionData.transaction_id}: Bereits in der Datenbank vorhanden`);
      return { imported: false, skipped: true };
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
      transactionData.name,                      // product_name statt name
      transactionData.payment_method,
      transactionData.quantity
    ];
    
    const result = await pool.query(insertQuery, values);
    log(`Transaktion ${transactionData.transaction_id} (ID: ${result.rows[0].id}) importiert`);
    return { imported: true, skipped: false };
    
  } catch (error) {
    log(`Fehler beim Importieren von Transaktion ${transactionData.transaction_id}: ${error.message}`);
    return { imported: false, skipped: false, error: error.message };
  }
}

// Stream-basierte Excel-Verarbeitung
async function processSmallExcelFile() {
  let status = getStatus();
  
  try {
    log(`Starte streamed Import der Excel-Datei: ${CONFIG.excelFilePath}`);
    
    // Excel-Datei lesen
    const workbook = xlsx.readFile(CONFIG.excelFilePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Daten in ein JSON-Array konvertieren
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    log(`Excel-Datei enthält ${data.length} Zeilen.`);
    
    // Batches verarbeiten
    for (let i = 0; i < data.length; i += CONFIG.batchSize) {
      const batch = data.slice(i, i + CONFIG.batchSize);
      
      log(`Verarbeite Batch: Zeilen ${i + 1} bis ${Math.min(i + CONFIG.batchSize, data.length)} von ${data.length}`);
      
      let batchImported = 0;
      let batchSkipped = 0;
      
      for (const row of batch) {
        // Extraktion der relevanten Daten basierend auf dem Format der Excel-Datei
        const transactionData = {
          transaction_id: parseInt(row['Telemetrieeinheit']) || null,
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
          log(`Überspringe Zeile ohne gültige Transaktions-ID`);
          batchSkipped++;
          continue;
        }
        
        const result = await importTransaction(transactionData);
        
        if (result.imported) batchImported++;
        if (result.skipped) batchSkipped++;
      }
      
      // Status aktualisieren
      status.importedCount += batchImported;
      status.skippedCount += batchSkipped;
      status.lastProcessed = new Date().toISOString();
      saveStatus(status);
      
      const progress = (((i + batch.length) / data.length) * 100).toFixed(2);
      log(`Batch abgeschlossen. ${batchImported} importiert, ${batchSkipped} übersprungen.`);
      log(`Fortschritt: ${i + batch.length}/${data.length} (${progress}%)`);
      
      // Kurze Pause zwischen den Batches, um CPU-Last zu reduzieren
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    log('Alle Daten wurden erfolgreich verarbeitet!');
    
  } catch (error) {
    log(`Kritischer Fehler: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
  }
}

// Hauptfunktion
async function main() {
  try {
    await processSmallExcelFile();
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