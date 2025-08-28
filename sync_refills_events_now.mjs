#!/usr/bin/env node
/**
 * SOFORT-SYNC für Refills und Events - Korrigiert für API v1.9.0
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
  
  const url = `${BASE_URL}/refills?from_timestamp=${startDate}&to_timestamp=${endDate}&limit=200`;
  console.log(`📅 Hole Refills der letzten 7 Tage...`);
  
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
        // API v1.9.0 Format: id, refill_date, relation_id, relation_name, refiller
        const vendonId = String(refill.id);
        
        // Prüfe ob bereits vorhanden
        const existing = await pool.query(
          'SELECT id FROM refills WHERE vendon_id = $1',
          [vendonId]
        );
        
        if (existing.rows.length > 0) {
          duplicates++;
          continue;
        }
        
        // Finde Machine ID
        const machineResult = await pool.query(
          'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
          [String(refill.relation_id)]
        );
        
        const machineId = machineResult.rows[0]?.id || null;
        
        // Speichere Refill
        await pool.query(`
          INSERT INTO refills (
            vendon_id, machine_id, machine_name, datetime, 
            operator, status, refill_type, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [
          vendonId,
          machineId,
          refill.relation_name || refill.relation_location_name,
          new Date(refill.refill_date * 1000),
          refill.refiller || 'Unknown',
          refill.status === 0 ? 'completed' : 'pending',
          refill.refill_type || 'unplanned'
        ]);
        
        saved++;
        
      } catch (error) {
        // Ignoriere Duplikate
        if (!error.message.includes('duplicate')) {
          console.error(`Fehler bei Refill ${refill.id}:`, error.message.split('\n')[0]);
        } else {
          duplicates++;
        }
      }
    }
    
    console.log(`✅ ${saved} neue Refills gespeichert, ${duplicates} bereits vorhanden`);
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
  
  const url = `${BASE_URL}/events?from_timestamp=${startDate}&to_timestamp=${endDate}&limit=500`;
  console.log(`📅 Hole Events der letzten 7 Tage...`);
  
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
    
    // Filter nur Tür-Events
    const doorEvents = events.filter(e => {
      const type = (e.event_type || e.type || '').toLowerCase();
      return type.includes('door') || type.includes('tür');
    });
    
    console.log(`🚪 ${doorEvents.length} Tür-Events gefunden`);
    
    let saved = 0;
    let duplicates = 0;
    
    for (const event of doorEvents) {
      try {
        const vendonId = String(event.event_id || event.id);
        
        // Prüfe ob bereits vorhanden
        const existing = await pool.query(
          'SELECT id FROM events WHERE vendon_id = $1',
          [vendonId]
        );
        
        if (existing.rows.length > 0) {
          duplicates++;
          continue;
        }
        
        // Finde Machine ID
        const machineResult = await pool.query(
          'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
          [String(event.machine_id)]
        );
        
        const machineId = machineResult.rows[0]?.id || null;
        
        // Speichere Event
        await pool.query(`
          INSERT INTO events (
            vendon_id, machine_id, machine_name, event_type,
            datetime, event_data, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          vendonId,
          machineId,
          event.machine_name || event.machine || 'Unknown',
          event.event_type || event.type || 'door_open',
          new Date((event.datetime || event.timestamp || event.created_at) * 1000),
          JSON.stringify(event.data || event.event_data || {})
        ]);
        
        saved++;
        
      } catch (error) {
        if (error.message.includes('duplicate')) {
          duplicates++;
        }
      }
    }
    
    console.log(`✅ ${saved} neue Tür-Events gespeichert, ${duplicates} bereits vorhanden`);
    return { saved, duplicates };
    
  } catch (error) {
    console.error('❌ Fehler beim Event-Sync:', error.message);
    return { saved: 0, duplicates: 0 };
  }
}

async function showCurrentStatus() {
  console.log('\n📊 AKTUELLER STATUS');
  console.log('════════════════════════════════');
  
  try {
    const result = await pool.query(`
      -- Neueste Refills pro Maschine
      WITH latest_refills AS (
        SELECT DISTINCT ON (machine_name)
          machine_name,
          datetime,
          operator
        FROM refills
        WHERE datetime >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY machine_name, datetime DESC
      ),
      -- Neueste Tür-Events pro Maschine  
      latest_events AS (
        SELECT DISTINCT ON (machine_name)
          machine_name,
          datetime,
          event_type
        FROM events
        WHERE datetime >= CURRENT_DATE - INTERVAL '7 days'
          AND event_type ILIKE '%door%'
        ORDER BY machine_name, datetime DESC
      )
      -- Zeige die 5 neuesten Refills
      SELECT 'Refill' as typ, machine_name, datetime, operator as details
      FROM latest_refills
      ORDER BY datetime DESC
      LIMIT 5
    `);
    
    console.log('\n🔄 Die 5 neuesten Refills:');
    if (result.rows.length === 0) {
      console.log('  Keine aktuellen Refills gefunden');
    } else {
      result.rows.forEach(row => {
        const zeit = new Date(row.datetime).toLocaleString('de-DE');
        console.log(`  ${row.machine_name}: ${zeit} (${row.details})`);
      });
    }
    
    // Statistik
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM refills WHERE datetime >= CURRENT_DATE) as heute_refills,
        (SELECT COUNT(*) FROM events WHERE datetime >= CURRENT_DATE AND event_type ILIKE '%door%') as heute_events,
        (SELECT MAX(datetime) FROM refills) as neueste_refill,
        (SELECT MAX(datetime) FROM events WHERE event_type ILIKE '%door%') as neuestes_event
    `);
    
    const stat = stats.rows[0];
    console.log('\n📈 Statistik:');
    console.log(`  Heutige Refills: ${stat.heute_refills}`);
    console.log(`  Heutige Tür-Events: ${stat.heute_events}`);
    console.log(`  Neuestes Refill: ${stat.neueste_refill ? new Date(stat.neueste_refill).toLocaleString('de-DE') : 'keine'}`);
    console.log(`  Neuestes Tür-Event: ${stat.neuestes_event ? new Date(stat.neuestes_event).toLocaleString('de-DE') : 'keine'}`);
    
  } catch (error) {
    console.error('Fehler beim Status:', error.message);
  }
}

// Führe Sync aus
async function runSync() {
  console.log('🚀 STARTE REFILL & EVENT SYNCHRONISATION');
  console.log('========================================\n');
  
  const refillResult = await syncRefills();
  const eventResult = await syncEvents();
  
  await showCurrentStatus();
  
  await pool.end();
  
  console.log('\n========================================');
  console.log('✅ SYNCHRONISATION ABGESCHLOSSEN!');
  console.log(`   ${refillResult.saved} neue Refills hinzugefügt`);
  console.log(`   ${eventResult.saved} neue Events hinzugefügt`);
  
  if (refillResult.saved > 0 || eventResult.saved > 0) {
    console.log('\n🎉 Die Standort-Status Seite zeigt jetzt aktuelle Daten!');
  }
  console.log('========================================');
}

runSync().catch(console.error);