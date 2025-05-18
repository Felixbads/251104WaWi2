import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// Direkte Bestellungsdaten aus der Datenbank abrufen
router.get('/direct-orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    return res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Bestellungen:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

// Direkte Lagerdaten aus der Datenbank abrufen
router.get('/direct-warehouses', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM warehouses WHERE is_active = true ORDER BY name');
    return res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Lager:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

// Direkte Lieferantendaten aus der Datenbank abrufen
router.get('/direct-suppliers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suppliers WHERE is_active = true ORDER BY name');
    return res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Lieferanten:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

export default router;