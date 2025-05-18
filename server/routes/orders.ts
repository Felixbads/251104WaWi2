import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, SQL } from 'drizzle-orm';
import { 
  orders, 
  orderItems,
  suppliers,
  products,
  warehouses,
  inventoryMovements,
  users,
  inventoryItems
} from '../../shared/schema';
// Direkte sendEmail Funktion anstelle des Imports
function sendEmail(to: string, from: string, subject: string, html: string) {
  // Einfache E-Mail-Sende-Funktion
  console.log(`Sending email to ${to} from ${from} with subject "${subject}"`);
  // Hier würde normalerweise der E-Mail-Versand stattfinden
  return Promise.resolve(true);
}

const router = Router();

// Hilfsfunktion zum Erstellen einer E-Mail-Vorlage für Bestellungen
function createOrderEmailTemplate(order: any, supplier: any, templateType: string = 'standard') {
  const now = new Date().toLocaleDateString('de-DE');
  const deliveryDate = order.expectedDeliveryDate 
    ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE') 
    : 'so bald wie möglich';
  
  // Basis-Template je nach Typ
  switch(templateType) {
    case 'dringend':
    case 'urgent':
      return `Sehr geehrte Damen und Herren,

DRINGENDE BESTELLUNG - Bitte um bevorzugte Bearbeitung!

hiermit bestellen wir dringend folgende Artikel mit der Bestellnummer ${order.orderNumber}:

{{orderItems}}

Bitte liefern Sie die Ware bis spätestens ${deliveryDate}.
Bei Rückfragen erreichen Sie uns unter der Telefonnummer: 030 123456789.

Vielen Dank für die schnelle Bearbeitung.

Mit freundlichen Grüßen
Ihr Proviantomat Team`;
    
    case 'nachbestellung':
    case 'reorder':
      return `Sehr geehrte Damen und Herren,

hiermit senden wir Ihnen eine Nachbestellung zu unserer ursprünglichen Bestellung.

Bestellnummer: ${order.orderNumber}
Datum: ${now}

Folgende Artikel bestellen wir nach:

{{orderItems}}

Lieferung bitte bis zum ${deliveryDate}.

Mit freundlichen Grüßen
Ihr Proviantomat Team`;
      
    default: // Standard-Template
      return `Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

{{orderItems}}

Bestellnummer: ${order.orderNumber}
Gewünschter Liefertermin: ${deliveryDate}

${order.notes ? 'Hinweise: ' + order.notes + '\n' : ''}
Mit freundlichen Grüßen
Ihr Proviantomat Team`;
  }
}

// Hilfsfunktion zum Erstellen einer HTML-Tabelle mit Bestellpositionen
function createOrderItemsTable(items: any[]): string {
  if (!items || items.length === 0) {
    return 'Keine Artikel in dieser Bestellung.';
  }
  
  // HTML-Tabelle erstellen
  let tableHtml = `
<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
  <thead>
    <tr style="background-color: #f2f2f2;">
      <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Artikel</th>
      <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Menge</th>
      <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Einheit</th>
      <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Einzelpreis</th>
      <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Gesamt</th>
    </tr>
  </thead>
  <tbody>`;
  
  // Zeilen für jeden Artikel
  items.forEach((item, index) => {
    const productName = item.productName || item.name || 'Unbekannter Artikel';
    const quantity = item.quantity || item.orderQuantity || 1;
    const unit = item.unit || 'Stk.';
    const price = typeof item.price === 'number' ? item.price : 
                 (typeof item.price === 'string' ? parseFloat(item.price) : 0);
    const total = price * quantity;
    
    const bgColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
    
    tableHtml += `
    <tr style="background-color: ${bgColor};">
      <td style="border: 1px solid #ddd; padding: 8px;">${productName}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${quantity}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${unit}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${price.toFixed(2)} €</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${total.toFixed(2)} €</td>
    </tr>`;
  });
  
  // Gesamtsumme berechnen
  const subtotal = items.reduce((sum, item) => {
    const quantity = item.quantity || item.orderQuantity || 1;
    const price = typeof item.price === 'number' ? item.price : 
                 (typeof item.price === 'string' ? parseFloat(item.price) : 0);
    return sum + (price * quantity);
  }, 0);
  
  // Tabelle abschließen mit Gesamtsumme
  tableHtml += `
  </tbody>
  <tfoot>
    <tr style="background-color: #f2f2f2; font-weight: bold;">
      <td colspan="4" style="border: 1px solid #ddd; padding: 8px; text-align: right;">Gesamtsumme:</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${subtotal.toFixed(2)} €</td>
    </tr>
  </tfoot>
</table>`;
  
  return tableHtml;
}

