import express from 'express';
import { pool } from '../db';

const router = express.Router();

// Hilfsfunktion zum Formatieren der Antwort für bestimmte Endpunkte
const formatDirectResponse = (rows: any[], message: string) => {
  console.log(`${message}: ${rows.length} Einträge gefunden`);
  return {
    success: true,
    data: rows,
    message: `${rows.length} Einträge erfolgreich geladen`
  };
};

// Direkter SQL-Zugriff für Bestellungen
router.post('/execute-sql', async (req, res) => {
  try {
    const { query, params } = req.body;
    
    console.log('Direkte SQL-Abfrage:', query);
    
    if (!query) {
      return res.status(400).json({ 
        error: 'Fehlende SQL-Abfrage', 
        message: 'Keine SQL-Abfrage angegeben' 
      });
    }
    
    // SQL-Abfrage ausführen
    const result = await pool.query(query, params || []);
    
    return res.json({
      rows: result.rows,
      rowCount: result.rowCount,
      success: true
    });
  } catch (error) {
    console.error('Fehler bei SQL-Abfrage:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// BLITZSCHNELLER Endpunkt für Bestellungsübersicht
router.get('/orders-quick', async (req, res) => {
  try {
    console.log('⚡ BLITZSCHNELLE Bestellungsübersicht...');
    
    const result = await pool.query(`
      SELECT 
        id, 
        order_number, 
        status, 
        created_at,
        supplier_name, 
        location_name,
        total_amount,
        expected_delivery_date
      FROM orders 
      ORDER BY id DESC 
      LIMIT 15
    `);
    
    console.log(`⚡ ${result.rows.length} Bestellungen in Millisekunden geladen`);
    
    return res.json(result.rows);
    
  } catch (error) {
    console.error('❌ Schnellfehler:', error);
    return res.status(500).json({ 
      error: 'Fehler', 
      message: error instanceof Error ? error.message : 'Unbekannt' 
    });
  }
});

// ULTRA-SCHNELLER Endpunkt nur für Bestellungsübersicht
router.get('/orders-direct', async (req, res) => {
  try {
    console.log('🚀 SCHNELLE Bestellungsübersicht wird geladen...');
    
    // SOFORTIGE Antwort mit minimalen Daten
    const result = await pool.query(`
      SELECT 
        o.id, 
        o.order_number, 
        o.status, 
        o.created_at::text as created_at,
        o.order_date::text as order_date,
        COALESCE(o.supplier_name, s.name) as supplier_name, 
        COALESCE(o.location_name, w.name) as warehouse_name,
        o.total_amount,
        o.expected_delivery_date::text as expected_delivery_date,
        COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      LEFT JOIN warehouses w ON o.warehouse_id = w.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      GROUP BY o.id, o.order_number, o.status, o.created_at, o.order_date, 
               o.supplier_name, s.name, o.location_name, w.name, o.total_amount, o.expected_delivery_date
      ORDER BY o.id DESC 
      LIMIT 50
    `);
    
    const orders = result.rows;
    
    console.log(`✅ ${orders.length} Bestellungen SOFORT geladen`);
    
    // Sofortige Antwort ohne weitere Verarbeitung
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(orders);
    
  } catch (error) {
    console.error('❌ Fehler beim schnellen Laden:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

// Direkter Endpunkt für einzelne Bestellung mit ID
router.get('/orders-direct/:id', async (req, res) => {
  try {
    const orderId = req.params.id;
    
    if (!orderId || isNaN(Number(orderId))) {
      return res.status(400).json({
        error: 'Ungültige Bestellungs-ID',
        message: 'Die angegebene Bestellungs-ID ist ungültig',
        success: false
      });
    }
    
    console.log(`Lade Bestellung mit ID ${orderId} direkt aus der Datenbank...`);
    
    // Bestellung ohne komplexe JOINs abfragen
    const orderResult = await pool.query(`
      SELECT * FROM orders WHERE id = $1
    `, [orderId]);
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Bestellung nicht gefunden',
        message: `Keine Bestellung mit ID ${orderId} gefunden`,
        success: false
      });
    }
    
    // Lieferantendaten holen, wenn vorhanden
    let supplierData = null;
    if (orderResult.rows[0].supplier_id) {
      const supplierQuery = await pool.query(`
        SELECT * FROM suppliers WHERE id = $1
      `, [orderResult.rows[0].supplier_id]);
      
      supplierData = supplierQuery.rows.length > 0 ? supplierQuery.rows[0] : null;
    }
    
    // Lagerdaten holen, wenn vorhanden
    let warehouseData = null;
    if (orderResult.rows[0].location_id) {
      const warehouseQuery = await pool.query(`
        SELECT * FROM warehouses WHERE id = $1
      `, [orderResult.rows[0].location_id]);
      
      warehouseData = warehouseQuery.rows.length > 0 ? warehouseQuery.rows[0] : null;
    }
    
    // Bestellpositionen abfragen ohne JOIN, um keinen Fehler zu bekommen
    const itemsResult = await pool.query(`
      SELECT * FROM order_items WHERE order_id = $1
    `, [orderId]);
    
    // Daten für Frontend aufbereiten
    const orderItems = itemsResult.rows;
    
    // Daten für Frontend aufbereiten und mit korrekten Feldnamen versehen
    const orderData = {
      ...orderResult.rows[0],
      // Frontend-kompatible Feldnamen
      warehouseId: orderResult.rows[0].warehouse_id || orderResult.rows[0].location_id,
      warehouseName: warehouseData ? warehouseData.name : (orderResult.rows[0].location_name || 'Unbekanntes Lager'),
      supplierName: supplierData ? supplierData.name : (orderResult.rows[0].supplier_name || 'Unbekannter Lieferant'),
      supplierEmail: supplierData ? supplierData.email : (orderResult.rows[0].supplier_email || ''),
      // Bestellpositionen
      items: orderItems
    };
    
    return res.json(orderData);
  } catch (error) {
    console.error(`Fehler beim Laden der Bestellung:`, error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Direkter Endpunkt für Bestellpositionen einer bestimmten Bestellung
router.get('/order-items-direct/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    
    if (!orderId || isNaN(Number(orderId))) {
      return res.status(400).json({
        error: 'Ungültige Bestellungs-ID',
        message: 'Die angegebene Bestellungs-ID ist ungültig',
        success: false
      });
    }
    
    console.log(`Lade Bestellpositionen für Bestellung ${orderId} direkt aus der Datenbank...`);
    
    // Bestellungspositionen abfragen ohne JOIN, um keinen Fehler zu bekommen
    const itemsResult = await pool.query(`
      SELECT * FROM order_items WHERE order_id = $1
    `, [orderId]);
    
    // Bestellpositionen für Frontend aufbereiten
    const orderItems = itemsResult.rows.map(item => {
      // Frontend-kompatible Feldnamen
      return {
        ...item,
        // Stelle sicher, dass alle Frontend-Daten vorhanden sind, auch wenn im Backend andere Namen verwendet werden
        productName: item.product_name || '',
        orderId: item.order_id,
        productId: item.product_id,
        quantity: item.quantity || 0,
        quantityDelivered: item.quantity_delivered || 0,
        unitPrice: item.unit_price || 0,
        totalPrice: item.total_price || 0,
        vatRate: item.vat_rate || 0,
        vatAmount: item.vat_amount || 0,
        discountAmount: item.discount_amount || 0,
        targetMachineId: item.target_machine_id || null,
        targetMachineName: item.target_machine_name || null,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      };
    });
    
    return res.json({
      success: true,
      data: orderItems,
      message: `${orderItems.length} Bestellpositionen für Bestellung ${orderId} geladen`
    });
  } catch (error) {
    console.error(`Fehler beim Laden der Bestellpositionen:`, error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Direkter Endpunkt für Lieferanten
router.get('/suppliers-direct', async (req, res) => {
  try {
    console.log('Lade Lieferanten direkt aus der Datenbank...');
    
    const result = await pool.query(`
      SELECT * FROM suppliers 
      ORDER BY name ASC
    `);
    
    return res.json(formatDirectResponse(result.rows, 'Lieferanten'));
  } catch (error) {
    console.error('Fehler beim Laden der Lieferanten:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Direkter Endpunkt für Lagerhäuser
router.get('/warehouses-direct', async (req, res) => {
  try {
    console.log('Lade Lagerhäuser direkt aus der Datenbank...');
    
    const result = await pool.query(`
      SELECT * FROM warehouses 
      WHERE is_active = true
      ORDER BY name ASC
    `);
    
    return res.json(formatDirectResponse(result.rows, 'Lagerhäuser'));
  } catch (error) {
    console.error('Fehler beim Laden der Lagerhäuser:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Direkter Endpunkt für Produkte
router.get('/products-direct', async (req, res) => {
  try {
    console.log('Lade Produkte direkt aus der Datenbank...');
    
    let query = `
      SELECT p.*,
             s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
    `;
    
    // Optionale Filterung nach Lieferant
    const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string) : null;
    
    if (supplierId && !isNaN(supplierId)) {
      query += ` WHERE p.supplier_id = ${supplierId}`;
    }
    
    query += ` ORDER BY p.name ASC`;
    
    const result = await pool.query(query);
    
    return res.json(formatDirectResponse(result.rows, 'Produkte'));
  } catch (error) {
    console.error('Fehler beim Laden der Produkte:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

export default router;