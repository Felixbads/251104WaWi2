import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// Fast suppliers overview - nur die essentiellen Daten
router.get('/fast-overview', async (req, res) => {
  try {
    // Single optimized query for all required data
    const query = await db.execute(sql`
      SELECT 
        s.id,
        s.name,
        COUNT(DISTINCT p.id) as "currentProducts",
        COUNT(DISTINCT CASE WHEN o.status IN ('sent', 'open') THEN o.id END) as "openDeliveries"
      FROM suppliers s
      LEFT JOIN products p ON s.id = p.supplier_id AND p.status = 'active'
      LEFT JOIN orders o ON s.id = o.supplier_id
      WHERE s.status = 'active'
      GROUP BY s.id, s.name
      ORDER BY s.name ASC
    `);

    const suppliers = query.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      currentProducts: parseInt(String(row.currentProducts)) || 0,
      openDeliveries: parseInt(String(row.openDeliveries)) || 0
    }));

    res.json({
      success: true,
      data: suppliers,
      count: suppliers.length
    });

  } catch (error) {
    console.error('Error in fast suppliers overview:', error);
    res.status(500).json({ 
      success: false,
      error: 'Fehler beim Laden der Lieferanten-Übersicht',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;