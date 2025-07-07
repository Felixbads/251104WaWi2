import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/suppliers-simple - Einfache Lieferantenliste für Dropdowns
router.get('/', async (req, res) => {
  try {
    console.log('[SUPPLIERS-SIMPLE] Fetching suppliers for dropdowns');
    
    const result = await pool.query(`
      SELECT 
        id,
        name,
        email,
        phone,
        payment_terms,
        delivery_terms,
        minimum_order_value
      FROM suppliers 
      WHERE active = true 
      ORDER BY name
    `);

    console.log('[SUPPLIERS-SIMPLE] Found suppliers:', result.rows.length);
    res.json(result.rows);

  } catch (error) {
    console.error('Fehler beim Laden der Lieferanten:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

export default router;