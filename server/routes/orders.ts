import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, lte } from 'drizzle-orm';
import { 
  orders, 
  orderItems,
  suppliers,
  products,
  warehouses,
  inventoryMovements,
  users,
  inventoryItems,
  productBatches,
  purchaseConditions
} from '../../shared/schema';
import { format, addWeeks } from 'date-fns';
import { createAndSendOrderEmail } from '../utils/orderEmailUtils';
// Direkte sendEmail Funktion anstelle des Imports
function sendEmail(to: string, from: string, subject: string, html: string) {
  // Einfache E-Mail-Sende-Funktion
  console.log(`Sending email to ${to} from ${from} with subject "${subject}"`);
  // Hier würde normalerweise der E-Mail-Versand stattfinden
  return Promise.resolve(true);
}

const router = Router();

// Dashboard endpoint für verschickte aber noch nicht gelieferte Bestellungen
router.get('/dashboard/open', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    
    // Hole offene Bestellungen (verschickt, bestätigt, etc.) mit Lieferanten-Daten
    const openOrdersQuery = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        orderDate: orders.orderDate,
        expectedDeliveryDate: orders.expectedDeliveryDate,
        actualDeliveryDate: orders.actualDeliveryDate,
        totalAmount: orders.totalAmount,
        supplierName: suppliers.name,
        supplierId: orders.supplierId
      })
      .from(orders)
      .leftJoin(suppliers, eq(orders.supplierId, suppliers.id))
      .where(and(
        // Statusfilterung: alle Status die Wareneingang benötigen (aber nicht bereits abgeschlossen)
        or(
          eq(orders.status, 'sent'),
          eq(orders.status, 'confirmed'),
          eq(orders.status, 'in_delivery'),
          eq(orders.status, 'partial_delivered'),
          eq(orders.status, 'draft'),  // Entwürfe die bereit für Wareneingang sind
          eq(orders.status, 'pending')
        ),
        // Noch nicht vollständig geliefert (actualDeliveryDate ist null)
        isNull(orders.actualDeliveryDate),
        // Ausschließen von bereits abgeschlossenen Bestellungen
        or(
          orders.status !== 'received',
          orders.status !== 'completed',
          orders.status !== 'cancelled'
        )
      ))
      .orderBy(desc(orders.createdAt), asc(orders.expectedDeliveryDate))
      .limit(limit);

    const formattedOrders = openOrdersQuery.map(order => {
      // Berechne ob die Bestellung verspätet ist
      const isOverdue = order.expectedDeliveryDate && 
        new Date(order.expectedDeliveryDate) < new Date();
      
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        orderDate: order.orderDate,
        expectedDeliveryDate: order.expectedDeliveryDate,
        actualDeliveryDate: order.actualDeliveryDate,
        supplierName: order.supplierName || 'Unbekannter Lieferant',
        totalValue: order.totalAmount || 0,
        totalAmount: order.totalAmount || 0, // Für Kompatibilität
        isOverdue
      };
    });

    return res.json(formattedOrders);
  } catch (error) {
    console.error('Fehler beim Abrufen der offenen Bestellungen für Dashboard:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der offenen Bestellungen',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

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
Lieferadresse:
Elbsandstein Proviant & Quartier GmbH
Pirnaer Str. 19
01829 Stadt Wehlen
Deutschland

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
router.get('/', async (req: Request, res: Response) => {
  // Header zur Sicherstellung der richtigen Antwortformatierung
  res.setHeader('Content-Type', 'application/json');
  
  try {
    // Paginierungsparameter
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    
    // Filter & Suche
    let statusFilter = req.query.status as string;
    const searchTerm = req.query.search as string;
    const supplierId = req.query.supplierId as string;
    
    // Sortierung
    const sortField = req.query.sortField as string || 'orderDate';
    const sortOrder = (req.query.sortOrder as string || 'desc') === 'asc' ? asc : desc;

    // Benutzer-basierte Filterung (deaktiviert für jetzt)
    let userConstraints: any[] = [];
    // if (req.user && req.user.role !== 'admin') {
    //   if (req.user.locationId) {
    //     userConstraints.push(eq(orders.locationId, req.user.locationId));
    //   }
    //   
    //   if (req.user.warehouseIds && Array.isArray(req.user.warehouseIds)) {
    //     userConstraints.push(inArray(orders.warehouseId, req.user.warehouseIds));
    //   }
    // }
    
    // Erstelle die Basisabfrage für die Zählung und die eigentliche Datenabfrage
    let countQuery = db.select({ count: sql`count(*)` }).from(orders);
    let query = db.select().from(orders);

    // Status-Filter hinzufügen, wenn definiert
    if (statusFilter) {
      countQuery = countQuery.where(eq(orders.status, statusFilter));
      query = query.where(eq(orders.status, statusFilter));
    }
    
    // Supplier-Filter hinzufügen, wenn definiert
    if (supplierId) {
      const supplierIdNum = parseInt(supplierId);
      if (!isNaN(supplierIdNum)) {
        countQuery = countQuery.where(eq(orders.supplierId, supplierIdNum));
        query = query.where(eq(orders.supplierId, supplierIdNum));
      }
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
    
    // Strukturierte Antwort mit Metadaten und dem Daten-Array
    const response = {
      orders: sanitizedData,
      pagination: {
        total: totalCount,
        pages: totalPages,
        page: page,
        limit: limit
      },
      statusCode: 200,
      success: true
    };
    
    // Setze den Status auf 200 OK und sende die strukturierte Antwort zurück
    res.status(200).json(response);
  } catch (error) {
    console.error('Fehler beim Abrufen der Bestellungen:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Bestellungen' });
  }
});

// Bulk order creation route (must be before /orders route)
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const {
      supplierId,
      warehouseId,
      orderType = 'bulk',
      expectedDeliveryDate,
      notes,
      priority = 'medium',
      items,
      analysisWeeks = 4,
      forecastWeeks = 2,
      totalValue
    } = req.body;

    // Validierung
    if (!supplierId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        error: 'Lieferant-ID und Artikel sind erforderlich',
        details: { supplierId, itemsCount: items?.length || 0 }
      });
    }

    // Lieferant validieren
    const supplierDetails = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);

    if (supplierDetails.length === 0) {
      return res.status(400).json({ 
        error: 'Lieferant nicht gefunden',
        supplierId 
      });
    }

    const supplier = supplierDetails[0];

    // Warehouse validieren (falls warehouseId übergeben wurde)
    let warehouse = null;
    if (warehouseId) {
      const warehouseDetails = await db
        .select()
        .from(warehouses)
        .where(eq(warehouses.id, warehouseId))
        .limit(1);

      if (warehouseDetails.length > 0) {
        warehouse = warehouseDetails[0];
      }
    }

    // Bestellnummer generieren
    const today = new Date();
    const dateString = format(today, 'yyyyMMdd');
    
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

    // Benutzerinformation
    const userId = (req as any).user?.id || null;
    const userName = (req as any).user?.username || null;
    const userEmail = (req as any).user?.email || null;

    // Bestellung erstellen
    const insertedOrder = await db
      .insert(orders)
      .values({
        orderNumber,
        supplierId,
        supplierName: supplier.name,
        locationId: warehouseId || null,
        locationName: warehouse?.name || null,
        status: 'draft',
        priority,
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
        notes,
        totalAmount: totalValue || 0,
        createdById: userId,
        createdByName: userName
      })
      .returning();

    const orderId = insertedOrder[0].id;

    // Order Items hinzufügen
    const orderItemsData = [];
    for (const item of items) {
      if (!item.productId || !item.quantity) {
        continue;
      }

      // Produktdaten abrufen
      const productDetails = await db
        .select()
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);

      if (productDetails.length === 0) {
        continue;
      }

      const product = productDetails[0];

      orderItemsData.push({
        orderId,
        productId: item.productId,
        productName: product.productName,
        quantity: item.quantity,
        unitPrice: product.price || 0,
        totalPrice: (product.price || 0) * item.quantity,
        status: 'pending'
      });
    }

    if (orderItemsData.length > 0) {
      await db.insert(orderItems).values(orderItemsData);
    }

    // Vollständige Bestellung mit Items zurückgeben
    const completeOrder = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    const orderItemsList = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    res.status(201).json({
      success: true,
      message: 'Bulk-Bestellung erfolgreich erstellt',
      order: {
        ...completeOrder[0],
        items: orderItemsList
      }
    });

  } catch (error) {
    console.error('Fehler bei Bulk-Bestellung:', error);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen der Bulk-Bestellung',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Bestellung erstellen
router.post('/orders', async (req: Request, res: Response) => {
  try {
    console.log("Neue Bestellung erhalten mit Daten:", JSON.stringify(req.body).substring(0, 200));
    
    // Explizit Content-Type Header für JSON setzen
    res.setHeader('Content-Type', 'application/json');
    
    // Fehlerbehandlungshelfer, um sicherzustellen, dass immer JSON zurückgegeben wird
    const sendJsonError = (statusCode: number, message: string) => {
      return res.status(statusCode).json({
        success: false,
        error: message,
        statusCode: statusCode
      });
    };
    
    const {
      warehouseId,
      supplierId,
      expectedDeliveryDate,
      priority = 'normal',
      notes = '',
      items
    } = req.body;
    
    // Validierung der Pflichtfelder mit verbesserter JSON-Antwort
    if (!warehouseId || !supplierId) {
      return sendJsonError(400, 'Lager und Lieferant müssen angegeben werden');
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return sendJsonError(400, 'Mindestens ein Artikel muss bestellt werden');
    }
    
    // Validieren und Konvertieren von expectedDeliveryDate
    let parsedDeliveryDate: Date | null = null;
    if (expectedDeliveryDate && typeof expectedDeliveryDate === 'string') {
      try {
        // Erweiterte Muster für verschiedene Datumsformate
        const patterns = [
          /^\d{4}-\d{2}-\d{2}$/,                    // YYYY-MM-DD
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,  // ISO 8601 with time
          /^\d{2}\/\d{2}\/\d{4}$/,                  // MM/DD/YYYY
          /^\d{2}\.\d{2}\.\d{4}$/,                  // DD.MM.YYYY
        ];
        
        // Prüfe ob es ein bekanntes Format ist
        const isKnownFormat = patterns.some(pattern => pattern.test(expectedDeliveryDate));
        
        if (isKnownFormat || expectedDeliveryDate.length >= 8) {
          const tempDate = new Date(expectedDeliveryDate);
          if (!isNaN(tempDate.getTime()) && tempDate.getFullYear() > 1900) {
            parsedDeliveryDate = tempDate;
            console.log(`Datum erfolgreich geparst: ${expectedDeliveryDate} → ${parsedDeliveryDate.toISOString()}`);
          } else {
            console.warn(`Ungültiges Datum erkannt: ${expectedDeliveryDate}`);
          }
        } else {
          console.warn(`Unbekanntes Datumsformat: ${expectedDeliveryDate}`);
        }
      } catch (e) {
        console.warn("Fehler beim Parsen des Datums:", e, "Input:", expectedDeliveryDate);
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
    const userId = 1;
    const userName = 'Admin';
    const userEmail = 'admin@example.com';
    const userRole = 'admin';
    
    // Lieferantendaten und Lagerortdaten abrufen
    const supplierDetails = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);

    const warehouseDetails = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.id, warehouseId))
      .limit(1);

    // Namen extrahieren oder Default-Werte nutzen
    const supplierName = supplierDetails.length > 0 ? supplierDetails[0].name : "Unbekannter Lieferant";
    const locationName = warehouseDetails.length > 0 ? warehouseDetails[0].name : "Unbekannter Lagerort";

    // Bestellung erstellen
    try {
      const insertedOrder = await db
        .insert(orders)
        .values({
          orderNumber,
          supplierId,
          supplierName: supplierName,
          locationId: warehouseId,
          locationName: locationName,
          status: 'draft', // Entwurf
          orderDate: new Date(),
                // Verwende das zuvor validierte und konvertierte Datum
          ...(parsedDeliveryDate ? { expectedDeliveryDate: parsedDeliveryDate } : {}),
          notes: notes,
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
              productName = productResult[0].productName;
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
              unitPrice: item.price || 0,
              totalPrice: (item.price || 0) * item.quantity,
              notes: item.notes || null,
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
      
      // Explizit den Content-Type headers setzen und eine saubere Antwort zurückgeben
      res.setHeader('Content-Type', 'application/json');
      
      // Statt direkt das komplexe orderResponse-Objekt zu senden, erstellen wir ein
      // einfacheres Antwortformat, das weniger anfällig für Serialisierungsprobleme ist
      return res.status(200).json({
        success: true,
        id: newOrder.id,
        orderNumber: newOrder.orderNumber,
        message: "Bestellung erfolgreich erstellt",
        order: {
          ...newOrder,
          items: orderItemsResult.map(item => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.unitPrice,
            discount: item.discount || 0
          }))
        }
      });
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

// Bestellung abrufen - VEREINFACHT
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    
    if (isNaN(orderId)) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }
    
    console.log(`Loading order ${orderId}`);
    
    // Direkte Bestellung abrufen ohne Benutzerberechtigungen
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    
    if (!orderResult || orderResult.length === 0) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    const order = orderResult[0];
    console.log(`Order found: ${order.orderNumber}`);
    
    // Explizit JSON Content-Type setzen
    res.setHeader('Content-Type', 'application/json');
    res.json(order);
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Bestellung:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ error: 'Fehler beim Abrufen der Bestellung' });
  }
});



