/**
 * Überprüft grundlegende Informationen über eine Excel-Datei
 */

const fs = require('fs');
const path = require('path');

const excelFilePath1 = './attached_assets/1.xlsx';
const excelFilePath2 = './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx';

function checkFile(filePath) {
  console.log(`\nÜberprüfe Datei: ${filePath}`);
  
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`  - Datei existiert nicht!`);
      return;
    }
    
    const stats = fs.statSync(filePath);
    console.log(`  - Dateigröße: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  - Zuletzt geändert: ${stats.mtime}`);
    console.log(`  - Erstellt: ${stats.birthtime}`);
    console.log(`  - Ist Datei: ${stats.isFile()}`);
    console.log(`  - Ist Verzeichnis: ${stats.isDirectory()}`);
    
    // Zeige die ersten 100 Bytes als Hex und ASCII, um zu sehen, ob es tatsächlich eine Excel-Datei ist
    const buffer = Buffer.alloc(100);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 100, 0);
    fs.closeSync(fd);
    
    console.log(`  - Erste ${bytesRead} Bytes (Hex):`);
    console.log(`    ${buffer.slice(0, bytesRead).toString('hex').match(/.{1,2}/g).join(' ')}`);
    
    // Prüfen, ob es die Excel-Signatur hat (XLSX: 50 4B 03 04)
    const isXlsx = buffer.slice(0, 4).toString('hex').toLowerCase() === '504b0304';
    console.log(`  - Hat XLSX-Signatur: ${isXlsx}`);
    
  } catch (error) {
    console.error(`  - Fehler: ${error.message}`);
  }
}

// Beide Dateien überprüfen
checkFile(excelFilePath1);
checkFile(excelFilePath2);