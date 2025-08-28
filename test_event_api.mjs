#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

const VENDON_API_KEY = process.env.VENDON_API_KEY;
const VENDON_BASE_URL = process.env.VENDON_BASE_URL || 'https://www.vendon.cloud/api/v2';

async function testEventAPI() {
  if (!VENDON_API_KEY) {
    console.error('❌ VENDON_API_KEY nicht gesetzt');
    process.exit(1);
  }

  console.log('🔍 Teste Vendon Events API...');

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
  
  const fromTimestamp = Math.floor(startDate.getTime() / 1000);
  const toTimestamp = Math.floor(endDate.getTime() / 1000);
  
  const url = `${VENDON_BASE_URL}/event/?from_timestamp=${fromTimestamp}&to_timestamp=${toTimestamp}&limit=5&offset=0`;
  
  console.log(`📡 API Call: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': VENDON_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const data = await response.json();
    
    console.log('\n📦 EVENT RESPONSE STRUCTURE:');
    console.log('Response type:', typeof data);
    console.log('Response keys:', Object.keys(data));
    
    if (data.result && Array.isArray(data.result)) {
      console.log(`\n✅ Gefundene Events: ${data.result.length}`);
      
      if (data.result.length > 0) {
        console.log('\n🔍 ERSTES EVENT - VOLLSTÄNDIGE STRUKTUR:');
        const firstEvent = data.result[0];
        console.log(JSON.stringify(firstEvent, null, 2));
        
        console.log('\n📋 FELD-ANALYSE:');
        for (const [key, value] of Object.entries(firstEvent)) {
          console.log(`  - ${key}: ${typeof value} = ${JSON.stringify(value)}`);
        }
        
        // Check for machine information
        console.log('\n🤖 MASCHINEN-INFORMATION:');
        console.log(`  - machine_id: ${firstEvent.machine_id || 'NICHT VORHANDEN'}`);
        console.log(`  - machine_name: ${firstEvent.machine_name || 'NICHT VORHANDEN'}`);
        console.log(`  - event_type: ${firstEvent.event_type || 'NICHT VORHANDEN'}`);
        console.log(`  - event_name: ${firstEvent.event_name || 'NICHT VORHANDEN'}`);
        console.log(`  - type: ${firstEvent.type || 'NICHT VORHANDEN'}`);
        console.log(`  - name: ${firstEvent.name || 'NICHT VORHANDEN'}`);
      }
    } else {
      console.log('❌ Unerwartete Response-Struktur:', data);
    }
    
  } catch (error) {
    console.error('❌ Fehler beim API-Call:', error.message);
  }
}

testEventAPI();