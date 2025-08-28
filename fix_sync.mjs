#!/usr/bin/env node
/**
 * MANUELLER SYNC FIX
 * Synchronisiert die fehlenden Transaktionen direkt
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function syncTransactions() {
  console.log('🔧 MANUELLER TRANSAKTIONS-SYNC');
  console.log('════════════════════════════════');
  
  const API_KEY = process.env.VENDON_API_KEY;
  const BASE_URL = 'https://cloud.vendon.net/rest/v1.9.0';
  
  // Hole Transaktionen der letzten 7 Tage
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = endDate - (7 * 24 * 60 * 60); // 7 Tage zurück
  
  const url = `${BASE_URL}/stats/vends?from_timestamp=${startDate}&to_timestamp=${endDate}&limit=1000`;
  
  console.log(`📅 Zeitraum: ${new Date(startDate * 1000).toISOString()} bis ${new Date(endDate * 1000).toISOString()}`);
  console.log(`🔗 URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const transactions = data.result || [];
    
    console.log(`\n✅ ${transactions.length} Transaktionen von API erhalten`);
    
    if (transactions.length === 0) {
      console.log('⚠️ Keine Transaktionen gefunden');
      return;
    }
    
    // Zeige Zusammenfassung
    const byDate = {};
    transactions.forEach(tx => {
      const date = new Date(tx.datetime * 1000).toISOString().split('T')[0];
      byDate[date] = (byDate[date] || 0) + 1;
    });
    
    console.log('\n📊 Transaktionen nach Tag:');
    Object.entries(byDate).sort().reverse().forEach(([date, count]) => {
      console.log(`  ${date}: ${count} Transaktionen`);
    });
    
    // Speichere in Datenbank
    console.log('\n💾 Speichere in Datenbank...');
    
    let saved = 0;
    let duplicates = 0;
    
    for (const tx of transactions) {
      try {
        // Prüfe ob Transaktion bereits existiert
        const existing = await pool.query(
          'SELECT id FROM transactions WHERE vendon_id = $1',
          [tx.transaction_id]
        );
        
        if (existing.rows.length > 0) {
          duplicates++;
          continue;
        }
        
        // Finde Machine ID
        const machineResult = await pool.query(
          'SELECT id FROM machines WHERE vendon_id = $1 OR machine_name = $2 LIMIT 1',
          [tx.machine_id, tx.machine_name]
        );
        
        const machineId = machineResult.rows[0]?.id || null;
        
        // Speichere Transaktion
        await pool.query(`
          INSERT INTO transactions (
            vendon_id, machine_id, product_id, product_name,
            quantity, amount, price, price_vat, price_wo_vat,
            payment_method, datetime, machine_name
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          tx.transaction_id,
          machineId,
          tx.stock_id,
          tx.name || tx.article || 'Unbekannt',
          tx.quantity || 1,
          tx.price,
          tx.price,
          tx.price_vat,
          tx.price_wo_vat,
          tx.payment_method || 'CASH',
          new Date(tx.datetime * 1000),
          tx.machine_name
        ]);
        
        saved++;
        
        if (saved % 50 === 0) {
          console.log(`  📝 ${saved} Transaktionen gespeichert...`);
        }
        
      } catch (error) {
        console.error(`❌ Fehler bei Transaction ${tx.transaction_id}:`, error.message);
      }
    }
    
    console.log(`\n✅ FERTIG!`);
    console.log(`  - ${saved} neue Transaktionen gespeichert`);
    console.log(`  - ${duplicates} Duplikate übersprungen`);
    
  } catch (error) {
    console.error('❌ Fehler:', error.message);
  } finally {
    await pool.end();
  }
}

// Führe Sync aus
syncTransactions().catch(console.error);