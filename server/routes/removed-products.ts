import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// Top entfernte Produkte API
router.post('/top', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 20;
    
    const query = `
      SELECT 
        rd.product_name as "productName",
        SUM(rd.removed) as "totalRemoved",
        COUNT(*) as "removalsCount",
        MAX(r.datetime) as "lastRemoved"
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      WHERE rd.removed > 0 
        AND r.datetime >= NOW() - INTERVAL '${days} days'
      GROUP BY rd.product_name
      ORDER BY "totalRemoved" DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [limit]);
    
    const response = result.rows.map((row, index) => ({
      rank: index + 1,
      productName: row.productName,
      totalRemoved: parseInt(row.totalRemoved),
      removalsCount: parseInt(row.removalsCount),
      lastRemoved: row.lastRemoved
    }));
    
    console.log(`Top removed products response: ${response.length} items`);
    res.json(response);
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Top entfernten Produkte:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Daten', details: error.message });
  }
});

// Detaillierte Statistiken für ein spezifisches Produkt
router.get('/stats/:productName', async (req, res) => {
  try {
    const productName = decodeURIComponent(req.params.productName);
    const days = parseInt(req.query.days as string) || 30;
    
    // Grundlegende Statistiken
    const statsQuery = `
      SELECT 
        rd.product_name as "productName",
        SUM(rd.removed) as "totalRemoved",
        COUNT(*) as "removalsCount",
        MAX(r.datetime) as "lastRemoved",
        AVG(rd.removed) as "avgPerRemoval"
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      WHERE rd.removed > 0 
        AND rd.product_name = $1
        AND r.datetime >= NOW() - INTERVAL '${days} days'
      GROUP BY rd.product_name
    `;
    
    const statsResult = await pool.query(statsQuery, [productName]);
    
    if (statsResult.rows.length === 0) {
      return res.json({
        productName,
        totalRemoved: 0,
        removalsCount: 0,
        lastRemoved: null,
        avgPerRemoval: 0,
        machines: [],
        timeline: []
      });
    }
    
    const stats = statsResult.rows[0];
    
    // Automaten-spezifische Aufschlüsselung
    const machinesQuery = `
      SELECT 
        r.machine_id as "machineId",
        r.machine_name as "machineName",
        SUM(rd.removed) as "removedCount"
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      WHERE rd.removed > 0 
        AND rd.product_name = $1
        AND r.datetime >= NOW() - INTERVAL '${days} days'
      GROUP BY r.machine_id, r.machine_name
      ORDER BY "removedCount" DESC
    `;
    
    const machinesResult = await pool.query(machinesQuery, [productName]);
    
    // Zeitverlaufs-Daten (tagesweise)
    const timelineQuery = `
      SELECT 
        DATE(r.datetime) as "date",
        SUM(rd.removed) as "removed",
        COUNT(*) as "count"
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      WHERE rd.removed > 0 
        AND rd.product_name = $1
        AND r.datetime >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(r.datetime)
      ORDER BY "date"
    `;
    
    const timelineResult = await pool.query(timelineQuery, [productName]);
    
    res.json({
      ...stats,
      avgPerRemoval: parseFloat(stats.avgPerRemoval),
      machines: machinesResult.rows,
      timeline: timelineResult.rows
    });
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Produktstatistiken:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Daten' });
  }
});

// Export der Rückläufer-Daten als Excel
router.get('/export', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const productName = req.query.productName as string;
    const machineId = req.query.machineId as string;
    
    let query = `
      SELECT 
        r.datetime,
        rd.product_name,
        r.machine_name,
        rd.removed,
        rd.previous_stock,
        rd.current_stock
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      WHERE rd.removed > 0 
        AND r.datetime >= NOW() - INTERVAL '${days} days'
    `;
    
    const params: any[] = [];
    
    if (productName) {
      query += ` AND rd.product_name = $${params.length + 1}`;
      params.push(productName);
    }
    
    if (machineId) {
      query += ` AND r.machine_id = $${params.length + 1}`;
      params.push(parseInt(machineId));
    }
    
    query += ` ORDER BY r.datetime DESC`;
    
    const result = await pool.query(query, params);
    
    // Excel-Export mit xlsx
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    
    const worksheet = XLSX.utils.json_to_sheet(result.rows.map(row => ({
      'Datum/Zeit': row.datetime,
      'Produktname': row.product_name,
      'Automat': row.machine_name,
      'Entfernt': row.removed,
      'Vorheriger Bestand': row.previous_stock,
      'Aktueller Bestand': row.current_stock
    })));
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rückläufer');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename=ruecklaufer-export.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
    
  } catch (error) {
    console.error('Fehler beim Excel-Export:', error);
    res.status(500).json({ error: 'Fehler beim Export' });
  }
});

export default router;