// Bestellpositionen abrufen
router.get('/:id/items', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    
    console.log(`GET /api/orders/${id}/items - Lade Bestellpositionen mit korrekten Preisen...`);
    
    if (isNaN(orderId)) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }
    
    const result = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    console.log(`${result.length} Bestellpositionen mit Preisdaten geladen`);
    
    res.setHeader('Content-Type', 'application/json');
    res.json(result);
  } catch (error) {
    console.error('Fehler beim Abrufen der Bestellpositionen:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ error: 'Fehler beim Abrufen der Bestellpositionen' });
  }
});

// Bestellung kopieren/duplizieren
router.post('/orders/:id/copy', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sourceOrderId = parseInt(id);
    
    if (isNaN(sourceOrderId)) {
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }
    
    // Quell-Bestellung laden
    const sourceOrder = await db
      .select()
      .from(orders)
      .where(eq(orders.id, sourceOrderId))
      .limit(1);
    
    if (sourceOrder.length === 0) {
      return res.status(404).json({ error: 'Quell-Bestellung nicht gefunden' });
    }
    
    // Quell-Bestellpositionen laden
    const sourceItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, sourceOrderId));
    
    // Neue Bestellnummer generieren
    const today = new Date();
    const dateString = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    let sequenceNumber = 1;
    try {
      const latestOrderQuery = await db
        .select()
        .from(orders)
        .where(ilike(orders.orderNumber, `ORD-${dateString}-%`))
        .orderBy(desc(orders.orderNumber))
        .limit(1);
      
      if (latestOrderQuery.length > 0) {
        const latestOrderNumber = latestOrderQuery[0].orderNumber;
        const match = latestOrderNumber.match(/ORD-\d{8}-(\d+)/);
        if (match) {
          sequenceNumber = parseInt(match[1]) + 1;
        }
      }
    } catch (orderNumberError) {
      console.warn('Fehler beim Generieren der Bestellnummer, verwende Standard:', orderNumberError);
    }
    
    const newOrderNumber = `ORD-${dateString}-${sequenceNumber.toString().padStart(3, '0')}`;
    
    // Neue Bestellung erstellen
    const newOrderData = {
      orderNumber: newOrderNumber,
      warehouseId: sourceOrder[0].warehouseId,
      supplierId: sourceOrder[0].supplierId,
      supplierName: sourceOrder[0].supplierName,
      locationName: sourceOrder[0].locationName,
      status: 'draft',
      orderDate: today,
      expectedDeliveryDate: sourceOrder[0].expectedDeliveryDate,
      totalAmount: sourceOrder[0].totalAmount,
      currency: sourceOrder[0].currency || 'EUR',
      priority: sourceOrder[0].priority || 'normal',
      notes: `Kopie von ${sourceOrder[0].orderNumber}`,
      createdAt: today,
      updatedAt: today
    };
    
    const [newOrder] = await db.insert(orders).values(newOrderData).returning();
    
    // Bestellpositionen kopieren
    if (sourceItems.length > 0) {
      const newItemsData = sourceItems.map(item => ({
        orderId: newOrder.id,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        supplierSku: item.supplierSku,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        vatRate: item.vatRate,
        status: 'pending',
        createdAt: today,
        updatedAt: today
      }));
      
      await db.insert(orderItems).values(newItemsData);
    }
    
    // Vollständige neue Bestellung mit Items zurückgeben
    const completeNewOrder = await db
      .select()
      .from(orders)
      .where(eq(orders.id, newOrder.id))
      .limit(1);
    
    const newOrderItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, newOrder.id));
    
    res.setHeader('Content-Type', 'application/json');
    res.status(201).json({
      success: true,
      message: 'Bestellung erfolgreich kopiert',
      order: {
        ...completeNewOrder[0],
        items: newOrderItems
      }
    });
    
  } catch (error) {
    console.error('Fehler beim Kopieren der Bestellung:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ error: 'Fehler beim Kopieren der Bestellung' });
  }
});

