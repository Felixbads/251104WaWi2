import express from 'express';
import { db, rawDb, pool } from '../db';

const router = express.Router();

// Dieser Endpunkt ermöglicht direkten SQL-Zugriff für den Bestellungen-V3 Service
router.post('/execute-sql', async (req, res) => {
  try {
    // SQL-Query aus dem Request-Body extrahieren
    const { query, params } = req.body;
    
    console.log('Ausführung einer direkten SQL-Abfrage:', query);
    
    if (!query) {
      return res.status(400).json({ 
        error: 'Fehlerhafte Anfrage', 
        message: 'SQL-Query ist erforderlich'
      });
    }
    
    // Für Sicherheit beim Produktiveinsatz sollten hier weitere Prüfungen erfolgen!
    
    // SQL-Abfrage ausführen mit optionalen Parametern
    const result = await pool.query(query, params || []);
    
    // Ergebnis zurückgeben
    return res.json({
      rows: result.rows,
      rowCount: result.rowCount,
      success: true
    });
  } catch (error) {
    console.error('Fehler bei SQL-Abfrage:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Direkter Zugriff auf Bestellungen über optimierten Endpunkt
router.get('/orders', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM orders 
      ORDER BY created_at DESC
    `);
    
    console.log(`${result.rows.length} Bestellungen direkt aus der Datenbank geladen`);
    
    return res.json({
      rows: result.rows,
      success: true
    });
  } catch (error) {
    console.error('Fehler beim Laden der Bestellungen:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Direkter Zugriff auf Lager über optimierten Endpunkt
router.get('/warehouses', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM warehouses 
      WHERE is_active = true
      ORDER BY name
    `);
    
    console.log(`${result.rows.length} Lager direkt aus der Datenbank geladen`);
    
    return res.json({
      rows: result.rows,
      success: true
    });
  } catch (error) {
    console.error('Fehler beim Laden der Lager:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Direkter Zugriff auf Lieferanten über optimierten Endpunkt
router.get('/suppliers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM suppliers 
      WHERE is_active = true
      ORDER BY name
    `);
    
    console.log(`${result.rows.length} Lieferanten direkt aus der Datenbank geladen`);
    
    return res.json({
      rows: result.rows,
      success: true
    });
  } catch (error) {
    console.error('Fehler beim Laden der Lieferanten:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

export default router;