// NOTFALL-FIX: Direkte API-Anfrage für heutige Transaktionen
import axios from 'axios';

const API_KEY = process.env.VENDON_API_KEY || process.env.API_KEY;
const BASE_URL = "https://cloud.vendon.net/rest/v1.8.0";

async function getTransactionsToday() {
  console.log("🚀 NOTFALL-SYNC: Hole heutige Transaktionen direkt...");
  
  const headers = {
    'Authorization': `Token ${API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  // NUR HEUTE - kleine Zeitfenster
  const now = new Date();
  const today = new Date();
  today.setHours(0,0,0,0);
  
  console.log("⏰ Zeitbereich:");
  console.log("  Von:", today.toISOString());
  console.log("  Bis:", now.toISOString());
  console.log("  Timestamps:", Math.floor(today.getTime() / 1000), "bis", Math.floor(now.getTime() / 1000));
  
  try {
    const response = await axios.get(`${BASE_URL}/stats/vends`, {
      headers,
      params: {
        from_timestamp: Math.floor(today.getTime() / 1000),
        to_timestamp: Math.floor(now.getTime() / 1000),
        limit: 200  // Mehr Transaktionen abfragen
      },
      timeout: 15000
    });
    
    const transactions = response.data.result || [];
    console.log("✅ ERFOLG:", transactions.length, "Transaktionen heute gefunden!");
    
    if (transactions.length > 0) {
      console.log("📊 Beispiel-Transaktionen:");
      transactions.slice(0, 5).forEach((tx, i) => {
        console.log(`  ${i+1}. ${tx.name} - ${new Date(tx.datetime * 1000).toLocaleTimeString()} - ${tx.price}€`);
      });
      
      console.log("\n💰 Statistiken:");
      const totalRevenue = transactions.reduce((sum, tx) => sum + (tx.price || 0), 0);
      const uniqueMachines = new Set(transactions.map(tx => tx.machine_id)).size;
      
      console.log(`  💵 Gesamtumsatz: ${totalRevenue.toFixed(2)}€`);
      console.log(`  🏪 Aktive Maschinen: ${uniqueMachines}`);
      console.log(`  📈 Durchschnittspreis: ${(totalRevenue / transactions.length).toFixed(2)}€`);
    } else {
      console.log("⚠️ Keine Transaktionen heute gefunden.");
      
      // Teste gestern als Vergleich
      console.log("\n🔍 Teste gestern als Vergleich...");
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const yesterdayResponse = await axios.get(`${BASE_URL}/stats/vends`, {
        headers,
        params: {
          from_timestamp: Math.floor(yesterday.getTime() / 1000),
          to_timestamp: Math.floor(today.getTime() / 1000),
          limit: 200
        },
        timeout: 15000
      });
      
      const yesterdayTx = yesterdayResponse.data.result || [];
      console.log(`📊 Gestern: ${yesterdayTx.length} Transaktionen`);
    }
    
  } catch (error) {
    console.log("❌ FEHLER beim Abrufen:", error.message);
    if (error.response) {
      console.log("   Status:", error.response.status);
      console.log("   Data:", JSON.stringify(error.response.data));
    }
  }
}

getTransactionsToday().catch(console.error);