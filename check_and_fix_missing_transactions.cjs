/**
 * Überprüfung und Reparatur fehlender Transaktionen
 * 
 * 1. Prüft die letzten 5 Tage auf fehlende Transaktionen
 * 2. Startet systematische historische Synchronisation ab 01.01.2024
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

/**
 * Prüft fehlende Transaktionen der letzten 5 Tage
 */
async function checkMissingTransactions() {
  console.log('🔍 Überprüfe fehlende Transaktionen der letzten 5 Tage...');
  
  try {
    // Hole aktuelle Transaktionsverteilung
    const response = await axios.get(`${BASE_URL}/transactions/byDateRange`, {
      params: {
        startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString()
      }
    });

    const transactions = response.data;
    console.log(`✅ ${transactions.length} Transaktionen in den letzten 5 Tagen gefunden`);

    // Gruppiere nach Tagen
    const transactionsByDay = {};
    transactions.forEach(t => {
      const day = t.datetime.split('T')[0];
      transactionsByDay[day] = (transactionsByDay[day] || 0) + 1;
    });

    console.log('\n📊 Transaktionen pro Tag:');
    for (let i = 4; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const count = transactionsByDay[dateStr] || 0;
      console.log(`${dateStr}: ${count} Transaktionen ${count === 0 ? '❌ FEHLT' : ''}`);
    }

    return transactionsByDay;
  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Transaktionen:', error.message);
    return {};
  }
}

/**
 * Synchronisiert fehlende Tage
 */
async function syncMissingDays(transactionsByDay) {
  console.log('\n🔄 Synchronisiere fehlende Tage...');

  for (let i = 4; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    const count = transactionsByDay[dateStr] || 0;

    if (count < 10) { // Weniger als 10 Transaktionen pro Tag ist verdächtig
      console.log(`🔄 Synchronisiere ${dateStr} (nur ${count} Transaktionen)...`);
      
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      try {
        const syncResponse = await axios.post(`${BASE_URL}/vendon/sync`, {
          type: 'transactions',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          batchSize: 100,
          forceUpdate: true
        });

        console.log(`✅ Synchronisation für ${dateStr} gestartet: ${syncResponse.data.message}`);
        
        // Warte 3 Sekunden zwischen den Synchronisationen
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.error(`❌ Fehler bei Synchronisation für ${dateStr}:`, error.message);
      }
    }
  }
}

/**
 * Startet systematische historische Synchronisation ab 01.01.2024
 */
async function startSystematicHistoricalSync() {
  console.log('\n🚀 Starte systematische historische Synchronisation ab 01.01.2024...');
  
  try {
    const response = await axios.post(`${BASE_URL}/vendon/sync`, {
      type: 'systematic-historical',
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: new Date().toISOString(),
      intervalHours: 6,
      batchSize: 100
    });

    console.log('✅ Systematische historische Synchronisation gestartet:', response.data.message);
    
    if (response.data.syncLogId) {
      console.log(`📋 Sync-Log-ID: ${response.data.syncLogId}`);
      console.log('💡 Sie können den Fortschritt mit diesem Befehl überwachen:');
      console.log(`   curl -s "http://localhost:5000/api/sync/status" | jq`);
    }

    return response.data;
  } catch (error) {
    console.error('❌ Fehler beim Starten der systematischen Synchronisation:', error.message);
    if (error.response?.data) {
      console.error('Fehlerdetails:', error.response.data);
    }
    return null;
  }
}

/**
 * Prüft den Status der Vendon API-Verbindung
 */
async function checkVendonConnection() {
  console.log('🔗 Prüfe Vendon API-Verbindung...');
  
  try {
    const response = await axios.get(`${BASE_URL}/debug/refills`);
    const data = response.data;
    
    if (data.analysis && data.analysis.total > 0) {
      console.log(`✅ Vendon API funktioniert: ${data.analysis.total} Refills gefunden`);
      return true;
    } else {
      console.log('⚠️  Vendon API antwortet, aber keine Daten erhalten');
      return false;
    }
  } catch (error) {
    console.error('❌ Vendon API-Verbindung fehlgeschlagen:', error.message);
    return false;
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🏁 Starte Überprüfung und Reparatur der Transaktionssynchronisation\n');

  // 1. Prüfe API-Verbindung
  const apiWorking = await checkVendonConnection();
  if (!apiWorking) {
    console.log('❌ Abbruch: Vendon API-Verbindung funktioniert nicht');
    return;
  }

  // 2. Prüfe fehlende Transaktionen der letzten 5 Tage
  const transactionsByDay = await checkMissingTransactions();

  // 3. Synchronisiere fehlende Tage
  await syncMissingDays(transactionsByDay);

  // 4. Starte systematische historische Synchronisation
  const historicalSync = await startSystematicHistoricalSync();

  console.log('\n✅ Überprüfung und Reparatur abgeschlossen!');
  console.log('\n📋 Zusammenfassung:');
  console.log('- Vendon API-Verbindung überprüft');
  console.log('- Fehlende Transaktionen der letzten 5 Tage nachgeholt');
  console.log('- Systematische historische Synchronisation ab 01.01.2024 gestartet');
  
  if (historicalSync && historicalSync.syncLogId) {
    console.log(`\n💡 Überwachen Sie den Fortschritt mit:`);
    console.log(`   curl -s "http://localhost:5000/api/sync/status" | jq`);
  }
}

// Führe das Skript aus
main().catch(error => {
  console.error('💥 Unerwarteter Fehler:', error);
  process.exit(1);
});