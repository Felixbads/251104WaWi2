// Debug-Script: Teste Vendon-API direkt für heutige Transaktionen
const axios = require('axios');

const API_KEY = process.env.VENDON_API_KEY || process.env.API_KEY;
const BASE_URL = "https://cloud.vendon.net/rest/v1.8.0";

console.log("=== VENDON API DEBUG TEST ===");
console.log("API Key:", API_KEY ? "Verfügbar (****" + API_KEY.slice(-4) + ")" : "FEHLT!");

async function testVendonAPI() {
  if (!API_KEY) {
    console.error("❌ FEHLER: Kein API-Schlüssel gefunden!");
    return;
  }

  const headers = {
    'Authorization': `Token ${API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  // Teste verschiedene Zeitbereiche
  const now = new Date();
  const berlinNow = new Date(now.toLocaleString('en-US', {timeZone: 'Europe/Berlin'}));
  
  // UTC Heute
  const utcTodayStart = new Date();
  utcTodayStart.setHours(0,0,0,0);
  
  // Berlin Heute  
  const berlinTodayStart = new Date(berlinNow);
  berlinTodayStart.setHours(0,0,0,0);
  
  // Gestern Berlin
  const berlinYesterday = new Date(berlinTodayStart);
  berlinYesterday.setDate(berlinYesterday.getDate() - 1);
  
  const tests = [
    {
      name: "UTC Heute (aktuell verwendet)",
      from: Math.floor(utcTodayStart.getTime() / 1000),
      to: Math.floor(now.getTime() / 1000)
    },
    {
      name: "Berlin Heute", 
      from: Math.floor(berlinTodayStart.getTime() / 1000),
      to: Math.floor(berlinNow.getTime() / 1000)
    },
    {
      name: "Berlin Gestern",
      from: Math.floor(berlinYesterday.getTime() / 1000),
      to: Math.floor(berlinTodayStart.getTime() / 1000)
    },
    {
      name: "Letzte 24h",
      from: Math.floor((now.getTime() - 24*60*60*1000) / 1000),
      to: Math.floor(now.getTime() / 1000)
    }
  ];

  for (const test of tests) {
    console.log(`\n🔍 TESTE: ${test.name}`);
    console.log(`   Von: ${new Date(test.from * 1000).toISOString()}`);
    console.log(`   Bis: ${new Date(test.to * 1000).toISOString()}`);
    
    try {
      const response = await axios.get(`${BASE_URL}/stats/vends`, {
        headers,
        params: {
          from_timestamp: test.from,
          to_timestamp: test.to,
          limit: 5
        },
        timeout: 10000
      });
      
      const data = response.data;
      const transactions = data.result || [];
      
      console.log(`   ✅ Antwort: ${transactions.length} Transaktionen gefunden`);
      
      if (transactions.length > 0) {
        const firstTx = transactions[0];
        console.log(`   📊 Erste Transaktion: ${firstTx.name} - ${new Date(firstTx.datetime * 1000).toISOString()}`);
      }
    } catch (error) {
      console.log(`   ❌ FEHLER: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  console.log("\n=== FAZIT ===");
  console.log("Wenn 'Berlin Heute' Transaktionen zeigt, aber 'UTC Heute' nicht,");
  console.log("dann ist das Zeitzonenproblem bestätigt!");
}

testVendonAPI().catch(console.error);