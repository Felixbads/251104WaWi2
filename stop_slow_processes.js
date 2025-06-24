/**
 * Stoppt langsame Lagerabgleich-Prozesse
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString);
const db = drizzle(sql);

console.log('Stoppe langsame Lagerabgleich-Prozesse...');

// Führe SQL direkt aus, um langsame Prozesse zu stoppen
await sql`
  UPDATE sync_logs 
  SET sync_status = 'cancelled', 
      end_date = NOW(),
      error_message = 'Prozess gestoppt - zu langsam'
  WHERE sync_type IN ('warehouse_reconciliation', 'lagerabgleich') 
  AND sync_status = 'running'
`;

console.log('Langsame Prozesse gestoppt.');
await sql.end();