// Alle Bestellungen abrufen
router.get('/orders', async (req: Request, res: Response) => {
  try {
    // Paginierungsparameter
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    
    // Filter & Suche
    let statusFilter = req.query.status as string;
    const searchTerm = req.query.search as string;
    
    // Sortierung
    const sortField = req.query.sortField as string || 'orderDate';
    const sortOrder = (req.query.sortOrder as string || 'desc') === 'asc' ? asc : desc;

    // Benutzer-basierte Filterung
    let userConstraints: any[] = [];
    if (req.user && req.user.role !== 'admin') {
      if (req.user.locationId) {
        userConstraints.push(eq(orders.locationId, req.user.locationId));
      }
      
      if (req.user.warehouseIds && Array.isArray(req.user.warehouseIds)) {
        userConstraints.push(inArray(orders.warehouseId, req.user.warehouseIds));
      }
    }
    
    // Erstelle die Basisabfrage für die Zählung und die eigentliche Datenabfrage
    let countQuery = db.select({ count: SQL`count(*)` }).from(orders);
    let query = db.select().from(orders);

    // Status-Filter hinzufügen, wenn definiert
    if (statusFilter) {
      countQuery = countQuery.where(eq(orders.status, statusFilter));
      query = query.where(eq(orders.status, statusFilter));
    }
    
    // Suchfilter hinzufügen, wenn definiert
    if (searchTerm) {
      const searchFilter = or(
        ilike(orders.orderNumber, `%${searchTerm}%`),
        ilike(orders.supplierName, `%${searchTerm}%`)
      );
      countQuery = countQuery.where(searchFilter);
      query = query.where(searchFilter);
    }
    
    // Benutzerberechtigungen hinzufügen, falls nötig
    if (userConstraints.length > 0) {
      countQuery = countQuery.where(or(...userConstraints));
      query = query.where(or(...userConstraints));
    }
    
    // Sortierung und Paginierung für die Hauptabfrage
    query = query
      .orderBy(sortField === 'id' ? orders.id : 
               sortField === 'orderDate' ? orders.orderDate : 
               sortField === 'expectedDeliveryDate' ? orders.expectedDeliveryDate : 
               sortField === 'supplierName' ? orders.supplierName : 
               sortField === 'totalAmount' ? orders.totalAmount : 
               sortField === 'status' ? orders.status : 
               orders.orderDate, sortOrder)
      .limit(limit)
      .offset(offset);
    
    // Führe beide Abfragen parallel aus
    const [countResult, data] = await Promise.all([
      countQuery,
      query
    ]);

    // Extrahiere die Anzahl aus dem Ergebnis
    const totalCount = parseInt(countResult[0].count.toString());
    
    // Berechne die Gesamtanzahl an Seiten
    const totalPages = Math.ceil(totalCount / limit);
    
    // Daten-Sanitization für Datumsfelder, um Fehler beim Parsen zu vermeiden
    const sanitizedData = data.map(order => {
      // Fallback für erwartetes Lieferdatum (häufigste Fehlerquelle)
      if (order.expectedDeliveryDate === null || order.expectedDeliveryDate === undefined) {
        // In diesem Fall entfernen wir das Feld komplett statt null zu haben
        const { expectedDeliveryDate, ...rest } = order;
        return rest;
      }
      return order;
    });
    
    // Setze explizit Content-Type Header für JSON-Antwort
    res.setHeader('Content-Type', 'application/json');
    console.log("Sende Bestellungen-Daten zurück:", sanitizedData.length);
    
    // Setze den Status auf 200 OK und sende direkt das Array zurück
    res.status(200).json(sanitizedData);
  } catch (error) {
    console.error('Fehler beim Abrufen der Bestellungen:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Bestellungen' });
  }
});

