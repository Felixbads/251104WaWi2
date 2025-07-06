/**
 * Test Script für Historical Backward Sync
 * 
 * Dieses Script testet die neue historische Rückwärts-Synchronisation
 * mit einem kleinen Datumsbereich zur Validierung.
 */

const axios = require('axios');

const API_BASE = 'http://localhost:5000/api/enhanced-vendon-import';

// Test-Konfiguration
const TEST_CONFIG = {
  targetStartYear: 2024,
  batchSize: 50,
  requestDelay: 2000,
  enableSeasonalEnrichment: true,
  adaptiveTimeWindows: true,
  logLevel: 'detailed'
};

async function testHistoricalBackwardSync() {
  console.log('🧪 Starting Historical Backward Sync Tests');
  console.log('=' .repeat(60));
  
  try {
    // Test 1: Status vor dem Start prüfen
    console.log('\n📊 Test 1: Status vor dem Start');
    const initialStatus = await getBackwardSyncStatus();
    console.log('Initial Status:', initialStatus);
    
    // Test 2: Backward Sync starten
    console.log('\n🚀 Test 2: Backward Sync starten');
    const startResponse = await startBackwardSync(TEST_CONFIG);
    console.log('Start Response:', startResponse);
    
    if (!startResponse.success) {
      console.error('❌ Failed to start backward sync:', startResponse.error);
      return;
    }
    
    // Test 3: Status während des Laufs prüfen
    console.log('\n📈 Test 3: Status während des Laufs');
    await monitorProgress(30); // 30 Sekunden überwachen
    
    // Test 4: Sync-Verlauf abrufen
    console.log('\n📋 Test 4: Sync-Verlauf abrufen');
    const history = await getBackwardSyncHistory();
    console.log('Sync History:', JSON.stringify(history, null, 2));
    
    // Test 5: Optional - Sync stoppen für Testzwecke
    console.log('\n⏹️ Test 5: Sync für Test stoppen');
    const stopResponse = await stopBackwardSync();
    console.log('Stop Response:', stopResponse);
    
    console.log('\n✅ Alle Tests abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Test-Fehler:', error.message);
    if (error.response?.data) {
      console.error('API-Response:', error.response.data);
    }
  }
}

async function startBackwardSync(config) {
  try {
    const response = await axios.post(`${API_BASE}/backward-sync/start`, config);
    return response.data;
  } catch (error) {
    return error.response?.data || { success: false, error: error.message };
  }
}

async function getBackwardSyncStatus() {
  try {
    const response = await axios.get(`${API_BASE}/backward-sync/status`);
    return response.data;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function stopBackwardSync() {
  try {
    const response = await axios.post(`${API_BASE}/backward-sync/stop`);
    return response.data;
  } catch (error) {
    return error.response?.data || { success: false, error: error.message };
  }
}

async function getBackwardSyncHistory() {
  try {
    const response = await axios.get(`${API_BASE}/backward-sync/history?limit=5`);
    return response.data;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function monitorProgress(durationSeconds) {
  console.log(`📊 Überwache Progress für ${durationSeconds} Sekunden...`);
  
  const startTime = Date.now();
  let lastLogTime = 0;
  
  while ((Date.now() - startTime) < (durationSeconds * 1000)) {
    try {
      const status = await getBackwardSyncStatus();
      
      // Log nur alle 5 Sekunden
      if (Date.now() - lastLogTime > 5000) {
        if (status.success && status.isRunning) {
          console.log(`  📈 Status: ${status.totalTransactions} Transaktionen, ${status.savedTransactions} gespeichert, ${status.monthsRemaining} Monate verbleibend`);
          
          if (status.estimatedCompletion) {
            const eta = new Date(status.estimatedCompletion);
            console.log(`  ⏰ Geschätzte Fertigstellung: ${eta.toLocaleString()}`);
          }
        } else if (!status.isRunning) {
          console.log('  ⏹️ Sync ist nicht mehr aktiv');
          break;
        }
        lastLogTime = Date.now();
      }
      
      // Kurze Pause zwischen Checks
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error('  ❌ Status-Check Fehler:', error.message);
    }
  }
}

// Hilfsfunktionen für erweiterte Tests
async function testApiConnectivity() {
  console.log('\n🌐 Test: API-Konnektivität prüfen');
  
  try {
    // Test normale Enhanced Import API
    const response = await axios.get(`${API_BASE}/status`);
    console.log('✅ Enhanced Import API erreichbar:', response.data.success);
    
    // Test Backward Sync API
    const backwardStatus = await axios.get(`${API_BASE}/backward-sync/status`);
    console.log('✅ Backward Sync API erreichbar:', backwardStatus.data.success);
    
  } catch (error) {
    console.error('❌ API-Konnektivitäts-Test fehlgeschlagen:', error.message);
  }
}

async function testValidation() {
  console.log('\n🔍 Test: Eingabe-Validierung');
  
  try {
    // Test ungültige Konfiguration
    const invalidConfig = {
      targetStartYear: 2000, // Zu alt
      batchSize: 200,        // Über API-Limit
      logLevel: 'invalid'    // Ungültiger Log-Level
    };
    
    const response = await axios.post(`${API_BASE}/backward-sync/start`, invalidConfig);
    console.log('⚠️ Validation Response:', response.data);
    
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Validation funktioniert korrekt - ungültige Eingabe abgelehnt');
      console.log('Fehlerdetails:', error.response.data);
    } else {
      console.error('❌ Unerwarteter Validation-Fehler:', error.message);
    }
  }
}

// Hauptfunktion mit erweiterten Tests
async function runComprehensiveTests() {
  console.log('🔬 COMPREHENSIVE HISTORICAL BACKWARD SYNC TESTS');
  console.log('=' .repeat(80));
  
  await testApiConnectivity();
  await testValidation();
  await testHistoricalBackwardSync();
  
  console.log('\n🎉 Alle Tests abgeschlossen!');
  console.log('=' .repeat(80));
}

// Script-Ausführung
if (require.main === module) {
  // Prüfe, ob --comprehensive Flag gesetzt ist
  const args = process.argv.slice(2);
  const comprehensive = args.includes('--comprehensive');
  
  if (comprehensive) {
    runComprehensiveTests().catch(console.error);
  } else {
    testHistoricalBackwardSync().catch(console.error);
  }
}

module.exports = {
  testHistoricalBackwardSync,
  startBackwardSync,
  getBackwardSyncStatus,
  stopBackwardSync,
  getBackwardSyncHistory,
  monitorProgress
};