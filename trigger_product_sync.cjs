#!/usr/bin/env node

const axios = require('axios');

// Korrekte URL für die Replit-Umgebung
const BASE_URL = 'https://0250c0c2-8082-4e67-a4e3-a44a9518eee6-00-29uj3axg90g11.sisko.replit.dev';

async function triggerProductSync() {
  try {
    console.log('Starte den Neuimport der Produkte von Vendon...');
    
    // Rufe die Sync-API auf
    console.log('Rufe die Sync-API auf...');
    const syncResponse = await axios.post(`${BASE_URL}/api/sync/products`, {
      fullSync: true
    });
    
    console.log('Sync-Vorgang gestartet:', syncResponse.data);
    console.log('Bitte warten Sie, bis der Sync-Vorgang abgeschlossen ist.');
  } catch (error) {
    console.error('Fehler beim Neuimport:', error.response?.data || error.message);
  }
}

// Führe die Funktion aus
triggerProductSync().then(() => {
  console.log('Import-Vorgang initiiert.');
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});