// Bestellung erstellen
router.post('/orders', async (req: Request, res: Response) => {
  try {
    const {
      warehouseId,
      supplierId,
      expectedDeliveryDate,
      priority = 'normal',
      notes = '',
      items
    } = req.body;
    
    // Validierung der Pflichtfelder
    if (!warehouseId || !supplierId) {
      return res.status(400).json({ error: 'Lager und Lieferant müssen angegeben werden' });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Mindestens ein Artikel muss bestellt werden' });
    }
    
    // Validieren und Konvertieren von expectedDeliveryDate
    let parsedDeliveryDate: Date | null = null;
    if (expectedDeliveryDate && typeof expectedDeliveryDate === 'string') {
      // Normalisieren des Datums auf YYYY-MM-DD Format oder null
      if (/^\d{4}-\d{2}-\d{2}$/.test(expectedDeliveryDate)) {
        // Das Datum ist bereits im richtigen Format YYYY-MM-DD
        parsedDeliveryDate = new Date(expectedDeliveryDate);
      } else {
        // Versuche andere Formate zu parsen
        try {
          const tempDate = new Date(expectedDeliveryDate);
          if (!isNaN(tempDate.getTime())) {
            parsedDeliveryDate = tempDate;
          }
        } catch (e) {
          console.warn("Ungültiges Datumsformat, verwende Standarddatum:", e);
        }
      }
    }
    
    // Abrufen von Lager- und Lieferanteninformationen
    const warehouseResult = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.id, warehouseId))
      .limit(1);
    
    const supplierResult = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);
    
    if (!warehouseResult.length || !supplierResult.length) {
      return res.status(400).json({ error: 'Lager oder Lieferant existiert nicht' });
    }
    
    const warehouse = warehouseResult[0];
    const supplier = supplierResult[0];
    
    // Bestellnummer generieren
    const today = new Date();
    const dateString = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
    
    // Neueste Bestellnummer für heute abrufen
    const latestOrderQuery = await db
      .select()
      .from(orders)
      .where(
        ilike(orders.orderNumber, `ORD-${dateString}-%`)
      )
      .orderBy(desc(orders.orderNumber))
      .limit(1);
    
    let sequenceNumber = 1;
    if (latestOrderQuery.length > 0) {
      const latestOrderNumber = latestOrderQuery[0].orderNumber;
      const match = latestOrderNumber.match(/ORD-\d{8}-(\d+)/);
      if (match) {
        sequenceNumber = parseInt(match[1]) + 1;
      }
    }
    
    const orderNumber = `ORD-${dateString}-${sequenceNumber.toString().padStart(3, '0')}`;
    
    // Benutzerinformation (wenn verfügbar)
    const userId = req.user?.id || null;
    const userName = req.user?.username || null;
    const userEmail = req.user?.email || null;
    const userRole = req.user?.role || null;
    
    // Bestellung erstellen
    try {
      const insertedOrder = await db
        .insert(orders)
        .values({
          orderNumber,
          supplierId,
          supplierName: supplier.name,
          locationId: warehouse.locationId,
          locationName: warehouse.locationName,
          status: 'draft', // Entwurf
          orderDate: new Date(),
                // Verwende das zuvor validierte und konvertierte Datum
          ...(parsedDeliveryDate ? { expectedDeliveryDate: parsedDeliveryDate } : {}),
          notes,
          createdBy: userId,
          createdByName: userName,
          createdByEmail: userEmail,
          createdByRole: userRole,
          priority,
          itemCount: items.length,
        })
        .returning();
      
      const newOrder = insertedOrder[0];
      
      // Bestellpositionen hinzufügen
      const orderItemPromises = items.map(async (item: any) => {
        try {
          // Produktnamen abrufen, falls nur ProductID übergeben wurde
          let productName = item.productName;
          if (item.productId && !productName) {
            const productResult = await db
              .select()
              .from(products)
              .where(eq(products.id, item.productId))
              .limit(1);
            
            if (productResult.length > 0) {
              productName = productResult[0].name;
            }
          }
          
          return db
            .insert(orderItems)
            .values({
              orderId: newOrder.id,
              productId: item.productId || null,
              productName: productName || item.productName || 'Unbekanntes Produkt',
              sku: item.sku || null,
              supplierSku: item.supplierSku || null,
              quantity: item.quantity,
              unit: item.unit || 'Stk.',
              price: item.price || null,
              discountPercent: item.discountPercent || 0,
              notes: item.notes || null,
              expectedDeliveryDate: item.expectedDeliveryDate ? new Date(item.expectedDeliveryDate) : null,
            });
        } catch (itemError) {
          console.error('Fehler beim Erstellen eines Bestelleintrags:', itemError);
          // Fehler protokollieren, aber weitermachen
        }
      });
      
      await Promise.all(orderItemPromises);
      
      // Bestellung mit Positionen zurückgeben
      const orderItemsResult = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, newOrder.id));
      
      // Status 200 anstelle von 201 zurückgeben, um Kompatibilitätsprobleme mit dem Frontend zu vermeiden
      // Setze explizit den Content-Type header, um sicherzustellen, dass die Antwort als JSON interpretiert wird
      res.setHeader('Content-Type', 'application/json');
      
      // Detailliertere Logging für Debugging-Zwecke
      console.log('Sende Bestellungsdaten zurück:', {
        id: newOrder.id,
        orderNumber: newOrder.orderNumber,
        itemCount: orderItemsResult.length
      });
      
      // Die fertige Bestellung mit allen Positionen zurückgeben (als einfaches Objekt ohne Wrapper)
      const orderResponse = {
        ...newOrder,
        items: orderItemsResult
      };
      
      // Vor dem Senden nochmals prüfen und sicherstellen, dass wir eine gültige JSON-Antwort haben
      console.log("Sende Bestellungsantwort als JSON:", JSON.stringify(orderResponse).substring(0, 100) + "...");
      
      return res.status(200).json(orderResponse);
    } catch (storageError) {
      console.error('Fehler beim Speichern der Bestellung:', storageError);
      return res.status(500).json({ 
        error: 'Fehler beim Speichern der Bestellung',
        details: storageError
      });
    }
  } catch (error) {
    console.error('Fehler beim Erstellen der Bestellung:', error);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen der Bestellung',
      details: error
    });
  }
});

