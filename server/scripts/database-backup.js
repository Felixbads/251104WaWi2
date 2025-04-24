/**
 * Automatisches Datenbank-Backup-System
 * 
 * Dieses Skript erstellt regelmäßige Backups der PostgreSQL-Datenbank:
 * - Vollständige Backups (Schema und Daten)
 * - Inkrementelle Backups (nur Änderungen)
 * - Strukturierte Speicherung mit Zeitstempel
 * - Rotationsmechanismus für alte Backups
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Pool } = require('pg');
const os = require('os');

// Konfigurationen
const BACKUP_DIR = path.join(process.cwd(), 'db_backups');
const FULL_BACKUP_DIR = path.join(BACKUP_DIR, 'full');
const SCHEMA_DIR = path.join(BACKUP_DIR, 'schema');
const INCREMENTAL_DIR = path.join(BACKUP_DIR, 'incremental');
const LOG_DIR = path.join(BACKUP_DIR, 'logs');
const META_FILE = path.join(BACKUP_DIR, 'backup_meta.json');

// Aufbewahrungsrichtlinien (in Tagen)
const RETENTION = {
  full: 30,        // Aufbewahrung von vollständigen Backups für 30 Tage
  schema: 60,      // Aufbewahrung von Schema-Backups für 60 Tage
  incremental: 7,  // Aufbewahrung von inkrementellen Backups für 7 Tage
  logs: 14         // Aufbewahrung von Logs für 14 Tage
};

// Datenbankkonfiguration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

/**
 * Stelle sicher, dass alle erforderlichen Verzeichnisse existieren
 */
function ensureDirectories() {
  [BACKUP_DIR, FULL_BACKUP_DIR, SCHEMA_DIR, INCREMENTAL_DIR, LOG_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Verzeichnis erstellt: ${dir}`);
    }
  });
}

/**
 * Erzeuge einen Zeitstempel für Dateinamen
 */
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-');
}

/**
 * Protokolliere eine Meldung im Log-Verzeichnis und in der Konsole
 */
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);
  
  const logFile = path.join(LOG_DIR, `backup_${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logMessage + '\n');
}

/**
 * Überprüfe die Datenbankverbindung
 */
async function checkDbConnection() {
  const pool = new Pool(dbConfig);
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT current_database()');
    const dbName = res.rows[0].current_database;
    log(`Verbindung zur Datenbank '${dbName}' erfolgreich hergestellt`);
    client.release();
    await pool.end();
    return true;
  } catch (err) {
    log(`Fehler bei der Datenbankverbindung: ${err.message}`, 'ERROR');
    await pool.end();
    return false;
  }
}

/**
 * Erstelle ein vollständiges Datenbank-Backup (Schema und Daten)
 */
async function createFullBackup() {
  const timestamp = getTimestamp();
  const backupFile = path.join(FULL_BACKUP_DIR, `full_backup_${timestamp}.sql`);
  const dumpCmd = `PGPASSWORD="${process.env.PGPASSWORD}" pg_dump -h ${process.env.PGHOST} -p ${process.env.PGPORT} -U ${process.env.PGUSER} -d ${process.env.PGDATABASE} -v -F p -f "${backupFile}"`;
  
  log(`Starte vollständiges Backup in Datei: ${backupFile}`);
  
  try {
    execSync(dumpCmd, { stdio: 'inherit' });
    
    // Komprimiere das Backup
    execSync(`gzip "${backupFile}"`, { stdio: 'inherit' });
    log(`Vollständiges Backup erfolgreich erstellt und komprimiert: ${backupFile}.gz`);
    
    updateBackupMeta('full', `${backupFile}.gz`);
    return `${backupFile}.gz`;
  } catch (err) {
    log(`Fehler beim vollständigen Backup: ${err.message}`, 'ERROR');
    throw err;
  }
}

/**
 * Erstelle ein Schema-Backup (nur Datenbankstruktur, keine Daten)
 */
async function createSchemaBackup() {
  const timestamp = getTimestamp();
  const backupFile = path.join(SCHEMA_DIR, `schema_backup_${timestamp}.sql`);
  const dumpCmd = `PGPASSWORD="${process.env.PGPASSWORD}" pg_dump -h ${process.env.PGHOST} -p ${process.env.PGPORT} -U ${process.env.PGUSER} -d ${process.env.PGDATABASE} -v -F p --schema-only -f "${backupFile}"`;
  
  log(`Starte Schema-Backup in Datei: ${backupFile}`);
  
  try {
    execSync(dumpCmd, { stdio: 'inherit' });
    log(`Schema-Backup erfolgreich erstellt: ${backupFile}`);
    
    updateBackupMeta('schema', backupFile);
    return backupFile;
  } catch (err) {
    log(`Fehler beim Schema-Backup: ${err.message}`, 'ERROR');
    throw err;
  }
}

/**
 * Erstelle ein inkrementelles Backup basierend auf Änderungen seit dem letzten Backup
 */
