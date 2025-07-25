/**
 * Test Script für Targeted Historical Backfill
 * 
 * Dieses Skript testet die neue Targeted Historical Backfill Funktionalität
 * zur systematischen Rückwärts-Synchronisation bis 1. Juli 2023.
 */

const axios = require('axios');

const BASE_URL = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
  : 'http://localhost:3000';

console.log('🧪 Teste Targeted Historical Backfill Service');
console.log(`📡 Verwende Base URL: ${BASE_URL}`);

async function testTargetedBackfill() {
  try {
    console.log('\n🚀 Starte Targeted Historical Backfill Test...');
    
    // Test 1: Starte den Backfill-Prozess
    console.log('\n📞 Teste API-Aufruf zum Starten des Backfills...');
    const response = await axios.post(`${BASE_URL}/api/vendon/targeted-backfill`, {
      action: 'start',
      targetDate: '2023-07-01',
      batchSize: 50, // Kleinere Batch-Größe für Tests
      requestDelay: 2000, // 2 Sekunden Verzögerung für Tests
      maxRetries: 2,
      enableDetailedLogging: true
    });

    console.log('✅ API-Antwort erhalten:');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.data.status === 'started') {
      console.log('\n🎉 Targeted Historical Backfill erfolgreich gestartet!');
      console.log('📋 Konfiguration:');
      console.log(`   - Zieldatum: ${response.data.config.targetDate}`);
      console.log(`   - Batch-Größe: ${response.data.config.batchSize}`);
      console.log(`   - Request-Verzögerung: ${response.data.config.requestDelay}ms`);
      console.log(`   - Max. Wiederholungen: ${response.data.config.maxRetries}`);
      console.log(`   - Detailliertes Logging: ${response.data.config.enableDetailedLogging}`);
      
      console.log('\n⏰ Der Backfill-Prozess läuft jetzt im Hintergrund.');
      console.log('📊 Überwachen Sie die Logs im Server-Terminal für den Fortschritt.');
      
      // Test 2: Status-Abfrage
      console.log('\n📞 Teste Status-Abfrage...');
      setTimeout(async () => {
        try {
          const statusResponse = await axios.post(`${BASE_URL}/api/vendon/targeted-backfill`, {
            action: 'status'
          });
          console.log('📈 Status-Antwort:');
          console.log(JSON.stringify(statusResponse.data, null, 2));
        } catch (statusError) {
          console.log('⚠️ Status-Abfrage fehlgeschlagen:', statusError.message);
        }
      }, 5000);
      
    } else {
      console.log('❌ Backfill-Start fehlgeschlagen:', response.data);
    }

  } catch (error) {
    console.error('❌ Fehler beim Testen des Targeted Historical Backfill:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Antwort:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Fehler:', error.message);
    }
  }
}

// Führe den Test aus
testTargetedBackfill()
  .then(() => {
    console.log('\n✅ Test abgeschlossen.');
    console.log('\n📝 Nächste Schritte:');
    console.log('   1. Überprüfen Sie die Server-Logs für detaillierte Backfill-Nachrichten');
    console.log('   2. Nutzen Sie die Frontend-UI unter /vendon-sync -> Historischer Import');
    console.log('   3. Überwachen Sie die Transaktions-Datenbank für neue Einträge');
    console.log('   4. Der Prozess stoppt automatisch beim Erreichen von 2023-07-01');
  })
  .catch((error) => {
    console.error('\n💥 Test fehlgeschlagen:', error.message);
    process.exit(1);
  });