// Bestellung abrufen
router.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }
    
    // Benutzer-basierte Zugriffsbeschränkungen
    let userConstraints: any[] = [];
    if (req.user && req.user.role !== 'admin') {
      if (req.user.locationId) {
        userConstraints.push(eq(orders.locationId, req.user.locationId));
      }
      
      if (req.user.warehouseIds && Array.isArray(req.user.warehouseIds)) {
        userConstraints.push(inArray(orders.warehouseId, req.user.warehouseIds));
      }
    }
    
    // Basisabfrage
    let query = db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));
    
    // Benutzerberechtigungen hinzufügen, falls nötig
    if (userConstraints.length > 0) {
      query = query.where(and(eq(orders.id, orderId), or(...userConstraints)));
    }
    
    const orderResult = await query.limit(1);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    // Bestellpositionen abrufen
    const orderItemsResult = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    // Lieferanten abrufen
    let supplier = null;
    if (orderResult[0].supplierId) {
      const supplierResult = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, orderResult[0].supplierId))
        .limit(1);
      
      if (supplierResult && supplierResult.length > 0) {
        supplier = supplierResult[0];
      }
    }
    
    // Gesamtpreis berechnen
    let subtotal = 0;
    orderItemsResult.forEach(item => {
      const price = item.price || 0;
      const quantity = item.quantity || 1;
      const discount = item.discountPercent || 0;
      
      // Berechnung des Positionsgesamtpreises unter Berücksichtigung des Rabatts
      const lineTotal = price * quantity * (1 - discount / 100);
      subtotal += lineTotal;
    });
    
    // MwSt berechnen (Standard: 19%)
    const vatRate = 19;
    const vatAmount = subtotal * (vatRate / 100);
    const totalAmount = subtotal + vatAmount;
    
    res.json({
      ...orderResult[0],
      items: orderItemsResult,
      supplier,
      pricing: {
        subtotal,
        vatRate,
        vatAmount,
        totalAmount
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Bestellung:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Bestellung' });
  }
});

// Bestellpositionen abrufen
router.get('/orders/:id/items', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }
    
    const result = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    res.json(result);
  } catch (error) {
    console.error('Fehler beim Abrufen der Bestellpositionen:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Bestellpositionen' });
  }
});

