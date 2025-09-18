import express from 'express';
import { Pool } from '@neondatabase/serverless';
import { isAuthenticated } from '../middleware/auth';
import { pool } from '../db';

const router = express.Router();

// Authentifizierung für alle Routen aktivieren
router.use(isAuthenticated);

// DEPRECATED: Legacy endpoint - wird durch /api/orders/v4 ersetzt
router.post('/save-order-direct', async (req, res) => {
  // Log für Legacy-Verwendung
  console.log('[DEPRECATED] /save-order-direct verwendet:', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
    body: req.body
  });

  // 410 Gone Response mit Migration-Information
  return res.status(410).json({
    error: 'Endpoint deprecated',
    message: 'Der Endpoint /save-order-direct ist veraltet und wurde deaktiviert.',
    migrationInfo: {
      newEndpoint: '/api/orders/v4/create',
      documentation: 'Verwenden Sie den neuen orders-v4 Endpoint für Bestellungen',
      changes: [
        'Zentrale Validierung mit Zod-Schema',
        'Unique-Constraint für order_number',
        'Idempotente Requests unterstützt',
        'Verbesserte Error-Handling'
      ]
    },
    deprecatedSince: '2025-09-18',
    removalDate: '2025-10-18'
  });

  // Der restliche Code bleibt als Backup, aber wird nicht mehr ausgeführt
  try {
    const { 
      warehouseId, 
      supplierId, 
      orderItems, 
      expectedDeliveryDate, 
      notes,
      status = 'draft'
    } = req.body;
    
    if (!warehouseId || !supplierId) {
      return res.status(400).json({ 
        error: 'Fehlende Pflichtfelder', 
        message: 'Lager und Lieferant sind erforderlich'
      });
    }
    
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ 
        error: 'Keine Bestellpositionen', 
        message: 'Die Bestellung enthält keine Positionen'
      });
    }
    
    console.log('Erstelle Bestellung direkt über neuen SQL-Endpunkt:', { warehouseId, supplierId, itemCount: orderItems.length });
    
    // Transaktion starten
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Order-Nummer generieren (Datum + Zufallszahl)
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const randomStr = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ORD-${dateStr}-${randomStr}`;
      
      // SQL-Query mit den exakten Spaltennamen aus der Datenbank
      const sql = `
        INSERT INTO orders (
          location_id, 
          supplier_id, 
          order_number, 
          status, 
          order_date, 
          expected_delivery_date, 
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const params = [
        warehouseId,          // location_id 
        supplierId,           // supplier_id
        orderNumber,          // order_number
        status,               // status
        new Date(),           // order_date
        expectedDeliveryDate ? new Date(expectedDeliveryDate) : null, // expected_delivery_date
        notes || ''           // notes
      ];
      
      console.log('SQL-Query:', sql);
      console.log('Parameter:', params);
      
      const orderResult = await client.query(sql, params);
      
      if (!orderResult.rows || orderResult.rows.length === 0) {
        throw new Error('Bestellung konnte nicht erstellt werden');
      }
      
      const newOrder = orderResult.rows[0];
      console.log('Bestellung erstellt:', newOrder);
      
      // Bestellpositionen einfügen
      for (const item of orderItems) {
        const itemSql = `
          INSERT INTO order_items (
            order_id, 
            product_id, 
            quantity, 
            unit_price, 
            unit,
            product_name
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `;
        
        const itemParams = [
          newOrder.id, 
          item.productId, 
          item.quantity, 
          item.price || 0, 
          item.unit || 'Stück',
          item.productName || 'Unbekanntes Produkt'
        ];
        
        await client.query(itemSql, itemParams);
      }
      
      // Transaktion abschließen
      await client.query('COMMIT');
      
      console.log(`Bestellung ${orderNumber} (ID: ${newOrder.id}) erfolgreich erstellt mit ${orderItems.length} Positionen`);
      
      return res.json({
        success: true,
        data: newOrder,
        message: `Bestellung ${orderNumber} erfolgreich erstellt`
      });
      
    } catch (error) {
      // Bei Fehlern Transaktion zurückrollen
      await client.query('ROLLBACK');
      console.error('SQL-Fehler beim Bestellungserstellen:', error);
      throw error;
    } finally {
      // Client freigeben
      client.release();
    }
    
  } catch (error) {
    console.error('Fehler beim Erstellen der Bestellung:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Erstellen der Bestellung', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Endpunkt zum Speichern von Bestellpositionen
router.post('/save-order-items-direct/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { items } = req.body;
    
    if (!orderId || isNaN(Number(orderId))) {
      return res.status(400).json({ 
        error: 'Ungültige Bestellungs-ID', 
        message: 'Bitte geben Sie eine gültige Bestellungs-ID an'
      });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        error: 'Keine Bestellpositionen', 
        message: 'Keine Bestellpositionen angegeben'
      });
    }
    
    console.log(`Speichere ${items.length} Bestellpositionen für Bestellung ${orderId}`);
    
    // Transaktion starten
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Vorhandene Positionen löschen
      await client.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
      
      // Neue Positionen einfügen
      for (const item of items) {
        await client.query(`
          INSERT INTO order_items (
            order_id, 
            product_id, 
            quantity, 
            unit_price, 
            unit,
            product_name
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          orderId, 
          item.productId, 
          item.quantity, 
          item.price || 0, 
          item.unit || 'Stück',
          item.productName || 'Unbekanntes Produkt'
        ]);
      }
      
      // Transaktion abschließen
      await client.query('COMMIT');
      
      return res.json({
        success: true,
        message: `${items.length} Bestellpositionen erfolgreich gespeichert`
      });
      
    } catch (error) {
      // Bei Fehlern Transaktion zurückrollen
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Client freigeben
      client.release();
    }
    
  } catch (error) {
    console.error(`Fehler beim Speichern der Bestellpositionen für Bestellung ${req.params.orderId}:`, error);
    return res.status(500).json({ 
      error: 'Fehler beim Speichern der Bestellpositionen', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

export default router;