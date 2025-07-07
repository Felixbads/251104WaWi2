import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/suppliers-simple - Alle aktiven Lieferanten für Dropdowns
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        name as company_name,
        contact_person,
        email,
        phone,
        status as is_active
      FROM suppliers 
      WHERE status = 'active' 
      ORDER BY name ASC
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