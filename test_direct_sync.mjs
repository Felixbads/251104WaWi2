import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';
const BASE_URL = 'https://cloud.vendon.net/rest/v1.8.0';

async function testDirectSync() {
  console.log('🧪 Direkter API-Test für Transaktionen\n');
  
  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Token ${API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 30000
  });

  try {
    // Hole Transaktionen der letzten 2 Stunden
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    const params = {
      from_timestamp: Math.floor(twoHoursAgo.getTime() / 1000),
      to_timestamp: Math.floor(now.getTime() / 1000),
      limit: 10
    };
    
    console.log('📅 Zeitraum:', twoHoursAgo.toISOString(), 'bis', now.toISOString());
    console.log('📋 Parameter:', params);
    
    const response = await client.get('/stats/vends', { params });
    
    console.log('\n📊 Response-Struktur:');
    console.log('   Status:', response.status);
    console.log('   Headers Content-Type:', response.headers['content-type']);
    console.log('   Data Type:', typeof response.data);
    console.log('   Top-Level Keys:', Object.keys(response.data));
    
    if (response.data.result && Array.isArray(response.data.result)) {
      const transactions = response.data.result;
      console.log(`\n✅ ${transactions.length} Transaktionen gefunden`);
      
      if (transactions.length > 0) {
        console.log('\n🔍 Erste Transaktion:');
        const tx = transactions[0];
        console.log('   transaction_id:', tx.transaction_id);
        console.log('   machine_id:', tx.machine_id); 
        console.log('   machine_name:', tx.machine_name);
        console.log('   datetime:', new Date(tx.datetime * 1000).toISOString());
        console.log('   product:', tx.name);
        console.log('   price:', tx.price);
        console.log('   payment_method:', tx.payment_method);
        
        // Prüfe ob die Felder vorhanden sind, die DuplicatePreventionService erwartet
        console.log('\n🔧 Feld-Check für DuplicatePreventionService:');
        console.log('   transaction_id vorhanden:', tx.transaction_id !== undefined);
        console.log('   machine_id vorhanden:', tx.machine_id !== undefined);
        console.log('   machine_name vorhanden:', tx.machine_name !== undefined);
        console.log('   quantity vorhanden:', tx.quantity !== undefined);
        console.log('   price vorhanden:', tx.price !== undefined);
        console.log('   name vorhanden:', tx.name !== undefined);
        console.log('   payment_method vorhanden:', tx.payment_method !== undefined);
      }
    } else {
      console.log('⚠️ Unerwartete Response-Struktur');
      console.log('Response Data:', JSON.stringify(response.data).substring(0, 500));
    }
    
  } catch (error) {
    console.error('❌ API-Fehler:', error.response ? error.response.data : error.message);
    if (error.response) {
      console.log('Response Headers:', error.response.headers);
    }
  }
}

testDirectSync().catch(console.error);