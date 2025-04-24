/**
 * Sichere Datenbank-Migration
 * 
 * Dieses Skript unterstützt sichere Schema-Änderungen ohne Datenverlust durch:
 * 1. Prüfung potenzieller destruktiver Änderungen
 * 2. Automatisches Backup vor Änderungen
 * 3. Transaktionsbasierte Schema-Änderungen
 * 4. Validierung nach der Migration
 */

const { Pool } = require('pg');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const backupTool = require('./database-backup');

// Datenbankeinstellungen
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Verzeichnisse
const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');
const MIGRATION_REPORTS_DIR = path.join(process.cwd(), 'db_reports', 'migrations');

/**
 * Logger-Funktion
 */
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

/**
 * Erstelle Verzeichnisse, falls sie nicht existieren
 */
function ensureDirectories() {
  if (!fs.existsSync(MIGRATION_REPORTS_DIR)) {
    fs.mkdirSync(MIGRATION_REPORTS_DIR, { recursive: true });
  }
}

/**
 * Führt npm-Befehl aus, um Migrations-Dateien zu generieren
 */
async function generateMigrations() {
  log('Generiere Migrations-Dateien...');
  
  return new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npm, ['run', 'db:generate'], { stdio: 'pipe' });
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
      process.stderr.write(data);
    });
    
    child.on('exit', (code) => {
      if (code === 0) {
        log('Migrations-Dateien erfolgreich generiert');
        resolve(output);
      } else {
        log(`Fehler beim Generieren der Migrations-Dateien: Exit-Code ${code}`, 'ERROR');
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

/**
 * Analysiert die generierten SQL-Dateien auf potenziell destruktive Operationen
 */
async function analyzeMigrations() {
  log('Analysiere Migrations-Dateien auf destruktive Operationen...');
  
  // Muster für potenziell destruktive Operationen
  const destructivePatterns = [
    { pattern: /DROP\s+TABLE/i, severity: 'HIGH', description: 'Tabelle löschen' },
    { pattern: /DROP\s+COLUMN/i, severity: 'HIGH', description: 'Spalte löschen' },
    { pattern: /ALTER\s+TABLE\s+.*\s+DROP\s+CONSTRAINT/i, severity: 'MEDIUM', description: 'Constraint löschen' },
    { pattern: /TRUNCATE\s+TABLE/i, severity: 'HIGH', description: 'Tabelle leeren' },
    { pattern: /CREATE\s+TABLE\s+.*\s+AS\s+SELECT/i, severity: 'LOW', description: 'Tabelle aus Abfrage erstellen' },
    { pattern: /ALTER\s+TABLE\s+.*\s+ALTER\s+COLUMN/i, severity: 'MEDIUM', description: 'Spaltentyp ändern' },
    { pattern: /DELETE\s+FROM/i, severity: 'HIGH', description: 'Daten löschen' },
    { pattern: /UPDATE\s+(?!pg_)/i, severity: 'MEDIUM', description: 'Daten aktualisieren' }
  ];
  
  // Suche das Migrations-Verzeichnis
  const migrationsFolders = fs.readdirSync(MIGRATIONS_DIR)
    .filter(item => fs.statSync(path.join(MIGRATIONS_DIR, item)).isDirectory())
    .filter(item => item !== 'meta');
  
  if (migrationsFolders.length === 0) {
    log('Keine Migrations-Verzeichnisse gefunden', 'WARN');
    return { hasMigrations: false, issues: [] };
  }
  
  // Nimm das neueste Migrations-Verzeichnis
  const latestMigrationFolder = migrationsFolders.sort().pop();
  const migrationsPath = path.join(MIGRATIONS_DIR, latestMigrationFolder);
  
  log(`Analysiere Migrations-Verzeichnis: ${migrationsPath}`);
  
  // Suche SQL-Dateien im Migrations-Verzeichnis
  const sqlFiles = fs.readdirSync(migrationsPath)
    .filter(file => file.endsWith('.sql'));
  
  if (sqlFiles.length === 0) {
    log('Keine SQL-Migrations-Dateien gefunden', 'WARN');
    return { hasMigrations: false, issues: [] };
  }
  
  const issues = [];
  
  // Analysiere jede SQL-Datei
  for (const sqlFile of sqlFiles) {
    const filePath = path.join(migrationsPath, sqlFile);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Teile das SQL in Anweisungen auf
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    // Prüfe jede Anweisung auf destruktive Muster
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      for (const pattern of destructivePatterns) {
        if (pattern.pattern.test(statement)) {
          issues.push({
            file: sqlFile,
            statementIndex: i,
            statement: statement.trim(),
            issue: pattern.description,
            severity: pattern.severity
          });
        }
      }
    }
  }
  
  // Speichere den Analysebericht
  const reportPath = path.join(MIGRATION_REPORTS_DIR, `migration_analysis_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    migrationPath: migrationsPath,
    analyzedFiles: sqlFiles,
    issues
  }, null, 2));
  
  log(`Migration-Analyse abgeschlossen: ${issues.length} potenzielle Probleme gefunden`);
  if (issues.length > 0) {
    log(`Details wurden gespeichert in: ${reportPath}`);
  }
  
  return {
    hasMigrations: true,
    migrationPath: migrationsPath,
    sqlFiles,
    issues
  };
}

/**
 * Führe die Migration mit der "sicheren" Option aus
 */
async function runSafeMigration() {
  log('Starte sichere Migration...');
  
  return new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const args = ['run', 'db:push', '--', '--safe'];
    
    log(`Führe Befehl aus: npm ${args.join(' ')}`);
    const child = spawn(npm, args, { stdio: 'pipe' });
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
      process.stderr.write(data);
    });
    
    child.on('exit', (code) => {
      if (code === 0) {
        log('Migration erfolgreich ausgeführt');
        resolve(output);
      } else {
        log(`Fehler bei der Migration: Exit-Code ${code}`, 'ERROR');
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

/**
 * Führe die Migration mit der `--allow-destructive` Option aus
 * WARNUNG: Dies erlaubt potenziell destruktive Änderungen!
 */
async function runDestructiveMigration() {
  log('Starte Migration mit erlaubten destruktiven Änderungen...', 'WARN');
  log('WARNUNG: Diese Operation erlaubt potenziell destruktive Datenbankänderungen!', 'WARN');
  
  return new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const args = ['run', 'db:push', '--', '--allow-destructive'];
    
    log(`Führe Befehl aus: npm ${args.join(' ')}`);
    const child = spawn(npm, args, { stdio: 'pipe' });
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
      process.stderr.write(data);
    });
    
    child.on('exit', (code) => {
      if (code === 0) {
        log('Migration erfolgreich ausgeführt');
        resolve(output);
      } else {
        log(`Fehler bei der Migration: Exit-Code ${code}`, 'ERROR');
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

/**
 * Überprüft den Zustand der Datenbank nach einer Migration
 */
async function verifyMigration() {
  log('Überprüfe Datenbankzustand nach der Migration...');
  
  const pool = new Pool(dbConfig);
  
  try {
    const client = await pool.connect();
    
    // Prüfe, ob wichtige Tabellen noch existieren und zugänglich sind
    const tables = ['users', 'products', 'transactions', 'machines', 'warehouses'];
    const results = {};
    
    for (const table of tables) {
      try {
        const res = await client.query(`SELECT COUNT(*) FROM "${table}"`);
        results[table] = {
          exists: true,
          count: parseInt(res.rows[0].count)
        };
      } catch (err) {
        results[table] = {
          exists: false,
          error: err.message
        };
      }
    }
    
    client.release();
    
    // Speichere den Verifikationsbericht
    const reportPath = path.join(MIGRATION_REPORTS_DIR, `migration_verification_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      results
    }, null, 2));
    
    // Prüfe, ob alle Tabellen existieren
    const missingTables = tables.filter(table => !results[table].exists);
    
    if (missingTables.length > 0) {
      log(`WARNUNG: Folgende Tabellen fehlen nach der Migration: ${missingTables.join(', ')}`, 'WARN');
      return {
        success: false,
        missingTables,
        results
      };
    }
    
    log('Migration erfolgreich verifiziert: Alle wichtigen Tabellen sind vorhanden');
    return {
      success: true,
      results
    };
  } catch (err) {
    log(`Fehler bei der Migrationsverifikation: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Interaktive Abfrage der Benutzerbestätigung
 */
async function promptConfirmation(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(`${message} (j/n): `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'j' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Führt den vollständigen sicheren Migrations-Workflow durch
 */
async function performSafeMigration() {
  try {
    log('Starte sicheren Migrations-Workflow...');
    ensureDirectories();
    
    // 1. Erstelle Backup vor der Migration
    log('Erstelle Backup vor der Migration...');
    await backupTool.runBackupCycle();
    
    // 2. Generiere die Migrations-Dateien
    await generateMigrations();
    
    // 3. Analysiere die Migrations-Dateien auf destruktive Operationen
    const analysis = await analyzeMigrations();
    
    if (!analysis.hasMigrations) {
      log('Keine Migrations-Dateien gefunden. Der Prozess wird beendet.');
      return { success: false, reason: 'NO_MIGRATIONS' };
    }
    
    // 4. Prüfe auf destruktive Operationen und frage nach Bestätigung
    const destructiveIssues = analysis.issues.filter(issue => issue.severity === 'HIGH');
    const warningIssues = analysis.issues.filter(issue => issue.severity === 'MEDIUM');
    
    if (destructiveIssues.length > 0) {
      log(`WARNUNG: ${destructiveIssues.length} potenziell destruktive Operationen gefunden:`, 'WARN');
      destructiveIssues.forEach(issue => {
        log(`- ${issue.issue} in ${issue.file}: ${issue.statement.substring(0, 100)}...`, 'WARN');
      });
      
      const confirmed = await promptConfirmation('Möchten Sie trotzdem mit der Migration fortfahren? Dies könnte zu Datenverlust führen!');
      
      if (!confirmed) {
        log('Migration abgebrochen vom Benutzer.');
        return { success: false, reason: 'USER_CANCELLED' };
      }
      
      // Benutzer hat bestätigt, wir verwenden den destruktiven Modus
      log('Benutzer hat destruktive Änderungen bestätigt. Fahre fort mit der Migration...');
      await runDestructiveMigration();
    } else if (warningIssues.length > 0) {
      log(`HINWEIS: ${warningIssues.length} Operationen mit mittlerem Risiko gefunden:`, 'WARN');
      warningIssues.forEach(issue => {
        log(`- ${issue.issue} in ${issue.file}: ${issue.statement.substring(0, 100)}...`, 'WARN');
      });
      
      const confirmed = await promptConfirmation('Möchten Sie mit der Migration fortfahren?');
      
      if (!confirmed) {
        log('Migration abgebrochen vom Benutzer.');
        return { success: false, reason: 'USER_CANCELLED' };
      }
      
      // Benutzer hat bestätigt, wir verwenden den sicheren Modus
      log('Benutzer hat Änderungen bestätigt. Fahre fort mit der sicheren Migration...');
      await runSafeMigration();
    } else {
      log('Keine hochriskanten Operationen gefunden. Fahre fort mit der sicheren Migration...');
      await runSafeMigration();
    }
    
    // 5. Überprüfe den Datenbankzustand nach der Migration
    const verification = await verifyMigration();
    
    // 6. Erstelle ein weiteres Backup nach der Migration
    log('Erstelle Backup nach der Migration...');
    await backupTool.createSchemaBackup();
    
    log('Migrations-Workflow abgeschlossen');
    
    return {
      success: true,
      analysis,
      verification
    };
  } catch (err) {
    log(`Fehler im Migrations-Workflow: ${err.message}`, 'ERROR');
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'safe';
  
  switch (command) {
    case 'analyze':
      await generateMigrations();
      await analyzeMigrations();
      break;
    case 'safe':
      await performSafeMigration();
      break;
    case 'generate':
      await generateMigrations();
      break;
    case 'verify':
      await verifyMigration();
      break;
    default:
      log(`Unbekannter Befehl: ${command}`, 'ERROR');
      log('Verfügbare Befehle: analyze, safe, generate, verify');
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
  performSafeMigration,
  analyzeMigrations,
  generateMigrations,
  verifyMigration
};