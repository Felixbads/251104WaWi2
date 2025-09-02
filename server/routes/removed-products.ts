import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// Dashboard API für wöchentliche Entnahmen
router.get('/', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    
    console.log(`[RemovedProducts] Dashboard API: Getting removals for ${days} days`);
    
    const query = `
      SELECT 
        rd.product_name as "productName",
        r.machine_name as "machineName", 
        SUM(rd.removed) as "totalRemoved",
        AVG(COALESCE(p.cost_price, pc.unit_price, 2.0)) as "productPrice",
        COUNT(*) as "removalCount",
        MAX(r.datetime) as "lastRemoved"
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      LEFT JOIN products p ON rd.product_name = p.product_name
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true

      WHERE rd.removed > 0 
        AND r.datetime >= NOW() - INTERVAL '${days} days'
      GROUP BY rd.product_name, r.machine_name
      ORDER BY "totalRemoved" DESC, r.machine_name
    `;
    
    const result = await pool.query(query);
    
    // Format die Daten für das Dashboard
    const items = result.rows.map(row => ({
      productName: row.productName,
      machineName: row.machineName, 
      quantity: parseInt(row.totalRemoved) || 0,
      productPrice: parseFloat(row.productPrice) || 2.0,
      datetime: row.lastRemoved,
      value: (parseInt(row.totalRemoved) || 0) * (parseFloat(row.productPrice) || 2.0)
    }));
    
    // Gruppiere nach Maschine für Dashboard-Summary
    const machineGroups: any = {};
    items.forEach(item => {
      if (!machineGroups[item.machineName]) {
        machineGroups[item.machineName] = {
          machineName: item.machineName,
          count: 0,
          value: 0
        };
      }
      machineGroups[item.machineName].count += item.quantity;
      machineGroups[item.machineName].value += item.value;
    });
    
    const machineData = Object.values(machineGroups);
    
    const response = {
      success: true,
      items: items,
      totalItems: items.length,
      totalValue: items.reduce((sum, item) => sum + item.value, 0),
      machineBreakdown: machineData,
      dateRange: `${days} Tage`
    };
    
    console.log(`[RemovedProducts] Dashboard response: ${items.length} items, total value: ${response.totalValue.toFixed(2)}€`);
    res.json(response);
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Entnahmen für Dashboard:', error);
    res.status(500).json({ 
      success: false,
      error: 'Fehler beim Abrufen der Entnahmen', 
      items: [],
      totalItems: 0,
      totalValue: 0
    });
  }
});

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
        COALESCE(AVG(p.cost_price), AVG(pc.unit_price), 2.0) as "avgPurchasePrice",
        SUM(rd.removed * COALESCE(p.cost_price, pc.unit_price, 2.0)) as "estimatedLoss"
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      LEFT JOIN products p ON rd.product_name = p.product_name
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true

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
 AND r.machine_id = t.machine_id
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

