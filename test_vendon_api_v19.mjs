#!/usr/bin/env node
/**
 * TEST VENDON API v1.9.0
 * Testet die korrigierte API-Verbindung mit v1.9.0
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const API_KEY = process.env.VENDON_API_KEY;
const BASE_URL = 'https://cloud.vendon.net/rest/v1.9.0';

console.log('🔧 Teste Vendon API v1.9.0 Verbindung');
console.log('═════════════════════════════════════');
console.log(`📍 Base URL: ${BASE_URL}`);
console.log(`🔑 API Key: ${API_KEY ? '✅ Vorhanden' : '❌ FEHLT!'}`);
console.log('');

if (!API_KEY) {
  console.error('❌ FEHLER: VENDON_API_KEY nicht gefunden in .env');
  process.exit(1);
}

// Test 1: Machines endpoint
async function testMachines() {
  console.log('📊 Test 1: Machines Endpoint');
  console.log('─────────────────────────────');
  
  const url = `${BASE_URL}/machines`;
  console.log(`🔗 URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📡 Status: ${response.status} ${response.statusText}`);
    console.log(`📋 Headers:`, response.headers.raw());
    
    if (response.status === 401) {
      console.error('❌ Authentifizierung fehlgeschlagen - API-Key ungültig oder falsche Version');
      const text = await response.text();
      console.log('Response:', text.substring(0, 500));
      return false;
    }
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`✅ Erfolgreich! ${Array.isArray(data?.result) ? data.result.length : 0} Maschinen gefunden`);
      
      if (data?.result && data.result.length > 0) {
        console.log('\n📍 Erste Maschine:');
        const machine = data.result[0];
        console.log(`  - ID: ${machine.id}`);
        console.log(`  - Name: ${machine.name}`);
        console.log(`  - Status: ${machine.status}`);
      }
      return true;
    }
    
    console.warn(`⚠️ Unerwarteter Status: ${response.status}`);
    const text = await response.text();
    console.log('Response:', text.substring(0, 500));
    return false;
    
  } catch (error) {
    console.error('❌ Fehler:', error.message);
    return false;
  }
}

// Test 2: Transactions endpoint  
async function testTransactions() {
  console.log('\n📊 Test 2: Transactions (stats/vends) Endpoint');
  console.log('───────────────────────────────────────────────');
  
  const now = Math.floor(Date.now() / 1000);
  const yesterday = now - 86400;
  
  const params = new URLSearchParams({
    from_timestamp: yesterday.toString(),
    to_timestamp: now.toString(),
    limit: '10'
  });
  
  const url = `${BASE_URL}/stats/vends?${params}`;
  console.log(`🔗 URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📡 Status: ${response.status} ${response.statusText}`);
    
    if (response.status === 401) {
      console.error('❌ Authentifizierung fehlgeschlagen');
      const text = await response.text();
      console.log('Response:', text.substring(0, 500));
      return false;
    }
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`✅ Erfolgreich! ${Array.isArray(data?.result) ? data.result.length : 0} Transaktionen gefunden`);
      
      if (data?.result && data.result.length > 0) {
        console.log('\n💰 Erste Transaktion:');
        const tx = data.result[0];
        console.log(`  - Transaction ID: ${tx.transaction_id}`);
        console.log(`  - Machine ID: ${tx.machine_id}`);
        console.log(`  - Machine Name: ${tx.machine_name}`);
        console.log(`  - Timestamp: ${tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : 'N/A'}`);
      }
      return true;
    }
    
    console.warn(`⚠️ Unerwarteter Status: ${response.status}`);
    const text = await response.text();
    console.log('Response:', text.substring(0, 500));
    return false;
    
  } catch (error) {
    console.error('❌ Fehler:', error.message);
    return false;
  }
}

// Führe Tests aus
async function runTests() {
  console.log('🚀 Starte API Tests...\n');
  
  const machinesOk = await testMachines();
  const transactionsOk = await testTransactions();
  
  console.log('\n═════════════════════════════════════');
  console.log('📊 TESTERGEBNIS:');
  console.log('─────────────────────────────────────');
  console.log(`  Machines API: ${machinesOk ? '✅ OK' : '❌ FEHLER'}`);
  console.log(`  Transactions API: ${transactionsOk ? '✅ OK' : '❌ FEHLER'}`);
  
  if (machinesOk && transactionsOk) {
    console.log('\n✅ Alle Tests erfolgreich! API v1.9.0 funktioniert korrekt.');
  } else {
    console.log('\n❌ Einige Tests fehlgeschlagen. Bitte prüfen Sie die Fehlermeldungen oben.');
  }
}

runTests().catch(console.error);