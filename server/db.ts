// Verwende commonjs-Import für postgres-Modul
import pg from 'pg';
const { Pool } = pg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Exportiere das Drizzle-Objekt für ORM-Zugriff
export const db = drizzle(pool, { schema });

// Auch Raw-Query-Zugriff bereitstellen
export const rawDb = {
  query: (text: string, params?: any[]) => pool.query(text, params)
};

// SQL-Tagged Template Function für sicheres SQL
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

// Füge eine unsichere Variante für direktes SQL hinzu - nur mit Vorsicht verwenden!
rawSql.unsafe = async (text: string) => {
  const result = await pool.query(text);
  return result.rows;
};