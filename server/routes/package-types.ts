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
    console.log('[PACKAGE-TYPES] Fetching package type names from database');
    
    const result = await pool.query(`
      SELECT id, name 
      FROM package_types 
      WHERE is_active = true 
      ORDER BY sort_order ASC, name ASC
    `);
    
    console.log('[PACKAGE-TYPES] Found', result.rows.length, 'package types');
    
    if (result.rows.length > 0) {
      // Return both id and name for dropdown functionality
      const packageTypes = result.rows.map(row => ({
        id: row.id,
        name: row.name
      }));
      
      console.log('[PACKAGE-TYPES] Returning DB data:', packageTypes);
      res.json(packageTypes);
    } else {
      // Fallback wenn DB leer ist
      console.log('[PACKAGE-TYPES] No data in DB, using fallback');
      const fallbackTypes = [
        { id: 1, name: 'Karton' },
        { id: 2, name: 'Stiege' },
        { id: 3, name: 'Kasten' },
        { id: 4, name: 'Kiste' },
        { id: 5, name: 'Stück' },
        { id: 6, name: 'Pack' },
        { id: 7, name: 'Palette' }
      ];
      res.json(fallbackTypes);
    }
  } catch (error) {
    console.error('[PACKAGE-TYPES] Error loading package type names:', error);
    // Fallback wenn DB-Zugriff fehlschlägt
    const fallbackTypes = [
      { id: 1, name: 'Karton' },
      { id: 2, name: 'Stiege' },
      { id: 3, name: 'Kasten' },
      { id: 4, name: 'Kiste' },
      { id: 5, name: 'Stück' },
      { id: 6, name: 'Pack' },
      { id: 7, name: 'Palette' }
    ];
    console.log('[PACKAGE-TYPES] Using fallback types due to error');
    res.json(fallbackTypes);
  }
});

export default router;