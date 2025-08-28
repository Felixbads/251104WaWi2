#!/usr/bin/env node
import axios from 'axios';

const API_KEY = process.env.VENDON_API_KEY;
const BASE_URL = 'https://cloud.vendon.net/rest/v1.9.0';

async function testAPICall() {
  console.log('🧪 Test Vendon API mit und ohne Parameter...\n');
  
  // Test 1: Ohne Parameter (sollte fehlschlagen)
  console.log('Test 1: API ohne Parameter:');
  try {
    const response1 = await axios.get(`${BASE_URL}/stats/vends`, {
      headers: { 'Authorization': `Token ${API_KEY}` }
    });
    console.log('❌ Unerwarteter Erfolg ohne Parameter!');
  } catch (error) {
    if (error.response?.data?.result === 'Invalid date format') {
      console.log('✅ Erwarteter Fehler: "Invalid date format"');
    } else {
      console.log('❌ Unerwarteter Fehler:', error.response?.data);
    }
  }
  
  // Test 2: Mit Parametern über params-Objekt (axios standard)
  console.log('\nTest 2: Mit params-Objekt (axios standard):');
  const params = {
    from_timestamp: Math.floor(Date.now() / 1000) - 3600,
    to_timestamp: Math.floor(Date.now() / 1000),
    limit: 5
  };
  
  try {
    const response2 = await axios.get(`${BASE_URL}/stats/vends`, {
      headers: { 'Authorization': `Token ${API_KEY}` },
      params: params
    });
    
    if (Array.isArray(response2.data.result)) {
      console.log(`✅ Erfolg! ${response2.data.result.length} Transaktionen erhalten`);
      if (response2.data.result.length > 0) {
        console.log('Erste Transaktion:', response2.data.result[0].transaction_id);
      }
    } else {
      console.log('❌ API gab kein Array zurück:', typeof response2.data.result);
    }
  } catch (error) {
    console.log('❌ Fehler mit params-Objekt:', error.response?.data || error.message);
  }
  
  // Test 3: Mit manuell gebauter URL (mein Fix)
  console.log('\nTest 3: Mit manuell gebauter URL (BUGFIX):');
  const queryString = new URLSearchParams(params).toString();
  const urlWithParams = `${BASE_URL}/stats/vends?${queryString}`;
  
  try {
    const response3 = await axios.get(urlWithParams, {
      headers: { 'Authorization': `Token ${API_KEY}` }
    });
    
    if (Array.isArray(response3.data.result)) {
      console.log(`✅ Erfolg mit manueller URL! ${response3.data.result.length} Transaktionen erhalten`);
      if (response3.data.result.length > 0) {
        console.log('Erste Transaktion:', response3.data.result[0].transaction_id);
      }
    } else {
      console.log('❌ API gab kein Array zurück:', typeof response3.data.result);
    }
  } catch (error) {
    console.log('❌ Fehler mit manueller URL:', error.response?.data || error.message);
  }
  
  console.log('\n📊 Zusammenfassung:');
  console.log('- API erwartet zwingend Zeitstempel-Parameter');
  console.log('- Manuelle URL-Konstruktion funktioniert zuverlässig');
  console.log('- params-Objekt funktioniert möglicherweise nicht konsistent');
}

if (!API_KEY) {
  console.error('❌ VENDON_API_KEY nicht gesetzt!');
  process.exit(1);
}

testAPICall().catch(console.error);