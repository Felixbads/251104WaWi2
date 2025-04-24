/**
 * Datenbank-Integritätsprüfung und -Korrektur
 * 
 * Dieses Skript analysiert die Datenbank auf fehlende Fremdschlüssel,
 * Konsistenzprobleme und fehlende Indizes. Es bietet Funktionen zum
 * Hinzufügen fehlender Constraints und zur Überprüfung der Datenintegrität.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Datenbankkonfiguration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

/**
 * Protokolliert eine Nachricht mit Zeitstempel
 */
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

/**
 * Ermittelt alle im Code definierten Fremdschlüsselbeziehungen aus schema.ts
 */
async function getDefinedForeignKeys() {
  const schemaPath = path.join(process.cwd(), 'shared', 'schema.ts');
  
  if (!fs.existsSync(schemaPath)) {
    log(`Schema-Datei nicht gefunden: ${schemaPath}`, 'ERROR');
    return [];
  }
  
  const content = fs.readFileSync(schemaPath, 'utf8');
  const foreignKeys = [];
  
  // Regulärer Ausdruck für Fremdschlüsseldefinitionen in schema.ts
  // Sucht nach Mustern wie: someField: integer("field_name").references(() => table.id)
  const regex = /(\w+):\s*(?:integer|text|varchar)\(\s*["'](\w+)["']\s*(?:,\s*{[^}]*})?\s*\)\.references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)\s*\)/g;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    foreignKeys.push({
      fieldName: match[1],        // z.B. locationId
      columnName: match[2],       // z.B. location_id
      referencedTable: match[3],  // z.B. locations
      referencedColumn: match[4]  // z.B. id
    });
  }
  
  log(`${foreignKeys.length} Fremdschlüsselbeziehungen in schema.ts gefunden`);
  return foreignKeys;
}

/**
 * Ermittelt die tatsächlich in der Datenbank existierenden Fremdschlüssel
 */
