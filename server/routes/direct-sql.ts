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

// Direkter Endpunkt für Bestellungen
router.get('/orders-direct', async (req, res) => {
  try {
    console.log('Lade Bestellungen direkt aus der Datenbank...');
    
    // Einfache und schnelle Abfrage - alle Bestellungen ohne JOINs
    const result = await pool.query(`
      SELECT * FROM orders 
      ORDER BY created_at DESC
    `);
    
    // Einfache Datenaufbereitung ohne zusätzliche Verarbeitung
    const orders = result.rows;
    
    console.log(`${orders.length} Bestellungen aus der Datenbank geladen`);
    console.log("Erste Bestellung als Beispiel:", orders[0] ? JSON.stringify(orders[0], null, 2) : "Keine Bestellungen vorhanden");
    
    return res.json(orders);
  } catch (error) {
    console.error('Fehler beim Laden der Bestellungen:', error);
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