// CORRECTED Standort-Trends API - REALISTIC removal data calculation
router.post('/location-trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 50;
    
    console.log(`[LOCATION-TRENDS] Calculating REALISTIC removal data for ${days} days`);
    
    // CORRECTED QUERY: Cap removal values at realistic levels (max 10 per event)
    const query = `
      SELECT 
        r.machine_name as "locationName",
        rd.product_name as "productName",
        SUM(LEAST(rd.removed, 10)) as "totalRemoved",
        COUNT(*) as "removalEvents",
        AVG(LEAST(rd.removed, 10)) as "avgPerEvent",
        COALESCE(AVG(p.cost_price), AVG(pc.unit_price), 2.0) as "avgPurchasePrice",
        SUM(LEAST(rd.removed, 10) * COALESCE(p.cost_price, pc.unit_price, 2.0)) as "locationLoss",
        RANK() OVER (PARTITION BY r.machine_name ORDER BY SUM(LEAST(rd.removed, 10)) DESC) as "rankAtLocation"
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      LEFT JOIN products p ON rd.product_name = p.product_name
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true
      WHERE rd.removed > 0 
        AND r.datetime >= NOW() - INTERVAL '${days} days'
        AND LEAST(rd.removed, 10) >= 1
      GROUP BY r.machine_name, rd.product_name
      HAVING SUM(LEAST(rd.removed, 10)) >= 2
      ORDER BY r.machine_name, "totalRemoved" DESC
    `;
    
    const result = await pool.query(query);
    
    // REALISTIC sales data for comparison (last 3 months only)
    const salesQuery = `
      SELECT 
        t.machine_name as "locationName",
        t.product_name as "productName",
        DATE_TRUNC('month', t.datetime) as "month",
        COUNT(*) as "monthlySales",
        SUM(t.quantity) as "monthlyQuantity",
        AVG(t.price) as "avgSalePrice"
      FROM transactions t
      WHERE t.datetime >= NOW() - INTERVAL '3 months'
      GROUP BY t.machine_name, t.product_name, DATE_TRUNC('month', t.datetime)
      ORDER BY t.machine_name, t.product_name, "month"
    `;
    
    const salesResult = await pool.query(salesQuery);
    console.log(`[RemovedProducts] Sales query returned ${salesResult.rows.length} monthly sales records`);
    
    // Organisiere Verkaufsdaten nach Standort und Produkt
    const salesData: any = {};
    salesResult.rows.forEach((row: any) => {
      const key = `${row.locationName}|${row.productName}`;
      if (!salesData[key]) {
        salesData[key] = [];
      }
      salesData[key].push({
        month: row.month,
        monthlySales: parseInt(row.monthlySales),
        monthlyQuantity: parseInt(row.monthlyQuantity),
        avgSalePrice: parseFloat(row.avgSalePrice)
      });
    });
    
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
      
      const salesKey = `${row.locationName}|${row.productName}`;
      const productSalesData = salesData[salesKey] || [];
      
      // Berechne Durchschnittswerte für die letzten 24 Monate
      const totalMonthlySales = productSalesData.reduce((sum: number, month: any) => sum + month.monthlySales, 0);
      const totalMonthlyQuantity = productSalesData.reduce((sum: number, month: any) => sum + month.monthlyQuantity, 0);
      const avgWeeklySales = totalMonthlySales > 0 ? (totalMonthlySales / Math.max(productSalesData.length, 1)) / 4.33 : 0; // ~4.33 Wochen pro Monat
      
      const productData = {
        productName: row.productName,
        totalRemoved: parseInt(row.totalRemoved),
        removalEvents: parseInt(row.removalEvents),
        avgPerEvent: parseFloat(row.avgPerEvent),
        avgPurchasePrice: row.avgPurchasePrice ? parseFloat(row.avgPurchasePrice) : 0,
        locationLoss: row.locationLoss ? parseFloat(row.locationLoss) : 0,
        rankAtLocation: parseInt(row.rankAtLocation),
        salesAnalysis: {
          avgWeeklySales: Math.round(avgWeeklySales * 100) / 100,
          totalMonthlySales: totalMonthlySales,
          totalMonthsWithData: productSalesData.length,
          monthlySalesData: productSalesData
        }
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

// Raw Data API für detaillierte Entnahmen-Tabelle mit Filtering und Pagination
router.get('/raw-data', async (req, res) => {
  try {
    const {
      machine_id,
      from_date,
      to_date,
      operator,
      product_name,
      sort_by = 'refill_date',
      sort_order = 'DESC',
      page = '1',
      limit = '50'
    } = req.query;

    console.log('[RAW-DATA] Request params:', req.query);

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    // Base query mit allen erforderlichen Feldern
    let query = `
      SELECT 
        r.created_at as refill_date,
        m.machine_name as machine_name,
        r.machine_id,
        rd.product_name,
        r.operator,
        rd.removed as removed_quantity,
        (rd.removed * COALESCE(p.cost_price, pc.unit_price, 2.0)) as estimated_loss,
        COUNT(*) OVER() as total_count
      FROM refills r
      JOIN refill_details rd ON r.id = rd.refill_id  
      JOIN machines m ON r.machine_id = m.id
      LEFT JOIN products p ON rd.product_name = p.product_name
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true
      WHERE rd.removed > 0
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Filter anwenden
    if (from_date) {
      query += ` AND r.created_at >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      query += ` AND r.created_at <= $${paramIndex}`;
      params.push(to_date + ' 23:59:59'); // Ende des Tages
      paramIndex++;
    }

    if (machine_id) {
      query += ` AND r.machine_id = $${paramIndex}`;
      params.push(parseInt(machine_id as string));
      paramIndex++;
    }

    if (operator) {
      query += ` AND r.operator ILIKE $${paramIndex}`;
      params.push(`%${operator}%`);
      paramIndex++;
    }

    if (product_name) {
      query += ` AND rd.product_name ILIKE $${paramIndex}`;
      params.push(`%${product_name}%`);
      paramIndex++;
    }

    // Sortierung validieren und anwenden
    const validSortColumns = ['refill_date', 'machine_name', 'product_name', 'operator', 'removed_quantity', 'estimated_loss'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sort_by as string) ? sort_by : 'refill_date';
    const sortDirection = validSortOrders.includes((sort_order as string).toUpperCase()) ? 
      (sort_order as string).toUpperCase() : 'DESC';

    query += ` ORDER BY ${sortColumn} ${sortDirection}`;

    // Pagination
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), offset);

    console.log('[RAW-DATA] Executing query with params:', params);
    const result = await pool.query(query, params);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    const totalPages = Math.ceil(totalCount / parseInt(limit as string));

    const data = result.rows.map(row => ({
      refill_date: row.refill_date,
      machine_name: row.machine_name,
      machine_id: row.machine_id,
      product_name: row.product_name,
      operator: row.operator || 'Unbekannt',
      removed_quantity: parseInt(row.removed_quantity),
      estimated_loss: parseFloat(row.estimated_loss) || 0
    }));

    const response = {
      success: true,
      data,
      pagination: {
        current_page: parseInt(page as string),
        total_pages: totalPages,
        total_count: totalCount,
        per_page: parseInt(limit as string),
        has_next: parseInt(page as string) < totalPages,
        has_prev: parseInt(page as string) > 1
      },
      filters: {
        machine_id,
        from_date,
        to_date,
        operator,
        product_name,
        sort_by: sortColumn,
        sort_order: sortDirection
      }
    };

    console.log(`[RAW-DATA] Response: ${data.length} items, page ${page}/${totalPages}, total: ${totalCount}`);
    res.json(response);

  } catch (error) {
    console.error('[RAW-DATA] Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Fehler beim Abrufen der Raw-Data',
      data: [],
      pagination: {
        current_page: 1,
        total_pages: 0,
        total_count: 0,
        per_page: 50,
        has_next: false,
        has_prev: false
      }
    });
  }
});

