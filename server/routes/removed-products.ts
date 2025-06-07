import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// Top entfernte Produkte API mit Kostenanalyse
router.post('/top', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 20;
    
    const query = `
      SELECT 
        rd.product_name as "productName",
        SUM(rd.removed) as "totalRemoved",
        COUNT(*) as "removalsCount",
        MAX(r.datetime) as "lastRemoved",
        COALESCE(AVG(pc.purchase_price), AVG(t.price), 0) as "avgPurchasePrice",
        SUM(rd.removed * COALESCE(pc.purchase_price, t.price, 0)) as "estimatedLoss"
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      LEFT JOIN products p ON rd.product_name = p.name
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true
      LEFT JOIN transactions t ON rd.product_name = t.product_name
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
      lastRemoved: row.lastRemoved,
      avgPurchasePrice: row.avgPurchasePrice ? parseFloat(row.avgPurchasePrice) : 0,
      estimatedLoss: row.estimatedLoss ? parseFloat(row.estimatedLoss) : 0
    }));
    
    console.log(`Top removed products response: ${response.length} items`);
    res.json(response);
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Top entfernten Produkte:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Daten', details: error.message });
  }
});

// Detaillierte Statistiken für ein spezifisches Produkt
router.post('/stats/:productName', async (req, res) => {
  try {
    const productName = decodeURIComponent(req.params.productName);
    const days = parseInt(req.query.days as string) || 30;
    
    console.log(`[RemovedProducts] Getting detailed stats for: "${productName}" (${days} days)`);
    
    // Grundlegende Statistiken mit Kostenanalyse
    const statsQuery = `
      SELECT 
        rd.product_name as "productName",
        SUM(rd.removed) as "totalRemoved",
        COUNT(*) as "removalsCount",
        MAX(r.datetime) as "lastRemoved",
        AVG(rd.removed) as "avgPerRemoval",
        AVG(t.price) as "avgSalePrice",
        SUM(rd.removed * COALESCE(t.price, 0)) as "estimatedLoss"
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      LEFT JOIN transactions t ON rd.product_name = t.product_name
      WHERE rd.removed > 0 
        AND rd.product_name = $1
        AND r.datetime >= NOW() - INTERVAL '${days} days'
      GROUP BY rd.product_name
    `;
    
    const statsResult = await pool.query(statsQuery, [productName]);
    console.log(`[RemovedProducts] Stats query returned ${statsResult.rows.length} rows`);
    
    if (statsResult.rows.length === 0) {
      console.log(`[RemovedProducts] No data found for product: "${productName}"`);
      return res.json({
        productName,
        totalRemoved: 0,
        removalsCount: 0,
        lastRemoved: null,
        avgPerRemoval: 0,
        avgSalePrice: 0,
        estimatedLoss: 0,
        machines: [],
        timeline: []
      });
    }
    
    const stats = statsResult.rows[0];
    console.log(`[RemovedProducts] Stats:`, stats);
    
    // Automaten-spezifische Aufschlüsselung mit Kostenberechnung
    const machinesQuery = `
      SELECT 
        r.machine_id as "machineId",
        r.machine_name as "machineName",
        SUM(rd.removed) as "removedCount",
        AVG(t.price) as "avgPrice",
        SUM(rd.removed * COALESCE(t.price, 0)) as "machineLoss"
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      LEFT JOIN transactions t ON rd.product_name = t.product_name AND r.machine_id = t.machine_id
      WHERE rd.removed > 0 
        AND rd.product_name = $1
        AND r.datetime >= NOW() - INTERVAL '${days} days'
      GROUP BY r.machine_id, r.machine_name
      ORDER BY "removedCount" DESC
    `;
    
    const machinesResult = await pool.query(machinesQuery, [productName]);
    console.log(`[RemovedProducts] Machines query returned ${machinesResult.rows.length} machines`);
    
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
    console.log(`[RemovedProducts] Timeline query returned ${timelineResult.rows.length} timeline entries`);
    
    const response = {
      ...stats,
      totalRemoved: parseInt(stats.totalRemoved),
      removalsCount: parseInt(stats.removalsCount),
      avgPerRemoval: parseFloat(stats.avgPerRemoval),
      avgSalePrice: stats.avgSalePrice ? parseFloat(stats.avgSalePrice) : 0,
      estimatedLoss: stats.estimatedLoss ? parseFloat(stats.estimatedLoss) : 0,
      machines: machinesResult.rows.map(m => ({
        ...m,
        removedCount: parseInt(m.removedCount),
        avgPrice: m.avgPrice ? parseFloat(m.avgPrice) : 0,
        machineLoss: m.machineLoss ? parseFloat(m.machineLoss) : 0
      })),
      timeline: timelineResult.rows.map(t => ({
        ...t,
        removed: parseInt(t.removed),
        count: parseInt(t.count)
      }))
    };
    
    console.log(`[RemovedProducts] Sending response:`, response);
    res.json(response);
    
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

// Standort-Trends API - zeigt welche Produkte an welchen Standorten übermäßig entfernt werden
router.post('/location-trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const query = `
      SELECT 
        r.machine_name as "locationName",
        rd.product_name as "productName",
        SUM(rd.removed) as "totalRemoved",
        COUNT(*) as "removalEvents",
        AVG(rd.removed) as "avgPerEvent",
        COALESCE(AVG(pc.purchase_price), AVG(t.price), 0) as "avgPurchasePrice",
        SUM(rd.removed * COALESCE(pc.purchase_price, t.price, 0)) as "locationLoss",
        RANK() OVER (PARTITION BY r.machine_name ORDER BY SUM(rd.removed) DESC) as "rankAtLocation"
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      LEFT JOIN products p ON rd.product_name = p.name
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true
      LEFT JOIN transactions t ON rd.product_name = t.product_name AND r.machine_id = t.machine_id
      WHERE rd.removed > 0 
        AND r.datetime >= NOW() - INTERVAL '${days} days'
      GROUP BY r.machine_name, rd.product_name
      HAVING SUM(rd.removed) >= 2
      ORDER BY r.machine_name, "totalRemoved" DESC
    `;
    
    const result = await pool.query(query);
    
    // Gruppiere Ergebnisse nach Standort
    const locationTrends: any = {};
    result.rows.forEach((row: any) => {
      const location = row.locationName;
      if (!locationTrends[location]) {
        locationTrends[location] = {
          locationName: location,
          products: [],
          totalRemovedAtLocation: 0,
          totalLossAtLocation: 0
        };
      }
      
      const productData = {
        productName: row.productName,
        totalRemoved: parseInt(row.totalRemoved),
        removalEvents: parseInt(row.removalEvents),
        avgPerEvent: parseFloat(row.avgPerEvent),
        avgPurchasePrice: row.avgPurchasePrice ? parseFloat(row.avgPurchasePrice) : 0,
        locationLoss: row.locationLoss ? parseFloat(row.locationLoss) : 0,
        rankAtLocation: parseInt(row.rankAtLocation)
      };
      
      locationTrends[location].products.push(productData);
      locationTrends[location].totalRemovedAtLocation += productData.totalRemoved;
      locationTrends[location].totalLossAtLocation += productData.locationLoss;
    });
    
    // Konvertiere zu Array und sortiere nach Gesamtverlust
    const response = Object.values(locationTrends).sort((a: any, b: any) => b.totalLossAtLocation - a.totalLossAtLocation);
    
    console.log(`Location trends response: ${response.length} locations with removal patterns`);
    res.json(response);
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Standort-Trends:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Standort-Trends' });
  }
});

export default router;