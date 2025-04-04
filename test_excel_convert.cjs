const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const filePath = './attached_assets/1.xlsx';

console.log(`Versuche Excel-Datei zu lesen: ${filePath}`);
console.log(`Datei existiert: ${fs.existsSync(filePath)}`);

try {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Konvertiere das erste Arbeitsblatt in JSON
  const data = xlsx.utils.sheet_to_json(worksheet, { raw: true });
  
  console.log(`Excel-Datei erfolgreich gelesen. ${data.length} Zeilen gefunden.`);
  console.log('Erste 2 Einträge:');
  console.log(JSON.stringify(data.slice(0, 2), null, 2));
  
} catch (error) {
  console.error(`Fehler beim Lesen der Excel-Datei: ${error.message}`);
}