async function createIncrementalBackup() {
  // In einer echten Implementierung würde hier WAL-Archivierung oder 
  // pg_dump mit --since-last-backup o.ä. verwendet werden
  // Für unsere Zwecke erstellen wir ein Daten-only Backup als "inkrementell"
  
  const timestamp = getTimestamp();
  const backupFile = path.join(INCREMENTAL_DIR, `incr_backup_${timestamp}.sql`);
  const dumpCmd = `PGPASSWORD="${process.env.PGPASSWORD}" pg_dump -h ${process.env.PGHOST} -p ${process.env.PGPORT} -U ${process.env.PGUSER} -d ${process.env.PGDATABASE} -v -F p --data-only -f "${backupFile}"`;
  
  log(`Starte inkrementelles Backup in Datei: ${backupFile}`);
  
  try {
    execSync(dumpCmd, { stdio: 'inherit' });
    
    // Komprimiere das Backup
    execSync(`gzip "${backupFile}"`, { stdio: 'inherit' });
    log(`Inkrementelles Backup erfolgreich erstellt und komprimiert: ${backupFile}.gz`);
    
    updateBackupMeta('incremental', `${backupFile}.gz`);
    return `${backupFile}.gz`;
  } catch (err) {
    log(`Fehler beim inkrementellen Backup: ${err.message}`, 'ERROR');
    throw err;
  }
}

/**
 * Sammle Informationen über die Datenbank
 */
async function collectDatabaseInfo() {
  const pool = new Pool(dbConfig);
  try {
    const client = await pool.connect();
    
    // Datenbankgröße
    const sizeQuery = "SELECT pg_size_pretty(pg_database_size(current_database())) as size";
    const sizeResult = await client.query(sizeQuery);
    const dbSize = sizeResult.rows[0].size;
    
    // Anzahl der Tabellen
    const tablesQuery = "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public'";
    const tablesResult = await client.query(tablesQuery);
    const tableCount = tablesResult.rows[0].table_count;
    
    // Anzahl der Datensätze pro Tabelle
    const recordsQuery = `
      SELECT 
        relname as table_name, 
        n_live_tup as row_count
      FROM 
        pg_stat_user_tables
      ORDER BY 
        n_live_tup DESC
    `;
    const recordsResult = await client.query(recordsQuery);
    
    client.release();
    await pool.end();
    
    const info = {
      timestamp: new Date().toISOString(),
      database_size: dbSize,
      table_count: tableCount,
      tables: recordsResult.rows
    };
    
    // Speichere Informationen in einer Datei
    const infoFile = path.join(BACKUP_DIR, `db_info_${getTimestamp()}.json`);
    fs.writeFileSync(infoFile, JSON.stringify(info, null, 2));
    
    log(`Datenbankinformationen gesammelt und in ${infoFile} gespeichert.`);
    return info;
  } catch (err) {
    log(`Fehler beim Sammeln von Datenbankinformationen: ${err.message}`, 'ERROR');
    await pool.end();
    throw err;
  }
}

/**
 * Aktualisiere die Backup-Metadaten
 */
