import axios from 'axios';
import pkg from 'pg';
const { Pool } = pkg;

// PostgreSQL Verbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Vendon API Konfiguration
const VENDON_API_KEY = process.env.VENDON_API_KEY;
const BASE_URL = "https://cloud.vendon.net/rest/v1.8.0";

async function syncTodayTransactions() {
  try {
    console.log('🚀 Starte Synchronisation der heutigen Transaktionen...');
    
    // Zeitraum für heute definieren
    const today = new Date('2025-05-31');
    const startOfDay = Math.floor(today.getTime() / 1000);
    const endOfDay = Math.floor((today.getTime() + 24 * 60 * 60 * 1000) / 1000);
    
    console.log(`📅 Zeitraum: ${new Date(startOfDay * 1000).toISOString()} bis ${new Date(endOfDay * 1000).toISOString()}`);
    
    // Vendon API Call für Transaktionen
    const url = `${BASE_URL}/transaction/`;
    const params = {
      from_timestamp: startOfDay,
      to_timestamp: endOfDay,
      limit: 100,
      offset: 0
    };
    
    console.log('🌐 API Request:', url, params);
    
    const response = await axios.get(url, {
      params,
      headers: {
        'Authorization': `Bearer ${VENDON_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    console.log('📡 API Response Status:', response.status);
    console.log('📊 Anzahl Transaktionen:', response.data.result?.length || 0);
    
    if (response.data.result && response.data.result.length > 0) {
      console.log('📋 Erste Transaktion (JSON-Struktur):');
      console.log(JSON.stringify(response.data.result[0], null, 2));
      
      // Transaktionen in Datenbank speichern
      for (const transaction of response.data.result) {
        await saveTransactionToDatabase(transaction);
      }
      
      console.log(`✅ ${response.data.result.length} Transaktionen erfolgreich synchronisiert`);
    } else {
      console.log('ℹ️ Keine Transaktionen für heute gefunden');
    }
    
  } catch (error) {
    console.error('❌ Fehler bei der Synchronisation:', error.message);
    if (error.response) {
      console.error('🔍 API Error Details:', error.response.data);
    }
  } finally {
    await pool.end();
  }
}

async function saveTransactionToDatabase(vendonTransaction) {
  try {
    // Maschinen-ID aus unserer Datenbank holen
    const machineQuery = 'SELECT id FROM machines WHERE vendon_id = $1';
    const machineResult = await pool.query(machineQuery, [vendonTransaction.machine_id]);
    
    if (machineResult.rows.length === 0) {
      console.warn(`⚠️ Maschine mit Vendon-ID ${vendonTransaction.machine_id} nicht in Datenbank gefunden`);
      return;
    }
    
    const machineId = machineResult.rows[0].id;
    
    // Transaktion speichern
    const insertQuery = `
      INSERT INTO transactions (
        vendon_id, machine_id, machine_name, datetime, transaction_dt, 
        registered_dt, product_id, product_name, selection, stock_id,
        article, quantity, price, price_vat, price_wo_vat, vat, currency,
        discount_code, discount_amount, payment_method, payment_type,
        source, transaction_data, note, metadata, extra_data, amount,
        location_id, location_name, transaction_type, status,
        coin_credit, card_credit, cashless_credit, is_test,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, 
        $29, $30, $31, $32, $33, $34, $35, NOW(), NOW()
      ) ON CONFLICT (vendon_id) DO UPDATE SET
        price = EXCLUDED.price,
        price_vat = EXCLUDED.price_vat,
        price_wo_vat = EXCLUDED.price_wo_vat,
        updated_at = NOW()
    `;
    
    const values = [
      vendonTransaction.id || null,
      machineId,
      vendonTransaction.machine_name || null,
      vendonTransaction.transaction_datetime ? new Date(vendonTransaction.transaction_datetime) : null,
      vendonTransaction.transaction_datetime ? new Date(vendonTransaction.transaction_datetime) : null,
      vendonTransaction.received_at ? new Date(vendonTransaction.received_at) : null,
      vendonTransaction.product_id || null,
      vendonTransaction.product_name || null,
      vendonTransaction.selection || null,
      vendonTransaction.stock_id || null,
      vendonTransaction.article || null,
      vendonTransaction.quantity || 1,
      vendonTransaction.price || 0,
      vendonTransaction.price_vat || 0,
      vendonTransaction.price_wo_vat || 0,
      vendonTransaction.vat || 0,
      vendonTransaction.currency || 'EUR',
      vendonTransaction.discount_code || null,
      vendonTransaction.discount_amount || 0,
      vendonTransaction.payment_method || null,
      vendonTransaction.payment_type || null,
      vendonTransaction.source || 'vendon_api',
      vendonTransaction.transaction_data ? JSON.stringify(vendonTransaction.transaction_data) : null,
      vendonTransaction.note || null,
      vendonTransaction.metadata ? JSON.stringify(vendonTransaction.metadata) : null,
      vendonTransaction.extra_data ? JSON.stringify(vendonTransaction.extra_data) : null,
      vendonTransaction.amount || 0,
      vendonTransaction.location_id || null,
      vendonTransaction.location_name || null,
      vendonTransaction.transaction_type || 'sale',
      vendonTransaction.status || 'completed',
      vendonTransaction.coin_credit || 0,
      vendonTransaction.card_credit || 0,
      vendonTransaction.cashless_credit || 0,
      vendonTransaction.is_test || false
    ];
    
    await pool.query(insertQuery, values);
    console.log(`💾 Transaktion ${vendonTransaction.id} gespeichert`);
    
  } catch (error) {
    console.error(`❌ Fehler beim Speichern der Transaktion ${vendonTransaction.id}:`, error.message);
  }
}

// Script ausführen
syncTodayTransactions();