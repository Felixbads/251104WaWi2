import express from 'express';
import { pool } from '../db';

const router = express.Router();

// Kein Authentifizierungszwang für diese Testrouten, um einfacher zu debuggen

// Direkter Endpunkt zum Speichern von Bestellungen für BestellungV3
router.post('/create-order-v3', async (req, res) => {
  try {
    const { 
      warehouseId, 
      supplierId, 
      orderItems, 
      expectedDeliveryDate, 
      notes,
      status = 'draft',
      priority = 'normal'
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
    
    console.log('Erstelle Bestellung direkt über SQL-Router:', { warehouseId, supplierId, itemCount: orderItems.length });
    
    // Transaktion starten
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Order-Nummer generieren (Datum + Zufallszahl)
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const randomStr = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ORD-${dateStr}-${randomStr}`;
      
      // Bestellung in die Datenbank einfügen
      // Verwende die korrekten Spaltennamen aus der Datenbankstruktur
      const orderResult = await client.query(`
        INSERT INTO orders (
          location_id, 
          supplier_id, 
          order_number, 
          status, 
          order_date, 
          expected_delivery_date, 
          notes,
          priority,
          created_by_id,
          created_by_name,
          currency,
          total_amount,
          payment_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        warehouseId,  // Das Warehouse-ID wird in location_id gespeichert
        supplierId, 
        orderNumber, 
        status, 
        new Date(), 
        expectedDeliveryDate ? new Date(expectedDeliveryDate) : null, 
        notes || '',
        priority,
        1,  // Admin User ID
        'System',
        'EUR',
        0,  // total_amount
        'pending' // payment_status
      ]);
      
      const newOrder = orderResult.rows[0];
      
      // Bestellpositionen einfügen
      // Verwende die korrekten Spaltennamen aus der Datenbankstruktur
      for (const item of orderItems) {
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
          newOrder.id, 
          item.productId, 
          item.quantity, 
          item.price || 0, 
          item.unit || 'Stück',
          item.productName || 'Unbekanntes Produkt'
        ]);
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
      
      console.error('Fehler beim Erstellen der Bestellung:', error);
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

export default router;