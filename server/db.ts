import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '@shared/schema';

// Konfiguriere WebSocket für Neon Postgres
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Verbindungspool für die Neon-Datenbank erstellen
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ORM-Instanz mit den Schemadefinitionen initialisieren
export const db = drizzle(pool, { schema });

// Raw-Query-Zugriff für direkte SQL-Abfragen bereitstellen
export const rawDb = {
  query: (text: string, params?: any[]) => pool.query(text, params)
};

// SQL-Tagged Template Function für sicheres SQL mit Parameterisierung
export const rawSql = async (strings: TemplateStringsArray, ...values: any[]) => {
  let text = strings[0];
  const params: any[] = [];

  for (let i = 0; i < values.length; i++) {
    params.push(values[i]);
    text += `$${params.length}${strings[i + 1] || ''}`;
  }

  const result = await pool.query(text, params);
  return result.rows;
};

// Methode für direkte SQL-Ausführung ohne Parameterisierung
// WARNUNG: Dies sollte nur für administrative Abfragen verwendet werden.
// Bei Benutzerabfragen immer die parameterisierte Variante verwenden!
rawSql.unsafe = async (text: string) => {
  const result = await pool.query(text);
  return result.rows;
};