async function getExistingForeignKeys() {
  const pool = new Pool(dbConfig);
  
  try {
    const client = await pool.connect();
    
    const query = `
      SELECT
          tc.table_schema, 
          tc.constraint_name, 
          tc.table_name, 
          kcu.column_name, 
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `;
    
    const res = await client.query(query);
    client.release();
    
    log(`${res.rows.length} existierende Fremdschlüssel in der Datenbank gefunden`);
    return res.rows;
  } catch (err) {
    log(`Fehler beim Ermitteln existierender Fremdschlüssel: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Vergleicht die definierten mit den existierenden Fremdschlüsseln
 * und gibt die fehlenden zurück
 */
async function findMissingForeignKeys() {
  const definedFKs = await getDefinedForeignKeys();
  const existingFKs = await getExistingForeignKeys();
  
  // Extrahiere relevante Informationen aus existierenden Fremdschlüsseln
  const existingFKMap = existingFKs.map(fk => ({
    table: fk.table_name,
    column: fk.column_name,
    referencedTable: fk.foreign_table_name,
    referencedColumn: fk.foreign_column_name
  }));
  
  // Hole Tabellennamen aus schema.ts
  const tableNameMap = await getTableNameMapping();
  
  // Finde Fremdschlüssel, die in schema.ts definiert, aber nicht in der Datenbank vorhanden sind
  const missingFKs = [];
  
  for (const definedFK of definedFKs) {
    // Hole den aktuellen Tabellennamen aus dem Kontext
    const currentTable = tableNameMap[definedFK.referencedTable] || '';
    
    // Überspringe, wenn wir keine Tabellenzuordnung finden konnten
    if (!currentTable) {
      log(`Keine Tabellenzuordnung gefunden für: ${definedFK.referencedTable}`, 'WARN');
      continue;
    }
    
    // Prüfe, ob dieser FK in der Datenbank existiert
    const exists = existingFKMap.some(efk => 
      efk.table === currentTable && 
      efk.column === definedFK.columnName &&
      efk.referencedTable === definedFK.referencedTable &&
      efk.referencedColumn === definedFK.referencedColumn
    );
    
    if (!exists) {
      missingFKs.push({
        table: currentTable,
        column: definedFK.columnName,
        referencedTable: definedFK.referencedTable,
        referencedColumn: definedFK.referencedColumn
      });
    }
  }
  
  log(`${missingFKs.length} fehlende Fremdschlüssel identifiziert`);
  return missingFKs;
}

/**
 * Ermittelt die Zuordnung von Drizzle-Tabellennamen zu PostgreSQL-Tabellennamen
 */
async function getTableNameMapping() {
  const schemaPath = path.join(process.cwd(), 'shared', 'schema.ts');
  const content = fs.readFileSync(schemaPath, 'utf8');
  
  const tableMap = {};
  
  // Suche nach Definitionen wie: export const tableName = pgTable("table_name", {...
  const regex = /export\s+const\s+(\w+)\s*=\s*pgTable\(\s*["'](\w+)["']/g;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const drizzleName = match[1];     // z.B. users
    const postgresName = match[2];    // z.B. users
    
    tableMap[drizzleName] = postgresName;
  }
  
  return tableMap;
}

/**
 * Generiert SQL-Skript, um fehlende Fremdschlüssel hinzuzufügen
 */
async function generateAddForeignKeysScript(missingFKs) {
  let sql = '-- SQL-Skript zum Hinzufügen fehlender Fremdschlüssel\n';
  sql += `-- Generiert am ${new Date().toISOString()}\n\n`;
  
  for (const fk of missingFKs) {
    // Generiere einen eindeutigen Constraint-Namen
    const constraintName = `fk_${fk.table}_${fk.column}_${fk.referencedTable}`;
    
    sql += `-- Füge Fremdschlüssel von ${fk.table}.${fk.column} zu ${fk.referencedTable}.${fk.referencedColumn} hinzu\n`;
    sql += `ALTER TABLE "${fk.table}" ADD CONSTRAINT "${constraintName}"\n`;
    sql += `  FOREIGN KEY ("${fk.column}") REFERENCES "${fk.referencedTable}" ("${fk.referencedColumn}");\n\n`;
  }
  
  // Speichere das SQL-Skript in eine Datei
  const scriptPath = path.join(process.cwd(), 'db_scripts', 'add_foreign_keys.sql');
  
  // Stelle sicher, dass das Verzeichnis existiert
  const scriptDir = path.dirname(scriptPath);
  if (!fs.existsSync(scriptDir)) {
    fs.mkdirSync(scriptDir, { recursive: true });
  }
  
  fs.writeFileSync(scriptPath, sql);
  log(`SQL-Skript zum Hinzufügen fehlender Fremdschlüssel generiert: ${scriptPath}`);
  
  return scriptPath;
}

/**
 * Führe das SQL-Skript aus, um fehlende Fremdschlüssel hinzuzufügen
 */
async function addMissingForeignKeys(scriptPath) {
  const pool = new Pool(dbConfig);
  
  try {
    // Lese das SQL-Skript
    const sql = fs.readFileSync(scriptPath, 'utf8');
    
    // Trenne die Anweisungen
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    const client = await pool.connect();
    
    // Führe jede Anweisung separat aus
    for (const statement of statements) {
      try {
        await client.query(statement);
        log(`SQL-Anweisung erfolgreich ausgeführt: ${statement.substring(0, 100)}...`);
      } catch (err) {
        log(`Fehler bei der Ausführung der SQL-Anweisung: ${statement.substring(0, 100)}...`, 'ERROR');
        log(`Fehlermeldung: ${err.message}`, 'ERROR');
      }
    }
    
    client.release();
    log('Hinzufügen fehlender Fremdschlüssel abgeschlossen');
  } catch (err) {
    log(`Fehler beim Hinzufügen fehlender Fremdschlüssel: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Überprüft die Datenintegrität durch Prüfen auf Fremdschlüsselverletzungen
 */
async function checkDataIntegrity() {
  const pool = new Pool(dbConfig);
  
  try {
    const client = await pool.connect();
    
    // Hole alle Fremdschlüsselbeziehungen
    const fkQuery = `
      SELECT
          tc.table_schema, 
          tc.constraint_name, 
          tc.table_name, 
          kcu.column_name, 
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `;
    
    const fkResult = await client.query(fkQuery);
    const violations = [];
    
    // Überprüfe jede Fremdschlüsselbeziehung
    for (const fk of fkResult.rows) {
      // Konstruiere Query, um Fremdschlüsselverletzungen zu finden
      const violationQuery = `
        SELECT a.*, b.* FROM "${fk.table_name}" a
        LEFT JOIN "${fk.foreign_table_name}" b 
          ON a."${fk.column_name}" = b."${fk.foreign_column_name}"
        WHERE a."${fk.column_name}" IS NOT NULL 
          AND b."${fk.foreign_column_name}" IS NULL
        LIMIT 10
      `;
      
      try {
        const violationResult = await client.query(violationQuery);
        
        if (violationResult.rows.length > 0) {
          violations.push({
            table: fk.table_name,
            column: fk.column_name,
            referencedTable: fk.foreign_table_name,
            referencedColumn: fk.foreign_column_name,
            violationCount: violationResult.rows.length,
            examples: violationResult.rows.slice(0, 3) // Begrenzen wir auf 3 Beispiele
          });
        }
      } catch (err) {
        log(`Fehler bei der Überprüfung der Fremdschlüsselbeziehung ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}: ${err.message}`, 'ERROR');
      }
    }
    
    client.release();
    
    if (violations.length > 0) {
      log(`${violations.length} Fremdschlüsselverletzungen gefunden`, 'WARN');
      
      // Speichere den Bericht in einer Datei
      const reportPath = path.join(process.cwd(), 'db_reports', 'integrity_violations.json');
      const reportDir = path.dirname(reportPath);
      
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(violations, null, 2));
      log(`Bericht über Integritätsverletzungen gespeichert: ${reportPath}`);
    } else {
      log('Keine Fremdschlüsselverletzungen gefunden. Datenintegrität ist OK.');
    }
    
    return violations;
  } catch (err) {
    log(`Fehler bei der Integritätsprüfung: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Ermittelt fehlende Indizes für eine bessere Abfrageleistung
 */
async function findMissingIndices() {
  const pool = new Pool(dbConfig);
  
  try {
    const client = await pool.connect();
    
    // Abfrage, um Tabellen mit vielen Datensätzen zu identifizieren
    const tablesQuery = `
      SELECT 
        relname as table_name, 
        n_live_tup as row_count
      FROM 
        pg_stat_user_tables
      WHERE 
        n_live_tup > 1000
      ORDER BY 
        n_live_tup DESC
    `;
    
    const tablesResult = await client.query(tablesQuery);
    
    // Hole existierende Indizes
    const indicesQuery = `
      SELECT
        t.relname as table_name,
        i.relname as index_name,
        a.attname as column_name
      FROM
        pg_class t,
        pg_class i,
        pg_index ix,
        pg_attribute a
      WHERE
        t.oid = ix.indrelid
        AND i.oid = ix.indexrelid
        AND a.attrelid = t.oid
        AND a.attnum = ANY(ix.indkey)
        AND t.relkind = 'r'
        AND t.relname in (${tablesResult.rows.map(r => `'${r.table_name}'`).join(',')})
      ORDER BY
        t.relname,
        i.relname
    `;
    
    const indicesResult = await client.query(indicesQuery);
    
    // Analysiere Fremdschlüsselspalten, die eventuell Indizes benötigen
    const fkQuery = `
      SELECT
        tc.table_name, 
        kcu.column_name
      FROM 
        information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
      WHERE 
        tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name in (${tablesResult.rows.map(r => `'${r.table_name}'`).join(',')})
    `;
    
    const fkResult = await client.query(fkQuery);
    
    // Finde FK-Spalten ohne Index
    const existingIndexCols = new Set();
    indicesResult.rows.forEach(idx => {
      existingIndexCols.add(`${idx.table_name}.${idx.column_name}`);
    });
    
    const missingIndices = [];
    fkResult.rows.forEach(fk => {
      const key = `${fk.table_name}.${fk.column_name}`;
      if (!existingIndexCols.has(key)) {
        missingIndices.push({
          table: fk.table_name,
          column: fk.column_name,
          reason: 'FK_NO_INDEX'
        });
      }
    });
    
    client.release();
    
    log(`${missingIndices.length} fehlende Indizes identifiziert`);
    
    // Speichere den Bericht
    if (missingIndices.length > 0) {
      const reportPath = path.join(process.cwd(), 'db_reports', 'missing_indices.json');
      const reportDir = path.dirname(reportPath);
      
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(missingIndices, null, 2));
      log(`Bericht über fehlende Indizes gespeichert: ${reportPath}`);
    }
    
    return missingIndices;
  } catch (err) {
    log(`Fehler beim Ermitteln fehlender Indizes: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Generiert SQL-Skript zum Hinzufügen fehlender Indizes
 */
async function generateAddIndicesScript(missingIndices) {
  let sql = '-- SQL-Skript zum Hinzufügen fehlender Indizes\n';
  sql += `-- Generiert am ${new Date().toISOString()}\n\n`;
  
  for (const idx of missingIndices) {
    // Generiere einen eindeutigen Index-Namen
    const indexName = `idx_${idx.table}_${idx.column}`;
    
    sql += `-- Füge Index für ${idx.table}.${idx.column} hinzu\n`;
    sql += `CREATE INDEX "${indexName}" ON "${idx.table}" ("${idx.column}");\n\n`;
  }
  
  // Speichere das SQL-Skript in eine Datei
  const scriptPath = path.join(process.cwd(), 'db_scripts', 'add_indices.sql');
  
  // Stelle sicher, dass das Verzeichnis existiert
  const scriptDir = path.dirname(scriptPath);
  if (!fs.existsSync(scriptDir)) {
    fs.mkdirSync(scriptDir, { recursive: true });
  }
  
  fs.writeFileSync(scriptPath, sql);
  log(`SQL-Skript zum Hinzufügen fehlender Indizes generiert: ${scriptPath}`);
  
  return scriptPath;
}

/**
 * Überprüft, ob Spalten in der Datenbank fehlen, die im Schema definiert sind
 */
async function findMissingColumns() {
  const pool = new Pool(dbConfig);
  
  try {
    // Schema-Definitionen laden
    const tables = await getTableColumns();
    
    const client = await pool.connect();
    const missingColumns = [];
    
    // Für jede Tabelle
    for (const [tableName, columns] of Object.entries(tables)) {
      // Abfrage für existierende Spalten
      const query = `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
      `;
      
      const result = await client.query(query, [tableName]);
      
      // Existierende Spalten als Set
      const existingColumns = new Set(result.rows.map(row => row.column_name));
      
      // Prüfe auf fehlende Spalten
      for (const column of columns) {
        if (!existingColumns.has(column)) {
          missingColumns.push({
            table: tableName,
            column: column
          });
        }
      }
    }
    
    client.release();
    
    if (missingColumns.length > 0) {
      log(`${missingColumns.length} fehlende Spalten gefunden`);
      
      // Speichere den Bericht
      const reportPath = path.join(process.cwd(), 'db_reports', 'missing_columns.json');
      const reportDir = path.dirname(reportPath);
      
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(missingColumns, null, 2));
      log(`Bericht über fehlende Spalten gespeichert: ${reportPath}`);
    } else {
      log('Keine fehlenden Spalten gefunden');
    }
    
    return missingColumns;
  } catch (err) {
    log(`Fehler beim Ermitteln fehlender Spalten: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Extrahiert Tabellen und Spalten aus dem Schema
 */
async function getTableColumns() {
  const schemaPath = path.join(process.cwd(), 'shared', 'schema.ts');
  const content = fs.readFileSync(schemaPath, 'utf8');
  
  const tables = {};
  
  // Finde Tabellendefinitionen
  const tableRegex = /export\s+const\s+(\w+)\s*=\s*pgTable\(\s*["'](\w+)["']/g;
  
  let tableMatch;
  while ((tableMatch = tableRegex.exec(content)) !== null) {
    const drizzleName = tableMatch[1];    // z.B. users
    const pgTableName = tableMatch[2];    // z.B. users
    
    // Finde die Position der öffnenden Klammer nach dem pgTable-Aufruf
    const startIndex = tableMatch.index + tableMatch[0].length;
    let bracketCount = 1;
    let endIndex = startIndex;
    
    // Finde die schließende Klammer (beachte verschachtelte Klammern)
    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') bracketCount++;
      if (content[i] === '}') bracketCount--;
      
      if (bracketCount === 0) {
        endIndex = i;
        break;
      }
    }
    
    // Extrahiere den Inhalt zwischen den Klammern
    const tableContent = content.substring(startIndex, endIndex);
    
    // Finde die Spaltendefinitionen
    const columnRegex = /(\w+):\s*(?:\w+)\(\s*["'](\w+)["']/g;
    const columns = [];
    
    let columnMatch;
    while ((columnMatch = columnRegex.exec(tableContent)) !== null) {
      const columnName = columnMatch[2];    // z.B. username
      columns.push(columnName);
    }
    
    tables[pgTableName] = columns;
  }
  
  return tables;
}

/**
 * Führt einen vollständigen Integritätscheck durch
 */
async function runFullIntegrityCheck() {
  log('Starte vollständigen Datenbankintegritätscheck...');
  
  try {
    // 1. Finde fehlende Fremdschlüssel
    const missingFKs = await findMissingForeignKeys();
    if (missingFKs.length > 0) {
      const scriptPath = await generateAddForeignKeysScript(missingFKs);
      log(`Skript zum Hinzufügen fehlender Fremdschlüssel generiert: ${scriptPath}`);
    }
    
    // 2. Prüfe auf Integritätsverletzungen
    const violations = await checkDataIntegrity();
    
    // 3. Finde fehlende Indizes
    const missingIndices = await findMissingIndices();
    if (missingIndices.length > 0) {
      const scriptPath = await generateAddIndicesScript(missingIndices);
      log(`Skript zum Hinzufügen fehlender Indizes generiert: ${scriptPath}`);
    }
    
    // 4. Prüfe auf fehlende Spalten
    const missingColumns = await findMissingColumns();
    
    // Erstelle einen Gesamtbericht
    const report = {
      timestamp: new Date().toISOString(),
      missingForeignKeys: missingFKs.length,
      integrityViolations: violations.length,
      missingIndices: missingIndices.length,
      missingColumns: missingColumns.length,
      result: missingFKs.length === 0 && violations.length === 0 && missingColumns.length === 0 ? 'OK' : 'ISSUES_FOUND'
    };
    
    // Speichere den Bericht
    const reportPath = path.join(process.cwd(), 'db_reports', `integrity_check_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const reportDir = path.dirname(reportPath);
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`Gesamtbericht gespeichert: ${reportPath}`);
    
    log('Datenbankintegritätscheck abgeschlossen');
    
    return report;
  } catch (err) {
    log(`Fehler beim Ausführen des Integritätschecks: ${err.message}`, 'ERROR');
    throw err;
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';
  
  switch (command) {
    case 'check':
      await runFullIntegrityCheck();
      break;
    case 'fix-fk':
      const missingFKs = await findMissingForeignKeys();
      if (missingFKs.length > 0) {
        const scriptPath = await generateAddForeignKeysScript(missingFKs);
        console.log(`Möchten Sie fehlende Fremdschlüssel hinzufügen? (j/n)`);
        process.stdin.once('data', async (data) => {
          const input = data.toString().trim().toLowerCase();
          if (input === 'j' || input === 'y') {
            await addMissingForeignKeys(scriptPath);
          } else {
            console.log('Vorgang abgebrochen');
          }
          process.exit(0);
        });
      } else {
        log('Keine fehlenden Fremdschlüssel gefunden');
        process.exit(0);
      }
      break;
    case 'fix-idx':
      const missingIndices = await findMissingIndices();
      if (missingIndices.length > 0) {
        const scriptPath = await generateAddIndicesScript(missingIndices);
        console.log(`SQL-Skript zum Hinzufügen fehlender Indizes generiert: ${scriptPath}`);
      } else {
        log('Keine fehlenden Indizes gefunden');
      }
      break;
    default:
      log(`Unbekannter Befehl: ${command}`, 'ERROR');
      log('Verfügbare Befehle: check, fix-fk, fix-idx');
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
  findMissingForeignKeys,
  generateAddForeignKeysScript,
  addMissingForeignKeys,
  checkDataIntegrity,
  findMissingIndices,
  findMissingColumns,
  runFullIntegrityCheck
};