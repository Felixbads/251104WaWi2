/**
 * Diagnostic Vendon Sync - Investigate and Fix Data Retrieval Issues
 */

import { db } from './server/db.js';
import { events, refills } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const VENDON_API_KEY = process.env.VENDON_API_KEY || "e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB";
const VENDON_API_BASE = "https://cloud.vendon.net/rest/v1.8.0";

async function makeVendonRequest(endpoint) {
  const response = await fetch(`${VENDON_API_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Token ${VENDON_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Vendon API Error: ${response.status} ${response.statusText} - ${await response.text()}`);
  }
  
  return response.json();
}

async function diagnosticSync() {
  try {
    console.log('=== VENDON API DIAGNOSTIC SYNC ===');
    
    // Current timestamp ranges
    const now = Math.floor(Date.now() / 1000);
    const yesterday = now - (24 * 60 * 60);
    const threeDaysAgo = now - (3 * 24 * 60 * 60);
    
    console.log(`Current timestamp: ${now} (${new Date(now * 1000).toISOString()})`);
    console.log(`Yesterday timestamp: ${yesterday} (${new Date(yesterday * 1000).toISOString()})`);
    console.log(`3 days ago timestamp: ${threeDaysAgo} (${new Date(threeDaysAgo * 1000).toISOString()})`);
    
    // 1. Test Events API with different time ranges
    console.log('\n--- TESTING EVENTS API ---');
    
    try {
      const eventsLast24h = await makeVendonRequest(
        `/events?from_timestamp=${yesterday}&to_timestamp=${now}&limit=20`
      );
      console.log(`Events last 24h: Found ${eventsLast24h.result?.length || 0} events`);
      if (eventsLast24h.result?.length > 0) {
        console.log('Sample event:', JSON.stringify(eventsLast24h.result[0], null, 2));
      }
    } catch (error) {
      console.error('Error fetching events last 24h:', error.message);
    }
    
    try {
      const eventsLast3Days = await makeVendonRequest(
        `/events?from_timestamp=${threeDaysAgo}&to_timestamp=${now}&limit=50`
      );
      console.log(`Events last 3 days: Found ${eventsLast3Days.result?.length || 0} events`);
    } catch (error) {
      console.error('Error fetching events last 3 days:', error.message);
    }
    
    // 2. Test Refills API
    console.log('\n--- TESTING REFILLS API ---');
    
    try {
      const refillsLast24h = await makeVendonRequest(
        `/refills?from_timestamp=${yesterday}&to_timestamp=${now}&limit=20`
      );
      console.log(`Refills last 24h: Found ${refillsLast24h.result?.length || 0} refills`);
      if (refillsLast24h.result?.length > 0) {
        console.log('Sample refill:', JSON.stringify(refillsLast24h.result[0], null, 2));
      }
    } catch (error) {
      console.error('Error fetching refills last 24h:', error.message);
    }
    
    try {
      const refillsLast3Days = await makeVendonRequest(
        `/refills?from_timestamp=${threeDaysAgo}&to_timestamp=${now}&limit=50`
      );
      console.log(`Refills last 3 days: Found ${refillsLast3Days.result?.length || 0} refills`);
    } catch (error) {
      console.error('Error fetching refills last 3 days:', error.message);
    }
    
    // 3. Check what's in our database vs what should be there
    console.log('\n--- DATABASE vs API COMPARISON ---');
    
    const dbEvents = await db.execute(`
      SELECT COUNT(*) as count, MAX(datetime) as latest 
      FROM events 
      WHERE datetime >= NOW() - INTERVAL '24 hours'
    `);
    
    const dbRefills = await db.execute(`
      SELECT COUNT(*) as count, MAX(datetime) as latest 
      FROM refills 
      WHERE datetime >= NOW() - INTERVAL '24 hours'
    `);
    
    console.log(`DB Events last 24h: ${dbEvents.rows[0]?.count || 0}, latest: ${dbEvents.rows[0]?.latest || 'none'}`);
    console.log(`DB Refills last 24h: ${dbRefills.rows[0]?.count || 0}, latest: ${dbRefills.rows[0]?.latest || 'none'}`);
    
    // 4. Test API connection and permissions
    console.log('\n--- API AUTHENTICATION TEST ---');
    
    try {
      const authTest = await makeVendonRequest('/user');
      console.log('API Authentication: SUCCESS');
      console.log('User info:', JSON.stringify(authTest, null, 2));
    } catch (error) {
      console.error('API Authentication: FAILED -', error.message);
    }
    
    // 5. Test machine list to understand data structure
    console.log('\n--- MACHINES API TEST ---');
    
    try {
      const machines = await makeVendonRequest('/machines?limit=5');
      console.log(`Machines found: ${machines.result?.length || 0}`);
      if (machines.result?.length > 0) {
        console.log('Sample machine:', JSON.stringify(machines.result[0], null, 2));
      }
    } catch (error) {
      console.error('Error fetching machines:', error.message);
    }
    
    console.log('\n=== DIAGNOSTIC COMPLETE ===');
    
  } catch (error) {
    console.error('Diagnostic failed:', error);
  }
}

diagnosticSync();