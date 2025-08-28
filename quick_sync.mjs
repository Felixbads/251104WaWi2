import fetch from 'node-fetch';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function quickSync() {
  const API_KEY = process.env.VENDON_API_KEY;
  const BASE_URL = 'https://cloud.vendon.net/rest/v1.9.0';
  
  // Hole die letzten 48 Stunden
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = endDate - (48 * 60 * 60);
  
  console.log('🚀 QUICK SYNC - Letzte 48 Stunden');
  
  // 1. REFILLS
  const refillUrl = `${BASE_URL}/refills?from_timestamp=${startDate}&to_timestamp=${endDate}&limit=100`;
  const refillRes = await fetch(refillUrl, {
    headers: { 'Authorization': `Token ${API_KEY}`, 'Accept': 'application/json' }
  });
  const refillData = await refillRes.json();
  const refills = refillData.result || [];
  
  console.log(`📦 ${refills.length} Refills gefunden`);
  
  let newRefills = 0;
  for (const r of refills) {
    try {
      await pool.query(
        `INSERT INTO refills (vendon_id, machine_name, datetime, operator, status, refill_type) 
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (vendon_id) DO NOTHING`,
        [String(r.id), r.relation_name, new Date(r.refill_date * 1000), 
         r.refiller || 'Unknown', 'completed', r.refill_type || 'unplanned']
      );
      newRefills++;
    } catch(e) {}
  }
  
  // 2. EVENTS  
  const eventUrl = `${BASE_URL}/events?from_timestamp=${startDate}&to_timestamp=${endDate}&limit=200`;
  const eventRes = await fetch(eventUrl, {
    headers: { 'Authorization': `Token ${API_KEY}`, 'Accept': 'application/json' }
  });
  const eventData = await eventRes.json();
  const events = (eventData.result || []).filter(e => 
    (e.event_type || e.type || '').toLowerCase().includes('door')
  );
  
  console.log(`🚪 ${events.length} Tür-Events gefunden`);
  
  let newEvents = 0;
  for (const e of events) {
    try {
      await pool.query(
        `INSERT INTO events (vendon_id, machine_name, event_type, datetime) 
         VALUES ($1, $2, $3, $4) ON CONFLICT (vendon_id) DO NOTHING`,
        [String(e.event_id || e.id), e.machine_name || e.machine || 'Unknown',
         e.event_type || e.type || 'door_open', new Date((e.datetime || e.timestamp) * 1000)]
      );
      newEvents++;
    } catch(e) {}
  }
  
  console.log(`\n✅ FERTIG: ${newRefills} Refills, ${newEvents} Events hinzugefügt`);
  
  // Zeige aktuelle Statistik
  const stats = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM refills WHERE datetime >= CURRENT_DATE) as heute_refills,
      (SELECT COUNT(*) FROM events WHERE datetime >= CURRENT_DATE) as heute_events,
      (SELECT MAX(datetime) FROM refills) as neuester_refill,
      (SELECT MAX(datetime) FROM events WHERE event_type ILIKE '%door%') as neuestes_event
  `);
  
  const s = stats.rows[0];
  console.log(`\n📊 AKTUELLER STAND:`);
  console.log(`  Heutige Refills: ${s.heute_refills}`);
  console.log(`  Heutige Events: ${s.heute_events}`);
  console.log(`  Neuester Refill: ${s.neuester_refill ? new Date(s.neuester_refill).toLocaleString('de-DE') : 'keine'}`);
  console.log(`  Neuestes Event: ${s.neuestes_event ? new Date(s.neuestes_event).toLocaleString('de-DE') : 'keine'}`);
  
  await pool.end();
}

quickSync().catch(console.error);
