const { Pool } = require('pg');

// Datenbankverbindung herstellen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function countAllTables() {
  try {
    // Alle Tabellen im Schema 'public' abrufen
    const tablesResult = await pool.query(`
      SELECT tablename 
      FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    const tables = tablesResult.rows.map(row => row.tablename);
    console.log(`Gefundene Tabellen: ${tables.length}`);
    
    // Für jede Tabelle die Anzahl der Einträge zählen
    const counts = [];
    
    for (const table of tables) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) FROM "${table}"`);
        const count = parseInt(countResult.rows[0].count);
        counts.push({ table, count });
      } catch (err) {
        console.error(`Fehler beim Zählen von Einträgen in ${table}:`, err.message);
        counts.push({ table, count: 'FEHLER' });
      }
    }
    
    // Sortieren und ausgeben
    counts.sort((a, b) => {
      if (typeof a.count === 'number' && typeof b.count === 'number') {
        return b.count - a.count;
      }
      return 0;
    });
    
    console.log("\nANZAHL DER EINTRÄGE IN JEDER TABELLE:");
    console.log("=====================================");
    
    const maxTableLength = Math.max(...counts.map(item => item.table.length));
    
    for (const item of counts) {
      console.log(`${item.table.padEnd(maxTableLength + 2)}: ${item.count}`);
    }
    
  } catch (err) {
    console.error('Fehler bei der Abfrage:', err);
  } finally {
    await pool.end();
  }
}

countAllTables();