// Bestellung aktualisieren (PUT für Frontend)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const updateData = req.body;
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }
    
    console.log(`PUT /api/orders/${id} - Updating order with data:`, updateData);
    
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
    
    // Updates vorbereiten - fix field name mapping from frontend (snake_case) to database (camelCase)
    const updates: any = {};
    
    // Handle optional fields with proper mapping
    if (updateData.expected_delivery_date !== undefined || updateData.expectedDeliveryDate !== undefined) {
      const dateValue = updateData.expected_delivery_date || updateData.expectedDeliveryDate;
      // Convert string date to Date object if needed
      if (typeof dateValue === 'string' && dateValue) {
        updates.expectedDeliveryDate = new Date(dateValue);
      } else if (dateValue instanceof Date) {
        updates.expectedDeliveryDate = dateValue;
      }
    }
    
    if (updateData.delivery_location !== undefined || updateData.deliveryLocation !== undefined) {
      updates.deliveryLocation = updateData.delivery_location || updateData.deliveryLocation;
    }
    
    if (updateData.delivery_type !== undefined || updateData.deliveryType !== undefined) {
      updates.deliveryType = updateData.delivery_type || updateData.deliveryType || 'delivery';
    }
    
    if (updateData.show_prices_in_email !== undefined || updateData.showPricesInEmail !== undefined) {
      updates.showPricesInEmail = updateData.show_prices_in_email !== undefined ? updateData.show_prices_in_email : updateData.showPricesInEmail;
    }
    
    if (updateData.warehouseId !== undefined || updateData.warehouse_id !== undefined) {
      updates.warehouseId = updateData.warehouseId || updateData.warehouse_id;
    }
    
    if (updateData.notes !== undefined) {
      updates.notes = updateData.notes;
    }
    
    // Always set updatedAt
    updates.updatedAt = new Date();
    
    // If no updates were provided, return error
    if (Object.keys(updates).length === 1) { // Only updatedAt
      return res.status(400).json({ error: 'Keine Änderungen angegeben' });
    }
    
    // In Datenbank aktualisieren
    console.log('BEFORE DATABASE UPDATE:');
    console.log('Order ID:', orderId);
    console.log('Updates object:', JSON.stringify(updates, null, 2));
    
    const updatedOrderResult = await db
      .update(orders)
      .set(updates)
      .where(eq(orders.id, orderId))
      .returning();
    
    console.log('DATABASE UPDATE RESULT:', updatedOrderResult);
    console.log('Result length:', updatedOrderResult?.length);
    
    if (!updatedOrderResult || updatedOrderResult.length === 0) {
      console.error('DATABASE UPDATE FAILED - no rows returned');
      return res.status(500).json({ error: 'Fehler beim Aktualisieren der Bestellung' });
    }
    
    console.log(`Order ${orderId} updated successfully`);
    
    res.json({
      success: true,
      order: updatedOrderResult[0]
    });
  } catch (error) {
    console.error('DETAILED ERROR beim Aktualisieren der Bestellung:');
    console.error('Error type:', typeof error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('Order ID:', id);
    console.error('Update data received:', JSON.stringify(updateData, null, 2));
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Bestellung', details: error instanceof Error ? error.message : String(error) });
  }
});

