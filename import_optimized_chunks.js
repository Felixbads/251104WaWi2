const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Konfiguration
const config = {
  sourceDir: 'json_chunks_optimized',
  apiEndpoint: 'http://localhost:5000/api/vendon/import/json',
  delayBetweenRequests: 3000  // 3 Sekunden zwischen den Anfragen
};

// Funktion zum Importieren einer einzelnen JSON-Datei
async function importJsonFile(filePath) {
  try {
    const fileData = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(fileData);
    
    console.log(`Importiere Datei: ${path.basename(filePath)}`);
    
    // API-Anfrage zum Import der Daten
    const response = await axios.post(config.apiEndpoint, jsonData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Import abgeschlossen für ${path.basename(filePath)}`);
    console.log(`Status: ${response.status}`);
    console.log(`Ergebnis: ${JSON.stringify(response.data, null, 2)}`);
    
    return {
      success: true,
      fileName: path.basename(filePath),
      result: response.data
    };
  } catch (error) {
    console.error(`Fehler beim Importieren von ${path.basename(filePath)}:`, error.message);
    return {
      success: false,
      fileName: path.basename(filePath),
      error: error.message
    };
  }
}

// Hauptfunktion zum Importieren von Dateien mit einem bestimmten Muster
async function importSelectedFiles(pattern, startIndex = 0, count = 10) {
  console.log(`Import von ${count} Dateien mit dem Muster "${pattern}" gestartet, beginnend bei Index ${startIndex}`);
  
  // Lese das Quellverzeichnis
  const files = fs.readdirSync(config.sourceDir)
    .filter(file => file.includes(pattern))
    .sort((a, b) => {
      // Extrahiere die Zahlen aus den Dateinamen für eine numerische Sortierung
      const numA = parseInt(a.match(/split(\d+)/)[1]);
      const numB = parseInt(b.match(/split(\d+)/)[1]);
      return numA - numB;
    });
  
  console.log(`${files.length} Dateien gefunden, die dem Muster entsprechen.`);
  
  // Wähle die zu importierenden Dateien aus
  const selectedFiles = files.slice(startIndex, startIndex + count);
  console.log(`${selectedFiles.length} Dateien für den Import ausgewählt.`);
  
  // Statistik-Objekt
  const stats = {
    total: selectedFiles.length,
    successful: 0,
    failed: 0,
    details: []
  };
  
  // Importiere die Dateien nacheinander mit Verzögerung
  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    const filePath = path.join(config.sourceDir, file);
    
    console.log(`Import ${i + 1}/${selectedFiles.length}: ${file}`);
    const result = await importJsonFile(filePath);
    
    if (result.success) {
      stats.successful++;
    } else {
      stats.failed++;
    }
    
    stats.details.push(result);
    
    // Verzögerung zwischen den Importen, außer nach dem letzten
    if (i < selectedFiles.length - 1) {
      console.log(`Warte ${config.delayBetweenRequests}ms vor dem nächsten Import...`);
      await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
    }
  }
  
  // Zeige Import-Zusammenfassung
  console.log('\n--- Import-Zusammenfassung ---');
  console.log(`Gesamt: ${stats.total}`);
  console.log(`Erfolgreich: ${stats.successful}`);
  console.log(`Fehlgeschlagen: ${stats.failed}`);
  
  return stats;
}

// Kommandozeilenargumente parsen
const args = process.argv.slice(2);
const pattern = args[0] || 'split';
const startIndex = parseInt(args[1] || '0');
const count = parseInt(args[2] || '10');

// Starte den Import
importSelectedFiles(pattern, startIndex, count)
  .then(stats => {
    console.log('Import abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fehler beim Import:', error);
    process.exit(1);
  });