// Bestellung aktualisieren
router.patch('/orders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const updateData = req.body;
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }
    
    // Aktuelle Bestellung abrufen
    const existingOrderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    
    if (!existingOrderResult || existingOrderResult.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    const existingOrder = existingOrderResult[0];
    
    // Prüfe, ob die Bestellung bereits geliefert wurde
    if (existingOrder.status === 'delivered') {
      return res.status(400).json({ 
        error: 'Bestellung kann nicht mehr geändert werden',
        message: 'Diese Bestellung wurde bereits geliefert und kann nicht mehr geändert werden.'
      });
    }
    
    // Updates vorbereiten
    const updates: any = {
      ...updateData,
      updatedAt: new Date()
    };
    
    // Benutzerinformation für die Aktualisierung
    if (req.user) {
      updates.updatedBy = req.user.id;
      updates.updatedByName = req.user.username;
      updates.updatedByEmail = req.user.email;
      updates.updatedByRole = req.user.role;
    }
    
    // Status-Historie aktualisieren, falls ein neuer Status gesetzt wird
    if (updateData.status && updateData.status !== existingOrder.status) {
      let currentHistory = [];
      
      // Bestehende Statushistorie parsen
      if (existingOrder.statusHistory) {
        try {
          if (typeof existingOrder.statusHistory === 'string') {
            currentHistory = JSON.parse(existingOrder.statusHistory);
          } else if (Array.isArray(existingOrder.statusHistory)) {
            currentHistory = existingOrder.statusHistory;
          }
        } catch (e) {
          console.error('Fehler beim Parsen der Statushistorie:', e);
          currentHistory = [];
        }
      }
      
      // Neuen Statuseintrag erstellen
      const newStatusEntry = {
        status: updateData.status,
        timestamp: new Date().toISOString(),
        userId: req.user?.id || null,
        userName: req.user?.username || null,
        note: updateData.statusNote || `Status geändert von ${existingOrder.status} auf ${updateData.status}`
      };
      
      // Historie aktualisieren
      currentHistory.push(newStatusEntry);
      updates.statusHistory = JSON.stringify(currentHistory);
      
      // Bei Status "delivered", totalAmount aktualisieren falls vorhanden
      if (updateData.status === 'delivered' && updateData.totalAmount !== undefined) {
        updates.totalAmount = updateData.totalAmount;
      }
    }
    
    // In Datenbank aktualisieren
    const updatedOrderResult = await db
      .update(orders)
      .set(updates)
      .where(eq(orders.id, orderId))
      .returning();
    
    if (!updatedOrderResult || updatedOrderResult.length === 0) {
      return res.status(500).json({ error: 'Fehler beim Aktualisieren der Bestellung' });
    }
    
    // Wenn Bestellpositionen aktualisiert werden sollen
    if (updateData.items && Array.isArray(updateData.items)) {
      // Alle bestehenden Positionen abrufen
      const existingItemsResult = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      
      const existingItems = existingItemsResult || [];
      const existingItemIds = existingItems.map(item => item.id);
      const updatedItemIds: number[] = [];
      
      // Positionen aktualisieren oder hinzufügen
      for (const item of updateData.items) {
        if (item.id && existingItemIds.includes(item.id)) {
          // Bestehende Position aktualisieren
          const itemId = item.id;
          delete item.id; // ID aus Update-Daten entfernen
          
          await db
            .update(orderItems)
            .set({
              ...item,
              updatedAt: new Date()
            })
            .where(eq(orderItems.id, itemId));
          
          updatedItemIds.push(itemId);
        } else {
          // Neue Position hinzufügen
          const newItem = await db
            .insert(orderItems)
            .values({
              orderId,
              productId: item.productId || null,
              productName: item.productName || 'Unbenanntes Produkt',
              quantity: item.quantity || 1,
              unit: item.unit || 'Stk.',
              price: item.price || null,
              discountPercent: item.discountPercent || 0,
              notes: item.notes || null
            })
            .returning();
          
          if (newItem && newItem.length > 0) {
            updatedItemIds.push(newItem[0].id);
          }
        }
      }
      
      // Nicht aktualisierte Positionen löschen, wenn deleteRemaining=true
      if (updateData.deleteRemaining) {
        const itemsToDelete = existingItemIds.filter(id => !updatedItemIds.includes(id));
        if (itemsToDelete.length > 0) {
          await db
            .delete(orderItems)
            .where(inArray(orderItems.id, itemsToDelete));
        }
      }
      
      // Aktualisiere die Anzahl der Positionen in der Bestellung
      const updatedItemCount = await db
        .select({ count: SQL`count(*)` })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      
      await db
        .update(orders)
        .set({
          itemCount: parseInt(updatedItemCount[0].count.toString()),
          updatedAt: new Date()
        })
        .where(eq(orders.id, orderId));
    }
    
    // Aktualisierte Bestellung zurückgeben
    const updatedOrder = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    
    const updatedItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    res.json({
      ...updatedOrder[0],
      items: updatedItems
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Bestellung:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Bestellung' });
  }
});

// Bestellung löschen
router.delete('/orders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }
    
    // Bestellung prüfen
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    const order = orderResult[0];
    
    // Prüfe, ob die Bestellung bereits geliefert wurde
    if (order.status === 'delivered') {
      return res.status(400).json({
        error: 'Bestellung kann nicht gelöscht werden',
        message: 'Gelieferte Bestellungen können nicht gelöscht werden.'
      });
    }
    
    // Alle Bestellpositionen löschen
    await db
      .delete(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    // Bestellung löschen
    await db
      .delete(orders)
      .where(eq(orders.id, orderId));
    
    res.json({ success: true, message: 'Bestellung erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen der Bestellung:', error);
    res.status(500).json({ error: 'Fehler beim Löschen der Bestellung' });
  }
});