// Neue Position zu Bestellung hinzufügen
router.post('/:id/items', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const itemData = req.body;
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }
    
    console.log(`POST /api/orders/${id}/items - Adding item:`, itemData);
    
    // Bestellung existiert prüfen
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    // Neue Position hinzufügen
    const newItem = await db
      .insert(orderItems)
      .values({
        orderId,
        productId: itemData.product_id || itemData.productId || null,
        productName: itemData.product_name || itemData.productName || 'Unbenanntes Produkt',
        quantity: itemData.quantity || 1,
        unit: itemData.unit || 'Stk.',
        unitPrice: itemData.unit_price || itemData.unitPrice || 0,
        totalPrice: (itemData.quantity || 1) * (itemData.unit_price || itemData.unitPrice || 0),
        packageSize: itemData.package_size || itemData.packageSize || null,
        packageQuantity: itemData.package_quantity || itemData.packageQuantity || null,
        packageInfo: itemData.package_info || itemData.packageInfo || null,
        vatRate: itemData.vat_rate || itemData.vatRate || 19,
        vatAmount: ((itemData.quantity || 1) * (itemData.unit_price || itemData.unitPrice || 0)) * (itemData.vat_rate || itemData.vatRate || 19) / 100,
        netAmount: ((itemData.quantity || 1) * (itemData.unit_price || itemData.unitPrice || 0)) - (((itemData.quantity || 1) * (itemData.unit_price || itemData.unitPrice || 0)) * (itemData.vat_rate || itemData.vatRate || 19) / 100),
        grossAmount: (itemData.quantity || 1) * (itemData.unit_price || itemData.unitPrice || 0)
      })
      .returning();
    
    if (!newItem || newItem.length === 0) {
      return res.status(500).json({ error: 'Fehler beim Hinzufügen der Position' });
    }
    
    console.log(`Item added to order ${orderId}:`, newItem[0]);
    
    res.json({
      success: true,
      item: newItem[0]
    });
  } catch (error) {
    console.error('Fehler beim Hinzufügen der Position:', error);
    res.status(500).json({ error: 'Fehler beim Hinzufügen der Position' });
  }
});

