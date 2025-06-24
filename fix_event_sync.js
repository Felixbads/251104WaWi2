/**
 * Emergency Event Sync Fix
 * Imports recent events and refills from Vendon API to fix outdated location status data
 */

import { db } from './server/db.js';
import { events, refills, machines } from './shared/schema.js';
import { eq, desc } from 'drizzle-orm';
import fetch from 'node-fetch';

const VENDON_API_BASE = "https://cloud.vendon.net/rest/v1.8.0";
const API_KEY = process.env.VENDON_API_KEY || "e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB";

async function makeVendonRequest(endpoint) {
  const response = await fetch(`${VENDON_API_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Token ${API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Vendon API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function getMachineByVendonId(vendonId) {
  const machine = await db.select()
    .from(machines)
    .where(eq(machines.vendonId, vendonId))
    .limit(1);
  
  return machine[0] || null;
}

async function syncRecentEvents() {
  console.log('🔄 Synchronisiere Events der letzten 7 Tage...');
  
  const fromTimestamp = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000); // 7 Tage zurück
  const toTimestamp = Math.floor(Date.now() / 1000);
  
  let offset = 0;
  let hasMore = true;
  let totalEvents = 0;
  let savedEvents = 0;
  
  while (hasMore) {
    try {
      console.log(`📥 Lade Events: Offset ${offset}`);
      
      const response = await makeVendonRequest(
        `/events?from_timestamp=${fromTimestamp}&to_timestamp=${toTimestamp}&limit=100&offset=${offset}`
      );
      
      if (!response.result || response.result.length === 0) {
        console.log('ℹ️ Keine weiteren Events gefunden');
        break;
      }
      
      console.log(`📦 ${response.result.length} Events erhalten`);
      totalEvents += response.result.length;
      
      for (const event of response.result) {
        try {
          // Prüfe ob Event bereits existiert
          const existingEvent = await db.select()
            .from(events)
            .where(eq(events.vendonId, event.id.toString()))
            .limit(1);
            
          if (existingEvent.length > 0) {
            continue; // Skip duplicate
          }
          
          // Finde zugehörige Maschine
          let machineId = null;
          if (event.machine_id) {
            const machine = await getMachineByVendonId(event.machine_id.toString());
            machineId = machine?.id || null;
          }
          
          // Event-Datum konvertieren
          let eventDate = new Date();
          if (event.event_datetime) {
            eventDate = new Date(event.event_datetime * 1000);
          } else if (event.received_at) {
            eventDate = new Date(event.received_at * 1000);
          }
          
          // Event speichern
          await db.insert(events).values({
            vendonId: event.id.toString(),
            machineId: machineId,
            machineName: event.machine_name || 'Unbekannt',
            datetime: eventDate,
            eventType: event.event_type || event.type || 'unknown',
            eventName: event.event_name || event.name || 'Unbekannt',
            severity: event.severity || 'normal',
            description: event.description || event.message || null,
            extraData: JSON.stringify(event)
          });
          
          savedEvents++;
          
          console.log(`💾 Event gespeichert: ${event.event_name || event.name} für Maschine ${event.machine_name}`);
          
        } catch (error) {
          console.error('❌ Fehler beim Speichern des Events:', error);
        }
      }
      
      hasMore = response.result.length === 100;
      offset += 100;
      
      // Kleine Pause zwischen Requests
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`❌ Fehler beim Abrufen von Events bei Offset ${offset}:`, error);
      break;
    }
  }
  
  console.log(`✅ Event-Sync abgeschlossen: ${savedEvents}/${totalEvents} neue Events gespeichert`);
  return { total: totalEvents, saved: savedEvents };
}

async function syncRecentRefills() {
  console.log('🔄 Synchronisiere Refills der letzten 14 Tage...');
  
  const fromTimestamp = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000); // 14 Tage zurück
  const toTimestamp = Math.floor(Date.now() / 1000);
  
  let offset = 0;
  let hasMore = true;
  let totalRefills = 0;
  let savedRefills = 0;
  
  while (hasMore) {
    try {
      console.log(`📥 Lade Refills: Offset ${offset}`);
      
      const response = await makeVendonRequest(
        `/refills?from_timestamp=${fromTimestamp}&to_timestamp=${toTimestamp}&limit=100&offset=${offset}`
      );
      
      if (!response.result || response.result.length === 0) {
        console.log('ℹ️ Keine weiteren Refills gefunden');
        break;
      }
      
      console.log(`📦 ${response.result.length} Refills erhalten`);
      totalRefills += response.result.length;
      
      for (const refill of response.result) {
        try {
          // Prüfe ob Refill bereits existiert
          const existingRefill = await db.select()
            .from(refills)
            .where(eq(refills.vendonId, refill.id.toString()))
            .limit(1);
            
          if (existingRefill.length > 0) {
            continue; // Skip duplicate
          }
          
          // Finde zugehörige Maschine
          let machineId = null;
          if (refill.machine_id) {
            const machine = await getMachineByVendonId(refill.machine_id.toString());
            machineId = machine?.id || null;
          }
          
          // Refill-Datum konvertieren
          let refillDate = new Date();
          if (refill.datetime) {
            refillDate = new Date(refill.datetime * 1000);
          } else if (refill.timestamp) {
            refillDate = new Date(refill.timestamp * 1000);
          }
          
          // Refill speichern
          await db.insert(refills).values({
            vendonId: refill.id.toString(),
            machineId: machineId,
            datetime: refillDate,
            operator: refill.operator || refill.employee_name || 'Unbekannt',
            products: refill.products ? JSON.stringify(refill.products) : null,
            extraData: JSON.stringify(refill)
          });
          
          savedRefills++;
          
          console.log(`💾 Refill gespeichert: ${refillDate.toISOString()} für Maschine ${refill.machine_name}`);
          
        } catch (error) {
          console.error('❌ Fehler beim Speichern des Refills:', error);
        }
      }
      
      hasMore = response.result.length === 100;
      offset += 100;
      
      // Kleine Pause zwischen Requests
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`❌ Fehler beim Abrufen von Refills bei Offset ${offset}:`, error);
      break;
    }
  }
  
  console.log(`✅ Refill-Sync abgeschlossen: ${savedRefills}/${totalRefills} neue Refills gespeichert`);
  return { total: totalRefills, saved: savedRefills };
}

async function main() {
  try {
    console.log('🚀 Starte Emergency Event & Refill Sync...');
    
    // Synchronisiere Events
    const eventResult = await syncRecentEvents();
    
    // Synchronisiere Refills
    const refillResult = await syncRecentRefills();
    
    console.log('\n📊 ZUSAMMENFASSUNG:');
    console.log(`Events: ${eventResult.saved}/${eventResult.total} neue Events`);
    console.log(`Refills: ${refillResult.saved}/${refillResult.total} neue Refills`);
    
    // Prüfe aktualisierte Daten für die problematischen Maschinen
    console.log('\n🔍 Überprüfe aktualisierte Daten für Bad Schandau und Bad Gottleuba...');
    
    const updatedData = await db.select({
      id: machines.id,
      machineName: machines.machineName,
      latestRefill: db.select({ datetime: refills.datetime })
        .from(refills)
        .where(eq(refills.machineId, machines.id))
        .orderBy(desc(refills.datetime))
        .limit(1),
      latestEvent: db.select({ datetime: events.datetime })
        .from(events)
        .where(eq(events.machineId, machines.id))
        .orderBy(desc(events.datetime))
        .limit(1)
    }).from(machines)
    .where(eq(machines.id, 3)); // Bad Schandau
    
    console.log('Aktualisierte Daten:', JSON.stringify(updatedData, null, 2));
    
  } catch (error) {
    console.error('❌ Kritischer Fehler:', error);
    process.exit(1);
  }
}

main();