// Raw Data Excel Export
router.get('/raw-data/export', async (req, res) => {
  try {
    const {
      machine_id,
      from_date,
      to_date,
      operator,
      product_name
    } = req.query;

    console.log('[RAW-DATA-EXPORT] Request params:', req.query);

    // Basis-Query ohne Pagination für Export
    let query = `
      SELECT 
        r.created_at as refill_date,
        m.machine_name as machine_name,
        rd.product_name,
        r.operator,
        rd.removed as removed_quantity,
        (rd.removed * COALESCE(p.cost_price, pc.unit_price, 2.0)) as estimated_loss
      FROM refills r
      JOIN refill_details rd ON r.id = rd.refill_id  
      JOIN machines m ON r.machine_id = m.id
      LEFT JOIN products p ON rd.product_name = p.product_name
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true
      WHERE rd.removed > 0
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Filter anwenden (gleiche Logik wie beim normalen Endpoint)
    if (from_date) {
      query += ` AND r.created_at >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      query += ` AND r.created_at <= $${paramIndex}`;
      params.push(to_date + ' 23:59:59');
      paramIndex++;
    }

    if (machine_id) {
      query += ` AND r.machine_id = $${paramIndex}`;
      params.push(parseInt(machine_id as string));
      paramIndex++;
    }

    if (operator) {
      query += ` AND r.operator ILIKE $${paramIndex}`;
      params.push(`%${operator}%`);
      paramIndex++;
    }

    if (product_name) {
      query += ` AND rd.product_name ILIKE $${paramIndex}`;
      params.push(`%${product_name}%`);
      paramIndex++;
    }

    query += ` ORDER BY r.created_at DESC`;

    const result = await pool.query(query, params);

    // Excel-Export mit xlsx
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.json_to_sheet(result.rows.map(row => ({
      'Datum/Zeit': row.refill_date,
      'Automat': row.machine_name,
      'Produkt': row.product_name,
      'Mitarbeiter': row.operator || 'Unbekannt',
      'Entnahme-Menge': row.removed_quantity,
      'Geschätzter Verlust (€)': parseFloat(row.estimated_loss).toFixed(2)
    })));

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Raw Data');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=ruecklaufer-raw-data.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

    console.log(`[RAW-DATA-EXPORT] Exported ${result.rows.length} records`);

  } catch (error) {
    console.error('[RAW-DATA-EXPORT] Error:', error);
    res.status(500).json({ error: 'Fehler beim Raw-Data Export' });
  }
});

