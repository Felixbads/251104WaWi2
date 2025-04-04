/**
 * Überwachungsskript für den Excel-Import-Prozess
 * 
 * Dieses Skript prüft den Status des Excel-zu-JSON-Konvertierungs- und Import-Prozesses,
 * zeigt detaillierte Informationen an und erlaubt die Überwachung des Fortschritts.
 */

const fs = require('fs');
const path = require('path');

// Konfiguration
const config = {
  excelSplitStatusFile: './excel_split_status.json',
  jsonImportStatusFile: './json_chunks_import_status.json',
  chunksDir: './json_chunks_large',
  detailedMode: true, // Zeigt zusätzliche Informationen an
  maxStatusAge: 300000, // 5 Minuten in Millisekunden
};

/**
 * Formatiert eine Zahl als KB, MB oder GB
 */
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} Byte`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

/**
 * Zeigt an, ob ein Prozess aktiv oder inaktiv ist
 */
function isProcessActive(lastUpdated) {
  if (!lastUpdated) return false;
  
  const lastUpdateTime = new Date(lastUpdated).getTime();
  const currentTime = new Date().getTime();
  
  return (currentTime - lastUpdateTime) < config.maxStatusAge;
}

/**
 * Prüft den Status der Aufteilung
 */
function checkSplitStatus() {
  console.log('=== EXCEL-AUFTEILUNG STATUS ===');
  
  if (!fs.existsSync(config.excelSplitStatusFile)) {
    console.log('Keine Status-Datei für die Excel-Aufteilung gefunden.');
    console.log('Die Aufteilung wurde noch nicht gestartet oder ist fehlgeschlagen.');
    return null;
  }
  
  try {
    const statusContent = fs.readFileSync(config.excelSplitStatusFile, 'utf8');
    const status = JSON.parse(statusContent);
    
    console.log(`Status: ${status.completed ? 'Abgeschlossen' : status.failed ? 'Fehlgeschlagen' : 'In Bearbeitung'}`);
    
    if (status.failed) {
      console.log(`Fehler: ${status.errorMessage || 'Unbekannter Fehler'}`);
    }
    
    console.log(`Fortschritt: ${status.totalProcessed}/${status.totalRows} Zeilen (${((status.totalProcessed / status.totalRows) * 100).toFixed(2)}%)`);
    console.log(`Anzahl erstellter Chunks: ${status.currentChunkIndex}`);
    console.log(`Letzte Verarbeitung: ${status.lastProcessed || 'Noch nicht gestartet'}`);
    
    const isActive = isProcessActive(status.lastProcessed);
    console.log(`Prozess-Status: ${isActive ? 'Aktiv' : 'Inaktiv'}`);
    
    if (config.detailedMode) {
      console.log(`\nDetails:`);
      console.log(`- Aktuelle Zeile: ${status.startRow}`);
      console.log(`- Durchlauf #: ${status.currentPass}`);
    }
    
    return status;
  } catch (err) {
    console.error(`Fehler beim Lesen der Split-Status-Datei: ${err.message}`);
    return null;
  }
}

/**
 * Prüft den Status des JSON-Imports
 */
function checkImportStatus() {
  console.log('\n=== JSON-IMPORT STATUS ===');
  
  if (!fs.existsSync(config.jsonImportStatusFile)) {
    console.log('Keine Status-Datei für den JSON-Import gefunden.');
    console.log('Der Import wurde noch nicht gestartet oder ist fehlgeschlagen.');
    return null;
  }
  
  try {
    const statusContent = fs.readFileSync(config.jsonImportStatusFile, 'utf8');
    const status = JSON.parse(statusContent);
    
    console.log(`Status: ${status.completed ? 'Abgeschlossen' : status.failed ? 'Fehlgeschlagen' : 'In Bearbeitung'}`);
    
    if (status.failed) {
      console.log(`Fehler: ${status.errorMessage || 'Unbekannter Fehler'}`);
    }
    
    if (status.totalChunks > 0) {
      console.log(`Fortschritt: ${status.processedChunks}/${status.totalChunks} Chunks (${((status.processedChunks / status.totalChunks) * 100).toFixed(2)}%)`);
    } else {
      console.log('Fortschritt: Keine Chunks gefunden');
    }
    
    console.log(`Importierte Datensätze: ${status.importedCount}`);
    console.log(`Übersprungene Datensätze: ${status.skippedCount}`);
    console.log(`Letzter verarbeiteter Chunk: ${status.lastProcessedChunk}`);
    console.log(`Letzte Verarbeitung: ${status.lastProcessed || 'Noch nicht gestartet'}`);
    
    const isActive = isProcessActive(status.lastProcessed);
    console.log(`Prozess-Status: ${isActive ? 'Aktiv' : 'Inaktiv'}`);
    
    return status;
  } catch (err) {
    console.error(`Fehler beim Lesen der Import-Status-Datei: ${err.message}`);
    return null;
  }
}

