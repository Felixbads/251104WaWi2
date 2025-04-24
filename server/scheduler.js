/**
 * Scheduler für regelmäßige Hintergrundaufgaben
 * 
 * Dieser Scheduler führt automatisierte Aufgaben nach definierten Zeitplänen aus:
 * - Datenbank-Backups (täglich, wöchentlich)
 * - Datenbankintegritätsprüfung (wöchentlich)
 * - Synchronisierungsaufgaben (stündlich, täglich)
 * - Lager-Abgleich (täglich)
 */

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { syncTransactions } = require('./services/vendonSync');
const { syncRefills } = require('./services/refillSync');
const { syncMachines } = require('./services/machineSync');
const { syncEvents } = require('./services/eventSync');
const { syncProducts } = require('./services/productSync');
const { syncHistoricalData } = require('./services/historicalSync');
const { syncHolidays } = require('./services/holidaySync');
const { syncWeatherForecast } = require('./services/weatherSync');
const { syncHistoricalWeather } = require('./services/weatherHistoricalSync');
const { reconcileWarehouseInventory } = require('./services/warehouseReconciliation');
const backupSystem = require('./scripts/database-backup');
const integrityCheck = require('./scripts/database-integrity');

// Protokollierung
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
  
  // Speichere auch in eine Logdatei
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, `scheduler_${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, `[${timestamp}] [${level}] ${message}\n`);
}

/**
 * Initialisiere den Scheduler mit allen regelmäßigen Aufgaben
 */
function initializeScheduler() {
  log('Initialisiere automatisches Synchronisierungssystem...');
  
  // Sofortige Synchronisierung beim Start
  startImmediateSynchronization();
  
  // Regelmäßige schnelle Synchronisierungen (alle 5-60 Minuten)
  scheduleRegularSynchronization();
  
  // Tägliche Wartungsaufgaben
  scheduleDailyMaintenance();
  
  // Wöchentliche Wartungsaufgaben
  scheduleWeeklyMaintenance();
  
  // Monatliche Wartungsaufgaben
  scheduleMonthlyMaintenance();
  
  log('Automatischer Scheduler erfolgreich initialisiert');
}

/**
 * Starte sofortige Synchronisierung bestimmter Daten beim Serverstart
 */
function startImmediateSynchronization() {
  log('Starte automatische Synchronisierung...');
  
  // Sofortige Synchronisierung für wichtige Daten
  log('Plane sofortige Synchronisierung für: transactions');
  syncTransactions({ forceUpdate: false })
    .catch(err => log(`Fehler bei der sofortigen Transactions-Synchronisierung: ${err.message}`, 'ERROR'));
  
  // Schnelle initiale Synchronisierungen für wichtige Daten (mit Verzögerung)
  const fastSyncItems = ['refills', 'machines', 'products', 'events', 'weather_forecast'];
  fastSyncItems.forEach((item, index) => {
    const delay = (index + 1) * 2 * 60 * 1000; // 2, 4, 6, 8, 10 Minuten Verzögerung
    log(`Plane initiale schnelle Synchronisierung für: ${item}`);
    
    setTimeout(() => {
      executeScheduledSync(item);
    }, delay);
  });
  
  // Mittelschnelle initiale Synchronisierungen
  const mediumSyncItems = ['holidays', 'weather_historical_batch', 'warehouse_reconciliation'];
  mediumSyncItems.forEach((item, index) => {
    const delay = (fastSyncItems.length + index + 1) * 5 * 60 * 1000; // Weitere Verzögerung
    log(`Plane initiale langsame Synchronisierung für: ${item}`);
    
    setTimeout(() => {
      executeScheduledSync(item);
    }, delay);
  });
  
  // Historische Batch-Synchronisierung (am längsten verzögert)
  setTimeout(() => {
    log('Plane initiale historische Synchronisierung für: historical_batch');
    executeScheduledSync('historical_batch');
  }, (fastSyncItems.length + mediumSyncItems.length + 1) * 10 * 60 * 1000);
}

/**
 * Plane regelmäßige Synchronisierungen
 */
function scheduleRegularSynchronization() {
  // Transactions alle 15 Minuten (höchste Priorität)
  cron.schedule('*/15 * * * *', () => {
    log('Plane regelmäßige Synchronisierung: transactions (15 Minuten)');
    executeScheduledSync('transactions');
  });
  
  // Refills jede Stunde
  cron.schedule('5 * * * *', () => {
    log('Plane regelmäßige Synchronisierung: refills (stündlich)');
    executeScheduledSync('refills');
  });
  
  // Machines alle 2 Stunden
  cron.schedule('10 */2 * * *', () => {
    log('Plane regelmäßige Synchronisierung: machines (2 Stunden)');
    executeScheduledSync('machines');
  });
  
  // Products alle 3 Stunden
  cron.schedule('15 */3 * * *', () => {
    log('Plane regelmäßige Synchronisierung: products (3 Stunden)');
    executeScheduledSync('products');
  });
  
  // Events alle 4 Stunden
  cron.schedule('20 */4 * * *', () => {
    log('Plane regelmäßige Synchronisierung: events (4 Stunden)');
    executeScheduledSync('events');
  });
  
  // Wettervorhersage alle 6 Stunden
  cron.schedule('30 */6 * * *', () => {
    log('Plane regelmäßige Synchronisierung: weather_forecast (6 Stunden)');
    executeScheduledSync('weather_forecast');
  });
}

/**
 * Plane tägliche Wartungsaufgaben
 */
function scheduleDailyMaintenance() {
  // Täglicher Lagerabgleich um 2:30 Uhr
  cron.schedule('30 2 * * *', () => {
    log('Starte täglichen Lagerabgleich...');
    reconcileWarehouseInventory({ forceUpdate: true, onlyMachineProducts: true, createMissing: true })
      .then(() => log('Täglicher Lagerabgleich erfolgreich abgeschlossen'))
      .catch(err => log(`Fehler beim täglichen Lagerabgleich: ${err.message}`, 'ERROR'));
  });
  
  // Tägliches Vollbackup um 3:00 Uhr
  cron.schedule('0 3 * * *', () => {
    log('Starte tägliches Datenbankbackup...');
    backupSystem.runBackupCycle()
      .then(() => log('Tägliches Datenbankbackup erfolgreich abgeschlossen'))
      .catch(err => log(`Fehler beim täglichen Datenbankbackup: ${err.message}`, 'ERROR'));
  });
  
  // Tägliche historische Wetterdaten um 4:00 Uhr
  cron.schedule('0 4 * * *', () => {
    log('Starte tägliche Synchronisierung historischer Wetterdaten...');
    executeScheduledSync('weather_historical_batch');
  });
  
  // Tägliche historische Transaktionen um 5:00 Uhr
  cron.schedule('0 5 * * *', () => {
    log('Starte tägliche Synchronisierung historischer Transaktionen...');
    executeScheduledSync('historical_batch');
  });
}

/**
 * Plane wöchentliche Wartungsaufgaben
 */
function scheduleWeeklyMaintenance() {
  // Wöchentliche Integritätsprüfung am Sonntag um 1:00 Uhr
  cron.schedule('0 1 * * 0', () => {
    log('Starte wöchentliche Datenbankintegritätsprüfung...');
    integrityCheck.runFullIntegrityCheck()
      .then(result => {
        if (result.result === 'OK') {
          log('Wöchentliche Datenbankintegritätsprüfung erfolgreich: Keine Probleme gefunden');
        } else {
          log(`Wöchentliche Datenbankintegritätsprüfung: Probleme gefunden - ${JSON.stringify(result)}`, 'WARN');
        }
      })
      .catch(err => log(`Fehler bei der wöchentlichen Datenbankintegritätsprüfung: ${err.message}`, 'ERROR'));
  });
  
  // Wöchentliche Feiertags-Synchronisierung am Montag um 0:30 Uhr
  cron.schedule('30 0 * * 1', () => {
    log('Starte wöchentliche Feiertags-Synchronisierung...');
    executeScheduledSync('holidays');
  });
}

/**
 * Plane monatliche Wartungsaufgaben
 */
function scheduleMonthlyMaintenance() {
  // Monatliches vollständiges Reindexing am 1. des Monats um 2:00 Uhr
  cron.schedule('0 2 1 * *', () => {
    log('Starte monatliches Datenbank-Reindexing...');
    executeDbReindexing()
      .then(() => log('Monatliches Datenbank-Reindexing erfolgreich abgeschlossen'))
      .catch(err => log(`Fehler beim monatlichen Datenbank-Reindexing: ${err.message}`, 'ERROR'));
  });
}

/**
 * Führe eine geplante Synchronisierung aus
 */
function executeScheduledSync(type) {
  switch (type) {
    case 'transactions':
      syncTransactions({ forceUpdate: false })
        .then(() => log(`Geplante Synchronisierung abgeschlossen für ${type}: success`))
        .catch(err => log(`Fehler bei der geplanten ${type}-Synchronisierung: ${err.message}`, 'ERROR'));
      break;
    case 'refills':
      syncRefills({ forceUpdate: false })
        .then(() => log(`Geplante Synchronisierung abgeschlossen für ${type}: success`))
        .catch(err => log(`Fehler bei der geplanten ${type}-Synchronisierung: ${err.message}`, 'ERROR'));
      break;
    case 'machines':
      syncMachines({ forceUpdate: false })
        .then(() => log(`Geplante Synchronisierung abgeschlossen für ${type}: success`))
        .catch(err => log(`Fehler bei der geplanten ${type}-Synchronisierung: ${err.message}`, 'ERROR'));
      break;
    case 'products':
      syncProducts({ forceUpdate: false })
        .then(() => log(`Geplante Synchronisierung abgeschlossen für ${type}: success`))
        .catch(err => log(`Fehler bei der geplanten ${type}-Synchronisierung: ${err.message}`, 'ERROR'));
      break;
    case 'events':
      syncEvents({ forceUpdate: false })
        .then(() => log(`Geplante Synchronisierung abgeschlossen für ${type}: success`))
        .catch(err => log(`Fehler bei der geplanten ${type}-Synchronisierung: ${err.message}`, 'ERROR'));
      break;
    case 'weather_forecast':
      syncWeatherForecast()
        .then(() => log(`Geplante Synchronisierung abgeschlossen für ${type}: success`))
        .catch(err => log(`Fehler bei der geplanten ${type}-Synchronisierung: ${err.message}`, 'ERROR'));
      break;
    case 'holidays':
      syncHolidays()
        .then(() => log(`Geplante Synchronisierung abgeschlossen für ${type}: success`))
        .catch(err => log(`Fehler bei der geplanten ${type}-Synchronisierung: ${err.message}`, 'ERROR'));
      break;
    case 'weather_historical_batch':
      syncHistoricalWeather()
        .then(() => log(`Geplante Synchronisierung abgeschlossen für ${type}: success`))
        .catch(err => log(`Fehler bei der geplanten ${type}-Synchronisierung: ${err.message}`, 'ERROR'));
      break;
    case 'historical_batch':
      syncHistoricalData({ days: 7 })
        .then(() => log(`Geplante Synchronisierung abgeschlossen für ${type}: success`))
        .catch(err => log(`Fehler bei der geplanten ${type}-Synchronisierung: ${err.message}`, 'ERROR'));
      break;
    case 'warehouse_reconciliation':
      reconcileWarehouseInventory({ forceUpdate: false, onlyMachineProducts: true, createMissing: true })
        .then(() => log(`Geplante Synchronisierung abgeschlossen für ${type}: success`))
        .catch(err => log(`Fehler bei der geplanten ${type}-Synchronisierung: ${err.message}`, 'ERROR'));
      break;
    default:
      log(`Unbekannter Synchronisierungstyp: ${type}`, 'ERROR');
  }
}

/**
 * Führe ein Datenbank-Reindexing aus
 */
async function executeDbReindexing() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  try {
    const client = await pool.connect();
    
    // Liste der Tabellen abrufen
    const tablesRes = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public'
    `);
    
    // Für jede Tabelle REINDEX ausführen
    for (const row of tablesRes.rows) {
      const tableName = row.tablename;
      log(`Reindexing Tabelle: ${tableName}`);
      
      await client.query(`REINDEX TABLE "${tableName}"`);
    }
    
    // ANALYZE ausführen, um Statistiken zu aktualisieren
    log('Aktualisiere Datenbankstatistiken mit ANALYZE');
    await client.query('ANALYZE');
    
    client.release();
    log('Datenbank-Reindexing erfolgreich abgeschlossen');
  } catch (err) {
    log(`Fehler beim Datenbank-Reindexing: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

module.exports = {
  initializeScheduler,
  executeScheduledSync
};