// Raw Data API für detaillierte Entnahme-Tabelle
router.get('/raw-data', async (req, res) => {
  try {
    const {
      machine_id,
      from_date,
      to_date, 
      operator,
      product_name,
      sort_by = 'refill_date',
      sort_order = 'DESC',
      page = '1',
      limit = '50'
    } = req.query;

    console.log('[RawData] API called with params:', req.query);

    let whereConditions = ['rd.removed > 0'];
    let queryParams = [];
    let paramIndex = 1;

    // Date range filter
    if (from_date) {
      whereConditions.push(`r.datetime >= $${paramIndex}::date`);
      queryParams.push(from_date);
      paramIndex++;
    }
    
    if (to_date) {
      whereConditions.push(`r.datetime <= $${paramIndex}::date + INTERVAL '1 day'`);
      queryParams.push(to_date);
      paramIndex++;
    }

    // Machine filter
    if (machine_id) {
      whereConditions.push(`r.machine_id = $${paramIndex}::integer`);
      queryParams.push(parseInt(machine_id as string));
      paramIndex++;
    }

    // Operator filter
    if (operator) {
      whereConditions.push(`LOWER(r.operator) LIKE LOWER($${paramIndex})`);
      queryParams.push(`%${operator}%`);
      paramIndex++;
    }

    // Product name filter
    if (product_name) {
      whereConditions.push(`LOWER(rd.product_name) LIKE LOWER($${paramIndex})`);
      queryParams.push(`%${product_name}%`);
      paramIndex++;
    }

    // Build ORDER BY clause
    const validSortColumns = ['refill_date', 'machine_name', 'product_name', 'operator', 'removed_quantity', 'estimated_loss'];
    const orderBy = validSortColumns.includes(sort_by as string) ? sort_by : 'refill_date';
    const order = sort_order === 'ASC' ? 'ASC' : 'DESC';

    // Count query for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      WHERE ${whereConditions.join(' AND ')}
    `;

    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].total);

    // Calculate pagination
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const totalPages = Math.ceil(totalCount / limitNum);

    // Main data query
    const dataQuery = `
      SELECT 
        r.datetime as refill_date,
        r.machine_name,
        r.machine_id,
        rd.product_name,
        COALESCE(r.operator, 'Unbekannt') as operator,
        rd.removed as removed_quantity,
        rd.removed * COALESCE(pc.unit_price, t.price, 2.0) as estimated_loss
      FROM refill_details rd
      INNER JOIN refills r ON rd.refill_id = r.id
      LEFT JOIN products p ON rd.product_name = p.product_name
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.is_preferred = true
 AND t.machine_id = r.machine_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY 
        ${orderBy === 'refill_date' ? 'r.datetime' : 
          orderBy === 'machine_name' ? 'r.machine_name' :
          orderBy === 'product_name' ? 'rd.product_name' :
          orderBy === 'operator' ? 'r.operator' :
          orderBy === 'removed_quantity' ? 'rd.removed' :
          orderBy === 'estimated_loss' ? 'estimated_loss' : 'r.datetime'} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limitNum, offset);

    const dataResult = await pool.query(dataQuery, queryParams);

    const response = {
      success: true,
      data: dataResult.rows.map(row => ({
        refill_date: row.refill_date,
        machine_name: row.machine_name,
        machine_id: row.machine_id,
        product_name: row.product_name,
        operator: row.operator,
        removed_quantity: parseInt(row.removed_quantity),
        estimated_loss: parseFloat(row.estimated_loss) || 0
      })),
      pagination: {
        current_page: pageNum,
        total_pages: totalPages,
        total_count: totalCount,
        per_page: limitNum,
        has_next: pageNum < totalPages,
        has_prev: pageNum > 1
      },
      filters: {
        machine_id,
        from_date,
        to_date,
        operator,
        product_name,
        sort_by: orderBy,
        sort_order: order
      }
    };

    console.log(`[RawData] Response: ${dataResult.rows.length} items, page ${pageNum}/${totalPages}`);
    res.json(response);

  } catch (error) {
    console.error('[RawData] API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Raw Data',
      details: error.message
    });
  }
});

export default router;