// Bestellposition aktualisieren
router.put('/:orderId/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { orderId, itemId } = req.params;
    const orderIdNum = parseInt(orderId);
    const itemIdNum = parseInt(itemId);
    const updateData = req.body;
    
    if (isNaN(orderIdNum) || isNaN(itemIdNum)) {
      return res.status(400).json({ error: 'Ungültige IDs' });
    }
    
    console.log(`PUT /api/orders/${orderId}/items/${itemId} - Updating item:`, updateData);
    
    // Position aktualisieren
    const updatedItem = await db
      .update(orderItems)
      .set({
        quantity: updateData.quantity || 1,
        unitPrice: updateData.unit_price || updateData.unitPrice || 0,
        totalPrice: (updateData.quantity || 1) * (updateData.unit_price || updateData.unitPrice || 0),
        vatRate: updateData.vat_rate || updateData.vatRate || 19,
        vatAmount: ((updateData.quantity || 1) * (updateData.unit_price || updateData.unitPrice || 0)) * (updateData.vat_rate || updateData.vatRate || 19) / 100,
        netAmount: ((updateData.quantity || 1) * (updateData.unit_price || updateData.unitPrice || 0)) - (((updateData.quantity || 1) * (updateData.unit_price || updateData.unitPrice || 0)) * (updateData.vat_rate || updateData.vatRate || 19) / 100),
        grossAmount: (updateData.quantity || 1) * (updateData.unit_price || updateData.unitPrice || 0),
        updatedAt: new Date()
      })
      .where(and(eq(orderItems.id, itemIdNum), eq(orderItems.orderId, orderIdNum)))
      .returning();
    
    if (!updatedItem || updatedItem.length === 0) {
      return res.status(404).json({ error: 'Position nicht gefunden' });
    }
    
    console.log(`Item ${itemIdNum} updated in order ${orderIdNum}`);
    
    res.json({
      success: true,
      item: updatedItem[0]
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Position:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Position' });
  }
});

