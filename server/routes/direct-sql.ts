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
    
    // Optimierte Abfrage mit JOIN auf suppliers und warehouses, um Namen zu garantieren
    // KEIN Status-Filter, damit ALLE Bestellungen angezeigt werden (auch 'draft')
    const result = await pool.query(`
      SELECT o.*,
             COALESCE(o.supplier_name, s.name) AS supplier_name, 
             COALESCE(o.location_name, w.name) AS location_name,
             COALESCE(w.name, o.location_name) AS warehouse_name,
             COALESCE(o.warehouse_id, o.location_id) AS warehouse_id,
             s.email AS supplier_email
      FROM orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      LEFT JOIN warehouses w ON o.location_id = w.id
      ORDER BY o.created_at DESC
    `);
    
    // Daten für Frontend aufbereiten
    const orders = result.rows.map(order => {
      if (!order.supplier_name && order.supplier_id) {
        console.log(`Warnung: Lieferantenname für Bestellung ${order.id} fehlt!`);
      }
      if (!order.location_name && order.location_id) {
        console.log(`Warnung: Lagerortsname für Bestellung ${order.id} fehlt!`);
      }
      
      // Frontend-kompatible Feldnamen hinzufügen
      return {
        ...order,
        warehouseId: order.warehouse_id || order.location_id,
        warehouseName: order.warehouse_name || order.location_name || 'Unbekanntes Lager'
      };
    });
    
    console.log(`${orders.length} Bestellungen aus der Datenbank geladen`);
    
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
    
    // Bestellung mit COALESCE für Namen abfragen und Frontend-Mapping hinzufügen
    const orderResult = await pool.query(`
      SELECT o.*,
             COALESCE(o.supplier_name, s.name) AS supplier_name,
             COALESCE(o.location_name, w.name) AS location_name,
             COALESCE(w.name, o.location_name) AS warehouse_name,
             COALESCE(o.warehouse_id, o.location_id) AS warehouse_id,
             s.email AS supplier_email
      FROM orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      LEFT JOIN warehouses w ON o.location_id = w.id
      WHERE o.id = $1
    `, [orderId]);
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Bestellung nicht gefunden',
        message: `Keine Bestellung mit ID ${orderId} gefunden`,
        success: false
      });
    }
    
    // Bestellungspositionen abfragen
    const itemsResult = await pool.query(`
      SELECT 
        oi.*,
        p.name AS product_name
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
    `, [orderId]);
    
    // Daten für Frontend aufbereiten und mit korrekten Feldnamen versehen
    const orderData = {
      ...orderResult.rows[0],
      // Frontend-kompatible Feldnamen
      warehouseId: orderResult.rows[0].warehouse_id || orderResult.rows[0].location_id,
      warehouseName: orderResult.rows[0].warehouse_name || orderResult.rows[0].location_name || 'Unbekanntes Lager',
      // Bestellpositionen mit korrektem Namen
      items: itemsResult.rows
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

// Direkter Endpunkt für E-Mail-Vorlagen
router.get('/email-templates-direct', async (req, res) => {
  try {
    console.log('Lade E-Mail-Vorlagen direkt aus der Datenbank...');
    
    // Prüfe, ob die Tabelle existiert
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'email_templates'
      )
    `);
    
    // Standardvorlage erstellen (wird zurückgegeben, wenn keine Vorlage in der Datenbank existiert)
    const defaultTemplate = {
      id: 1,
      name: 'Standard-Bestellvorlage',
      subject: 'Neue Bestellung: {{orderNumber}}',
      body: `<h2>Sehr geehrte Damen und Herren,</h2>
             <p>hiermit senden wir Ihnen folgende Bestellung:</p>
             <p><strong>Bestellnummer:</strong> {{orderNumber}}</p>
             <p><strong>Lieferdatum:</strong> {{deliveryDate}}</p>
             <p><strong>Lieferadresse:</strong> {{warehouse}}</p>
             <h3>Bestellpositionen:</h3>
             <table border="1" cellpadding="5" cellspacing="0">
               <tr>
                 <th>Produkt</th>
                 <th>Menge</th>
                 <th>Einheit</th>
                 <th>Einzelpreis</th>
                 <th>Gesamtpreis</th>
               </tr>
               {{#each orderItems}}
               <tr>
                 <td>{{this.productName}}</td>
                 <td>{{this.quantity}}</td>
                 <td>{{this.unit}}</td>
                 <td>{{this.price}} €</td>
                 <td>{{this.totalPrice}} €</td>
               </tr>
               {{/each}}
             </table>
             <p><strong>Gesamtbetrag:</strong> {{totalAmount}} €</p>
             <p><strong>Notizen:</strong> {{notes}}</p>
             <p>Mit freundlichen Grüßen<br/>Ihr Smart Vending Team</p>`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_default: true
    };
    
    // Wenn die Tabelle nicht existiert oder leer ist, die Standardvorlage zurückgeben
    if (!checkTable.rows[0].exists) {
      console.log('E-Mail-Vorlagen-Tabelle existiert nicht, gebe Standardvorlage zurück');
      return res.json({
        success: true,
        data: [defaultTemplate],
        message: '1 Standard-Vorlage erstellt, da keine E-Mail-Vorlagen in der Datenbank gefunden wurden'
      });
    }
    
    const result = await pool.query(`
      SELECT * FROM email_templates 
      ORDER BY created_at DESC
    `);
    
    // Wenn keine Vorlagen in der Datenbank gefunden wurden, die Standardvorlage zurückgeben
    if (result.rows.length === 0) {
      console.log('Keine E-Mail-Vorlagen in der Datenbank gefunden, gebe Standardvorlage zurück');
      return res.json({
        success: true,
        data: [defaultTemplate],
        message: '1 Standard-Vorlage erstellt, da keine E-Mail-Vorlagen in der Datenbank gefunden wurden'
      });
    }
    
    return res.json({
      success: true,
      data: result.rows,
      message: `${result.rows.length} E-Mail-Vorlagen geladen`
    });
  } catch (error) {
    console.error('Fehler beim Laden der E-Mail-Vorlagen:', error);
    // Bei Fehler eine Standard-Vorlage zurückgeben
    return res.json({
      success: true,
      data: [{
        id: 1,
        name: 'Notfall-Bestellvorlage',
        subject: 'Neue Bestellung: {{orderNumber}}',
        body: `<h2>Sehr geehrte Damen und Herren,</h2>
               <p>hiermit bestellen wir folgende Waren:</p>
               <p><strong>Bestellnummer:</strong> {{orderNumber}}</p>
               <p><strong>Produkte:</strong></p>
               <ul>
                 {{#each orderItems}}
                 <li>{{this.productName}} - {{this.quantity}} {{this.unit}}</li>
                 {{/each}}
               </ul>
               <p>Mit freundlichen Grüßen<br/>Ihr Smart Vending Team</p>`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_default: true
      }],
      message: '1 Notfall-Vorlage erstellt, da beim Laden der E-Mail-Vorlagen ein Fehler aufgetreten ist'
    });
  }
});

// Direkter Endpunkt zum Speichern von Bestellungen
router.post('/orders-create-direct', async (req, res) => {
  try {
    const { 
      warehouseId, 
      supplierId, 
      orderItems, 
      expectedDeliveryDate, 
      notes,
      status = 'open'  // Status auf 'open' statt 'draft' setzen
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
    
    console.log('Erstelle Bestellung direkt über SQL:', { warehouseId, supplierId, itemCount: orderItems.length });
    
    // Transaktion starten
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Order-Nummer generieren (Datum + Zufallszahl)
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const randomStr = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ORD-${dateStr}-${randomStr}`;
      
      // Namen für Lieferant und Lager aus der Datenbank holen
      const supplierResult = await client.query(`
        SELECT name FROM suppliers WHERE id = $1
      `, [supplierId]);
      
      const warehouseResult = await client.query(`
        SELECT name FROM warehouses WHERE id = $1
      `, [warehouseId]);
      
      const supplierName = supplierResult.rows.length > 0 ? supplierResult.rows[0].name : null;
      const locationName = warehouseResult.rows.length > 0 ? warehouseResult.rows[0].name : null;
      
      console.log(`Namen gefunden: Lieferant "${supplierName}", Lager "${locationName}"`);
      
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
          supplier_name,
          location_name, 
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        warehouseId,  // Das Warehouse-ID wird in location_id gespeichert
        supplierId, 
        orderNumber, 
        status, 
        new Date(), 
        expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
        supplierName,
        locationName, 
        notes || ''
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

// Direkter Endpunkt zum Speichern von Bestellpositionen separat
router.post('/order-items-direct/:orderId', async (req, res) => {
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
      // Verwende die korrekten Spaltennamen aus der Datenbankstruktur
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

// Direkter Endpunkt für Bestellpositionen zum Laden
router.get('/order-items-direct/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId || isNaN(Number(orderId))) {
      return res.status(400).json({ 
        error: 'Ungültige Bestellungs-ID', 
        message: 'Bitte geben Sie eine gültige Bestellungs-ID an'
      });
    }
    
    console.log(`Lade Bestellpositionen für Bestellung ${orderId} direkt aus der Datenbank...`);
    
    // SQL-Abfrage für Bestellpositionen ohne JOIN auf products
    // Wir nutzen direkt die Daten aus der order_items Tabelle
    const result = await pool.query(`
      SELECT *
      FROM order_items
      WHERE order_id = $1
      ORDER BY id ASC
    `, [orderId]);
    
    return res.json({
      success: true,
      data: result.rows,
      message: `${result.rows.length} Bestellpositionen für Bestellung ${orderId} geladen`
    });
  } catch (error) {
    console.error(`Fehler beim Laden der Bestellpositionen für Bestellung ${req.params.orderId}:`, error);
    return res.status(500).json({ 
      error: 'Fehler beim Laden der Bestellpositionen', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Direkter Endpunkt für Lager
router.get('/warehouses-direct', async (req, res) => {
  try {
    console.log('Lade Lager direkt aus der Datenbank...');
    
    const result = await pool.query(`
      SELECT * FROM warehouses 
      ORDER BY name ASC
    `);
    
    return res.json(formatDirectResponse(result.rows, 'Lager'));
  } catch (error) {
    console.error('Fehler beim Laden der Lager:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Direkter Endpunkt zum Erstellen von Bestellungen
router.post('/orders-direct', async (req, res) => {
  try {
    console.log('Erstelle Bestellung direkt in der Datenbank...');
    console.log('Bestellungsdaten:', req.body);
    
    const {
      supplierId,
      supplierName,
      warehouseId,
      warehouseName,
      expectedDeliveryDate,
      products,
      priority,
      notes
    } = req.body;
    
    if (!supplierId || !warehouseId) {
      return res.status(400).json({
        success: false,
        error: 'Fehlende Pflichtfelder',
        message: 'Lieferanten-ID und Lager-ID sind erforderlich'
      });
    }
    
    // Generiere Bestellnummer
    const now = new Date();
    const formattedDate = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomNumber = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${formattedDate.substring(2)}-${randomNumber}`;
    
    // Berechne Gesamtbetrag
    let totalAmount = 0;
    if (Array.isArray(products)) {
      for (const product of products) {
        if (product.price && product.quantity) {
          totalAmount += Number(product.price) * Number(product.quantity);
        }
      }
    }
    
    // Erstelle Bestellung in der Datenbank
    const result = await pool.query(`
      INSERT INTO orders (
        order_number, 
        supplier_id, 
        supplier_name, 
        location_id, 
        location_name, 
        status, 
        order_date, 
        expected_delivery_date, 
        total_amount, 
        currency, 
        created_by_id,
        created_by_name,
        notes,
        priority
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING *
    `, [
      orderNumber,
      supplierId,
      supplierName,
      warehouseId,
      warehouseName,
      'draft', // Standardstatus für neue Bestellungen
      now.toISOString(),
      expectedDeliveryDate || null,
      totalAmount,
      'EUR', // Standardwährung
      1, // Annahme: Admin-Benutzer mit ID 1
      'System',
      notes || '',
      priority || 'normal'
    ]);
    
    const order = result.rows[0];
    
    // Füge Bestellpositionen hinzu, wenn vorhanden
    if (Array.isArray(products) && products.length > 0) {
      for (const product of products) {
        await pool.query(`
          INSERT INTO order_items (
            order_id,
            product_id,
            product_name,
            quantity,
            unit,
            price,
            total_price
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7
          )
        `, [
          order.id,
          product.id || null,
          product.name || product.productName,
          product.quantity || 0,
          product.unit || 'Stück',
          product.price || 0,
          (product.price && product.quantity) ? product.price * product.quantity : 0
        ]);
      }
    }
    
    return res.json({
      success: true,
      message: 'Bestellung erfolgreich erstellt',
      data: order
    });
    
  } catch (error) {
    console.error('Fehler beim Erstellen der Bestellung:', error);
    return res.status(500).json({
      success: false,
      error: 'Datenbankfehler',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;