// E-Mail-Vorlage für eine Bestellung abrufen
router.get('/orders/:id/email-template', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const { type = 'standard' } = req.query;
    const templateType = type as string;

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    // Die neue orderEmailUtils-Funktionen importieren
    const { createOrderEmailTemplate } = await import('../utils/orderEmailUtils');
    
    // Bestellung abrufen
    const orderData = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderData || orderData.length === 0) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }
    
    const order = orderData[0];

    // Lieferanten abrufen
    let supplier = null;
    if (order.supplierId) {
      const supplierData = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, order.supplierId))
        .limit(1);
      
      if (supplierData && supplierData.length > 0) {
        supplier = supplierData[0];
      }
    }

    // E-Mail-Vorlage erstellen mit neuer Utility-Funktion
    const emailTemplate = createOrderEmailTemplate(order, supplier || {}, templateType);

    // E-Mail-Betreff erstellen
    let subject = "";
    switch (templateType) {
      case "urgent":
      case "dringend":
        subject = `DRINGEND: Bestellung ${order.orderNumber} - ${order.supplierName || supplier?.name || 'Unbekannt'}`;
        break;
      case "reorder":
      case "nachbestellung":
        subject = `Nachbestellung ${order.orderNumber} - ${order.supplierName || supplier?.name || 'Unbekannt'}`;
        break;
      default:
        subject = `Bestellung ${order.orderNumber} - ${order.supplierName || supplier?.name || 'Unbekannt'}`;
    }

    res.json({
      subject,
      content: emailTemplate.replace('{{orderItems}}', 'ARTIKELLISTE WIRD AUTOMATISCH EINGEFÜGT')
    });
  } catch (error) {
    console.error("Fehler beim Generieren der E-Mail-Vorlage:", error);
    res.status(500).json({ error: "Fehler beim Generieren der E-Mail-Vorlage" });
  }
});

// Bestellung per E-Mail versenden
router.post('/orders/:id/send-email', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const { to, subject, content, templateType = 'standard' } = req.body;
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }
    
    if (!to || !to.includes('@')) {
      return res.status(400).json({ error: "Eine gültige E-Mail-Adresse des Empfängers muss angegeben werden" });
    }
    
    // Neue optimierte E-Mail-Funktion verwenden
    const { createAndSendOrderEmail } = await import('../utils/orderEmailUtils');
    
    // E-Mail senden mit der neuen Utility-Funktion
    const result = await createAndSendOrderEmail(
      orderId,
      to,
      subject,
      content,
      templateType
    );
    
    if (result) {
      // Bestellung abrufen, um den aktuellen Status zu überprüfen
      const orderResult = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      
      if (orderResult && orderResult.length > 0) {
        const order = orderResult[0];
        
        // Bestellung als versandt markieren, wenn sie noch im Entwurfsstatus ist
        if (order.status === 'draft') {
          // Bestehende Statushistorie konsistent verarbeiten
          let currentHistory = [];
          try {
            if (order.statusHistory) {
              if (typeof order.statusHistory === 'string') {
                currentHistory = JSON.parse(order.statusHistory);
              } else if (Array.isArray(order.statusHistory)) {
                currentHistory = order.statusHistory;
              }
            }
          } catch (parseError) {
            console.error("Fehler beim Parsen der Statushistorie:", parseError);
            currentHistory = [];
          }
          
          // Neuen Statuseintrag erstellen
          const newStatusEntry = {
            status: "sent",
            timestamp: new Date().toISOString(),
            note: "Bestellung per E-Mail an Lieferant gesendet"
          };
          
          await db
            .update(orders)
            .set({
              status: 'sent',
              sentAt: new Date(),
              updatedAt: new Date(),
              statusHistory: JSON.stringify([...currentHistory, newStatusEntry])
            })
            .where(eq(orders.id, orderId));
        }
      }
      
      res.json({ 
        success: true, 
        message: 'E-Mail wurde erfolgreich versendet',
        order: orderId
      });
    } else {
      res.status(500).json({ 
        error: 'E-Mail konnte nicht versendet werden',
        message: 'Es gab ein Problem beim Versenden der E-Mail. Bitte versuchen Sie es später erneut.'
      });
    }
  } catch (error) {
    console.error("Fehler beim Senden der Bestellungs-E-Mail:", error);
    res.status(500).json({ error: "Fehler beim Senden der E-Mail" });
  }
});