// Bestellposition löschen
router.delete('/:orderId/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { orderId, itemId } = req.params;
    const orderIdNum = parseInt(orderId);
    const itemIdNum = parseInt(itemId);
    
    if (isNaN(orderIdNum) || isNaN(itemIdNum)) {
      return res.status(400).json({ error: 'Ungültige IDs' });
    }
    
    console.log(`DELETE /api/orders/${orderId}/items/${itemId} - Removing item`);
    
    // Position löschen
    const deletedItem = await db
      .delete(orderItems)
      .where(and(eq(orderItems.id, itemIdNum), eq(orderItems.orderId, orderIdNum)))
      .returning();
    
    if (!deletedItem || deletedItem.length === 0) {
      return res.status(404).json({ error: 'Position nicht gefunden' });
    }
    
    console.log(`Item ${itemIdNum} removed from order ${orderIdNum}`);
    
    res.json({
      success: true,
      message: 'Position erfolgreich entfernt'
    });
  } catch (error) {
    console.error('Fehler beim Löschen der Position:', error);
    res.status(500).json({ error: 'Fehler beim Löschen der Position' });
  }
});

// BULK UPDATE für Bestellpositionen - KRITISCHE FEHLENDE ROUTE
router.put('/:id/items', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const { items } = req.body;
    
    console.log(`PUT /api/orders/${orderId}/items - Bulk-Update für ${items?.length || 0} Bestellpositionen...`);
    
    if (isNaN(orderId) || !items || !Array.isArray(items)) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ 
        error: 'Ungültige Daten', 
        message: 'Bestell-ID oder Items-Array ist ungültig' 
      });
    }
    
    let updatedCount = 0;
    let insertedCount = 0;
    const newlyInsertedIds = [];
    
    for (const item of items) {
      const { id, productId, productName, quantity, unit, unitPrice, totalPrice } = item;
      
      // Check if this is a new item (no ID or negative ID)
      if (!id || id <= 0) {
        console.log(`Inserting new item:`, item);
        try {
          const newItem = await db
            .insert(orderItems)
            .values({
              orderId,
              productId: productId || null,
              productName: productName || 'Unbenanntes Produkt',
              quantity: quantity || 1,
              unit: unit || 'Stk.',
              unitPrice: unitPrice || 0,
              totalPrice: totalPrice || (quantity || 1) * (unitPrice || 0),
              vatRate: 19,
              vatAmount: ((quantity || 1) * (unitPrice || 0)) * 19 / 100,
              netAmount: ((quantity || 1) * (unitPrice || 0)) - (((quantity || 1) * (unitPrice || 0)) * 19 / 100),
              grossAmount: (quantity || 1) * (unitPrice || 0)
            })
            .returning();
          
          if (newItem && newItem.length > 0) {
            newlyInsertedIds.push(newItem[0]);
            insertedCount++;
            console.log(`Inserted new item with ID ${newItem[0].id}: ${quantity} @ ${unitPrice} = ${totalPrice}`);
          }
        } catch (itemError) {
          console.error(`Fehler beim Einfügen von neuem Item:`, itemError);
        }
      } else {
        // Update existing item
        try {
          await db
            .update(orderItems)
            .set({
              quantity: quantity || 1,
              unitPrice: unitPrice || 0,
              totalPrice: totalPrice || (quantity || 1) * (unitPrice || 0),
              updatedAt: new Date()
            })
            .where(and(eq(orderItems.id, parseInt(id)), eq(orderItems.orderId, orderId)));
          
          console.log(`Updated item ${id}: ${quantity} @ ${unitPrice} = ${totalPrice}`);
          updatedCount++;
        } catch (itemError) {
          console.error(`Fehler beim Update von Item ${id}:`, itemError);
        }
      }
    }
    
    console.log(`Bulk-Update für Bestellung ${orderId} erfolgreich - ${updatedCount} Items aktualisiert, ${insertedCount} Items hinzugefügt`);
    
    res.setHeader('Content-Type', 'application/json');
    return res.json({ 
      success: true, 
      message: `${updatedCount} Bestellpositionen aktualisiert, ${insertedCount} neue Positionen hinzugefügt`,
      updatedItems: updatedCount,
      insertedItems: insertedCount,
      newItems: newlyInsertedIds
    });
    
  } catch (error) {
    console.error('Fehler beim Bulk-Update der Bestellpositionen:', error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ 
      error: 'Datenbankfehler beim Bulk-Update', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

// Bestellung aktualisieren (PATCH für Legacy)
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

    // Bestellpositionen mit supplier_article_number aus purchase_conditions holen
    const { createOrderItemsTable } = await import('../utils/orderEmailUtils');
    const items = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        unit: orderItems.unit,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        sku: orderItems.sku,
        supplierSku: orderItems.supplierSku,
        supplier_article_number: purchaseConditions.supplierArticleNumber,
        vatRate: orderItems.vatRate
      })
      .from(orderItems)
      .leftJoin(purchaseConditions, eq(orderItems.productId, purchaseConditions.productId))
      .where(eq(orderItems.orderId, orderId));

    console.log(`[email-template] ${items.length} Bestellpositionen geladen`);
    for (const item of items) {
      console.log(`[email-template] Produkt: ${item.productName}, supplier_article_number: ${item.supplier_article_number}`);
    }

    // HTML-Tabelle für Bestellpositionen erstellen
    const itemsTableHtml = createOrderItemsTable(items);

    // E-Mail-Vorlage erstellen mit neuer Utility-Funktion
    const emailTemplate = createOrderEmailTemplate(order, supplier || {}, templateType);

    // E-Mail-Betreff erstellen
    let subject = "";
    switch (templateType) {
      case "urgent":
      case "dringend":
        subject = `DRINGEND: Bestellung ${order.orderNumber} - Elbsandstein Proviant & Quartier GmbH`;
        break;
      case "reorder":
      case "nachbestellung":
        subject = `Nachbestellung ${order.orderNumber} - Elbsandstein Proviant & Quartier GmbH`;
        break;
      default:
        subject = `Bestellung ${order.orderNumber} - Elbsandstein Proviant & Quartier GmbH`;
    }

    res.json({
      subject,
      content: emailTemplate.replace('{{orderItems}}', itemsTableHtml)
    });
  } catch (error) {
    console.error("Fehler beim Generieren der E-Mail-Vorlage:", error);
    res.status(500).json({ error: "Fehler beim Generieren der E-Mail-Vorlage" });
  }
});

