import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/package-types - Alle verfügbaren Gebindearten
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, is_active 
      FROM package_types 
      WHERE is_active = true 
      ORDER BY name ASC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Laden der Gebindearten:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Gebindearten',
      message: error.message 
    });
  }
});

// GET /api/package-types/names - Nur Gebindeart-Namen (für Dropdown)
router.get('/names', async (req, res) => {
  try {
    // Erstmal die häufigsten Gebindearten statisch zurückgeben
    const packageTypes = [
      'Flasche',
      'Dose',
      'Becher',
      'Schale',
      'Karton', 
      'Beutel',
      'Glas',
      'Tube',
      'Packung'
    ];
    
    res.json(packageTypes);
  } catch (error) {
    console.error('Fehler beim Laden der Gebindeart-Namen:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Gebindeart-Namen',
      message: error.message 
    });
  }
});

export default router;