function updateBackupMeta(type, filePath) {
  let meta = {};
  if (fs.existsSync(META_FILE)) {
    meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  }
  
  if (!meta[type]) {
    meta[type] = [];
  }
  
  meta[type].push({
    file: filePath,
    timestamp: new Date().toISOString(),
    size: fs.statSync(filePath).size
  });
  
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

/**
 * Entferne alte Backups basierend auf den Aufbewahrungsrichtlinien
 */
function cleanupOldBackups() {
  log('Starte Bereinigung alter Backups...');
  
  const now = new Date();
  
  // Funktion zur Bereinigung eines bestimmten Verzeichnisses
  function cleanupDir(dir, retentionDays, filePattern) {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir)
      .filter(file => file.match(filePattern))
      .map(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        return { file, path: filePath, mtime: stats.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime); // Neueste zuerst
    
    const retentionDate = new Date(now);
    retentionDate.setDate(retentionDate.getDate() - retentionDays);
    
    let deletedCount = 0;
    for (const file of files) {
      if (file.mtime < retentionDate) {
        try {
          fs.unlinkSync(file.path);
          log(`Alte Backup-Datei gelöscht: ${file.path}`);
          deletedCount++;
        } catch (err) {
          log(`Fehler beim Löschen der Datei ${file.path}: ${err.message}`, 'ERROR');
        }
      }
    }
    
    log(`${deletedCount} alte Backup-Dateien aus ${dir} gelöscht`);
  }
  
  // Bereinige jedes Backup-Verzeichnis
  cleanupDir(FULL_BACKUP_DIR, RETENTION.full, /^full_backup_.*\.sql\.gz$/);
  cleanupDir(SCHEMA_DIR, RETENTION.schema, /^schema_backup_.*\.sql$/);
  cleanupDir(INCREMENTAL_DIR, RETENTION.incremental, /^incr_backup_.*\.sql\.gz$/);
  cleanupDir(LOG_DIR, RETENTION.logs, /^backup_.*\.log$/);
  
  log('Backup-Bereinigung abgeschlossen');
}

/**
 * Führe ein Backup mit dem angegebenen Typ aus
 */
async function runBackup(type) {
  log(`Starte Backup vom Typ: ${type}`);
  
  try {
    switch (type) {
      case 'full':
        await createFullBackup();
        break;
      case 'schema':
        await createSchemaBackup();
        break;
      case 'incremental':
        await createIncrementalBackup();
        break;
      case 'info':
        await collectDatabaseInfo();
        break;
      default:
        log(`Unbekannter Backup-Typ: ${type}`, 'ERROR');
        return false;
    }
    
    return true;
  } catch (err) {
    log(`Backup vom Typ ${type} fehlgeschlagen: ${err.message}`, 'ERROR');
    return false;
  }
}

/**
 * Wiederherstellung aus einem Backup
 * @param {string} backupFile - Pfad zur Backup-Datei
 */
async function restoreBackup(backupFile) {
  if (!fs.existsSync(backupFile)) {
    log(`Backup-Datei nicht gefunden: ${backupFile}`, 'ERROR');
    return false;
  }
  
  log(`Starte Wiederherstellung aus Backup: ${backupFile}`);
  
  try {
    // Entscheide, ob die Datei komprimiert ist
    const isGzipped = backupFile.endsWith('.gz');
    let restoreCmd;
    
    if (isGzipped) {
      // Für komprimierte Backups
      restoreCmd = `gunzip -c "${backupFile}" | PGPASSWORD="${process.env.PGPASSWORD}" psql -h ${process.env.PGHOST} -p ${process.env.PGPORT} -U ${process.env.PGUSER} -d ${process.env.PGDATABASE}`;
    } else {
      // Für unkomprimierte Backups
      restoreCmd = `PGPASSWORD="${process.env.PGPASSWORD}" psql -h ${process.env.PGHOST} -p ${process.env.PGPORT} -U ${process.env.PGUSER} -d ${process.env.PGDATABASE} -f "${backupFile}"`;
    }
    
    execSync(restoreCmd, { stdio: 'inherit' });
    log(`Wiederherstellung erfolgreich abgeschlossen: ${backupFile}`);
    return true;
  } catch (err) {
    log(`Fehler bei der Wiederherstellung aus ${backupFile}: ${err.message}`, 'ERROR');
    return false;
  }
}

/**
 * Führe einen vollständigen Backup-Zyklus aus
 */
async function runBackupCycle() {
  log('Starte vollständigen Backup-Zyklus');
  
  try {
    // Stelle sicher, dass alle Verzeichnisse existieren
    ensureDirectories();
    
    // Überprüfe die Datenbankverbindung
    const dbConnected = await checkDbConnection();
    if (!dbConnected) {
      log('Backup-Zyklus abgebrochen: Keine Datenbankverbindung', 'ERROR');
      return false;
    }
    
    // Sammle Datenbankinformationen
    await collectDatabaseInfo();
    
    // Führe Backups in der richtigen Reihenfolge aus
    await createSchemaBackup();
    await createFullBackup();
    await createIncrementalBackup();
    
    // Bereinige alte Backups
    cleanupOldBackups();
    
    log('Backup-Zyklus erfolgreich abgeschlossen');
    return true;
  } catch (err) {
    log(`Backup-Zyklus fehlgeschlagen: ${err.message}`, 'ERROR');
    return false;
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'cycle';
  
  switch (command) {
    case 'cycle':
      await runBackupCycle();
      break;
    case 'full':
      await runBackup('full');
      break;
    case 'schema':
      await runBackup('schema');
      break;
    case 'incremental':
      await runBackup('incremental');
      break;
    case 'info':
      await runBackup('info');
      break;
    case 'restore':
      const backupFile = args[1];
      if (!backupFile) {
        log('Fehler: Keine Backup-Datei angegeben für die Wiederherstellung', 'ERROR');
        process.exit(1);
      }
      await restoreBackup(backupFile);
      break;
    case 'cleanup':
      cleanupOldBackups();
      break;
    default:
      log(`Unbekannter Befehl: ${command}`, 'ERROR');
      log('Verfügbare Befehle: cycle, full, schema, incremental, info, restore, cleanup');
      process.exit(1);
  }
}

// Führe das Skript aus, wenn es direkt aufgerufen wird
if (require.main === module) {
  main().catch(err => {
    log(`Unbehandelte Ausnahme: ${err.message}`, 'ERROR');
    process.exit(1);
  });
}

module.exports = {
  runBackupCycle,
  createFullBackup,
  createSchemaBackup,
  createIncrementalBackup,
  restoreBackup,
  collectDatabaseInfo,
  cleanupOldBackups
};