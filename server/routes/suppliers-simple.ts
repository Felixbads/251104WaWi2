import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/suppliers-simple - Alle aktiven Lieferanten für Dropdowns
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        company_name,
        contact_person,
        email,
        phone,
        is_active
      FROM suppliers 
      WHERE is_active = true 
      ORDER BY company_name ASC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Laden der Lieferanten:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Lieferanten',
      message: error.message 
    });
  }
});

export default router;