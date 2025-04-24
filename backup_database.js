/**
 * Dieses Skript erstellt ein Backup der PostgreSQL-Datenbank
 * inkl. Schema und Daten, um vor weiteren Änderungen
 * eine Sicherungskopie zu haben.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';

dotenv.config();
const execPromise = promisify(exec);
const { Pool } = pg;

// Datenbankverbindung konfigurieren
const dbConfig = {
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE
};

// Backup-Verzeichnis und Zeitstempel
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = './backups';
const schemaBackupPath = path.join(backupDir, `schema_backup_${timestamp}.sql`);
const dataBackupPath = path.join(backupDir, `data_backup_${timestamp}.sql`);
const statsSummaryPath = path.join(backupDir, `db_stats_${timestamp}.json`);

/**
 * Prüft die Datenbankverbindung
 */
async function checkDbConnection() {
  const pool = new Pool(dbConfig);
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as time');
    console.log(`✅ Datenbankverbindung erfolgreich hergestellt - ${result.rows[0].time}`);
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Fehler bei der Datenbankverbindung:', error.message);
    return false;
  } finally {
    await pool.end();
  }
}

/**
 * Erstellt ein Verzeichnis, falls es nicht existiert
 */
async function ensureDirectoryExists(directory) {
  try {
    await execPromise(`mkdir -p ${directory}`);
    console.log(`✅ Verzeichnis "${directory}" bereitgestellt`);
  } catch (error) {
    console.error(`❌ Fehler beim Erstellen des Verzeichnisses: ${error.message}`);
    throw error;
  }
}

/**
 * Erstellt ein Backup des Datenbankschemas (ohne Daten)
 */
async function backupSchema() {
  try {
    console.log('📝 Erstelle Schema-Backup...');
    
    // pg_dump mit --schema-only Option für Schema ohne Daten
    const command = `PGPASSWORD="${dbConfig.password}" pg_dump --schema-only` +
      ` --host=${dbConfig.host}` +
      ` --port=${dbConfig.port}` +
      ` --username=${dbConfig.user}` +
      ` --dbname=${dbConfig.database}` +
      ` > ${schemaBackupPath}`;
    
    await execPromise(command);
    console.log(`✅ Schema-Backup erstellt: ${schemaBackupPath}`);
    return true;
  } catch (error) {
    console.error('❌ Fehler beim Erstellen des Schema-Backups:', error.message);
    return false;
  }
}

/**
 * Erstellt ein Backup der Datenbankdaten (ohne Schema)
 */
async function backupData() {
  try {
    console.log('📝 Erstelle Daten-Backup...');
    
    // pg_dump mit --data-only Option für Daten ohne Schema
    const command = `PGPASSWORD="${dbConfig.password}" pg_dump --data-only` +
      ` --host=${dbConfig.host}` +
      ` --port=${dbConfig.port}` +
      ` --username=${dbConfig.user}` +
      ` --dbname=${dbConfig.database}` +
      ` > ${dataBackupPath}`;
    
    await execPromise(command);
    console.log(`✅ Daten-Backup erstellt: ${dataBackupPath}`);
    return true;
  } catch (error) {
    console.error('❌ Fehler beim Erstellen des Daten-Backups:', error.message);
    return false;
  }
}

/**
 * Sammelt Statistiken über die Datenbank
 */
async function collectDatabaseStats() {
  const pool = new Pool(dbConfig);
  try {
    console.log('📊 Sammle Datenbankstatistiken...');
    
    // Tabellen im Schema 'public' abrufen
    const tablesResult = await pool.query(`
      SELECT tablename 
      FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    const tables = tablesResult.rows.map(row => row.tablename);
    console.log(`Gefundene Tabellen: ${tables.length}`);
    
    // Für jede Tabelle die Anzahl der Einträge zählen
    const tableStats = [];
    
    for (const table of tables) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) FROM "${table}"`);
        const count = parseInt(countResult.rows[0].count);
        tableStats.push({ table, count });
      } catch (err) {
        console.error(`Fehler beim Zählen von Einträgen in ${table}:`, err.message);
        tableStats.push({ table, count: 'ERROR' });
      }
    }
    
    // Fremdschlüsselbeziehungen abrufen
    const foreignKeysResult = await pool.query(`
      SELECT 
        conrelid::regclass AS table_name, 
        conname AS constraint_name, 
        pg_get_constraintdef(oid) AS definition
      FROM 
        pg_constraint
      WHERE 
        contype = 'f' AND 
        connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY 
        table_name
    `);
    
    // Datenbankstatistiken in eine JSON-Datei schreiben
    const dbStats = {
      timestamp: new Date().toISOString(),
      tableCount: tables.length,
      tableStats: tableStats.sort((a, b) => {
        if (typeof a.count === 'number' && typeof b.count === 'number') {
          return b.count - a.count;
        }
        return 0;
      }),
      foreignKeys: foreignKeysResult.rows,
      databaseName: dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port
    };
    
    await writeFile(statsSummaryPath, JSON.stringify(dbStats, null, 2));
    console.log(`✅ Datenbankstatistiken gespeichert: ${statsSummaryPath}`);
    
    // Ausgabe der Tabellenstatistiken
    console.log("\nANZAHL DER EINTRÄGE IN JEDER TABELLE:");
    console.log("=====================================");
    
    const maxTableLength = Math.max(...tableStats.map(item => item.table.length));
    
    for (const item of tableStats.sort((a, b) => {
      if (typeof a.count === 'number' && typeof b.count === 'number') {
        return b.count - a.count;
      }
      return 0;
    })) {
      console.log(`${item.table.padEnd(maxTableLength + 2)}: ${item.count}`);
    }
    
    return dbStats;
  } catch (error) {
    console.error('❌ Fehler beim Sammeln der Datenbankstatistiken:', error.message);
    return null;
  } finally {
    await pool.end();
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  try {
    console.log('🔄 Starte Datenbank-Backup-Prozess...');
    
    // Prüfen der Datenbankverbindung
    const isConnected = await checkDbConnection();
    if (!isConnected) {
      throw new Error('Keine Verbindung zur Datenbank möglich - Backup abgebrochen');
    }
    
    // Sicherstellen, dass das Backup-Verzeichnis existiert
    await ensureDirectoryExists(backupDir);
    
    // Backups erstellen
    const schemaBackupSuccess = await backupSchema();
    const dataBackupSuccess = await backupData();
    
    // Statistiken sammeln
    const stats = await collectDatabaseStats();
    
    console.log('\n🎉 BACKUP-PROZESS ABGESCHLOSSEN');
    console.log('===============================');
    console.log(`Schema-Backup: ${schemaBackupSuccess ? '✅ Erfolgreich' : '❌ Fehlgeschlagen'}`);
    console.log(`Daten-Backup: ${dataBackupSuccess ? '✅ Erfolgreich' : '❌ Fehlgeschlagen'}`);
    console.log(`Statistiken: ${stats ? '✅ Erfolgreich erstellt' : '❌ Fehlgeschlagen'}`);
    console.log('\nBackup-Dateien:');
    console.log(`- Schema: ${schemaBackupPath}`);
    console.log(`- Daten: ${dataBackupPath}`);
    console.log(`- Stats: ${statsSummaryPath}`);
    
  } catch (error) {
    console.error(`\n❌ KRITISCHER FEHLER: ${error.message}`);
    process.exit(1);
  }
}

// Ausführen der Hauptfunktion
main();