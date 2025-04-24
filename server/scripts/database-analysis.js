/**
 * Datenbank-Strukturanalyse
 * 
 * Dieses Skript analysiert die aktuelle Datenbankstruktur und erstellt einen detaillierten Bericht.
 * Es identifiziert Tabellen, Spalten, Beziehungen, Indizes und potenzielle Probleme.
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Datenbankkonfiguration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Standardverzeichnis für Berichte
const REPORTS_DIR = path.join(process.cwd(), 'db_reports');

/**
 * Protokolliert eine Nachricht in der Konsole
 */
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

/**
 * Erstellt das Berichtsverzeichnis, falls es noch nicht existiert
 */
function ensureReportDirectory() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    log(`Berichtsverzeichnis erstellt: ${REPORTS_DIR}`);
  }
}

/**
 * Holt eine Liste aller Tabellen in der Datenbank
 */
async function getTables() {
  const pool = new Pool(dbConfig);
  
  try {
    const client = await pool.connect();
    
    const query = `
      SELECT 
        table_name,
        (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = t.table_name) as row_estimate
      FROM 
        information_schema.tables t
      WHERE 
        table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY 
        table_name
    `;
    
    const result = await client.query(query);
    client.release();
    
    return result.rows;
  } catch (err) {
    log(`Fehler beim Abrufen der Tabellen: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Holt detaillierte Informationen über alle Spalten einer Tabelle
 */
async function getTableColumns(tableName) {
  const pool = new Pool(dbConfig);
  
  try {
    const client = await pool.connect();
    
    const query = `
      SELECT 
        column_name, 
        data_type, 
        character_maximum_length,
        is_nullable,
        column_default,
        (
          SELECT 
            pg_catalog.col_description(c.oid, cols.ordinal_position::int)
          FROM 
            pg_catalog.pg_class c
          WHERE 
            c.oid = (SELECT oid FROM pg_catalog.pg_class WHERE relname = $1)
            AND c.relkind = 'r'
        ) as column_comment
      FROM 
        information_schema.columns cols
      WHERE 
        table_name = $1
      ORDER BY 
        ordinal_position
    `;
    
    const result = await client.query(query, [tableName]);
    client.release();
    
    return result.rows;
  } catch (err) {
    log(`Fehler beim Abrufen der Spalten für Tabelle ${tableName}: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Holt alle Primär- und Fremdschlüssel für eine Tabelle
 */
async function getTableKeys(tableName) {
  const pool = new Pool(dbConfig);
  
  try {
    const client = await pool.connect();
    
    // Primärschlüssel
    const pkQuery = `
      SELECT
        kcu.column_name
      FROM
        information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
      WHERE
        tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = $1
      ORDER BY
        kcu.ordinal_position
    `;
    
    const pkResult = await client.query(pkQuery, [tableName]);
    
    // Fremdschlüssel
    const fkQuery = `
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM
        information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE
        tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = $1
      ORDER BY
        kcu.ordinal_position
    `;
    
    const fkResult = await client.query(fkQuery, [tableName]);
    
    client.release();
    
    return {
      primaryKeys: pkResult.rows.map(row => row.column_name),
      foreignKeys: fkResult.rows
    };
  } catch (err) {
    log(`Fehler beim Abrufen der Schlüssel für Tabelle ${tableName}: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Holt alle Indizes für eine Tabelle
 */
async function getTableIndices(tableName) {
  const pool = new Pool(dbConfig);
  
  try {
    const client = await pool.connect();
    
    const query = `
      SELECT
        i.relname as index_name,
        array_agg(a.attname) as column_names,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary
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
        AND t.relname = $1
      GROUP BY
        i.relname,
        ix.indisunique,
        ix.indisprimary
      ORDER BY
        i.relname
    `;
    
    const result = await client.query(query, [tableName]);
    client.release();
    
    return result.rows;
  } catch (err) {
    log(`Fehler beim Abrufen der Indizes für Tabelle ${tableName}: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Sammelt Statistiken über eine Tabelle
 */
async function getTableStats(tableName) {
  const pool = new Pool(dbConfig);
  
  try {
    const client = await pool.connect();
    
    const query = `
      SELECT
        pg_size_pretty(pg_total_relation_size($1)) as total_size,
        pg_size_pretty(pg_relation_size($1)) as table_size,
        pg_size_pretty(pg_total_relation_size($1) - pg_relation_size($1)) as index_size,
        n_live_tup as row_count,
        n_dead_tup as dead_tuples,
        (SELECT COUNT(*) FROM pg_indexes WHERE tablename = $1) as index_count
      FROM
        pg_stat_user_tables
      WHERE
        relname = $1
    `;
    
    const result = await client.query(query, [tableName]);
    client.release();
    
    return result.rows[0] || {};
  } catch (err) {
    log(`Fehler beim Abrufen der Statistiken für Tabelle ${tableName}: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Analysiert eine einzelne Tabelle und gibt alle Details zurück
 */
async function analyzeTable(tableName) {
  log(`Analysiere Tabelle: ${tableName}`);
  
  try {
    const columns = await getTableColumns(tableName);
    const keys = await getTableKeys(tableName);
    const indices = await getTableIndices(tableName);
    const stats = await getTableStats(tableName);
    
    return {
      name: tableName,
      columns,
      primaryKeys: keys.primaryKeys,
      foreignKeys: keys.foreignKeys,
      indices,
      stats
    };
  } catch (err) {
    log(`Fehler bei der Analyse der Tabelle ${tableName}: ${err.message}`, 'ERROR');
    return {
      name: tableName,
      error: err.message
    };
  }
}

/**
 * Findet implizite Beziehungen zwischen Tabellen
 * (Spalten mit ähnlichen Namen, die potenziell Fremdschlüssel sein könnten)
 */
function findImplicitRelationships(tables) {
  const relationships = [];
  
  for (const sourceTable of tables) {
    // Suche nach Spalten mit dem Suffix "_id"
    const idColumns = sourceTable.columns.filter(col => 
      col.column_name.endsWith('_id') && 
      !sourceTable.foreignKeys.some(fk => fk.column_name === col.column_name)
    );
    
    for (const column of idColumns) {
      // Extrahiere den Tabellennamen aus der Spalte (z.B. "user_id" -> "users")
      const potentialTableName = column.column_name.replace('_id', 's');
      
      // Finde passende Tabellen
      const targetTable = tables.find(t => 
        t.name === potentialTableName || 
        t.name === column.column_name.replace('_id', '') || 
        t.name === column.column_name.replace('_id', 'es')
      );
      
      if (targetTable) {
        relationships.push({
          sourceTable: sourceTable.name,
          sourceColumn: column.column_name,
          targetTable: targetTable.name,
          targetColumn: targetTable.primaryKeys[0] || 'id',
          isForeignKey: false,
          isImplicit: true
        });
      }
    }
  }
  
  return relationships;
}

/**
 * Führt eine vollständige Datenbankanalyse durch
 */
async function analyzeDatabaseStructure() {
  log('Starte Analyse der Datenbankstruktur...');
  ensureReportDirectory();
  
  try {
    // Hole alle Tabellen
    const tablesList = await getTables();
    log(`${tablesList.length} Tabellen gefunden`);
    
    // Analysiere jede Tabelle
    const tables = [];
    for (const table of tablesList) {
      const tableDetails = await analyzeTable(table.table_name);
      tables.push(tableDetails);
    }
    
    // Sammle explizite Beziehungen aus Fremdschlüsseln
    const explicitRelationships = [];
    for (const table of tables) {
      for (const fk of (table.foreignKeys || [])) {
        explicitRelationships.push({
          sourceTable: table.name,
          sourceColumn: fk.column_name,
          targetTable: fk.foreign_table_name,
          targetColumn: fk.foreign_column_name,
          isForeignKey: true,
          isImplicit: false
        });
      }
    }
    
    // Finde implizite Beziehungen
    const implicitRelationships = findImplicitRelationships(tables);
    
    // Erstelle einen Gesamtbericht
    const report = {
      timestamp: new Date().toISOString(),
      database: process.env.PGDATABASE,
      tables,
      relationships: {
        explicit: explicitRelationships,
        implicit: implicitRelationships
      },
      summary: {
        tableCount: tables.length,
        explicitRelationshipCount: explicitRelationships.length,
        implicitRelationshipCount: implicitRelationships.length
      }
    };
    
    // Speichere den Bericht
    const reportPath = path.join(REPORTS_DIR, `db_structure_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`Vollständiger Strukturbericht gespeichert: ${reportPath}`);
    
    // Erstelle eine kompakte Markdown-Zusammenfassung
    createMarkdownSummary(report);
    
    return report;
  } catch (err) {
    log(`Fehler bei der Datenbankanalyse: ${err.message}`, 'ERROR');
    throw err;
  }
}

/**
 * Erstellt eine leserliche Markdown-Zusammenfassung des Berichts
 */
function createMarkdownSummary(report) {
  let markdown = `# Datenbank-Strukturanalyse\n\n`;
  markdown += `Generiert am: ${new Date().toLocaleString()}\n\n`;
  
  // Tabellen-Zusammenfassung
  markdown += `## Übersicht\n\n`;
  markdown += `- **Datenbank:** ${report.database}\n`;
  markdown += `- **Anzahl Tabellen:** ${report.summary.tableCount}\n`;
  markdown += `- **Explizite Beziehungen:** ${report.summary.explicitRelationshipCount}\n`;
  markdown += `- **Implizite Beziehungen:** ${report.summary.implicitRelationshipCount}\n\n`;
  
  // Tabellen nach Größe
  markdown += `## Tabellen nach Größe\n\n`;
  markdown += `| Tabelle | Zeilen | Gesamtgröße | Tabellengröße | Indexgröße |\n`;
  markdown += `|---------|-------:|------------:|--------------:|-----------:|\n`;
  
  const sortedTables = [...report.tables]
    .filter(t => t.stats && t.stats.row_count)
    .sort((a, b) => parseInt(b.stats.row_count) - parseInt(a.stats.row_count));
  
  for (const table of sortedTables) {
    markdown += `| ${table.name} | ${table.stats.row_count || '?'} | ${table.stats.total_size || '?'} | ${table.stats.table_size || '?'} | ${table.stats.index_size || '?'} |\n`;
  }
  
  markdown += `\n`;
  
  // Explizite Beziehungen
  markdown += `## Explizite Beziehungen (Fremdschlüssel)\n\n`;
  if (report.relationships.explicit.length > 0) {
    markdown += `| Quelltabelle | Spalte | Zieltabelle | Zielspalte |\n`;
    markdown += `|--------------|--------|------------|------------|\n`;
    
    for (const rel of report.relationships.explicit) {
      markdown += `| ${rel.sourceTable} | ${rel.sourceColumn} | ${rel.targetTable} | ${rel.targetColumn} |\n`;
    }
  } else {
    markdown += `*Keine expliziten Fremdschlüsselbeziehungen gefunden*\n`;
  }
  
  markdown += `\n`;
  
  // Implizite Beziehungen
  markdown += `## Potenzielle implizite Beziehungen\n\n`;
  if (report.relationships.implicit.length > 0) {
    markdown += `| Quelltabelle | Spalte | Potenzielle Zieltabelle | Potenzielle Zielspalte |\n`;
    markdown += `|--------------|--------|-------------------------|------------------------|\n`;
    
    for (const rel of report.relationships.implicit) {
      markdown += `| ${rel.sourceTable} | ${rel.sourceColumn} | ${rel.targetTable} | ${rel.targetColumn} |\n`;
    }
  } else {
    markdown += `*Keine impliziten Beziehungen gefunden*\n`;
  }
  
  markdown += `\n`;
  
  // Tabellen ohne Primärschlüssel
  const tablesWithoutPK = report.tables.filter(t => !t.primaryKeys || t.primaryKeys.length === 0);
  if (tablesWithoutPK.length > 0) {
    markdown += `## Tabellen ohne Primärschlüssel\n\n`;
    markdown += tablesWithoutPK.map(t => `- ${t.name}`).join('\n');
    markdown += `\n\n`;
  }
  
  // Speichere die Markdown-Zusammenfassung
  const markdownPath = path.join(REPORTS_DIR, `db_structure_summary_${new Date().toISOString().split('T')[0]}.md`);
  fs.writeFileSync(markdownPath, markdown);
  log(`Strukturzusammenfassung in Markdown gespeichert: ${markdownPath}`);
  
  return markdownPath;
}

/**
 * Hauptfunktion
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'analyze';
  
  switch (command) {
    case 'analyze':
    case 'full':
      await analyzeDatabaseStructure();
      break;
    default:
      log(`Unbekannter Befehl: ${command}`, 'ERROR');
      log('Verfügbare Befehle: analyze, full');
      process.exit(1);
  }
}

// Führe das Skript aus, wenn es direkt aufgerufen wird
if (import.meta.url === import.meta.main) {
  main().catch(err => {
    log(`Unbehandelte Ausnahme: ${err.message}`, 'ERROR');
    process.exit(1);
  });
}

export {
  analyzeDatabaseStructure,
  getTableColumns,
  getTableKeys,
  getTableIndices,
  getTableStats
};