/**
 * Analysiert das Chunks-Verzeichnis
 */
function analyzeChunksDirectory() {
  console.log('\n=== CHUNKS-VERZEICHNIS ANALYSE ===');
  
  if (!fs.existsSync(config.chunksDir)) {
    console.log(`Verzeichnis ${config.chunksDir} existiert nicht.`);
    return;
  }
  
  try {
    const files = fs.readdirSync(config.chunksDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    console.log(`Anzahl JSON-Dateien: ${jsonFiles.length}`);
    
    if (jsonFiles.length === 0) {
      console.log('Keine JSON-Chunks gefunden.');
      return;
    }
    
    // Berechne Gesamtgröße
    let totalSize = 0;
    jsonFiles.forEach(file => {
      const stats = fs.statSync(path.join(config.chunksDir, file));
      totalSize += stats.size;
    });
    
    console.log(`Gesamtgröße: ${formatFileSize(totalSize)}`);
    console.log(`Durchschnittliche Chunk-Größe: ${formatFileSize(totalSize / jsonFiles.length)}`);
    
    // Zeige die ersten und letzten Chunks
    const sortedFiles = jsonFiles.sort();
    
    if (config.detailedMode && sortedFiles.length > 0) {
      console.log('\nBeispiel-Chunks:');
      
      // Zeige ersten Chunk
      const firstChunk = sortedFiles[0];
      const firstChunkStats = fs.statSync(path.join(config.chunksDir, firstChunk));
      console.log(`- Erster: ${firstChunk} (${formatFileSize(firstChunkStats.size)})`);
      
      // Zeige letzten Chunk
      const lastChunk = sortedFiles[sortedFiles.length - 1];
      const lastChunkStats = fs.statSync(path.join(config.chunksDir, lastChunk));
      console.log(`- Letzter: ${lastChunk} (${formatFileSize(lastChunkStats.size)})`);
      
      // Zeige größten Chunk
      let largestChunk = '';
      let largestSize = 0;
      sortedFiles.forEach(file => {
        const stats = fs.statSync(path.join(config.chunksDir, file));
        if (stats.size > largestSize) {
          largestSize = stats.size;
          largestChunk = file;
        }
      });
      
      console.log(`- Größter: ${largestChunk} (${formatFileSize(largestSize)})`);
    }
  } catch (err) {
    console.error(`Fehler bei der Analyse des Chunk-Verzeichnisses: ${err.message}`);
  }
}

/**
 * Zeigt einen Gesamtüberblick zum Importfortschritt an
 */
function showImportSummary(splitStatus, importStatus) {
  console.log('\n=== GESAMTÜBERSICHT ===');
  
  // Prüfe, ob der Excel-zu-JSON-Prozess läuft oder abgeschlossen ist
  const splitComplete = splitStatus && splitStatus.completed;
  const splitFailed = splitStatus && splitStatus.failed;
  const splitRunning = splitStatus && !splitComplete && !splitFailed;
  
  // Prüfe, ob der JSON-zu-DB-Prozess läuft oder abgeschlossen ist
  const importComplete = importStatus && importStatus.completed;
  const importFailed = importStatus && importStatus.failed;
  const importRunning = importStatus && !importComplete && !importFailed;
  
  console.log('1. Excel-zu-JSON Konvertierung:');
  if (!splitStatus) {
    console.log('   Status: Nicht gestartet');
    console.log('   Aktion: Führen Sie "node run_split_excel_to_json.cjs" aus, um die Konvertierung zu starten.');
  } else if (splitComplete) {
    console.log('   Status: Abgeschlossen ✓');
    console.log(`   Chunks: ${splitStatus.currentChunkIndex}`);
  } else if (splitFailed) {
    console.log('   Status: Fehlgeschlagen ✗');
    console.log(`   Fehler: ${splitStatus.errorMessage}`);
    console.log('   Aktion: Führen Sie "node run_split_excel_to_json.cjs" aus, um die Konvertierung neu zu starten.');
  } else {
    console.log('   Status: In Bearbeitung ⟳');
    console.log(`   Fortschritt: ${((splitStatus.totalProcessed / splitStatus.totalRows) * 100).toFixed(2)}%`);
    const isActive = isProcessActive(splitStatus.lastProcessed);
    console.log(`   Zustand: ${isActive ? 'Aktiv' : 'Inaktiv - Neustart erforderlich'}`);
    console.log('   Aktion: Falls inaktiv, führen Sie "node run_split_excel_to_json.cjs" aus, um fortzusetzen.');
  }
  
  console.log('\n2. JSON-zu-Datenbank Import:');
  if (!importStatus) {
    console.log('   Status: Nicht gestartet');
    
    if (splitComplete) {
      console.log('   Aktion: Führen Sie "node run_optimized_json_import.cjs" aus, um den Import zu starten.');
    } else {
      console.log('   Aktion: Warten Sie bis die Excel-zu-JSON-Konvertierung abgeschlossen ist.');
    }
  } else if (importComplete) {
    console.log('   Status: Abgeschlossen ✓');
    console.log(`   Importierte Datensätze: ${importStatus.importedCount}`);
    console.log(`   Übersprungene Datensätze: ${importStatus.skippedCount}`);
  } else if (importFailed) {
    console.log('   Status: Fehlgeschlagen ✗');
    console.log(`   Fehler: ${importStatus.errorMessage}`);
    console.log('   Aktion: Führen Sie "node run_optimized_json_import.cjs" aus, um den Import neu zu starten.');
  } else {
    console.log('   Status: In Bearbeitung ⟳');
    console.log(`   Fortschritt: ${((importStatus.processedChunks / importStatus.totalChunks) * 100).toFixed(2)}%`);
    const isActive = isProcessActive(importStatus.lastProcessed);
    console.log(`   Zustand: ${isActive ? 'Aktiv' : 'Inaktiv - Neustart erforderlich'}`);
    console.log('   Aktion: Falls inaktiv, führen Sie "node run_optimized_json_import.cjs" aus, um fortzusetzen.');
  }
  
  console.log('\nEmpfohlene nächste Schritte:');
  if (!splitStatus || splitFailed || (splitRunning && !isProcessActive(splitStatus.lastProcessed))) {
    console.log('→ Starten/Fortsetzen der Excel-zu-JSON-Konvertierung mit "node run_split_excel_to_json.cjs"');
  } else if (splitComplete && (!importStatus || importFailed || (importRunning && !isProcessActive(importStatus.lastProcessed)))) {
    console.log('→ Starten/Fortsetzen des Datenbank-Imports mit "node run_optimized_json_import.cjs"');
  } else if (importComplete) {
    console.log('✓ Alle Prozesse abgeschlossen! Der Excel-Import ist vollständig beendet.');
  } else {
    console.log('→ Warten Sie, bis der laufende Prozess abgeschlossen ist.');
  }
}

/**
 * Hauptfunktion zur Statusüberprüfung
 */
function checkProcessingStatus() {
  console.log('=== EXCEL-VERARBEITUNGSSTATUS ===');
  console.log(`Zeitstempel: ${new Date().toISOString()}`);
  console.log('');
  
  const splitStatus = checkSplitStatus();
  const importStatus = checkImportStatus();
  
  analyzeChunksDirectory();
  
  showImportSummary(splitStatus, importStatus);
}

// Führe die Statusprüfung aus
checkProcessingStatus();