/**
 * Vollständige Historische Synchronisation ab 01.01.2024
 * 
 * Startet eine systematische 6-Stunden-Intervall-Synchronisation für alle
 * fehlenden historischen Daten von 2024 bis heute.
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

/**
 * Analysiert bestehende Transaktionslücken
 */
async function analyzeDataGaps() {
  console.log('Analysiere Datenlücken in der Transaktionshistorie...');
  
  try {
    // Hole Transaktionen der letzten 18 Monate
    const startAnalysis = new Date('2024-01-01');
    const endAnalysis = new Date();
    
    const response = await axios.get(`${BASE_URL}/transactions/byDateRange`, {
      params: {
        startDate: startAnalysis.toISOString(),
        endDate: endAnalysis.toISOString()
      }
    });

    const transactions = response.data;
    console.log(`Analysiere ${transactions.length} bestehende Transaktionen...`);

    // Gruppiere nach Monaten
    const transactionsByMonth = {};
    transactions.forEach(t => {
      const month = t.datetime.substring(0, 7); // YYYY-MM
      transactionsByMonth[month] = (transactionsByMonth[month] || 0) + 1;
    });

    console.log('\nTransaktionen pro Monat:');
    const currentDate = new Date('2024-01-01');
    const gaps = [];
    
    while (currentDate <= new Date()) {
      const monthKey = currentDate.toISOString().substring(0, 7);
      const count = transactionsByMonth[monthKey] || 0;
      
      console.log(`${monthKey}: ${count} Transaktionen ${count === 0 ? '❌ KOMPLETT FEHLEND' : count < 100 ? '⚠️  WENIGE DATEN' : '✅'}`);
      
      if (count < 100) { // Monate mit weniger als 100 Transaktionen sind verdächtig
        gaps.push({
          month: monthKey,
          count: count,
          priority: count === 0 ? 'high' : 'medium'
        });
      }
      
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return gaps;
  } catch (error) {
    console.error('Fehler bei der Datenanalyse:', error.message);
    return [];
  }
}

/**
 * Startet systematische historische Synchronisation in optimierten Chunks
 */
async function startSystematicSync() {
  console.log('\nStarte systematische historische Synchronisation...');
  console.log('Konfiguration: 6-Stunden-Intervalle von 01.01.2024 bis heute');
  
  try {
    const response = await axios.post(`${BASE_URL}/vendon/sync`, {
      type: 'systematic-historical',
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: new Date().toISOString(),
      intervalHours: 6,
      batchSize: 100
    });

    console.log('✅ Systematische Synchronisation gestartet:', response.data.message);
    
    if (response.data.syncLogId) {
      console.log(`Sync-Log-ID: ${response.data.syncLogId}`);
      
      // Starte Fortschrittsüberwachung
      await monitorSyncProgress(response.data.syncLogId);
    }

    return response.data;
  } catch (error) {
    console.error('❌ Fehler beim Starten der systematischen Synchronisation:', error.message);
    if (error.response?.data) {
      console.error('Fehlerdetails:', error.response.data);
    }
    throw error;
  }
}

/**
 * Überwacht den Synchronisationsfortschritt
 */
async function monitorSyncProgress(syncLogId) {
  console.log('\n📊 Starte Fortschrittsüberwachung...');
  
  let isCompleted = false;
  let lastProgress = '';
  
  while (!isCompleted) {
    try {
      const statusResponse = await axios.get(`${BASE_URL}/sync/status`);
      const status = statusResponse.data;
      
      // Suche nach unserem Sync-Log
      let currentSync = null;
      for (const [type, typeStatus] of Object.entries(status)) {
        if (typeStatus.syncLogId === syncLogId) {
          currentSync = typeStatus;
          break;
        }
      }
      
      if (currentSync) {
        const progress = `${currentSync.status} - Gefunden: ${currentSync.itemsFound || 0}, Gespeichert: ${currentSync.itemsSaved || 0}, Duplikate: ${currentSync.duplicates || 0}`;
        
        if (progress !== lastProgress) {
          console.log(`⏳ ${new Date().toLocaleTimeString()}: ${progress}`);
          lastProgress = progress;
        }
        
        if (currentSync.status === 'completed' || currentSync.status === 'error') {
          isCompleted = true;
          console.log(`\n${currentSync.status === 'completed' ? '✅' : '❌'} Synchronisation abgeschlossen!`);
          
          if (currentSync.status === 'completed') {
            console.log(`📊 Endergebnis:`);
            console.log(`   - Neue Transaktionen: ${currentSync.itemsSaved || 0}`);
            console.log(`   - Duplikate gefunden: ${currentSync.duplicates || 0}`);
            console.log(`   - Fehler: ${currentSync.errors || 0}`);
          }
        }
      }
      
      // Warte 10 Sekunden vor der nächsten Prüfung
      if (!isCompleted) {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
    } catch (error) {
      console.error('Fehler bei Fortschrittsabfrage:', error.message);
      await new Promise(resolve => setTimeout(resolve, 30000)); // Längere Pause bei Fehlern
    }
  }
}

/**
 * Startet zusätzliche monatliche Sync für kritische Lücken
 */
async function syncCriticalGaps(gaps) {
  const highPriorityGaps = gaps.filter(gap => gap.priority === 'high');
  
  if (highPriorityGaps.length === 0) {
    console.log('\nKeine kritischen Datenlücken gefunden.');
    return;
  }
  
  console.log(`\n🔧 Starte gezielte Synchronisation für ${highPriorityGaps.length} kritische Lücken...`);
  
  for (const gap of highPriorityGaps) {
    console.log(`\n🔄 Synchronisiere fehlenden Monat: ${gap.month}`);
    
    const [year, month] = gap.month.split('-');
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59); // Letzter Tag des Monats
    
    try {
      const response = await axios.post(`${BASE_URL}/vendon/sync`, {
        type: 'transactions',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        batchSize: 100,
        forceUpdate: true
      });
      
      console.log(`✅ Monat ${gap.month} Synchronisation gestartet: ${response.data.message}`);
      
      // Kurze Pause zwischen den Monaten
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error(`❌ Fehler bei Synchronisation von ${gap.month}:`, error.message);
    }
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🚀 Vollständige Historische Vendon-Synchronisation');
  console.log('=====================================\n');
  
  try {
    // 1. Analysiere bestehende Datenlücken
    const gaps = await analyzeDataGaps();
    
    // 2. Starte systematische Synchronisation für alle Daten ab 01.01.2024
    await startSystematicSync();
    
    // 3. Nach Abschluss: Gezielte Nachsynchronisation für kritische Lücken
    if (gaps.length > 0) {
      console.log('\n⏳ Warte 30 Sekunden vor gezielter Nachsynchronisation...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      await syncCriticalGaps(gaps);
    }
    
    console.log('\n🎉 Vollständige historische Synchronisation abgeschlossen!');
    console.log('\n💡 Empfohlene nächste Schritte:');
    console.log('   1. Datenqualität mit SQL-Abfragen prüfen');
    console.log('   2. Dashboard auf vollständige Darstellung überprüfen');
    console.log('   3. Automatische tägliche Synchronisation einrichten');
    
  } catch (error) {
    console.error('\n💥 Kritischer Fehler bei der historischen Synchronisation:', error.message);
    process.exit(1);
  }
}

// Führe das Skript aus
main().catch(error => {
  console.error('💥 Unerwarteter Fehler:', error);
  process.exit(1);
});