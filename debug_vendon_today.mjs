// Debug-Script: Teste Vendon-API direkt für heutige Transaktionen
import axios from 'axios';

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

  // 1. TESTE ERSTMAL GRUNDLEGENDE API-VERBINDUNG
  console.log("\n🔍 TESTE: Grundlegende API-Verbindung");
  try {
    const response = await axios.get(`${BASE_URL}/machines`, {
      headers,
      timeout: 10000
    });
    console.log("✅ /machines erfolgreich:", response.data.result?.length || 0, "Maschinen");
  } catch (error) {
    console.log("❌ /machines FEHLER:", error.message);
    if (error.response) {
      console.log("   Status:", error.response.status);
      console.log("   Data:", JSON.stringify(error.response.data));
    }
    console.log("⚠️ HAUPTPROBLEM: API-Verbindung schlägt fehl!");
    return;
  }

  // 2. TESTE TRANSAKTIONS-ENDPUNKT
  const now = new Date();
  const today = new Date();
  today.setHours(0,0,0,0);
  
  console.log("\n🔍 TESTE: Transaktions-Endpunkt für heute");
  console.log("   Von:", today.toISOString());
  console.log("   Bis:", now.toISOString());
  
  try {
    const response = await axios.get(`${BASE_URL}/stats/vends`, {
      headers,
      params: {
        from_timestamp: Math.floor(today.getTime() / 1000),
        to_timestamp: Math.floor(now.getTime() / 1000),
        limit: 10
      },
      timeout: 15000
    });
    
    const transactions = response.data.result || [];
    console.log("✅ Transaktionen heute:", transactions.length);
    
    if (transactions.length > 0) {
      console.log("📊 Erste Transaktion:");
      console.log("   Zeit:", new Date(transactions[0].datetime * 1000).toISOString());
      console.log("   Produkt:", transactions[0].name);
      console.log("   Preis:", transactions[0].price);
    }
  } catch (error) {
    console.log("❌ Transaktions-Endpunkt FEHLER:", error.message);
    if (error.response) {
      console.log("   Status:", error.response.status);
      console.log("   Data:", JSON.stringify(error.response.data));
    }
  }

  // 3. TESTE MIT GESTERN (zum Vergleich)
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  console.log("\n🔍 TESTE: Transaktionen von gestern (zum Vergleich)");
  try {
    const response = await axios.get(`${BASE_URL}/stats/vends`, {
      headers,
      params: {
        from_timestamp: Math.floor(yesterday.getTime() / 1000),
        to_timestamp: Math.floor(today.getTime() / 1000),
        limit: 10
      },
      timeout: 15000
    });
    
    const transactions = response.data.result || [];
    console.log("✅ Transaktionen gestern:", transactions.length);
  } catch (error) {
    console.log("❌ Gestern-Test FEHLER:", error.message);
  }
}

testVendonAPI().catch(console.error);