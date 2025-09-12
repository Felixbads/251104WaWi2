
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '@shared/schema';

// Konfiguriere WebSocket für Neon Postgres mit Fehlerbehandlung
neonConfig.webSocketConstructor = ws;
// Workaround für ErrorEvent.message Kompatibilitätsproblem
neonConfig.fetchConnectionCache = false;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Verbindungspool für die Neon-Datenbank erstellen mit verbesserten Einstellungen
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000, // 15 Sekunden Timeout (erhöht für Stabilität)
  max: 5, // reduziert für bessere Stabilität
  idleTimeoutMillis: 60000, // 60 Sekunden für bessere Verbindungsstabilität
  // Zusätzliche Workarounds für Neon Serverless Kompatibilität
  ssl: process.env.NODE_ENV === 'production'
});

// Verbindungsüberprüfung
pool.on('error', (err) => {
  console.error('Unerwarteter Datenbankfehler', err);
});

// ORM-Instanz mit den Schemadefinitionen initialisieren
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
