
import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@shared/schema';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Optimized PostgreSQL connection pool for Neon Database
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5, // Reduced max connections for better stability
  min: 1, // Keep minimum connections alive
  idleTimeoutMillis: 60000, // 60 seconds idle timeout
  connectionTimeoutMillis: 20000, // 20 seconds connection timeout (increased for Neon)
  // Note: acquireTimeoutMillis is not a valid PoolConfig property - removed
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Additional Neon-specific optimizations
  keepAlive: true,
  keepAliveInitialDelayMillis: 0
});

// Verbindungsüberprüfung
pool.on('error', (err) => {
  console.error('Unerwarteter Datenbankfehler', err);
});

// Drizzle ORM-Instanz mit Standard PostgreSQL Pool initialisieren
export const db = drizzle(pool, { schema });

// Raw-Query-Zugriff für direkte SQL-Abfragen bereitstellen
export const rawDb = {
  query: (text: string, params?: any[]) => {
    console.log('SQL-Anfrage ausführen:', text);
    return pool.query(text, params).catch(err => {
      console.error('SQL-Fehler:', err);
      throw err;
    });
  }
};

// SQL-Tagged Template Function für sicheres SQL mit Parameterisierung
export const rawSql = async (strings: TemplateStringsArray, ...values: any[]) => {
  let text = strings[0];
  const params: any[] = [];

  for (let i = 0; i < values.length; i++) {
    params.push(values[i]);
    text += `$${params.length}${strings[i + 1] || ''}`;
  }

  try {
    const result = await pool.query(text, params);
    return result.rows;
  } catch (error) {
    console.error('Fehler bei SQL-Ausführung:', error);
    throw error;
  }
};

// Methode für direkte SQL-Ausführung ohne Parameterisierung
// WARNUNG: Dies sollte nur für administrative Abfragen verwendet werden.
// Bei Benutzerabfragen immer die parameterisierte Variante verwenden!
rawSql.unsafe = async (text: string) => {
  try {
    const result = await pool.query(text);
    return result.rows;
  } catch (error) {
    console.error('Fehler bei unsicherer SQL-Ausführung:', error);
    throw error;
  }
};
