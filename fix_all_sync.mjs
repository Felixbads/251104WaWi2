#!/usr/bin/env node
/**
 * KOMPLETTER SYNC FIX
 * Synchronisiert ALLE fehlenden Daten: Transaktionen, Events und Refills
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const API_KEY = process.env.VENDON_API_KEY;
const BASE_URL = 'https://cloud.vendon.net/rest/v1.9.0';

async function syncRefills() {
  console.log('\n🔧 REFILL SYNCHRONISATION');
  console.log('════════════════════════════════');
  
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = endDate - (7 * 24 * 60 * 60); // 7 Tage zurück
  
  const url = `${BASE_URL}/refills?from_timestamp=${startDate}&to_timestamp=${endDate}&limit=1000`;
  console.log(`📅 Zeitraum: ${new Date(startDate * 1000).toISOString()} bis ${new Date(endDate * 1000).toISOString()}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    const refills = data.result || [];
    
    console.log(`✅ ${refills.length} Refills von API erhalten`);
    
    let saved = 0;
    let duplicates = 0;
    
    for (const refill of refills) {
      try {
        // Prüfe ob bereits vorhanden
        const existing = await pool.query(
          'SELECT id FROM refills WHERE vendon_id = $1',
          [refill.refill_id]
        );
        
        if (existing.rows.length > 0) {
          duplicates++;
          continue;
        }
        
        // Finde Machine ID
        const machineResult = await pool.query(
          'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
          [refill.machine_id]
        );
        
        const machineId = machineResult.rows[0]?.id || null;
        
        // Speichere Refill
        await pool.query(`
          INSERT INTO refills (
            vendon_id, machine_id, machine_name, datetime, 
            total_amount, is_delivery, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          refill.refill_id,
          machineId,
          refill.machine_name,
          new Date(refill.datetime * 1000),
          refill.total_amount || 0,
          refill.is_delivery || false
        ]);
        
        saved++;
        
      } catch (error) {
        console.error(`❌ Fehler bei Refill ${refill.refill_id}:`, error.message);
      }
    }
    
    console.log(`✅ ${saved} neue Refills gespeichert, ${duplicates} Duplikate übersprungen`);
    
  } catch (error) {
    console.error('❌ Fehler:', error.message);
  }
}

async function syncEvents() {
  console.log('\n🔧 EVENT SYNCHRONISATION');
  console.log('════════════════════════════════');
  
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = endDate - (7 * 24 * 60 * 60); // 7 Tage zurück
  
  const url = `${BASE_URL}/events?from_timestamp=${startDate}&to_timestamp=${endDate}&limit=1000`;
  console.log(`📅 Zeitraum: ${new Date(startDate * 1000).toISOString()} bis ${new Date(endDate * 1000).toISOString()}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    const events = data.result || [];
    
    console.log(`✅ ${events.length} Events von API erhalten`);
    
    // Zeige Zusammenfassung
    const byType = {};
    events.forEach(event => {
      const type = event.event_type || 'UNKNOWN';
      byType[type] = (byType[type] || 0) + 1;
    });
    
    console.log('\n📊 Events nach Typ:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    
    let saved = 0;
    let duplicates = 0;
    
    for (const event of events) {
      try {
        // Prüfe ob bereits vorhanden
        const existing = await pool.query(
          'SELECT id FROM events WHERE vendon_id = $1',
          [event.event_id]
        );
        
        if (existing.rows.length > 0) {
          duplicates++;
          continue;
        }
        
        // Finde Machine ID
        const machineResult = await pool.query(
          'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
          [event.machine_id]
        );
        
        const machineId = machineResult.rows[0]?.id || null;
        
        // Speichere Event
        await pool.query(`
          INSERT INTO events (
            vendon_id, machine_id, machine_name, event_type,
            datetime, event_data, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          event.event_id,
          machineId,
          event.machine_name,
          event.event_type,
          new Date(event.datetime * 1000),
          JSON.stringify(event.event_data || {})
        ]);
        
        saved++;
        
      } catch (error) {
        console.error(`❌ Fehler bei Event ${event.event_id}:`, error.message);
      }
    }
    
    console.log(`✅ ${saved} neue Events gespeichert, ${duplicates} Duplikate übersprungen`);
    
  } catch (error) {
    console.error('❌ Fehler:', error.message);
  }
}

async function showCurrentStatus() {
  console.log('\n📊 AKTUELLER STATUS NACH SYNC');
  console.log('════════════════════════════════');
  
  const result = await pool.query(`
    SELECT 
      'Heute Transaktionen' as kategorie,
      COUNT(*) as anzahl,
      MAX(datetime) as neueste
    FROM transactions 
    WHERE datetime >= CURRENT_DATE
    UNION ALL
    SELECT 
      'Letzte 7 Tage Refills' as kategorie,
      COUNT(*) as anzahl,
      MAX(datetime) as neueste
    FROM refills
    WHERE datetime >= CURRENT_DATE - INTERVAL '7 days'
    UNION ALL
    SELECT 
      'Letzte 7 Tage Events' as kategorie,
      COUNT(*) as anzahl,
      MAX(datetime) as neueste
    FROM events
    WHERE datetime >= CURRENT_DATE - INTERVAL '7 days'
  `);
  
  result.rows.forEach(row => {
    console.log(`${row.kategorie}: ${row.anzahl} (Neueste: ${row.neueste || 'keine'})`);
  });
}

// Führe alle Syncs aus
async function runFullSync() {
  console.log('🚀 STARTE KOMPLETTEN DATEN-SYNC');
  console.log('================================\n');
  
  await syncRefills();
  await syncEvents();
  await showCurrentStatus();
  
  await pool.end();
  console.log('\n✅ SYNC ABGESCHLOSSEN!');
}

runFullSync().catch(console.error);