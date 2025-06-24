/**
 * Complete Data Synchronization Fix
 * Fixes both event sync and holiday data issues
 */

import { db } from './server/db.js';
import { events, holidays } from './shared/schema.js';
import fetch from 'node-fetch';

const VENDON_API_KEY = process.env.VENDON_API_KEY || "e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB";
const VENDON_API_BASE = "https://cloud.vendon.net/rest/v1.8.0";

// German states for holiday data
const GERMAN_STATES = [
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' }
];

async function makeVendonRequest(endpoint) {
  const response = await fetch(`${VENDON_API_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Token ${VENDON_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 30000
  });
  
  if (!response.ok) {
    throw new Error(`Vendon API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function syncRecentEvents() {
  console.log('Synchronizing recent events from Vendon API...');
  
  const fromTimestamp = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000); // 14 days back
  const toTimestamp = Math.floor(Date.now() / 1000);
  
  let offset = 0;
  let hasMore = true;
  let totalEvents = 0;
  let savedEvents = 0;
  
  while (hasMore) {
    try {
      console.log(`Loading events: Offset ${offset}`);
      
      const response = await makeVendonRequest(
        `/events?from_timestamp=${fromTimestamp}&to_timestamp=${toTimestamp}&limit=200&offset=${offset}`
      );
      
      if (!response.result || response.result.length === 0) {
        console.log('No more events found');
        break;
      }
      
      console.log(`Received ${response.result.length} events`);
      totalEvents += response.result.length;
      
      for (const event of response.result) {
        try {
          // Check if event already exists
          const existingEvent = await db.select()
            .from(events)
            .where(eq(events.vendonId, event.id.toString()))
            .limit(1);
            
          if (existingEvent.length > 0) {
            continue; // Skip duplicate
          }
          
          // Convert event date
          let eventDate = new Date();
          if (event.event_datetime) {
            eventDate = new Date(event.event_datetime * 1000);
          } else if (event.received_at) {
            eventDate = new Date(event.received_at * 1000);
          }
          
          // Save event
          await db.insert(events).values({
            vendonId: event.id.toString(),
            machineId: null, // Will be linked later
            machineName: event.machine_name || 'Unknown',
            datetime: eventDate,
            eventType: event.event_type || event.type || 'unknown',
            eventName: event.event_name || event.name || 'Unknown',
            severity: event.severity || 'normal',
            description: event.description || event.message || null,
            extraData: JSON.stringify(event)
          });
          
          savedEvents++;
          
        } catch (error) {
          console.error('Error saving event:', error.message);
        }
      }
      
      hasMore = response.result.length === 200;
      offset += 200;
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`Error fetching events at offset ${offset}:`, error.message);
      break;
    }
  }
  
  console.log(`Event sync completed: ${savedEvents}/${totalEvents} new events saved`);
  return { total: totalEvents, saved: savedEvents };
}

async function syncGermanHolidays() {
  console.log('Synchronizing German holidays for all states...');
  
  let totalHolidays = 0;
  let savedHolidays = 0;
  
  for (const state of GERMAN_STATES) {
    try {
      console.log(`Fetching holidays for ${state.name} (${state.code})...`);
      
      // Use a German holiday API
      const response = await fetch(`https://feiertage-api.de/api/?jahr=2025&nur_land=${state.code}`, {
        timeout: 10000
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch holidays for ${state.code}: ${response.status}`);
        continue;
      }
      
      const holidaysData = await response.json();
      
      for (const [name, details] of Object.entries(holidaysData)) {
        try {
          const holidayDate = new Date(details.datum);
          
          // Check if holiday already exists
          const existing = await db.select()
            .from(holidays)
            .where(and(
              eq(holidays.date, holidayDate),
              eq(holidays.state, state.code),
              eq(holidays.name, name)
            ))
            .limit(1);
            
          if (existing.length > 0) {
            continue; // Skip duplicate
          }
          
          await db.insert(holidays).values({
            date: holidayDate,
            name: name,
            description: details.hinweis || null,
            type: 'public',
            isOfficial: true,
            country: 'DE',
            state: state.code,
            region: state.name,
            year: 2025,
            trimester: Math.ceil((holidayDate.getMonth() + 1) / 4),
            month: holidayDate.getMonth() + 1,
            day: holidayDate.getDate(),
            weekday: holidayDate.getDay(),
            weekdayName: holidayDate.toLocaleDateString('de-DE', { weekday: 'long' }),
            week: Math.ceil((holidayDate.getDate() + new Date(2025, holidayDate.getMonth(), 1).getDay()) / 7),
            metadata: JSON.stringify(details)
          });
          
          savedHolidays++;
          totalHolidays++;
          
        } catch (error) {
          console.error(`Error saving holiday ${name} for ${state.code}:`, error.message);
        }
      }
      
      console.log(`Saved holidays for ${state.code}: ${Object.keys(holidaysData).length} holidays`);
      
      // Small delay between state requests
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`Error fetching holidays for ${state.code}:`, error.message);
    }
  }
  
  console.log(`Holiday sync completed: ${savedHolidays} new holidays saved`);
  return { total: totalHolidays, saved: savedHolidays };
}

async function main() {
  try {
    console.log('Starting comprehensive data synchronization...');
    
    // Import the eq function
    const { eq, and } = await import('drizzle-orm');
    global.eq = eq;
    global.and = and;
    
    // Sync events
    const eventResult = await syncRecentEvents();
    
    // Sync holidays
    const holidayResult = await syncGermanHolidays();
    
    console.log('\n=== SYNCHRONIZATION SUMMARY ===');
    console.log(`Events: ${eventResult.saved}/${eventResult.total} new events imported`);
    console.log(`Holidays: ${holidayResult.saved} new holidays imported for all German states`);
    
    // Verify the fix
    console.log('\nVerifying data...');
    
    const recentEventsCount = await db.select({ count: 'count(*)' })
      .from(events)
      .where(gte(events.datetime, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
    
    const holidaysByState = await db.select({
      state: holidays.state,
      count: 'count(*)'
    })
    .from(holidays)
    .where(eq(holidays.year, 2025))
    .groupBy(holidays.state);
    
    console.log(`Recent events (last 7 days): ${recentEventsCount[0]?.count || 0}`);
    console.log(`Holiday data coverage: ${holidaysByState.length}/16 German states`);
    
  } catch (error) {
    console.error('Critical error:', error);
    process.exit(1);
  }
}

main();