// Conflicting email route removed - using complete email fix instead

// Bestellstatus ändern (neuer Endpunkt)
router.patch('/orders/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const { status, sentDate } = req.body;
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }
    
    if (!status) {
      return res.status(400).json({ error: "Status ist erforderlich" });
    }
    
    // Gültige Status-Werte
    const validStatuses = ['draft', 'sent', 'partial', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Ungültiger Status" });
    }
    
    // Bestellung aktualisieren
    const updateData: any = { status };
    
    // Wenn Status auf "sent" gesetzt wird und sentDate angegeben ist
    if (status === 'sent' && sentDate) {
      updateData.sentDate = new Date(sentDate);
    }
    
    const updatedOrder = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, orderId))
      .returning();
    
    if (updatedOrder.length === 0) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }
    
    res.json({
      success: true,
      message: `Bestellstatus erfolgreich auf "${status}" geändert`,
      order: updatedOrder[0]
    });
  } catch (error) {
    console.error('Fehler beim Ändern des Bestellstatus:', error);
    res.status(500).json({ error: 'Fehler beim Ändern des Bestellstatus' });
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
    
    // Validiere, dass keine abgelaufenen MHD-Werte vorhanden sind
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Auf Tagesbasis vergleichen
    
    const expiredItems = items.filter(item => {
      if (item.expiryDate) {
        const expiryDate = new Date(item.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        return expiryDate < today;
      }
      return false;
    });
    
    if (expiredItems.length > 0) {
      return res.status(400).json({
        error: 'Abgelaufene MHD-Werte nicht zulässig',
        message: 'Es wurden Artikel mit bereits abgelaufenen Mindesthaltbarkeitsdaten angegeben. Prüfen Sie die angegebenen MHD-Werte.',
        items: expiredItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          expiryDate: item.expiryDate
        }))
      });
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
            
            // Wenn ein MHD (expiryDate) angegeben ist, erstellen wir eine Charge (Batch)
            if (item.expiryDate) {
              try {
                // Generiere Chargennummer, falls keine angegeben wurde
                const batchNumber = item.batchNumber || `${order.orderNumber}-${new Date().toISOString().slice(0, 10)}`;
                
                // Prüfen, ob die Charge bereits existiert
                const existingBatch = await db
                  .select()
                  .from(productBatches)
                  .where(
                    and(
                      eq(productBatches.warehouseId, warehouseId),
                      eq(productBatches.productId, item.productId),
                      eq(productBatches.batchNumber, batchNumber)
                    )
                  )
                  .limit(1);
                
                const quantityToAdd = item.quantityDelivered || item.receivedQuantity || 0;
                
                if (existingBatch && existingBatch.length > 0) {
                  // Bestandserhöhung bei existierender Charge
                  const currentBatchQuantity = existingBatch[0].currentQuantity || 0;
                  
                  await db
                    .update(productBatches)
                    .set({
                      currentQuantity: currentBatchQuantity + quantityToAdd,
                      updatedAt: new Date()
                    })
                    .where(eq(productBatches.id, existingBatch[0].id));
                } else {
                  // Neue Charge erstellen
                  await db
                    .insert(productBatches)
                    .values({
                      productId: item.productId,
                      warehouseId: warehouseId,
                      batchNumber: batchNumber,
                      initialQuantity: quantityToAdd,
                      currentQuantity: quantityToAdd,
                      expiryDate: new Date(item.expiryDate),
                      receivedDate: new Date(receiptDate),
                      status: 'active',
                      locationInWarehouse: item.locationInWarehouse || null,
                      notes: item.notes || null,
                      createdAt: new Date(),
                      updatedAt: new Date()
                    });
                }
              } catch (batchError) {
                console.error(`Fehler beim Erstellen/Aktualisieren der Charge für Produkt ${item.productId}:`, batchError);
                // Fehler protokollieren, aber weitermachen
              }
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