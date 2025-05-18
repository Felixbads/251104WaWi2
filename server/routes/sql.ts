import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// Sicherer SQL-Ausführungsendpunkt für Abfragen
router.post('/execute-sql', async (req, res) => {
  try {
    const { query, params = [] } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'SQL-Abfrage fehlt' });
    }

    // Schütze vor gefährlichen Abfragen (nur SELECT erlauben)
    if (!query.trim().toLowerCase().startsWith('select')) {
      return res.status(403).json({ 
        error: 'Nur SELECT-Abfragen sind erlaubt' 
      });
    }

    console.log('SQL-Anfrage ausführen:', query, params);
    const result = await pool.query(query, params);
    
    return res.json({ 
      rows: result.rows,
      rowCount: result.rowCount 
    });
  } catch (error) {
    console.error('SQL-Fehler:', error);
    res.status(500).json({ 
      error: 'Fehler bei SQL-Ausführung', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;