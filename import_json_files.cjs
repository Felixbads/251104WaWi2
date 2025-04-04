/**
 * Import von JSON-Transaktionsdateien in die Datenbank
 * Für die Verwendung mit Dateien, die von convert_excel_to_json.cjs erzeugt wurden
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Konfiguration
const CONFIG = {
  apiEndpoint: 'http://localhost:5000/api/vendon/import/json', // API-Endpunkt für den Import
  jsonDir: './json_chunks', // Verzeichnis mit JSON-Dateien
  delay: 1000, // Verzögerung zwischen Importen in ms
  concurrent: false // Ob Dateien parallel importiert werden sollen
};

/**
 * Importiert eine einzelne JSON-Datei über die API
 * 
 * @param {string} filePath - Pfad zur JSON-Datei
 * @param {Object} options - Optionen für den Import
 * @returns {Object} Ergebnis des Imports
 */
async function importJsonFile(filePath, options = {}) {
  console.log(`Importiere Datei: ${filePath}`);
  
  try {
    // Lese die JSON-Datei
    const jsonContent = fs.readFileSync(filePath, 'utf8');
    const transactions = JSON.parse(jsonContent);
    
    console.log(`Datei enthält ${transactions.length} Transaktionen.`);
    
    // Falls es ein Testlauf ist, nicht tatsächlich importieren
    if (options.dryRun) {
      console.log('Testlauf: Keine tatsächlichen API-Aufrufe.');
      return {
        success: true,
        fileName: path.basename(filePath),
        transactions: transactions.length,
        imported: 0,
        duplicates: 0,
        errors: 0,
        message: 'Testlauf abgeschlossen'
      };
    }
    
    // Importiere die Transaktionen über die API
    const response = await axios.post(options.apiEndpoint || CONFIG.apiEndpoint, {
      transactions,
      skipExistingCheck: false // Prüfe auf Duplikate
    });
    
    if (response.data && response.data.status === 'success') {
      console.log(`Import erfolgreich: ${response.data.stats.saved} gespeichert, ${response.data.stats.duplicates} Duplikate, ${response.data.stats.errors} Fehler`);
      
      return {
        success: true,
        fileName: path.basename(filePath),
        transactions: transactions.length,
        imported: response.data.stats.saved,
        duplicates: response.data.stats.duplicates,
        errors: response.data.stats.errors,
        message: 'Import erfolgreich'
      };
    } else {
      console.error('API-Fehler:', response.data);
      return {
        success: false,
        fileName: path.basename(filePath),
        transactions: transactions.length,
        message: `API-Fehler: ${response.data.message || 'Unbekannter Fehler'}`
      };
    }
  } catch (error) {
    console.error(`Fehler beim Importieren von ${filePath}:`, error.message);
    return {
      success: false,
      fileName: path.basename(filePath),
      message: error.message
    };
  }
}

/**
 * Importiert alle JSON-Dateien in einem Verzeichnis
 * 
 * @param {string} dirPath - Pfad zum Verzeichnis mit JSON-Dateien
 * @param {Object} options - Optionen für den Import
 * @returns {Object} Ergebnis des Imports
 */
