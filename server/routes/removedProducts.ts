import { Router } from 'express';
import { storage } from '../storage';

// Router erstellen
const router = Router();

/**
 * Ruft alle aus Automaten entfernten Produkte anhand der refill_details.removed Daten ab
 */
router.get('/', async (req, res) => {
  try {
    const { machineId, startDate, endDate, limit } = req.query;
    
    // Abfrage für entfernte Produkte zusammenstellen
    const query = {
      machineId: machineId ? String(machineId) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined
    };
    
    // Abrufen der entfernten Produkte aus der Datenbank
    const removedProducts = await storage.query(`
      SELECT 
        rd.id,
        rd.refill_id as "refillId",
        rd.product_name as "productName",
        rd.removed, 
        r.datetime,
        r.machine_id as "machineId",
        m.name as "machineName"
      FROM refill_details rd
      JOIN refills r ON rd.refill_id = r.id
      JOIN machines m ON r.machine_id = m.id
      WHERE rd.removed > 0
      ${query.machineId ? 'AND r.machine_id = $1' : ''}
      ${query.startDate ? `AND r.datetime >= $${query.machineId ? 2 : 1}` : ''}
      ${query.endDate ? `AND r.datetime <= $${query.machineId && query.startDate ? 3 : query.machineId || query.startDate ? 2 : 1}` : ''}
      ORDER BY r.datetime DESC
      ${query.limit ? `LIMIT ${query.limit}` : ''}
    `, [
      ...(query.machineId ? [query.machineId] : []),
      ...(query.startDate ? [new Date(query.startDate)] : []),
      ...(query.endDate ? [new Date(query.endDate)] : [])
    ]);
    
    // Analytik erstellen
    const analytics = {
      byProduct: [],
      byMachine: [],
      byDate: []
    };
    
    // Produkten-Zählung
    const productCounts = {};
    removedProducts.forEach(product => {
      if (!productCounts[product.productName]) {
        productCounts[product.productName] = 0;
      }
      productCounts[product.productName] += product.removed;
    });
    
    // Automaten-Zählung
    const machineCounts = {};
    removedProducts.forEach(product => {
      if (!machineCounts[product.machineName]) {
        machineCounts[product.machineName] = 0;
      }
      machineCounts[product.machineName] += product.removed;
    });
    
    // Datums-Zählung
    const dateCounts = {};
    removedProducts.forEach(product => {
      const date = new Date(product.datetime).toISOString().split('T')[0];
      if (!dateCounts[date]) {
        dateCounts[date] = 0;
      }
      dateCounts[date] += product.removed;
    });
    
    // Analytics in Arrays umwandeln
    analytics.byProduct = Object.keys(productCounts).map(name => ({
      name,
      count: productCounts[name]
    })).sort((a, b) => b.count - a.count);
    
    analytics.byMachine = Object.keys(machineCounts).map(name => ({
      name,
      count: machineCounts[name]
    })).sort((a, b) => b.count - a.count);
    
    analytics.byDate = Object.keys(dateCounts).map(date => ({
      date,
      count: dateCounts[date]
    })).sort((a, b) => b.count - a.count);
    
    res.json({
      products: removedProducts,
      analytics
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der entfernten Produkte:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der entfernten Produkte',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * Ruft Zusammenfassung der entfernten Produkte für ein bestimmtes Datum oder Zeitraum ab
 */
router.get('/summary', async (req, res) => {
  try {
    const { groupBy = 'product', startDate, endDate } = req.query;
    
    // SQL-Abfrage je nach Gruppierung zusammenstellen
    let query = '';
    let params = [];
    
    // Parameter-Indizes für Prepared Statements
    let paramIndex = 1;
    
    // Basis-Query basierend auf Gruppierung
    if (groupBy === 'machine') {
      query = `
        SELECT 
          m.name as name,
          SUM(rd.removed) as total_removed
        FROM refill_details rd
        JOIN refills r ON rd.refill_id = r.id
        JOIN machines m ON r.machine_id = m.id
        WHERE rd.removed > 0
      `;
    } else if (groupBy === 'date') {
      query = `
        SELECT 
          TO_CHAR(r.datetime, 'YYYY-MM-DD') as name,
          SUM(rd.removed) as total_removed
        FROM refill_details rd
        JOIN refills r ON rd.refill_id = r.id
        WHERE rd.removed > 0
      `;
    } else {
      // Default: Gruppierung nach Produkt
      query = `
        SELECT 
          rd.product_name as name,
          SUM(rd.removed) as total_removed
        FROM refill_details rd
        JOIN refills r ON rd.refill_id = r.id
        WHERE rd.removed > 0
      `;
    }
    
    // Zeitraum-Filter
    if (startDate) {
      query += ` AND r.datetime >= $${paramIndex++}`;
      params.push(new Date(String(startDate)));
    }
    
    if (endDate) {
      query += ` AND r.datetime <= $${paramIndex++}`;
      params.push(new Date(String(endDate)));
    }
    
    // Gruppierung und Sortierung
    query += ` GROUP BY name ORDER BY total_removed DESC`;
    
    // Ausführen der Abfrage
    const summary = await storage.query(query, params);
    
    res.json(summary);
  } catch (error) {
    console.error('Fehler beim Abrufen der Zusammenfassung:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Zusammenfassung',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;