// Bestellung als gesendet markieren
router.post('/orders/:id/mark-sent', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }
    
    // Bestellung abrufen
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }
    
    const order = orderResult[0];
    
    // Kann nur markiert werden, wenn im Entwurfsstatus
    if (order.status !== 'draft') {
      return res.status(400).json({ 
        error: "Bestellung kann nicht als gesendet markiert werden",
        message: `Die Bestellung hat bereits den Status "${order.status}" und kann nicht als gesendet markiert werden.`
      });
    }
    
    // Statushistorie aktualisieren
    let currentHistory = [];
    try {
      if (order.statusHistory) {
        if (typeof order.statusHistory === 'string') {
          currentHistory = JSON.parse(order.statusHistory);
        } else if (Array.isArray(order.statusHistory)) {
          currentHistory = order.statusHistory;
        }
      }
    } catch (e) {
      console.error('Fehler beim Parsen der Statushistorie:', e);
      currentHistory = [];
    }
    
    // Neuen Statuseintrag erstellen
    const newStatusEntry = {
      status: "sent",
      timestamp: new Date().toISOString(),
      userId: req.user?.id || null,
      userName: req.user?.username || null,
      note: req.body.note || "Bestellung als gesendet markiert"
    };
    
    // Status aktualisieren
    const updatedOrderResult = await db
      .update(orders)
      .set({
        status: 'sent',
        sentAt: new Date(),
        updatedAt: new Date(),
        statusHistory: JSON.stringify([...currentHistory, newStatusEntry]),
        updatedBy: req.user?.id || null,
        updatedByName: req.user?.username || null,
        updatedByEmail: req.user?.email || null,
        updatedByRole: req.user?.role || null
      })
      .where(eq(orders.id, orderId))
      .returning();
    
    if (!updatedOrderResult || updatedOrderResult.length === 0) {
      return res.status(500).json({ error: "Fehler beim Aktualisieren des Bestellstatus" });
    }
    
    res.json({
      success: true,
      message: "Bestellung wurde als gesendet markiert",
      order: updatedOrderResult[0]
    });
  } catch (error) {
    console.error("Fehler beim Markieren der Bestellung als gesendet:", error);
    res.status(500).json({ error: "Fehler beim Markieren der Bestellung als gesendet" });
  }
});

