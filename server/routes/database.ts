import { Router } from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import { z } from 'zod';

const router = Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Backup request schema
const backupRequestSchema = z.object({
  table: z.string(),
  format: z.enum(['sql', 'json', 'csv']),
});

// Restore request schema
const restoreRequestSchema = z.object({
  sqlScript: z.string().min(1),
});

// Define available tables for backup
const AVAILABLE_TABLES = [
  'products', 'transactions', 'users', 'suppliers', 'warehouses', 
  'machines', 'orders', 'inventory', 'sync_logs', 'sync_state',
  'purchase_orders', 'order_items', 'machine_products', 'warehouse_inventory'
];

// Get list of all tables in database
async function getAllTables(): Promise<string[]> {
  const query = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  
  const result = await pool.query(query);
  return result.rows.map(row => row.table_name);
}

// Generate SQL dump for specific table
async function generateSQLDump(tableName: string): Promise<string> {
  let sqlDump = '';
  
  if (tableName === 'all') {
    const tables = await getAllTables();
    
    for (const table of tables) {
      sqlDump += await generateTableSQLDump(table);
      sqlDump += '\n\n';
    }
  } else {
    sqlDump = await generateTableSQLDump(tableName);
  }
  
  return sqlDump;
}

async function generateTableSQLDump(tableName: string): Promise<string> {
  // Get table structure
  const structureQuery = `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position;
  `;
  
  const structureResult = await pool.query(structureQuery, [tableName]);
  
  // Get table data
  const dataResult = await pool.query(`SELECT * FROM "${tableName}"`);
  
  let sqlDump = `-- Backup für Tabelle: ${tableName}\n`;
  sqlDump += `-- Erstellt am: ${new Date().toISOString()}\n\n`;
  
  // Create table structure comment
  sqlDump += `-- Tabellenstruktur für ${tableName}\n`;
  structureResult.rows.forEach(col => {
    sqlDump += `-- ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})\n`;
  });
  sqlDump += '\n';
  
  // Generate INSERT statements
  if (dataResult.rows.length > 0) {
    const columns = Object.keys(dataResult.rows[0]);
    sqlDump += `-- Daten für Tabelle ${tableName}\n`;
    
    dataResult.rows.forEach(row => {
      const values = columns.map(col => {
        const value = row[col];
        if (value === null) return 'NULL';
        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        if (value instanceof Date) return `'${value.toISOString()}'`;
        return value;
      }).join(', ');
      
      sqlDump += `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values});\n`;
    });
  }
  
  return sqlDump;
}

// Generate JSON export
async function generateJSONExport(tableName: string): Promise<object> {
  if (tableName === 'all') {
    const tables = await getAllTables();
    const result: Record<string, any[]> = {};
    
    for (const table of tables) {
      const tableResult = await pool.query(`SELECT * FROM "${table}"`);
      result[table] = tableResult.rows;
    }
    
    return {
      exportDate: new Date().toISOString(),
      database: 'postgresql',
      tables: result
    };
  } else {
    const result = await pool.query(`SELECT * FROM "${tableName}"`);
    return {
      exportDate: new Date().toISOString(),
      database: 'postgresql',
      table: tableName,
      data: result.rows
    };
  }
}

// Generate CSV export
async function generateCSVExport(tableName: string): Promise<string> {
  if (tableName === 'all') {
    throw new Error('CSV-Export für alle Tabellen nicht unterstützt. Bitte wählen Sie eine einzelne Tabelle.');
  }
  
  const result = await pool.query(`SELECT * FROM "${tableName}"`);
  
  if (result.rows.length === 0) {
    return `Keine Daten in Tabelle ${tableName} gefunden.\n`;
  }
  
  const columns = Object.keys(result.rows[0]);
  let csv = columns.join(',') + '\n';
  
  result.rows.forEach(row => {
    const values = columns.map(col => {
      const value = row[col];
      if (value === null) return '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csv += values.join(',') + '\n';
  });
  
  return csv;
}

// Backup endpoint
router.post('/backup', async (req, res) => {
  try {
    const { table, format } = backupRequestSchema.parse(req.body);
    
    // Validate table name
    if (table !== 'all' && !AVAILABLE_TABLES.includes(table)) {
      const availableTables = await getAllTables();
      if (!availableTables.includes(table)) {
        return res.status(400).json({ 
          error: 'Ungültige Tabelle', 
          availableTables: availableTables 
        });
      }
    }
    
    let content: string;
    let mimeType: string;
    
    switch (format) {
      case 'sql':
        content = await generateSQLDump(table);
        mimeType = 'application/sql';
        break;
      case 'json':
        const jsonData = await generateJSONExport(table);
        content = JSON.stringify(jsonData, null, 2);
        mimeType = 'application/json';
        break;
      case 'csv':
        content = await generateCSVExport(table);
        mimeType = 'text/csv';
        break;
      default:
        return res.status(400).json({ error: 'Ungültiges Format' });
    }
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="backup_${table}_${Date.now()}.${format}"`);
    res.send(content);
    
  } catch (error) {
    console.error('Backup-Fehler:', error);
    res.status(500).json({ 
      error: 'Backup fehlgeschlagen', 
      details: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

// Restore endpoint
router.post('/restore', async (req, res) => {
  try {
    const { sqlScript } = restoreRequestSchema.parse(req.body);
    
    // Start transaction for safety
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Split SQL script into individual statements
      const statements = sqlScript
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      let affectedRows = 0;
      
      for (const statement of statements) {
        if (statement.toLowerCase().startsWith('insert') || 
            statement.toLowerCase().startsWith('update') || 
            statement.toLowerCase().startsWith('delete')) {
          const result = await client.query(statement);
          affectedRows += result.rowCount || 0;
        } else {
          await client.query(statement);
        }
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: 'Wiederherstellung erfolgreich',
        affectedRows,
        statementsExecuted: statements.length
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Wiederherstellungs-Fehler:', error);
    res.status(500).json({ 
      error: 'Wiederherstellung fehlgeschlagen', 
      details: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

// Get available tables endpoint
router.get('/tables', async (req, res) => {
  try {
    const tables = await getAllTables();
    res.json({ tables });
  } catch (error) {
    console.error('Fehler beim Abrufen der Tabellen:', error);
    res.status(500).json({ 
      error: 'Tabellen konnten nicht abgerufen werden',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// Database statistics endpoint
router.get('/stats', async (req, res) => {
  try {
    const tables = await getAllTables();
    const stats: Record<string, number> = {};
    
    for (const table of tables) {
      const result = await pool.query(`SELECT COUNT(*) FROM "${table}"`);
      stats[table] = parseInt(result.rows[0].count);
    }
    
    res.json({ 
      totalTables: tables.length,
      tableStats: stats,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Statistiken:', error);
    res.status(500).json({ 
      error: 'Statistiken konnten nicht abgerufen werden',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;