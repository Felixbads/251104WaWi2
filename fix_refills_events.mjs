#!/usr/bin/env node
/**
 * KORRIGIERTER SYNC für Refills und Events
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
  console.log(`📅 Zeitraum: ${new Date(startDate * 1000).toLocaleDateString('de-DE')} bis ${new Date(endDate * 1000).toLocaleDateString('de-DE')}`);
  
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
    
    // Zeige Zusammenfassung nach Tag
    const byDate = {};
    refills.forEach(r => {
      const date = new Date((r.datetime || r.created_at) * 1000).toLocaleDateString('de-DE');
      byDate[date] = (byDate[date] || 0) + 1;
    });
    
    console.log('\n📊 Refills nach Tag:');
    Object.entries(byDate).sort().reverse().forEach(([date, count]) => {
      console.log(`  ${date}: ${count} Refills`);
    });
    
    let saved = 0;
    let duplicates = 0;
    
    for (const refill of refills) {
      try {
        // Prüfe ob bereits vorhanden
        const existing = await pool.query(
          'SELECT id FROM refills WHERE vendon_id = $1',
          [refill.refill_id || refill.id]
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
        
        // Speichere Refill - NUR mit existierenden Spalten!
        await pool.query(`
          INSERT INTO refills (
            vendon_id, machine_id, machine_name, datetime, 
            total_amount, operator, status, refill_type,
            actual_amount, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        `, [
          refill.refill_id || refill.id,
          machineId,
          refill.machine_name || refill.machine,
          new Date((refill.datetime || refill.created_at) * 1000),
          refill.total_amount || refill.total || 0,
          refill.operator || refill.user || 'Vendon',
          refill.status || 'completed',
          refill.refill_type || refill.type || 'manual',
          refill.actual_amount || refill.amount || 0
        ]);
        
        saved++;
        
      } catch (error) {
        console.error(`❌ Fehler bei Refill ${refill.refill_id}:`, error.message);
      }
    }
    
    console.log(`\n✅ ${saved} neue Refills gespeichert, ${duplicates} bereits vorhanden`);
    return { saved, duplicates };
    
  } catch (error) {
    console.error('❌ Fehler beim Refill-Sync:', error.message);
    return { saved: 0, duplicates: 0 };
  }
}

async function syncEvents() {
  console.log('\n🔧 EVENT SYNCHRONISATION (Tür-Öffnungen)');
  console.log('════════════════════════════════════════');
  
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = endDate - (7 * 24 * 60 * 60); // 7 Tage zurück
  
  const url = `${BASE_URL}/events?from_timestamp=${startDate}&to_timestamp=${endDate}&limit=1000`;
  console.log(`📅 Zeitraum: ${new Date(startDate * 1000).toLocaleDateString('de-DE')} bis ${new Date(endDate * 1000).toLocaleDateString('de-DE')}`);
  
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
    
    // Zeige Zusammenfassung nach Typ
    const byType = {};
    events.forEach(event => {
      const type = event.event_type || event.type || 'UNKNOWN';
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
          [event.event_id || event.id]
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
          event.event_id || event.id,
          machineId,
          event.machine_name || event.machine,
          event.event_type || event.type || 'unknown',
          new Date((event.datetime || event.timestamp || event.created_at) * 1000),
          JSON.stringify(event.data || event.event_data || {})
        ]);
        
        saved++;
        
      } catch (error) {
        // Ignoriere Fehler und fahre fort
        if (error.message.includes('duplicate key')) {
          duplicates++;
        }
      }
    }
    
    console.log(`\n✅ ${saved} neue Events gespeichert, ${duplicates} bereits vorhanden`);
    return { saved, duplicates };
    
  } catch (error) {
    console.error('❌ Fehler beim Event-Sync:', error.message);
    return { saved: 0, duplicates: 0 };
  }
}

async function showCurrentStatus() {
  console.log('\n📊 AKTUELLER STATUS NACH SYNC');
  console.log('════════════════════════════════');
  
  try {
    const result = await pool.query(`
      SELECT 
        'Heutige Refills' as kategorie,
        COUNT(*) as anzahl,
        MAX(datetime) as neueste
      FROM refills
      WHERE datetime >= CURRENT_DATE
      UNION ALL
      SELECT 
        'Heutige Tür-Events' as kategorie,
        COUNT(*) as anzahl,
        MAX(datetime) as neueste
      FROM events
      WHERE datetime >= CURRENT_DATE
        AND event_type IN ('DOOR_OPEN', 'DOOR_CLOSE', 'door_open', 'door_close')
      UNION ALL
      SELECT 
        'Letzte 3 Tage Refills' as kategorie,
        COUNT(*) as anzahl,
        MAX(datetime) as neueste
      FROM refills
      WHERE datetime >= CURRENT_DATE - INTERVAL '3 days'
      UNION ALL
      SELECT 
        'Letzte 3 Tage Events' as kategorie,
        COUNT(*) as anzahl,
        MAX(datetime) as neueste
      FROM events
      WHERE datetime >= CURRENT_DATE - INTERVAL '3 days'
    `);
    
    console.log('');
    result.rows.forEach(row => {
      const datum = row.neueste ? new Date(row.neueste).toLocaleString('de-DE') : 'keine';
      console.log(`${row.kategorie}: ${row.anzahl} Einträge (Neueste: ${datum})`);
    });
  } catch (error) {
    console.error('Fehler beim Status abrufen:', error.message);
  }
}

// Führe alle Syncs aus
async function runFullSync() {
  console.log('🚀 STARTE DATEN-SYNC FÜR STANDORT-STATUS');
  console.log('=========================================\n');
  
  const refillResult = await syncRefills();
  const eventResult = await syncEvents();
  
  await showCurrentStatus();
  
  await pool.end();
  
  console.log('\n=========================================');
  console.log('✅ SYNC ABGESCHLOSSEN!');
  console.log(`   Refills: ${refillResult.saved} neue hinzugefügt`);
  console.log(`   Events:  ${eventResult.saved} neue hinzugefügt`);
  console.log('=========================================');
}

runFullSync().catch(console.error);