// Wareneingang für eine Bestellung buchen
router.post('/orders/:id/receipt', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const { 
      receiptDate = new Date(),
      receivedBy,
      notes,
      items,
      updateInventory = true,
      createMovements = true
    } = req.body;
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Keine Artikel für den Wareneingang angegeben' });
    }
    
    // Bestellung abrufen
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    const order = orderResult[0];
    
    // Bestellung kann nur als geliefert markiert werden, wenn sie im Status "sent" ist
    if (order.status !== 'sent') {
      return res.status(400).json({
        error: 'Wareneingang kann nicht gebucht werden',
        message: `Die Bestellung hat den Status "${order.status}" und muss im Status "sent" sein, um einen Wareneingang zu buchen.`
      });
    }
    
    // Existierende Bestellpositionen abrufen
    const existingItemsResult = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    const existingItems = existingItemsResult || [];
    const existingItemsMap = existingItems.reduce((map, item) => {
      map[item.id] = item;
      return map;
    }, {});
    
    // Wareneingang für jede Position aktualisieren
    const itemUpdates = items.map(async (receiptItem: any) => {
      if (!receiptItem.id) {
        return Promise.reject(new Error('Artikel-ID fehlt in den Wareneingangsdaten'));
      }
      
      const itemId = receiptItem.id;
      const existingItem = existingItemsMap[itemId];
      
      if (!existingItem) {
        return Promise.reject(new Error(`Artikel mit ID ${itemId} gehört nicht zu dieser Bestellung`));
      }
      
      // Standardwerte für fehlende Felder
      const quantityDelivered = receiptItem.quantityDelivered !== undefined ? 
        receiptItem.quantityDelivered : existingItem.quantity;
      
      const receivedQuantity = receiptItem.receivedQuantity !== undefined ? 
        receiptItem.receivedQuantity : quantityDelivered;
      
      // Artikel in der Bestellung aktualisieren
      return db
        .update(orderItems)
        .set({
          quantityDelivered,
          receivedQuantity,
          deliveryDate: new Date(receiptDate),
          deliveredBy: receivedBy || req.user?.username || null,
          deliveryNotes: receiptItem.notes || null,
          updatedAt: new Date()
        })
        .where(eq(orderItems.id, itemId));
    });
    
    // Alle Aktualisierungen ausführen
    await Promise.all(itemUpdates);
    
    // Lager-ID für Lagerbestandsaktualisierungen abrufen
    const warehouseId = order.warehouseId;
    
    if (!warehouseId) {
      return res.status(400).json({ 
        error: 'Kein Lager zugeordnet',
        message: 'Die Bestellung hat kein zugeordnetes Lager für die Bestandsaktualisierung'
      });
    }
    
    // Wenn gewünscht, Lagerbestände aktualisieren
    if (updateInventory) {
      for (const item of items) {
        // Nur Artikel mit einer Produkt-ID können im Lager aktualisiert werden
        if (item.productId) {
          try {
            // Überprüfen, ob der Artikel bereits im Lagerbestand ist
            const inventoryResult = await db
              .select()
              .from(inventoryItems)
              .where(
                and(
                  eq(inventoryItems.warehouseId, warehouseId),
                  eq(inventoryItems.productId, item.productId)
                )
              )
              .limit(1);
            
            const quantityToAdd = item.quantityDelivered || item.receivedQuantity || 0;
            
            // Wenn der Artikel im Lager existiert, Bestand aktualisieren
            if (inventoryResult && inventoryResult.length > 0) {
              const currentQuantity = inventoryResult[0].quantity || 0;
              
              await db
                .update(inventoryItems)
                .set({
                  quantity: currentQuantity + quantityToAdd,
                  updatedAt: new Date()
                })
                .where(
                  and(
                    eq(inventoryItems.warehouseId, warehouseId),
                    eq(inventoryItems.productId, item.productId)
                  )
                );
            } else {
              // Ansonsten Artikel neu zum Lager hinzufügen
              await db
                .insert(inventoryItems)
                .values({
                  warehouseId,
                  productId: item.productId,
                  quantity: quantityToAdd,
                  status: 'active',
                  createdAt: new Date(),
                  updatedAt: new Date()
                });
            }
            
            // Wenn gewünscht, Lagerbewegungen protokollieren
            if (createMovements) {
              const productData = await db
                .select()
                .from(products)
                .where(eq(products.id, item.productId))
                .limit(1);
              
              await db
                .insert(inventoryMovements)
                .values({
                  warehouseId,
                  productId: item.productId,
                  quantity: item.quantityDelivered,
                  movementType: 'purchase-received',
                  notes: `Wareneingang aus Bestellung ${order.orderNumber}`,
                  referenceId: orderId.toString(),
                  referenceType: 'order',
                  userId: req.user ? req.user.id.toString() : null,
                  userName: req.user ? req.user.username : null,
                  price: item.price !== undefined ? item.price.toString() : null,
                  sku: productData && productData.length > 0 ? productData[0].sku : null
                });
            }
          } catch (inventoryError) {
            console.error(`Fehler bei der Lageraktualisierung für Produkt ${item.productId}:`, inventoryError);
            // Fehler protokollieren, aber weitermachen
          }
        }
      }
    }
    
    // Statushistorie aktualisieren
    let currentHistory = [];
    try {
      if (order.statusHistory) {
        if (typeof order.statusHistory === 'string') {
          currentHistory = JSON.parse(order.statusHistory);
        } else if (Array.isArray(order.statusHistory)) {
          currentHistory = order.statusHistory;
        }
      }
    } catch (e) {
      console.error('Fehler beim Parsen der Statushistorie:', e);
      currentHistory = [];
    }
    
    // Neuen Statuseintrag erstellen
    const newStatusEntry = {
      status: "delivered",
      timestamp: new Date().toISOString(),
      userId: req.user?.id || null,
      userName: req.user?.username || null,
      note: notes || "Wareneingang gebucht"
    };
    
    // Bestellung als geliefert markieren
    const updatedOrderResult = await db
      .update(orders)
      .set({
        status: 'delivered',
        deliveryDate: new Date(receiptDate),
        receivedBy: receivedBy || req.user?.username || null,
        notes: notes ? (order.notes ? `${order.notes}\n\nWareneingang: ${notes}` : notes) : order.notes,
        statusHistory: JSON.stringify([...currentHistory, newStatusEntry]),
        updatedAt: new Date(),
        updatedBy: req.user?.id || null,
        updatedByName: req.user?.username || null,
        updatedByEmail: req.user?.email || null,
        updatedByRole: req.user?.role || null
      })
      .where(eq(orders.id, orderId))
      .returning();
    
    if (!updatedOrderResult || updatedOrderResult.length === 0) {
      return res.status(500).json({ error: 'Fehler beim Aktualisieren der Bestellung' });
    }
    
    // Aktualisierte Bestellpositionen abrufen
    const updatedItemsResult = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    res.json({
      order: updatedOrderResult[0],
      items: updatedItemsResult,
      message: "Wareneingang wurde erfolgreich gebucht"
    });
  } catch (error) {
    console.error('Fehler beim Buchen des Wareneingangs:', error);
    res.status(500).json({ error: 'Fehler beim Buchen des Wareneingangs' });
  }
});

export default router;