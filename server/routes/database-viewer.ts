import { Router } from "express";
import { rawSql } from "../db";

const router = Router();

// Get all database names
router.get("/databases", async (_req, res) => {
  try {
    const result = await rawSql`
      SELECT datname FROM pg_database
      WHERE datistemplate = false
      ORDER BY datname;
    `;
    res.json(result);
  } catch (error) {
    console.error("Fehler beim Abrufen der Datenbankliste:", error);
    res.status(500).json({ 
      error: "Fehler beim Abrufen der Datenbankliste", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Get all tables for a specific database
router.get("/databases/:database/tables", async (req, res) => {
  try {
    const { database } = req.params;
    
    // Sicherheitsmaßnahme: Prüfen, ob die Datenbank existiert
    const dbCheck = await rawSql`
      SELECT datname FROM pg_database
      WHERE datname = ${database} AND datistemplate = false;
    `;
    
    if (dbCheck.length === 0) {
      return res.status(404).json({ error: "Datenbank nicht gefunden" });
    }
    
    const result = await rawSql`
      SELECT table_name, table_schema
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_catalog = ${database}
      ORDER BY table_schema, table_name;
    `;
    
    res.json(result);
  } catch (error) {
    console.error(`Fehler beim Abrufen der Tabellen für Datenbank ${req.params.database}:`, error);
    res.status(500).json({ 
      error: `Fehler beim Abrufen der Tabellen für Datenbank ${req.params.database}`, 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Get columns for a specific table
router.get("/databases/:database/tables/:table/columns", async (req, res) => {
  try {
    const { database, table } = req.params;
    const schema = req.query.schema as string || 'public';
    
    // Sicherheitsmaßnahme: Prüfen, ob die Datenbank existiert
    const dbCheck = await rawSql`
      SELECT datname FROM pg_database
      WHERE datname = ${database} AND datistemplate = false;
    `;
    
    if (dbCheck.length === 0) {
      return res.status(404).json({ error: "Datenbank nicht gefunden" });
    }
    
    // Tabellenspalten abrufen
    const result = await rawSql`
      SELECT 
        column_name, 
        data_type,
        character_maximum_length,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = ${table}
      AND table_schema = ${schema}
      AND table_catalog = ${database}
      ORDER BY ordinal_position;
    `;
    
    res.json(result);
  } catch (error) {
    console.error(`Fehler beim Abrufen der Spalten für Tabelle ${req.params.table}:`, error);
    res.status(500).json({ 
      error: `Fehler beim Abrufen der Spalten für Tabelle ${req.params.table}`, 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Get table content with pagination
router.get("/databases/:database/tables/:table/content", async (req, res) => {
  try {
    const { database, table } = req.params;
    const schema = req.query.schema as string || 'public';
    const page = parseInt(req.query.page as string || '1');
    const pageSize = parseInt(req.query.pageSize as string || '50');
    const orderBy = req.query.orderBy as string || 'id';
    const orderDirection = (req.query.orderDirection as string || 'asc').toUpperCase();
    
    // Validierung und Schutz vor SQL-Injection
    if (pageSize > 500) {
      return res.status(400).json({ error: "Die maximale Seitengröße ist 500" });
    }
    
    if (!['ASC', 'DESC'].includes(orderDirection)) {
      return res.status(400).json({ error: "Ungültige Sortierrichtung" });
    }
    
    // Sicherheitsmaßnahme: Prüfen, ob die Datenbank existiert
    const dbCheck = await rawSql`
      SELECT datname FROM pg_database
      WHERE datname = ${database} AND datistemplate = false;
    `;
    
    if (dbCheck.length === 0) {
      return res.status(404).json({ error: "Datenbank nicht gefunden" });
    }
    
    // Überprüfen, ob die Tabelle existiert
    const tableCheck = await rawSql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${schema}
      AND table_name = ${table}
      AND table_catalog = ${database};
    `;
    
    if (tableCheck.length === 0) {
      return res.status(404).json({ error: "Tabelle nicht gefunden" });
    }
    
    // Spalten abrufen, um die Sortierung zu validieren
    const columns = await rawSql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = ${schema}
      AND table_name = ${table}
      AND table_catalog = ${database};
    `;
    
    const columnNames = columns.map(col => col.column_name);
    
    // Prüfen, ob die Sortierspalte existiert
    if (!columnNames.includes(orderBy)) {
      return res.status(400).json({ error: `Die Spalte '${orderBy}' existiert nicht in der Tabelle` });
    }
    
    // Gesamtanzahl der Datensätze abrufen
    const countQuery = `SELECT COUNT(*) FROM "${schema}"."${table}"`;
    const countResult = await rawSql.unsafe(countQuery);
    const totalItems = parseInt(countResult[0].count);
    
    // Daten mit Pagination abrufen
    const offset = (page - 1) * pageSize;
    const contentQuery = `
      SELECT * FROM "${schema}"."${table}"
      ORDER BY "${orderBy}" ${orderDirection}
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    
    const data = await rawSql.unsafe(contentQuery);
    
    res.json({
      items: data,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize)
      }
    });
  } catch (error) {
    console.error(`Fehler beim Abrufen des Inhalts für Tabelle ${req.params.table}:`, error);
    res.status(500).json({ 
      error: `Fehler beim Abrufen des Inhalts für Tabelle ${req.params.table}`, 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;