async function importJsonDirectory(dirPath, options = {}) {
  console.log(`\nImportiere JSON-Dateien aus: ${dirPath}`);
  console.log(`Optionen: ${JSON.stringify(options)}`);
  
  try {
    // Überprüfe, ob das Verzeichnis existiert
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Verzeichnis ${dirPath} existiert nicht.`);
    }
    
    // Lese alle Dateien im Verzeichnis
    const files = fs.readdirSync(dirPath)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(dirPath, file));
    
    if (files.length === 0) {
      console.log('Keine JSON-Dateien im Verzeichnis gefunden.');
      return {
        success: true,
        filesFound: 0,
        message: 'Keine JSON-Dateien gefunden'
      };
    }
    
    console.log(`${files.length} JSON-Dateien gefunden.`);
    
    // Sortiere Dateien nach Namen (für sequentiellen Import)
    files.sort();
    
    // Initialisiere Statistik
    const stats = {
      totalFiles: files.length,
      processedFiles: 0,
      successfulImports: 0,
      failedImports: 0,
      totalTransactions: 0,
      importedTransactions: 0,
      duplicateTransactions: 0,
      errorTransactions: 0,
      startTime: Date.now()
    };
    
    // Wähle zwischen parallelem und sequentiellem Import
    if (options.concurrent) {
      // Paralleler Import aller Dateien
      console.log('Starte parallelen Import...');
      
      const importPromises = files.map(file => importJsonFile(file, options));
      const results = await Promise.all(importPromises);
      
      // Aktualisiere Statistik
      results.forEach(result => {
        stats.processedFiles++;
        
        if (result.success) {
          stats.successfulImports++;
          stats.totalTransactions += result.transactions || 0;
          stats.importedTransactions += result.imported || 0;
          stats.duplicateTransactions += result.duplicates || 0;
          stats.errorTransactions += result.errors || 0;
        } else {
          stats.failedImports++;
        }
      });
    } else {
      // Sequentieller Import mit Verzögerung
      console.log('Starte sequentiellen Import...');
      
      const delay = options.delay || CONFIG.delay;
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`\nImportiere Datei ${i+1}/${files.length}: ${path.basename(file)}`);
        
        const result = await importJsonFile(file, options);
        
        // Aktualisiere Statistik
        stats.processedFiles++;
        
        if (result.success) {
          stats.successfulImports++;
          stats.totalTransactions += result.transactions || 0;
          stats.importedTransactions += result.imported || 0;
          stats.duplicateTransactions += result.duplicates || 0;
          stats.errorTransactions += result.errors || 0;
        } else {
          stats.failedImports++;
        }
        
        // Verzögerung zwischen Importen (außer beim letzten)
        if (i < files.length - 1 && delay > 0) {
          console.log(`Warte ${delay}ms vor dem nächsten Import...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Zusammenfassung
    const totalTimeSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
    console.log('\n=== Import-Zusammenfassung ===');
    console.log(`Gesamtzeit: ${totalTimeSeconds} Sekunden`);
    console.log(`Verarbeitete Dateien: ${stats.processedFiles}/${stats.totalFiles}`);
    console.log(`Erfolgreiche Importe: ${stats.successfulImports}`);
    console.log(`Fehlgeschlagene Importe: ${stats.failedImports}`);
    console.log(`Gefundene Transaktionen: ${stats.totalTransactions}`);
    console.log(`Importierte Transaktionen: ${stats.importedTransactions}`);
    console.log(`Duplikate: ${stats.duplicateTransactions}`);
    console.log(`Fehler: ${stats.errorTransactions}`);
    
    return {
      success: true,
      message: 'Import abgeschlossen',
      stats
    };
    
  } catch (error) {
    console.error(`Fehler beim Importieren des Verzeichnisses:`, error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Optionen parsen
  const options = {
    apiEndpoint: CONFIG.apiEndpoint,
    concurrent: CONFIG.concurrent,
    delay: CONFIG.delay,
    dryRun: false,
    jsonDir: CONFIG.jsonDir
  };
  
  // Flags parsen
  if (args.includes('--dry-run')) {
    options.dryRun = true;
  }
  
  if (args.includes('--concurrent')) {
    options.concurrent = true;
  }
  
  // Verzeichnis parsen
  const dirArg = args.find(arg => arg.startsWith('--dir='));
  if (dirArg) {
    options.jsonDir = dirArg.split('=')[1];
  }
  
  // API-Endpunkt parsen
  const apiArg = args.find(arg => arg.startsWith('--api='));
  if (apiArg) {
    options.apiEndpoint = apiArg.split('=')[1];
  }
  
  // Verzögerung parsen
  const delayArg = args.find(arg => arg.startsWith('--delay='));
  if (delayArg) {
    options.delay = parseInt(delayArg.split('=')[1], 10);
  }
  
  // Einzelne Datei parsen
  const fileArg = args.find(arg => !arg.startsWith('--'));
  if (fileArg && fileArg.endsWith('.json')) {
    console.log(`Importiere einzelne JSON-Datei: ${fileArg}`);
    const result = await importJsonFile(fileArg, options);
    
    if (result.success) {
      console.log(`\nImport erfolgreich: ${result.message}`);
      if (!options.dryRun) {
        console.log(`Importierte Transaktionen: ${result.imported}`);
        console.log(`Duplikate: ${result.duplicates}`);
        console.log(`Fehler: ${result.errors}`);
      }
    } else {
      console.error(`\nImport fehlgeschlagen: ${result.message}`);
    }
    return;
  }
  
  // Importiere alle JSON-Dateien im Verzeichnis
  const result = await importJsonDirectory(options.jsonDir, options);
  
  if (result.success) {
    console.log(`\nVerzeichnis-Import erfolgreich: ${result.message}`);
  } else {
    console.error(`\nVerzeichnis-Import fehlgeschlagen: ${result.message}`);
  }
}

// Ausführen der Hauptfunktion
if (require.main === module) {
  main().catch(err => {
    console.error('Unbehandelte Ausnahme:', err);
    process.exit(1);
  });
}

// Export für die Verwendung in anderen Skripten
module.exports = { importJsonFile, importJsonDirectory };