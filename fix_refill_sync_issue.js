/**
 * Behebt das Problem mit veralteten Refill- und Event-Daten
 * Synchronisiert die neuesten Refills und Door-Open-Events
 */

import { neon } from '@neondatabase/serverless';
import axios from 'axios';

const sql = neon(process.env.DATABASE_URL);

const VENDON_API_KEY = process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';
const BASE_URL = 'https://cloud.vendon.net/rest/v1.8.0';

const headers = {
  'Authorization': `Token ${VENDON_API_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

async function makeApiRequest(endpoint, params = {}) {
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      headers,
      params,
      timeout: 15000
    });
    return response.data;
  } catch (error) {
    console.error(`API-Fehler für ${endpoint}:`, error.message);
    throw error;
  }
}

async function syncRecentRefills() {
  console.log('🔄 Synchronisiere aktuelle Refills...');
  
  // Letzte 30 Tage
  const endTimestamp = Math.floor(Date.now() / 1000);
  const startTimestamp = endTimestamp - (30 * 24 * 60 * 60);
  
  const params = {
    from_timestamp: startTimestamp,
    to_timestamp: endTimestamp,
    limit: 100
  };
  
  const response = await makeApiRequest('/refills', params);
  const refills = response.result || [];
  
  console.log(`📥 ${refills.length} Refills von API erhalten`);
  
  let newRefills = 0;
  
  for (const refill of refills) {
    try {
      // Prüfe ob Refill bereits existiert
      const existing = await sql`
        SELECT id FROM refills WHERE vendon_id = ${refill.id.toString()}
      `;
      
      if (existing.length > 0) {
        continue; // Skip bereits vorhandene Refills
      }
      
      // Hole oder erstelle Maschine
      let machineId;
      const machineVendonId = refill.relation_id?.toString();
      
      if (machineVendonId) {
        const machineResult = await sql`
          SELECT id FROM machines WHERE vendon_id = ${machineVendonId}
        `;
        
        if (machineResult.length > 0) {
          machineId = machineResult[0].id;
        } else {
          // Erstelle neue Maschine
          const newMachine = await sql`
            INSERT INTO machines (vendon_id, machine_name, last_sync)
            VALUES (${machineVendonId}, ${refill.relation_name || `Automat ${machineVendonId}`}, NOW())
            RETURNING id
          `;
          machineId = newMachine[0].id;
        }
      }
      
      // Konvertiere Unix-Timestamp zu Date
      const refillDate = new Date(refill.refill_date * 1000);
      
      // Speichere Refill
      await sql`
        INSERT INTO refills (
          vendon_id, machine_id, machine_name, datetime, operator, status, refill_type, extra_data
        ) VALUES (
          ${refill.id.toString()},
          ${machineId},
          ${refill.relation_name || 'Unbekannt'},
          ${refillDate.toISOString()},
          ${refill.refiller || ''},
          'completed',
          ${refill.refill_type || 'unplanned'},
          ${JSON.stringify(refill)}
        )
      `;
      
      newRefills++;
      console.log(`✅ Refill ${refill.id} für ${refill.relation_name} am ${refillDate.toISOString()} gespeichert`);
      
    } catch (error) {
      console.error(`❌ Fehler beim Speichern von Refill ${refill.id}:`, error.message);
    }
  }
  
  console.log(`✅ ${newRefills} neue Refills synchronisiert`);
  return newRefills;
}

async function syncRecentEvents() {
  console.log('🔄 Synchronisiere aktuelle Events...');
  
  // Letzte 30 Tage
  const endTimestamp = Math.floor(Date.now() / 1000);
  const startTimestamp = endTimestamp - (30 * 24 * 60 * 60);
  
  const params = {
    from_timestamp: startTimestamp,
    to_timestamp: endTimestamp,
    limit: 500
  };
  
  const response = await makeApiRequest('/events', params);
  const events = response.result || [];
  
  console.log(`📥 ${events.length} Events von API erhalten`);
  
  let newEvents = 0;
  
  for (const event of events) {
    try {
      // Nur Door-Access-Events (Type A) interessieren uns
      if (event.type !== 'A') {
        continue;
      }
      
      // Prüfe ob Event bereits existiert
      const existing = await sql`
        SELECT id FROM events WHERE vendon_id = ${event.id.toString()}
      `;
      
      if (existing.length > 0) {
        continue;
      }
      
      // Hole oder erstelle Maschine
      let machineId;
      const machineVendonId = event.machine_id?.toString();
      
      if (machineVendonId) {
        const machineResult = await sql`
          SELECT id FROM machines WHERE vendon_id = ${machineVendonId}
        `;
        
        if (machineResult.length > 0) {
          machineId = machineResult[0].id;
        } else {
          // Erstelle neue Maschine
          const newMachine = await sql`
            INSERT INTO machines (vendon_id, machine_name, last_sync)
            VALUES (${machineVendonId}, ${event.machine_name || `Automat ${machineVendonId}`}, NOW())
            RETURNING id
          `;
          machineId = newMachine[0].id;
        }
      }
      
      // Konvertiere Unix-Timestamp zu Date
      const eventDate = new Date(event.datetime * 1000);
      
      // Speichere Event
      await sql`
        INSERT INTO events (
          vendon_id, machine_id, machine_name, datetime, event_type, event_subtype, description, extra_data
        ) VALUES (
          ${event.id.toString()},
          ${machineId},
          ${event.machine_name || 'Unbekannt'},
          ${eventDate.toISOString()},
          ${event.type},
          ${event.subtype || ''},
          ${event.description || 'Door Access Event'},
          ${JSON.stringify(event)}
        )
      `;
      
      newEvents++;
      console.log(`✅ Event ${event.id} (${event.type}) für ${event.machine_name} am ${eventDate.toISOString()} gespeichert`);
      
    } catch (error) {
      console.error(`❌ Fehler beim Speichern von Event ${event.id}:`, error.message);
    }
  }
  
  console.log(`✅ ${newEvents} neue Events synchronisiert`);
  return newEvents;
}

async function main() {
  console.log('🚀 Starte Refill- und Event-Synchronisierung...');
  
  try {
    const refillsAdded = await syncRecentRefills();
    const eventsAdded = await syncRecentEvents();
    
    console.log(`\n📊 Zusammenfassung:`);
    console.log(`   ${refillsAdded} neue Refills hinzugefügt`);
    console.log(`   ${eventsAdded} neue Events hinzugefügt`);
    console.log(`✅ Synchronisierung erfolgreich abgeschlossen`);
    
  } catch (error) {
    console.error('❌ Fehler bei der Synchronisierung:', error);
    process.exit(1);
  }
}

main();