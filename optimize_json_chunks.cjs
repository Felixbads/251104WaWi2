/**
 * Dieses Skript verarbeitet bestehende JSON-Chunks und erzeugt kleinere Pakete
 */

const fs = require('fs');
const path = require('path');

// Konfiguration
const CONFIG = {
  sourceDir: './json_chunks_large',
  targetDir: './json_chunks_optimized',
  maxItemsPerChunk: 25  // Kleine Batches für zuverlässigere API-Anfragen
};

/**
 * Liest einen JSON-Chunk aus dem Quelldatenverzeichnis
 * @param {string} filePath - Pfad zur Quelldatei
 * @returns {Array} - Array von Transaktionsobjekten
 */
function readJsonChunk(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Fehler beim Lesen von ${filePath}: ${error.message}`);
    return [];
  }
}

/**
 * Schreibt einen JSON-Chunk in das Zielverzeichnis
 * @param {string} fileName - Name für die Zieldatei
 * @param {Array} data - Zu schreibende Daten
 * @returns {boolean} - Erfolg der Operation
 */
function writeJsonChunk(fileName, data) {
  try {
    const targetPath = path.join(CONFIG.targetDir, fileName);
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Fehler beim Schreiben von ${fileName}: ${error.message}`);
    return false;
  }
}

/**
 * Splitted einen großen JSON-Chunk in kleinere Teile
 * @param {string} sourceFile - Quell-JSON-Datei
 * @param {string} baseName - Basis-Name für die Ausgabedateien
 * @returns {number} - Anzahl der erzeugten Chunks
 */
function splitChunk(sourceFile, baseName) {
  const transactions = readJsonChunk(sourceFile);
  
  if (!transactions || !transactions.length) {
    console.error(`Keine Transaktionen in ${sourceFile} gefunden.`);
    return 0;
  }
  
  console.log(`Splitte ${sourceFile} mit ${transactions.length} Transaktionen`);
  
  const totalChunks = Math.ceil(transactions.length / CONFIG.maxItemsPerChunk);
  let chunksCreated = 0;
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CONFIG.maxItemsPerChunk;
    const end = Math.min(start + CONFIG.maxItemsPerChunk, transactions.length);
    const chunk = transactions.slice(start, end);
    
    // Dateinamen erzeugen: baseName_split1.json, baseName_split2.json, ...
    const chunkName = `${baseName}_split${i + 1}.json`;
    
    if (writeJsonChunk(chunkName, chunk)) {
      chunksCreated++;
      console.log(`Chunk ${i + 1}/${totalChunks} gespeichert: ${chunkName} (${chunk.length} Einträge)`);
    }
  }
  
  return chunksCreated;
}

/**
 * Verarbeitet alle JSON-Dateien im Quelldatenverzeichnis
 */
function processAllChunks() {
  // Sicherstellen, dass das Zielverzeichnis existiert
  if (!fs.existsSync(CONFIG.targetDir)) {
    fs.mkdirSync(CONFIG.targetDir, { recursive: true });
    console.log(`Verzeichnis ${CONFIG.targetDir} erstellt.`);
  }
  
  // Quelldateien auflisten
  const files = fs.readdirSync(CONFIG.sourceDir)
    .filter(file => file.endsWith('.json'))
    .sort(); // Natürliche Sortierung
  
  console.log(`${files.length} JSON-Dateien im Quellverzeichnis gefunden.`);
  
  let totalProcessed = 0;
  let totalChunksCreated = 0;
  
  // Jede Datei verarbeiten
  for (const file of files) {
    const sourceFile = path.join(CONFIG.sourceDir, file);
    // Basis-Name für die gesplitteten Dateien
    const baseName = path.basename(file, '.json');
    
    const chunksCreated = splitChunk(sourceFile, baseName);
    totalChunksCreated += chunksCreated;
    totalProcessed++;
    
    console.log(`Datei ${totalProcessed}/${files.length} verarbeitet: ${file} => ${chunksCreated} optimierte Chunks`);
  }
  
  console.log(`\nVerarbeitung abgeschlossen!`);
  console.log(`- Verarbeitete Quelldateien: ${totalProcessed}`);
  console.log(`- Erzeugte optimierte Chunks: ${totalChunksCreated}`);
  console.log(`- Zielverzeichnis: ${CONFIG.targetDir}`);
  
  return { processed: totalProcessed, created: totalChunksCreated };
}

// Hauptausführung
function main() {
  const args = process.argv.slice(2);
  
  // Parameter verarbeiten
  for (const arg of args) {
    if (arg.startsWith('--source=')) {
      CONFIG.sourceDir = arg.split('=')[1];
    } else if (arg.startsWith('--target=')) {
      CONFIG.targetDir = arg.split('=')[1];
    } else if (arg.startsWith('--max-items=')) {
      CONFIG.maxItemsPerChunk = parseInt(arg.split('=')[1]);
    }
  }
  
  console.log(`Starte Optimierung der JSON-Chunks`);
  console.log(`Optionen: Quellverzeichnis=${CONFIG.sourceDir}, Zielverzeichnis=${CONFIG.targetDir}, Max. Elemente pro Chunk=${CONFIG.maxItemsPerChunk}`);
  
  try {
    const result = processAllChunks();
    process.exit(0);
  } catch (error) {
    console.error(`Fehler bei der Verarbeitung: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();