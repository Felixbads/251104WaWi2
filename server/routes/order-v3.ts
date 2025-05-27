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
    
    console.log('Empfangene Bestelldaten:', JSON.stringify(req.body, null, 2));
    console.log('OrderItems Type:', typeof orderItems, 'Is Array:', Array.isArray(orderItems), 'Length:', orderItems?.length);
    
    // Prüfe auch, ob orderItems eventuell unter einem anderen Schlüssel übertragen wird
    const actualOrderItems = orderItems || req.body.items || req.body.products || [];
    console.log('Actual OrderItems:', actualOrderItems);
    
    if (!actualOrderItems || !Array.isArray(actualOrderItems) || actualOrderItems.length === 0) {
      return res.status(400).json({ 
        error: 'Mindestens ein Artikel muss bestellt werden', 
        message: 'Die Bestellung enthält keine gültigen Positionen',
        receivedItems: orderItems,
        actualItems: actualOrderItems,
        bodyKeys: Object.keys(req.body)
      });
    }
    
    console.log('Erstelle Bestellung direkt über SQL-Router:', { warehouseId, supplierId, itemCount: orderItems.length });
    
    // Transaktion starten
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Berechne den Gesamtbetrag basierend auf den Bestellpositionen
      let totalAmount = 0;
      if (Array.isArray(orderItems)) {
        for (const item of orderItems) {
          const itemPrice = Number(item.price) || 0;
          const itemQuantity = Number(item.quantity) || 0;
          totalAmount += itemPrice * itemQuantity;
        }
      }
      
      // Bestellnummer im Format ORD-YYYYMMDD-XXXX generieren
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;
      const randomStr = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ORD-${dateStr}-${randomStr}`;
      
      // Formatieren des Datums korrekt für PostgreSQL
      const orderDate = new Date();
      let deliveryDate = null;
      if (expectedDeliveryDate) {
        // Wenn das Datum nur als YYYY-MM-DD String kommt, korrigieren wir das Format
        if (typeof expectedDeliveryDate === 'string') {
          // ISO-Datum erstellen mit Uhrzeit auf 12 Uhr mittags
          deliveryDate = new Date(`${expectedDeliveryDate}T12:00:00`);
        } else {
          deliveryDate = new Date(expectedDeliveryDate);
        }
      }
      
      console.log('Order mit diesen Daten erstellen:', {
        location_id: warehouseId,
        supplier_id: supplierId,
        order_number: orderNumber,
        status,
        order_date: orderDate,
        expected_delivery_date: deliveryDate,
        total_amount: totalAmount
      });
      
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
          payment_status,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [
        warehouseId,  // Das Warehouse-ID wird in location_id gespeichert
        supplierId, 
        orderNumber, 
        status, 
        orderDate, 
        deliveryDate, 
        notes || '',
        priority || 'normal',
        1,  // Admin User ID
        'System',
        'EUR',
        totalAmount,  // total_amount berechnet
        'pending', // payment_status
        new Date(),  // created_at
        new Date()   // updated_at
      ]);
      
      const newOrder = orderResult.rows[0];
      
      // Bestellpositionen einfügen
      // Verwende die korrekten Spaltennamen aus der Datenbankstruktur
      for (const item of orderItems) {
        const productId = item.productId || null;
        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.price) || 0;
        const productName = item.productName || 'Unbekanntes Produkt';
        const unit = item.unit || 'Stück';
        const totalPrice = unitPrice * quantity;
        
        console.log('Füge Bestellposition hinzu:', {
          order_id: newOrder.id,
          product_id: productId,
          product_name: productName,
          quantity,
          unit_price: unitPrice,
          total_price: totalPrice
        });
        
        await client.query(`
          INSERT INTO order_items (
            order_id, 
            product_id, 
            quantity, 
            unit_price, 
            unit,
            product_name,
            total_price,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          newOrder.id, 
          productId, 
          quantity, 
          unitPrice, 
          unit,
          productName,
          totalPrice,  // Berechnung des Gesamtpreises
          new Date(),  // created_at
          new Date()   // updated_at
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