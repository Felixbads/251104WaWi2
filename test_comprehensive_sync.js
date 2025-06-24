/**
 * Test Script für Comprehensive Data Sync
 * 
 * Testet die neue umfassende Datensynchronisierung für Wetter- und Feiertagsdaten
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const API_TOKEN = process.env.API_TOKEN || 'i006fjv1spjm9uzop5x';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function testSyncStatus() {
  console.log('🔍 Teste Sync-Status API...');
  try {
    const response = await api.get('/api/comprehensive-data/status');
    console.log('✅ Status API funktioniert');
    console.log(`   Kalenderdaten: ${response.data.data.coverage.calendar.count}`);
    console.log(`   Feiertage: ${response.data.data.coverage.holidays.count}`);
    console.log(`   Wetterdaten: ${response.data.data.coverage.weather.count}`);
    return true;
  } catch (error) {
    console.log('❌ Status API Fehler:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testHolidaySync() {
  console.log('\n🎉 Teste Feiertags-Synchronisierung...');
  try {
    const response = await api.post('/api/comprehensive-data/sync-holidays', {
      startYear: 2024,
      endYear: 2024,
      states: ['SN'] // Nur Sachsen für Test
    });
    
    if (response.data.success) {
      console.log('✅ Feiertags-Sync erfolgreich');
      console.log(`   Nachricht: ${response.data.message}`);
      if (response.data.data) {
        console.log(`   Kalender: ${response.data.data.calendar?.synced} synchronisiert`);
        console.log(`   Feiertage: ${response.data.data.holidays?.synced} synchronisiert`);
        console.log(`   Schulferien: ${response.data.data.schoolHolidays?.synced} synchronisiert`);
      }
      return true;
    } else {
      console.log('❌ Feiertags-Sync fehlgeschlagen:', response.data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Feiertags-Sync Fehler:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testWeatherSync() {
  console.log('\n🌤️ Teste Wetter-Synchronisierung...');
  
  // Prüfe zuerst ob API-Key vorhanden ist
  if (!process.env.OPENWEATHER_API_KEY) {
    console.log('⚠️  OpenWeather API-Key nicht gefunden - überspringe Wetter-Test');
    return true;
  }
  
  try {
    const response = await api.post('/api/comprehensive-data/sync-weather', {
      startYear: 2024,
      endYear: 2024,
      states: ['SN']
    });
    
    if (response.data.success) {
      console.log('✅ Wetter-Sync erfolgreich');
      console.log(`   Nachricht: ${response.data.message}`);
      if (response.data.data?.weather) {
        console.log(`   Wetterdaten: ${response.data.data.weather.synced} synchronisiert`);
      }
      return true;
    } else {
      console.log('❌ Wetter-Sync fehlgeschlagen:', response.data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Wetter-Sync Fehler:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testComprehensiveSync() {
  console.log('\n🔄 Teste vollständige Synchronisierung...');
  try {
    const response = await api.post('/api/comprehensive-data/sync', {
      startYear: 2024,
      endYear: 2024,
      includeWeather: !!process.env.OPENWEATHER_API_KEY,
      includeHolidays: true,
      states: ['SN']
    });
    
    if (response.data.success) {
      console.log('✅ Vollständige Sync erfolgreich');
      console.log(`   Nachricht: ${response.data.message}`);
      return true;
    } else {
      console.log('❌ Vollständige Sync fehlgeschlagen:', response.data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Vollständige Sync Fehler:', error.response?.data?.message || error.message);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🧪 COMPREHENSIVE DATA SYNC - FUNKTIONSTEST');
  console.log('='.repeat(60));
  
  const tests = [
    { name: 'Sync Status', fn: testSyncStatus },
    { name: 'Holiday Sync', fn: testHolidaySync },
    { name: 'Weather Sync', fn: testWeatherSync },
    { name: 'Comprehensive Sync', fn: testComprehensiveSync }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    const result = await test.fn();
    if (result) passed++;
    
    // Kurze Pause zwischen Tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 TESTERGEBNISSE: ${passed}/${total} Tests bestanden`);
  console.log('='.repeat(60));
  
  if (passed === total) {
    console.log('🎉 Alle Tests erfolgreich! Das System ist bereit.');
  } else {
    console.log('⚠️  Einige Tests fehlgeschlagen. Prüfe die Logs oben.');
  }
  
  console.log('\n💡 Nächste Schritte:');
  console.log('   1. Füge OPENWEATHER_API_KEY zur .env hinzu für Wetterdaten');
  console.log('   2. Führe vollständigen Import aus: node import_comprehensive_data.js --all-states');
  console.log('   3. Verwende die neue ComprehensiveDataSyncTab Komponente im Frontend');
}

main().catch(error => {
  console.error('💥 Kritischer Testfehler:', error);
  process.exit(1);
});