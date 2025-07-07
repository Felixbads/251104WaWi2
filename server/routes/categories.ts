import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/categories - Alle aktiven Kategorien
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, sort_order, is_active 
      FROM product_categories 
      WHERE is_active = true 
      ORDER BY sort_order ASC, name ASC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Laden der Produktkategorien:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Produktkategorien',
      message: error.message 
    });
  }
});

// GET /api/categories/names - Nur Kategorienamen (für Dropdown)
router.get('/names', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name 
      FROM product_categories 
      WHERE is_active = true 
      ORDER BY sort_order ASC, name ASC
    `);
    
    res.json(result.rows.map(row => row.name));
  } catch (error) {
    console.error('Fehler beim Laden der Kategorienamen:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Kategorienamen',
      message: error.message 
    });
  }
});

export default router;