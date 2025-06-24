// Dieses Skript dient der Diagnose der API für Maschinen-Statistiken
const axios = require('axios');
const fs = require('fs');

// API-Endpunkt für die Maschine mit der ID 347989
const API_URL = 'http://localhost:3000/api/machines/347989/daily-stats';

// Funktion zum Abrufen der Daten
async function fetchMachineStats() {
  try {
    console.log('Anfrage an API-Endpunkt:', API_URL);
    const response = await axios.get(API_URL);
    console.log('Antwort-Status:', response.status);
    console.log('Antwort-Daten:', JSON.stringify(response.data, null, 2));

    // Speichern der Antwort in einer Datei
    fs.writeFileSync('api-response.json', JSON.stringify(response.data, null, 2));
    console.log('Antwort wurde in api-response.json gespeichert');
  } catch (error) {
    console.error('Fehler beim Abrufen der Daten:', error.message);
    
    if (error.response) {
      // Der Server hat mit einem Fehler geantwortet
      console.error('  Status:', error.response.status);
      console.error('  Fehlermeldung:', error.response.data);
    } else if (error.request) {
      // Die Anfrage wurde gestellt, aber keine Antwort erhalten
      console.error('  Keine Antwort vom Server erhalten');
    }
  }
}

// Ausführen der Funktion
fetchMachineStats();