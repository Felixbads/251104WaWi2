/**
 * Test der Vendon Events API
 */

import axios from 'axios';

const VENDON_API_BASE = "https://cloud.vendon.net/rest/v1.8.0";
const API_KEY = process.env.VENDON_API_KEY;

async function testVendonEventsAPI() {
  console.log('🚀 Teste Vendon Events API...');
  
  if (!API_KEY) {
    console.error('❌ VENDON_API_KEY nicht gesetzt');
    return;
  }

  try {
    // API-Request für Events der letzten 24 Stunden
    const fromTimestamp = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const toTimestamp = Math.floor(Date.now() / 1000);

    const url = `${VENDON_API_BASE}/event/`;
    const params = {
      from_timestamp: fromTimestamp,
      to_timestamp: toTimestamp,
      limit: 10,
      sort: '-id'
    };

    console.log(`📡 API Request: ${url}`);
    console.log(`📅 Zeitraum: ${new Date(fromTimestamp * 1000).toLocaleString()} - ${new Date(toTimestamp * 1000).toLocaleString()}`);

    const response = await axios.get(url, {
      params,
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    console.log(`✅ API Response Status: ${response.status}`);
    console.log(`📊 Events gefunden: ${response.data.result?.length || 0}`);

    if (response.data.result && response.data.result.length > 0) {
      console.log('\n📋 Erste 10 Events:');
      
      for (let i = 0; i < Math.min(10, response.data.result.length); i++) {
        const event = response.data.result[i];
        console.log(`\n--- Event ${i + 1} ---`);
        console.log(`ID: ${event.id}`);
        console.log(`Event Type: ${event.event_type || 'N/A'}`);
        console.log(`Event Name: ${event.event_name || 'N/A'}`);
        console.log(`Machine: ${event.machine_name || 'N/A'} (ID: ${event.machine_id || 'N/A'})`);
        console.log(`DateTime: ${event.event_datetime || event.received_at || 'N/A'}`);
        console.log(`State: ${event.state || 'N/A'}`);
        console.log(`Description: ${event.description || 'N/A'}`);
        console.log(`Duration: ${event.duration || 'N/A'} Sekunden`);
      }

      console.log('\n✅ API-Test erfolgreich abgeschlossen');

    } else {
      console.log('ℹ️ Keine Events im angegebenen Zeitraum gefunden');
    }

    console.log('\n📊 API Paging Info:');
    if (response.data.paging) {
      console.log(`- Offset: ${response.data.paging.offset}`);
      console.log(`- Limit: ${response.data.paging.limit}`);
      console.log(`- Total: ${response.data.paging.total}`);
      console.log(`- Has More: ${response.data.paging.has_more}`);
    }

  } catch (error) {
    console.error('❌ API-Fehler:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.error('🔑 API-Schlüssel ungültig oder abgelaufen');
    } else if (error.response?.status === 429) {
      console.error('⏱️ Rate Limit erreicht');
    }
  }
}

// Test ausführen
testVendonEventsAPI();