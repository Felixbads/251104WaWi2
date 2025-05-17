import { Request, Response, Router } from "express";
import { db } from "../db";
import { orders, orderItems, suppliers, locations } from "@shared/schema";
import { storage } from "../storage";
import { eq, and, like, ilike, or, desc, asc, isNull, isNotNull, sql, count } from "drizzle-orm";
import { sendEmail } from "../services/emailService";
import { generatePdf } from "../services/pdfService";

const router = Router();

// Bestellungs-Statistiken abrufen
router.get("/statistics", async (req: Request, res: Response) => {
  try {
    const statistics = await storage.getOrderStatistics();
    res.json(statistics);
  } catch (error) {
    console.error("Fehler beim Abrufen der Bestellungs-Statistiken:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der Bestellungs-Statistiken" });
  }
});

// Bestellung als versendet markieren
router.post("/:id/mark-sent", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const { sentDate } = req.body;

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    // Aktuellen Status der Bestellung prüfen
    const existingOrder = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!existingOrder || existingOrder.length === 0) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }

    if (existingOrder[0].status !== 'draft') {
      return res.status(400).json({ 
        error: "Statusänderung nicht möglich", 
        message: `Die Bestellung hat bereits den Status '${existingOrder[0].status}' und kann nicht als versendet markiert werden.` 
      });
    }

    // Benutzer-Informationen für die Aktualisierung
    const lastModifiedById = req.user?.id || 1; // Fallback auf System-ID
    const lastModifiedByName = req.user?.username || "System";

    // Update-Daten vorbereiten
    const updateData = {
      status: 'shipped',
      sentDate: sentDate ? new Date(sentDate) : new Date(),
      sentById: lastModifiedById,
      sentByName: lastModifiedByName,
      lastModifiedById,
      lastModifiedByName,
      updatedAt: new Date()
    };

    // Bestellung aktualisieren
    const updatedOrder = await storage.updateOrder(orderId, updateData);

    if (!updatedOrder) {
      return res.status(500).json({ error: "Fehler beim Aktualisieren der Bestellung" });
    }

    res.json({
      success: true,
      message: "Bestellung erfolgreich als versendet markiert",
      data: updatedOrder
    });
  } catch (error) {
    console.error("Fehler beim Markieren der Bestellung als versendet:", error);
    res.status(500).json({ 
      error: "Fehler beim Markieren der Bestellung als versendet", 
      details: error.message 
    });
  }
});

// Bestellungen nach Lieferanten zählen
router.get("/countBySupplier", async (req: Request, res: Response) => {
  try {
    // SQL-Abfrage für Zählung nach Lieferant und Status
    const result = await db.execute(sql`
      SELECT 
        supplier_id as "supplierId", 
        supplier_name as "supplierName",
        COUNT(*) as "total",
        COUNT(CASE WHEN status = 'open' THEN 1 END) as "open",
        COUNT(CASE WHEN status = 'ordered' THEN 1 END) as "ordered",
        COUNT(CASE WHEN status = 'partial' THEN 1 END) as "partial",
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as "completed",
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as "cancelled"
      FROM orders
      WHERE supplier_id IS NOT NULL
      GROUP BY supplier_id, supplier_name
      ORDER BY "supplierName"
    `);
    
    // Ergebnisse umwandeln
    const supplierCounts = result.map(row => ({
      supplierId: Number(row.supplierId),
      supplierName: row.supplierName as string,
      total: Number(row.total),
      open: Number(row.open),
      ordered: Number(row.ordered),
      partial: Number(row.partial),
      completed: Number(row.completed),
      cancelled: Number(row.cancelled)
    }));
    
    res.json(supplierCounts);
  } catch (error) {
    console.error("Fehler beim Zählen der Bestellungen nach Lieferanten:", error);
    res.status(500).json({ error: "Fehler beim Zählen der Bestellungen nach Lieferanten" });
  }
});

// Alle Bestellungen abrufen mit Filteroptionen
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      limit = 50,
      offset = 0,
      status,
      supplier,
      location,
      dateFrom,
      dateTo,
      search
    } = req.query;

    // Erstelle einen Filter basierend auf den Query-Parametern
    const queryOptions: any = {};
    let whereClause: any[] = [];

    // Filtere nach Status
    if (status) {
      whereClause.push(eq(orders.status, status as string));
    } else {
      // Wenn kein Status angegeben ist, zeige alle Status einschließlich 'draft' und 'sent' an
      whereClause.push(
        or(
          eq(orders.status, "draft"),
          eq(orders.status, "open"), 
          eq(orders.status, "sent"),
          eq(orders.status, "ordered"),
          eq(orders.status, "partial"),
          eq(orders.status, "completed"),
          eq(orders.status, "cancelled")
        )
      );
    }

    // Filtere nach Lieferanten
    if (supplier) {
      if (!isNaN(parseInt(supplier as string))) {
        whereClause.push(eq(orders.supplierId, parseInt(supplier as string)));
      } else {
        whereClause.push(ilike(orders.supplierName, `%${supplier}%`));
      }
    }

    // Filtere nach Standort
    if (location) {
      if (!isNaN(parseInt(location as string))) {
        whereClause.push(eq(orders.locationId, parseInt(location as string)));
      } else {
        whereClause.push(ilike(orders.locationName, `%${location}%`));
      }
    }

    // Filtere nach Datum
    if (dateFrom) {
      const fromDate = new Date(dateFrom as string);
      whereClause.push(sql`${orders.orderDate} >= ${fromDate}`);
    }

    if (dateTo) {
      const toDate = new Date(dateTo as string);
      whereClause.push(sql`${orders.orderDate} <= ${toDate}`);
    }

    // Textsuche
    if (search) {
      whereClause.push(
        or(
          ilike(orders.orderNumber, `%${search}%`),
          ilike(orders.supplierName, `%${search}%`),
          ilike(orders.notes, `%${search}%`)
        )
      );
    }

    // Bestellungen zählen
    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(orders)
      .where(whereClause.length > 0 ? and(...whereClause) : undefined);

    const total = Number(countResult[0].count);

    // Bestellungen abrufen mit Pagination
    const ordersList = await db
      .select()
      .from(orders)
      .where(whereClause.length > 0 ? and(...whereClause) : undefined)
      .orderBy(desc(orders.orderDate))
      .limit(Number(limit))
      .offset(Number(offset));

    // Erweiterte Informationen für jede Bestellung abrufen
    const ordersWithDetails = await Promise.all(
      ordersList.map(async (order) => {
        // Bestellungspositionen zählen und Details abrufen
        const itemsCount = await db
          .select({ count: sql`count(*)` })
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));
          
        // Bestellpositionen abrufen
        const items = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));

        // Gesamtbetrag der Bestellung berechnen
        // Verwende die tatsächlichen Positionen oder berechne aus quantity * unitPrice
        let totalAmount = 0;
        if (items && items.length > 0) {
          totalAmount = items.reduce((sum, item) => {
            return sum + (Number(item.quantity) * Number(item.unitPrice) || 0);
          }, 0);
        }

        // Lager-Informationen abrufen
        let warehouseName = "";
        
        // Direkt den Lagernamen aus der Haupttabelle verwenden, falls vorhanden
        if (order.locationName) {
          warehouseName = order.locationName;
        }
        // Ansonsten über die locationId das Lager nachschlagen
        else if (order.locationId) {
          try {
            const locationResult = await db
              .select()
              .from(locations)
              .where(eq(locations.id, order.locationId));
            
            if (locationResult && locationResult.length > 0) {
              warehouseName = locationResult[0].name || "";
            }
          } catch (locationError) {
            console.error(`Fehler beim Abrufen des Lagernamens für ID ${order.locationId}:`, locationError);
          }
        }

        // Detaillierte Version des Order-Objekts zurückgeben
        console.log(`Bestellung ${order.id} hat ${items.length} Positionen mit Gesamtwert ${totalAmount} und Lager ${warehouseName}`);
        
        return {
          ...order,
          itemCount: Number(itemsCount[0].count),
          totalAmount: totalAmount,
          warehouseName: warehouseName,
          // Zusätzlich die Artikel mitliefern für die PDF-Generierung
          orderItems: items
        };
      })
    );

    // Metadaten für Pagination
    const meta = {
      total,
      offset: Number(offset),
      limit: Number(limit),
      page: Math.floor(Number(offset) / Number(limit)) + 1,
      pages: Math.ceil(total / Number(limit)),
    };

    res.json({
      data: ordersWithDetails,
      meta,
    });
  } catch (error) {
    console.error("Fehler beim Abrufen der Bestellungen:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der Bestellungen" });
  }
});

// Bestellungen für Dashboard (nur offene Bestellungen)
router.get("/dashboard/open", async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.query;

    // Nur offene und teilweise gelieferte Bestellungen abrufen
    const openOrders = await db
      .select()
      .from(orders)
      .where(
        or(
          eq(orders.status, "open"),
          eq(orders.status, "ordered"),
          eq(orders.status, "partial")
        )
      )
      .orderBy(desc(orders.orderDate))
      .limit(Number(limit));

    // Anzahl der Bestellpositionen für jede Bestellung abrufen
    const ordersWithItemCount = await Promise.all(
      openOrders.map(async (order) => {
        const items = await db
          .select({ count: sql`count(*)` })
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));

        return {
          ...order,
          itemCount: Number(items[0].count),
        };
      })
    );

    res.json(ordersWithItemCount);
  } catch (error) {
    console.error("Fehler beim Abrufen der offenen Bestellungen:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der offenen Bestellungen" });
  }
});



// Neue Bestellung erstellen
router.post("/", async (req: Request, res: Response) => {
  try {
    const orderData = req.body;
    console.log("Received order data:", JSON.stringify(orderData, null, 2));

    // Bestellnummer generieren, falls nicht angegeben
    if (!orderData.orderNumber) {
      const today = new Date();
      const dateString = today.toISOString().split('T')[0].replace(/-/g, '');
      
      // Datumsbereich für heute festlegen
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);
      
      // Zähle bestehende Bestellungen für heute
      const existingOrders = await db
        .select({ count: sql`count(*)` })
        .from(orders)
        .where(
          and(
            sql`${orders.orderDate} >= ${startOfDay}`,
            sql`${orders.orderDate} <= ${endOfDay}`
          )
        );
      
      const count = Number(existingOrders[0].count) + 1;
      orderData.orderNumber = `ORD-${dateString}-${count.toString().padStart(4, '0')}`;
    }

    // Pflichtfelder überprüfen
    if (!orderData.supplierId) {
      return res.status(400).json({ error: "Lieferant muss angegeben werden" });
    }

    if (!orderData.locationId) {
      return res.status(400).json({ error: "Lagerstandort muss angegeben werden" });
    }

    // Status setzen falls nicht angegeben
    if (!orderData.status) {
      orderData.status = "draft";
    }

    // Lieferanten-Name aus der ID abrufen
    if (orderData.supplierId && !orderData.supplierName) {
      const supplier = await storage.getSupplierById(orderData.supplierId);
      if (supplier) {
        orderData.supplierName = supplier.name;
      }
    }

    // Standort-Name aus der ID abrufen
    if (orderData.locationId && !orderData.locationName) {
      const location = await storage.getLocation(orderData.locationId);
      if (location) {
        orderData.locationName = location.name;
      }
    }
    
    // Gesamtbetrag sicherstellen
    if (typeof orderData.totalAmount !== 'number' || isNaN(orderData.totalAmount)) {
      orderData.totalAmount = 0;
    }

    // Benutzer-Informationen hinzufügen
    if (req.user && req.user.id) {
      orderData.createdById = req.user.id;
      orderData.createdByName = req.user.username || "System";
    } else {
      orderData.createdById = 1; // System-ID
      orderData.createdByName = "System";
    }

    // Datums- und Zeitfelder korrekt formatieren oder auf null setzen
    try {
      if (orderData.expectedDeliveryDate) {
        if (orderData.expectedDeliveryDate instanceof Date) {
          // Wenn es bereits ein Date-Objekt ist, behalten wir es
        } else if (typeof orderData.expectedDeliveryDate === 'string') {
          // Wenn es ein String ist, konvertieren wir es
          orderData.expectedDeliveryDate = new Date(orderData.expectedDeliveryDate);
          // Überprüfen, ob das Datum gültig ist
          if (isNaN(orderData.expectedDeliveryDate.getTime())) {
            console.warn("Ungültiges Datumsformat für expectedDeliveryDate:", orderData.expectedDeliveryDate);
            orderData.expectedDeliveryDate = null;
          }
        } else {
          // Bei allen anderen Typen setzen wir es auf null
          console.warn("Unerwarteter Typ für expectedDeliveryDate:", typeof orderData.expectedDeliveryDate);
          orderData.expectedDeliveryDate = null;
        }
      }
    } catch (dateError) {
      console.error("Fehler bei der Verarbeitung des Lieferdatums:", dateError);
      orderData.expectedDeliveryDate = null;
    }

    // Sicherstellen, dass alle erforderlichen Felder vorhanden sind
    const requiredFieldDefaults = {
      vatAmount: orderData.totalAmount * 0.19,
      discountAmount: 0,
      shippingCost: 0,
      notes: orderData.notes || '',
      paymentStatus: 'pending'
    };

    // Bestellpositionen trennen
    // Akzeptiere sowohl 'orderItems' als auch 'products' als Quelle der Bestellpositionen
    const { orderItems, products, ...orderOnly } = orderData;
    const itemsArray = orderItems || products || [];

    // Fehlende Felder setzen
    const completeOrderData = {
      ...requiredFieldDefaults,
      ...orderOnly
    };

    console.log("Creating order with data:", JSON.stringify(completeOrderData, null, 2));
    
    try {
      // Bestellung erstellen
      const newOrder = await storage.createOrder(completeOrderData);
      console.log("Order created successfully:", newOrder);

      // Bestellpositionen erstellen
      if (itemsArray && Array.isArray(itemsArray) && itemsArray.length > 0) {
        console.log(`Processing ${itemsArray.length} order items`);
        const orderItemsWithId = itemsArray.map((item, index) => ({
          ...item,
          orderId: newOrder.id,
          positionNumber: item.positionNumber || index + 1
        }));

        // Speichere alle Bestellpositionen direkt, ohne Promise.all zu verwenden
        // Das verhindert Race-Conditions und stellt sicher, dass alle Positionen gespeichert werden
        const savedItems = [];
        for (let index = 0; index < orderItemsWithId.length; index++) {
          try {
            const item = orderItemsWithId[index];
            
            // Sicherstellen, dass alle erforderlichen Felder für orderItem vorhanden sind
            const completeItem = {
              orderId: newOrder.id, // Nochmals sicherstellen, dass die Bestellungs-ID gesetzt ist
              productId: item.productId || null,
              productName: item.productName || 'Unbenanntes Produkt',
              quantity: typeof item.quantity === 'number' ? item.quantity : 1,
              unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : 0,
              totalPrice: typeof item.totalPrice === 'number' ? item.totalPrice : 
                         (typeof item.unitPrice === 'number' && typeof item.quantity === 'number' ? 
                          item.unitPrice * item.quantity : 0),
              unit: item.unit || 'stk',
              vatRate: typeof item.vatRate === 'number' ? item.vatRate : 19,
              positionNumber: index + 1,
              status: 'pending',
              sku: item.sku || '',
              supplierSku: item.supplierSku || ''
            };
            
            console.log(`Creating order item ${index + 1}:`, JSON.stringify(completeItem, null, 2));
            const savedItem = await storage.createOrderItem(completeItem);
            console.log(`Successfully created order item ${index + 1}:`, JSON.stringify(savedItem, null, 2));
            savedItems.push(savedItem);
          } catch (itemError) {
            console.error(`Error creating order item ${index + 1}:`, itemError);
            // Fehler protokollieren, aber weitermachen statt abzubrechen
            console.error(`Continuing with next item...`);
          }
        }
        
        console.log(`Successfully created ${savedItems.length} order items out of ${orderItemsWithId.length}`);
        
        // Aktualisiere die Bestellung mit der Anzahl der erstellten Positionen
        if (savedItems.length > 0) {
          await storage.updateOrder(newOrder.id, {
            itemCount: savedItems.length,
            lastModifiedAt: new Date()
          });
        }
      }

      // Vollständige Bestellung mit Positionen zurückgeben
      const completeOrder = await db
        .select()
        .from(orders)
        .where(eq(orders.id, newOrder.id))
        .limit(1);

      if (!completeOrder || completeOrder.length === 0) {
        return res.status(404).json({ error: "Erstellte Bestellung nicht gefunden" });
      }

      // Bestellpositionen abrufen
      const orderItemsList = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, newOrder.id));

      res.status(201).json({
        ...completeOrder[0],
        orderItems: orderItemsList
      });
    } catch (storageError) {
      console.error("Storage error while creating order:", storageError);
      res.status(500).json({ 
        error: "Fehler beim Erstellen der Bestellung in der Datenbank", 
        details: storageError.message,
        stack: storageError.stack
      });
    }
  } catch (error) {
    console.error("General error while creating order:", error);
    res.status(500).json({ 
      error: "Fehler beim Erstellen der Bestellung", 
      details: error.message,
      stack: error.stack 
    });
  }
});

// Bestellung aktualisieren
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const updateData = req.body;

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    // Benutzer-Informationen für die Aktualisierung hinzufügen
    if (req.user && req.user.id) {
      updateData.lastModifiedById = req.user.id;
      updateData.lastModifiedByName = req.user.username || "System";
    } else {
      updateData.lastModifiedById = 1; // System-ID
      updateData.lastModifiedByName = "System";
    }

    // Aktualisiere updateAt
    updateData.updatedAt = new Date();

    // Bestellung aktualisieren
    const updatedOrder = await storage.updateOrder(orderId, updateData);

    if (!updatedOrder) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }

    // Bestellpositionen getrennt behandeln
    if (updateData.orderItems && Array.isArray(updateData.orderItems)) {
      // Bestehende Positionen abrufen
      const existingItems = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      // Map für bestehende Positionen erstellen
      const existingItemsMap = new Map(existingItems.map(item => [item.id, item]));

      // Positionen aktualisieren oder erstellen
      await Promise.all(
        updateData.orderItems.map(async (item: any, index: number) => {
          // Positionsnummer aktualisieren
          const itemWithPosition = {
            ...item,
            positionNumber: index + 1
          };

          if (item.id && existingItemsMap.has(item.id)) {
            // Position aktualisieren
            await storage.updateOrderItem(item.id, {
              ...itemWithPosition,
              updatedAt: new Date()
            });
          } else {
            // Neue Position erstellen
            await storage.createOrderItem({
              ...itemWithPosition,
              orderId
            });
          }
        })
      );

      // Positionen entfernen, die nicht mehr vorhanden sind
      const newItemIds = updateData.orderItems.map((item: any) => item.id).filter(Boolean);
      const itemsToDelete = existingItems.filter(item => !newItemIds.includes(item.id));

      if (itemsToDelete.length > 0) {
        await Promise.all(
          itemsToDelete.map(item => storage.deleteOrderItem(item.id))
        );
      }
    }

    // Aktualisierte Bestellung mit Positionen zurückgeben
    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }

    // Bestellpositionen abrufen
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    res.json({
      ...order[0],
      orderItems: items
    });
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Bestellung:", error);
    res.status(500).json({ error: "Fehler beim Aktualisieren der Bestellung" });
  }
});

// Bestellstatus aktualisieren
router.put("/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const { status, note } = req.body;

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    // Status validieren
    const validStatuses = ["open", "ordered", "partial", "delivered", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Ungültiger Status" });
    }

    // Bestehende Bestellung abrufen
    const existingOrder = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!existingOrder || existingOrder.length === 0) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }

    // Statusänderungsdaten
    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    // Bei Lieferung das tatsächliche Lieferdatum setzen
    if (status === "delivered" || status === "completed") {
      updateData.actualDeliveryDate = new Date();
    }

    // Benutzer-Informationen für die Aktualisierung hinzufügen
    if (req.user && req.user.id) {
      updateData.lastModifiedById = req.user.id;
      updateData.lastModifiedByName = req.user.username || "System";
    } else {
      updateData.lastModifiedById = 1; // System-ID
      updateData.lastModifiedByName = "System";
    }

    // Status-Historie aktualisieren
    const currentStatusHistory = existingOrder[0].statusHistory 
      ? JSON.parse(existingOrder[0].statusHistory)
      : [];

    const newStatusEntry = {
      status,
      timestamp: new Date().toISOString(),
      user: updateData.lastModifiedByName,
      note: note || `Status geändert zu: ${status}`
    };

    updateData.statusHistory = JSON.stringify([
      ...currentStatusHistory,
      newStatusEntry
    ]);

    // Bestellung aktualisieren
    const updatedOrder = await storage.updateOrder(orderId, updateData);

    if (!updatedOrder) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }

    // Aktualisierte Bestellung zurückgeben
    res.json(updatedOrder);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Bestellstatus:", error);
    res.status(500).json({ error: "Fehler beim Aktualisieren des Bestellstatus" });
  }
});

// Bestellposition hinzufügen
router.post("/:id/items", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const itemData = req.body;

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    // Prüfen, ob die Bestellung existiert
    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }

    // Bestehende Positionen abrufen für Positionsnummer
    const existingItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    // Neue Positionsnummer
    const positionNumber = existingItems.length + 1;

    // Bestellposition erstellen
    const newItem = await storage.createOrderItem({
      ...itemData,
      orderId,
      positionNumber
    });

    // Gesamtbetrag der Bestellung aktualisieren
    const totalAmount = existingItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    ) + newItem.totalPrice;

    await storage.updateOrder(orderId, {
      totalAmount,
      updatedAt: new Date()
    });

    res.status(201).json(newItem);
  } catch (error) {
    console.error("Fehler beim Hinzufügen der Bestellposition:", error);
    res.status(500).json({ error: "Fehler beim Hinzufügen der Bestellposition" });
  }
});

// Bestellposition aktualisieren
router.put("/:orderId/items/:itemId", async (req: Request, res: Response) => {
  try {
    const { orderId, itemId } = req.params;
    const orderIdNum = parseInt(orderId);
    const itemIdNum = parseInt(itemId);
    const itemData = req.body;

    if (isNaN(orderIdNum) || isNaN(itemIdNum)) {
      return res.status(400).json({ error: "Ungültige ID" });
    }

    // Prüfen, ob die Position existiert und zur Bestellung gehört
    const item = await db
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.id, itemIdNum),
          eq(orderItems.orderId, orderIdNum)
        )
      )
      .limit(1);

    if (!item || item.length === 0) {
      return res.status(404).json({ error: "Bestellposition nicht gefunden" });
    }

    // Bestellposition aktualisieren
    const updatedItem = await storage.updateOrderItem(itemIdNum, {
      ...itemData,
      updatedAt: new Date()
    });

    if (!updatedItem) {
      return res.status(404).json({ error: "Bestellposition nicht gefunden" });
    }

    // Gesamtbetrag der Bestellung aktualisieren
    const allItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderIdNum));

    const totalAmount = allItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    );

    await storage.updateOrder(orderIdNum, {
      totalAmount,
      updatedAt: new Date()
    });

    res.json(updatedItem);
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Bestellposition:", error);
    res.status(500).json({ error: "Fehler beim Aktualisieren der Bestellposition" });
  }
});

// Bestellposition löschen
router.delete("/:orderId/items/:itemId", async (req: Request, res: Response) => {
  try {
    const { orderId, itemId } = req.params;
    const orderIdNum = parseInt(orderId);
    const itemIdNum = parseInt(itemId);

    if (isNaN(orderIdNum) || isNaN(itemIdNum)) {
      return res.status(400).json({ error: "Ungültige ID" });
    }

    // Prüfen, ob die Position existiert und zur Bestellung gehört
    const item = await db
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.id, itemIdNum),
          eq(orderItems.orderId, orderIdNum)
        )
      )
      .limit(1);

    if (!item || item.length === 0) {
      return res.status(404).json({ error: "Bestellposition nicht gefunden" });
    }

    // Bestellposition löschen
    const deleted = await storage.deleteOrderItem(itemIdNum);

    if (!deleted) {
      return res.status(500).json({ error: "Bestellposition konnte nicht gelöscht werden" });
    }

    // Gesamtbetrag der Bestellung aktualisieren
    const remainingItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderIdNum));

    const totalAmount = remainingItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    );

    await storage.updateOrder(orderIdNum, {
      totalAmount,
      updatedAt: new Date()
    });

    res.json({ success: true, message: "Bestellposition erfolgreich gelöscht" });
  } catch (error) {
    console.error("Fehler beim Löschen der Bestellposition:", error);
    res.status(500).json({ error: "Fehler beim Löschen der Bestellposition" });
  }
});

// Wareneingang erfassen mit MHD und Chargen-Tracking
router.post("/:id/receipt", async (req: Request, res: Response) => {
  try {
    console.log("Wareneingang-Daten erhalten:", JSON.stringify(req.body, null, 2));
    
    const { id } = req.params;
    const orderId = parseInt(id);
    const {
      receiptDate,
      receiptNumber,
      deliveryNoteNumber,
      qualityCheckPassed,
      notes,
      isComplete: formIsComplete,
      // Unterstützt sowohl "items" als auch "receivedItems", um Kompatibilität sicherzustellen
      items, 
      receivedItems
    } = req.body;
    
    // Verwende receivedItems, wenn vorhanden, sonst items
    const itemsToProcess = receivedItems || items || [];

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    // Prüfen, ob die Bestellung existiert
    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }

    // Validieren, dass der Status für einen Wareneingang geeignet ist
    if (order[0].status !== "ordered" && order[0].status !== "pending" && 
        order[0].status !== "shipped" && order[0].status !== "partial") {
      return res.status(400).json({ 
        error: "Wareneingang kann nur für Bestellungen im Status 'ordered', 'pending', 'shipped' oder 'partial' erfasst werden" 
      });
    }

    // Prüfen, ob es sich um einen vollständigen oder teilweisen Wareneingang handelt
    const allOrderItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    let isComplete = formIsComplete;
    let hasDelivery = false;

    // Bestellpositionen und Batches aktualisieren
    if (items && Array.isArray(items)) {
      for (const item of items) {
        const orderItem = allOrderItems.find(oi => oi.id === item.orderItemId);
        
        if (!orderItem) {
          console.log(`Bestellposition ${item.orderItemId} nicht gefunden`);
          continue; // Position nicht gefunden
        }

        // Überprüfen, ob etwas geliefert wurde
        if (item.receivedQuantity > 0) {
          hasDelivery = true;
          console.log(`Position ${orderItem.id} hat Liefermenge ${item.receivedQuantity}`);
          
          // Wareneingang für diese Position erfassen
          await storage.updateOrderItem(orderItem.id, {
            quantityDelivered: (orderItem.quantityDelivered || 0) + item.receivedQuantity,
            status: item.qualityCheck ? "received_ok" : "received_issues",
            notes: item.notes || orderItem.notes
          });

          // Jetzt müssen wir einen Batch mit MHD erstellen und den Lagerbestand aktualisieren
          try {
            // 1. Lagerort aus der Bestellung ermitteln
            const warehouseId = order[0].locationId || 1; // Falls kein Lagerort festgelegt ist, Standard verwenden
            
            // 2. Produkt-Batch erstellen mit MHD und Chargennummer
            // Datum-Validierung für mehr Robustheit
            let parsedExpiryDate;
            try {
              // Sicherstellen, dass das MHD ein gültiges Datum ist
              parsedExpiryDate = item.expiryDate ? new Date(item.expiryDate) : new Date();
              if (isNaN(parsedExpiryDate.getTime())) {
                // Fallback zu einem Standarddatum (3 Monate in die Zukunft)
                const fallbackDate = new Date();
                fallbackDate.setMonth(fallbackDate.getMonth() + 3);
                parsedExpiryDate = fallbackDate;
                console.warn(`Ungültiges Ablaufdatum für Artikel ${item.productId}, verwende Standarddatum`);
              }
            } catch (dateError) {
              console.error("Fehler bei der Datumkonvertierung:", dateError);
              // Fallback-Datum (3 Monate in die Zukunft)
              const fallbackDate = new Date();
              fallbackDate.setMonth(fallbackDate.getMonth() + 3);
              parsedExpiryDate = fallbackDate;
            }
            
            // Empfangsdatum validieren
            let parsedReceivedDate;
            try {
              parsedReceivedDate = receiptDate ? new Date(receiptDate) : new Date();
              if (isNaN(parsedReceivedDate.getTime())) {
                parsedReceivedDate = new Date();
              }
            } catch (dateError) {
              console.error("Fehler beim Parsen des Eingangsdatums:", dateError);
              parsedReceivedDate = new Date();
            }
            
            const batchData = {
              productId: item.productId,
              warehouseId,
              batchNumber: item.batchNumber || `BATCH-${Date.now()}`,
              supplierBatchNumber: item.supplierBatchNumber || null,
              initialQuantity: item.receivedQuantity,
              currentQuantity: item.receivedQuantity,
              receivedDate: parsedReceivedDate,
              // Entfernt: manufacturingDate (existiert nicht in der Tabelle)
              expiryDate: parsedExpiryDate,
              orderId,
              supplierId: order[0].supplierId,
              status: item.qualityCheck ? "active" : "quarantine",
              locationInWarehouse: item.locationInWarehouse || null,
              notes: item.notes || null,
              createdAt: new Date(),
              updatedAt: new Date()
            };

            // Batch in der Datenbank speichern
            const newBatch = await db.insert(productBatches).values(batchData).returning();
            
            // 3. Lagerbestand aktualisieren
            const existingItem = await storage.getInventoryItemByProductAndWarehouse(
              item.productId, 
              warehouseId
            );

            if (existingItem) {
              // Bestand erhöhen
              await storage.updateInventoryItem(existingItem.id, {
                quantity: existingItem.quantity + item.receivedQuantity,
                lastCountDate: new Date(),
                updatedAt: new Date()
              });
            } else {
              // Neuen Lagerbestand anlegen
              await storage.createInventoryItem({
                productId: item.productId,
                warehouseId,
                quantity: item.receivedQuantity,
                minQuantity: 0,
                reorderPoint: 0,
                status: "active",
                lastCountDate: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
              });
            }

            // 4. Bewegung für den Bestandszugang erfassen
            await storage.createInventoryMovement({
              productId: item.productId,
              quantity: item.receivedQuantity,
              movementType: "receipt",
              sourceType: "supplier",
              sourceId: order[0].supplierId?.toString() || "",
              destinationType: "warehouse",
              destinationId: warehouseId.toString(),
              referenceType: "order",
              referenceId: orderId.toString(),
              reason: "Wareneingang",
              notes: `Wareneingang aus Bestellung ${order[0].orderNumber}, Charge: ${item.batchNumber}`,
              batchNumber: item.batchNumber,
              expiryDate: parsedExpiryDate,
              performedBy: "system"
            });
          } catch (error) {
            console.error("Fehler beim Erstellen von Batches und Lagerbestand:", error);
            // Fehler nicht weitergeben, stattdessen Logging, damit der Wareneingang trotzdem verarbeitet wird
          }
        }
      }
    }

    // Wenn keine Lieferung dabei ist, prüfen wir als Alternative auch itemsToProcess
    let hasAnyDelivery = hasDelivery;
    
    // Alternative Prüfung: Schauen, ob in itemsToProcess gültige Liefermengen sind
    if (!hasAnyDelivery && itemsToProcess && Array.isArray(itemsToProcess)) {
      const itemsWithQuantity = itemsToProcess.filter(item => item.receivedQuantity > 0);
      hasAnyDelivery = itemsWithQuantity.length > 0;
      
      if (hasAnyDelivery) {
        console.log("Liefermengen in itemsToProcess gefunden:", JSON.stringify(itemsWithQuantity, null, 2));
      }
    }
    
    // Wenn wirklich keine Lieferung gefunden wurde, Fehler zurückgeben
    if (!hasAnyDelivery) {
      console.error("Keine Liefermengen angegeben. Request body:", JSON.stringify(req.body, null, 2));
      return res.status(400).json({ error: "Keine Liefermengen angegeben" });
    }

    // Überprüfen, ob alle Positionen vollständig geliefert wurden - isComplete Flag berechnen
    if (!isComplete) {
      console.log("Prüfe automatisch ob Bestellung komplett geliefert ist...");
      let allItemsComplete = true;
      
      // Alle Bestellpositionen mit aktuellen Lieferdaten aktualisieren
      const updatedOrderItems = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      
      // Überprüfen, ob für jede Position die bestellte Menge = gelieferte Menge ist
      for (const orderItem of updatedOrderItems) {
        // Berechnung der gelieferten Menge: bereits gelieferte Menge + neue Menge aus aktuellem Wareneingang
        const itemInCurrentDelivery = items?.find(i => i.orderItemId === orderItem.id) || 
                                      itemsToProcess?.find(i => i.orderItemId === orderItem.id);
        
        const newlyDeliveredQuantity = itemInCurrentDelivery?.receivedQuantity || 0;
        const totalDeliveredQuantity = (orderItem.quantityDelivered || 0) + newlyDeliveredQuantity;
        
        // Wenn eine Position noch nicht vollständig geliefert ist, ist die gesamte Bestellung nicht komplett
        if (totalDeliveredQuantity < orderItem.orderedQuantity) {
          allItemsComplete = false;
          console.log(`Position ${orderItem.id} nicht vollständig: bestellt=${orderItem.orderedQuantity}, geliefert=${totalDeliveredQuantity}`);
          break;
        }
      }
      
      isComplete = allItemsComplete;
      console.log(`Bestellung ist ${isComplete ? 'vollständig' : 'teilweise'} geliefert.`);
    }

    // Status der Bestellung aktualisieren
    const newStatus = isComplete ? "completed" : "partial";
    
    // Dokumente als JSON-String speichern
    let documents = [];
    if (order[0].documents) {
      try {
        documents = JSON.parse(order[0].documents);
      } catch (e) {
        documents = [];
      }
    }

    // Neues Dokument hinzufügen, wenn vorhanden
    if (deliveryNoteNumber) {
      documents.push({
        type: "deliveryNote",
        number: deliveryNoteNumber,
        date: receiptDate || new Date().toISOString(),
        filename: `${deliveryNoteNumber.replace(/\s/g, '_')}.pdf`
      });
    }

    // Bestellung aktualisieren
    const updateData: any = {
      status: newStatus,
      actualDeliveryDate: receiptDate || new Date(),
      documents: JSON.stringify(documents),
      notes: notes ? (order[0].notes ? `${order[0].notes}\n\n${notes}` : notes) : order[0].notes,
      updatedAt: new Date()
    };

    // Statushistorie aktualisieren - sicherstellen, dass wir immer mit einem Array arbeiten
    let statusHistory;
    try {
      // Falls es ein String ist, versuchen wir es zu parsen
      statusHistory = typeof order[0].statusHistory === 'string' 
        ? JSON.parse(order[0].statusHistory) 
        : (Array.isArray(order[0].statusHistory) 
            ? order[0].statusHistory 
            : []);
    } catch (error) {
      console.error("Fehler beim Parsen der Statushistorie:", error);
      statusHistory = [];
    }

    // Neuen Status hinzufügen
    statusHistory.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      note: `Wareneingang erfasst: ${isComplete ? 'Vollständig' : 'Teilweise'}`
    });

    // Immer als String speichern, für Konsistenz
    updateData.statusHistory = JSON.stringify(statusHistory);

    // Bestellung aktualisieren
    const updatedOrder = await storage.updateOrder(orderId, updateData);

    // Lagerbestand aktualisieren für jede Position mit Wareneingang
    if (receivedItems && Array.isArray(receivedItems)) {
      for (const receivedItem of receivedItems) {
        if (receivedItem.receivedQuantity <= 0) continue;
        
        console.log(`Verarbeite receivedItem:`, JSON.stringify(receivedItem, null, 2));
        
        // Finde die entsprechende Bestellposition für Produkt-ID und Lager-ID
        const orderItem = allOrderItems.find(item => item.id === receivedItem.orderItemId);
        if (!orderItem || !orderItem.productId) {
          console.log(`Keine passende Bestellposition für ID ${receivedItem.orderItemId} gefunden`);
          continue;
        }
        
        // Standardmäßig das Lager vom Bestellkopf verwenden
        const warehouseId = order[0].warehouseId;
        if (!warehouseId) {
          console.warn(`Kein Lager für Bestellung ${orderId} gefunden, Bestand wird nicht aktualisiert`);
          continue;
        }
        
        try {
          // Prüfen, ob bereits ein Eintrag für dieses Produkt im Lager existiert
          const inventoryItem = await storage.getInventoryItemByProductAndWarehouse(
            orderItem.productId, 
            warehouseId
          );
          
          if (inventoryItem) {
            // Lagerbestand erhöhen
            await storage.updateInventoryItem(inventoryItem.id, {
              quantity: inventoryItem.quantity + receivedItem.receivedQuantity
            });
            
            console.log(`Lagerbestand für Produkt ${orderItem.productId} im Lager ${warehouseId} 
              von ${inventoryItem.quantity} auf ${inventoryItem.quantity + receivedItem.receivedQuantity} erhöht`);
          } else {
            // Neuen Lagerbestand anlegen
            await storage.createInventoryItem({
              productId: orderItem.productId,
              warehouseId: warehouseId,
              quantity: receivedItem.receivedQuantity,
              minQuantity: 0,
              lastCountDate: new Date()
            });
            
            console.log(`Neuer Lagerbestand für Produkt ${orderItem.productId} im Lager ${warehouseId} 
              mit Menge ${receivedItem.receivedQuantity} angelegt`);
          }
          
          // Warenbewegung erfassen
          await storage.createInventoryMovement({
            destinationWarehouseId: warehouseId,
            productId: orderItem.productId,
            quantity: receivedItem.receivedQuantity,
            movementType: "IN",
            referenceType: "ORDER",
            referenceId: orderId.toString(),
            status: "completed",
            notes: `Wareneingang aus Bestellung #${order[0].orderNumber}`
          });
        } catch (error) {
          console.error(`Fehler bei der Lagerbestandsaktualisierung für Produkt ${orderItem.productId}:`, error);
          // Wir werfen den Fehler nicht weiter, damit die Bestellung trotzdem als empfangen markiert wird
        }
      }
    }

    res.json({
      success: true,
      isComplete,
      order: updatedOrder,
      message: "Wareneingang erfolgreich erfasst und Lagerbestand aktualisiert"
    });
  } catch (error) {
    console.error("Fehler beim Erfassen des Wareneingangs:", error);
    res.status(500).json({ error: "Fehler beim Erfassen des Wareneingangs" });
  }
});

// PDF einer Bestellung herunterladen
router.get("/:id/pdf", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    console.log(`PDF für Bestellung ${orderId} wird generiert`);
    
    // Neuen PDF-Generator direkt mit der Bestellungs-ID verwenden
    // Diese Methode lädt alle benötigten Daten direkt aus der Datenbank
    const { generatePdf } = await import('../services/pdfService');
    const pdfBuffer = await generatePdf(orderId);
    
    // Bestellnummer abrufen für den Dateinamen
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId)
    });
    
    const orderNumber = order?.orderNumber || orderId.toString();
    
    console.log(`PDF erfolgreich generiert (${pdfBuffer.length} Bytes)`);
    
    // PDF an den Client senden
    res.contentType("application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Bestellung_${orderNumber}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Fehler beim Generieren des PDFs:", error);
    // Verbesserte Fehlerbehandlung mit mehr Details
    return res.status(500).json({ 
      error: "Fehler beim Generieren des PDFs",
      message: error instanceof Error ? error.message : "Unbekannter Fehler",
      details: "Bitte versuchen Sie es erneut oder kontaktieren Sie den Support."
    });
  }
});

// Bestellung löschen
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    // Prüfen, ob die Bestellung existiert
    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }

    // Bestellpositionen löschen
    await db
      .delete(orderItems)
      .where(eq(orderItems.orderId, orderId));

    // Bestellung löschen
    await db
      .delete(orders)
      .where(eq(orders.id, orderId));

    res.json({ success: true, message: "Bestellung erfolgreich gelöscht" });
  } catch (error) {
    console.error("Fehler beim Löschen der Bestellung:", error);
    res.status(500).json({ error: "Fehler beim Löschen der Bestellung" });
  }
});

// E-Mail-Vorlage für eine Bestellung abrufen
router.get("/:id/email-template", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const { type = 'standard' } = req.query;
    const templateType = type as string;

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

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

    // E-Mail-Vorlage erstellen
    const emailTemplate = createOrderEmailTemplate(order, supplier || {}, templateType);

    // E-Mail-Betreff erstellen
    let subject = "";
    switch (templateType) {
      case "dringend":
        subject = `DRINGEND: Bestellung ${order.orderNumber} - ${order.supplierName || supplier?.name || 'Unbekannt'}`;
        break;
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
router.post("/:id/email", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const { supplierEmail, subject, content, additionalNotes } = req.body;
    const to = supplierEmail; // Umbenennung für Kompatibilität mit Frontend

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    if (!to || !to.includes('@')) {
      return res.status(400).json({ error: "Eine gültige E-Mail-Adresse des Empfängers muss angegeben werden" });
    }

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

    // Bestellpositionen abrufen
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

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

    // Tabelle mit Bestellpositionen erstellen
    const itemsTable = createOrderItemsTable(items);

    // HTML-Inhalt für die E-Mail
    let htmlContent;
    
    if (content) {
      // Benutzerdefinierter Inhalt wird verwendet
      htmlContent = content;
      
      // Bestelldetails einfügen, falls Platzhalter vorhanden sind
      if (htmlContent.includes('{{orderItems}}')) {
        htmlContent = htmlContent.replace('{{orderItems}}', itemsTable);
      }
    } else {
      // Standardvorlage basierend auf dem Typ verwenden
      const emailTemplate = createOrderEmailTemplate(order, supplier || { name: order.supplierName || "Unbekannter Lieferant" }, templateType);
      
      // HTML für E-Mail mit Tabelle ergänzen
      htmlContent = emailTemplate.replace('{{orderItems}}', itemsTable);
    }
    
    // Absender-E-Mail
    const fromEmail = "bestellung@proviantomat.de";
    
    // PDF für Anhang generieren
    const pdfBuffer = await generatePdf({
      ...order,
      orderItems: items
    });
    
    console.log(`PDF für E-Mail generiert (${pdfBuffer.length} Bytes)`);
    
    // Speichere die PDF temporär
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const pdfFilename = path.join(tempDir, `bestellung_${order.orderNumber}.pdf`);
    fs.writeFileSync(pdfFilename, pdfBuffer);
    
    console.log(`PDF gespeichert in ${pdfFilename}`);
    
    // E-Mail mit Anhang senden
    const result = await sendEmail({
      to: to,
      from: fromEmail,
      subject: subject,
      html: htmlContent,
      attachments: [
        {
          filename: `Bestellung_${order.orderNumber}.pdf`,
          path: pdfFilename
        }
      ]
    });

    if (result) {
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

      return res.json({
        success: true,
        message: "E-Mail wurde erfolgreich versendet"
      });
    } else {
      return res.status(500).json({
        error: "E-Mail konnte nicht versendet werden",
        technicalDetails: "Fehler beim Senden der E-Mail"
      });
    }
  } catch (error) {
    console.error("Fehler beim Senden der Bestellungs-E-Mail:", error);
    res.status(500).json({
      error: "Fehler beim Senden der E-Mail",
      details: (error as Error).message
    });
  }
});

// Eine bestimmte Bestellung abrufen
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    // Bestellung abrufen
    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }

    // Bestellpositionen abrufen
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    // Lieferanten-Details abrufen
    let supplier = null;
    if (order[0].supplierId) {
      supplier = await storage.getSupplierById(order[0].supplierId);
    }

    res.json({
      ...order[0],
      orderItems: items,
      supplier,
    });
  } catch (error) {
    console.error("Fehler beim Abrufen der Bestellungsdetails:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der Bestellungsdetails" });
  }
});

// Bestellpositionen einer Bestellung abrufen (GET)
router.get("/:id/items", async (req: Request, res: Response) => {
  try {
    console.log(`[GET] Bestellpositionen werden für Bestellung ${req.params.id} abgerufen...`);
    const { id } = req.params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    // Prüfen, ob die Bestellung existiert
    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Bestellung nicht gefunden" });
    }

    console.log(`[GET] Bestellung ${orderId} gefunden, lade Bestellpositionen...`);
    
    try {
      // Bestellpositionen direkt aus der Datenbank abrufen
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      
      console.log(`[GET] ${items.length} Bestellpositionen für Bestellung ${orderId} gefunden`);

      // Direkt antworten mit den Items ohne weitere Verarbeitung für mehr Zuverlässigkeit
      res.json(items);
      
    } catch (error) {
      console.error(`[GET] Fehler beim Laden der Bestellpositionen für Bestellung ${orderId}:`, error);
      res.status(500).json({
        error: "Fehler beim Abrufen der Bestellpositionen",
        message: "Die Bestellpositionen konnten nicht geladen werden."
      });
    }
  } catch (error) {
    console.error("[GET] Allgemeiner Fehler beim Abrufen der Bestellpositionen:", error);
    res.status(500).json({
      error: "Fehler beim Abrufen der Bestellpositionen",
      message: error instanceof Error ? error.message : "Ein unerwarteter Fehler ist aufgetreten."
    });
  }
});

// Neue dedizierte API für PDF-Daten - liefert alle Daten für PDF-Erstellung in einem Aufruf
router.get("/:id/pdf-data", async (req: Request, res: Response) => {
  try {
    console.log(`📄 PDF-Daten werden für Bestellung ${req.params.id} gesammelt...`);
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
    console.log(`📄 Bestellung ${orderId} gefunden, sammle alle benötigten Daten...`);
    
    try {
      // 1. Bestellpositionen abrufen
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      
      console.log(`📄 ${items.length} Bestellpositionen für PDF-Daten gefunden`);
      
      // 2. Lieferanten-Informationen (falls vorhanden)
      let supplier = null;
      if (order.supplierId) {
        try {
          const supplierResult = await db
            .select()
            .from(suppliers)
            .where(eq(suppliers.id, order.supplierId))
            .limit(1);
          
          if (supplierResult && supplierResult.length > 0) {
            supplier = supplierResult[0];
            console.log(`📄 Lieferanten-Informationen für PDF-Daten gefunden: ${supplier.name}`);
          }
        } catch (supplierError) {
          console.error(`📄 Fehler beim Abrufen des Lieferanten:`, supplierError);
          // Kein Abbruch, nur Logging
        }
      }
      
      // 3. Lager-Informationen (falls vorhanden)
      let warehouse = null;
      if (order.warehouseId) {
        try {
          const warehouseResult = await db
            .select()
            .from(warehouses)
            .where(eq(warehouses.id, order.warehouseId))
            .limit(1);
          
          if (warehouseResult && warehouseResult.length > 0) {
            warehouse = warehouseResult[0];
            console.log(`📄 Lager-Informationen für PDF-Daten gefunden: ${warehouse.name}`);
          }
        } catch (warehouseError) {
          console.error(`📄 Fehler beim Abrufen des Lagers:`, warehouseError);
          // Kein Abbruch, nur Logging
        }
      }
      
      // 4. Produkt-Informationen für jede Position
      const enrichedItems = await Promise.all(
        items.map(async (item) => {
          let product = null;
          
          // Wenn eine Produkt-ID vorhanden ist, Produkt-Details abrufen
          if (item.productId) {
            try {
              const productResult = await db
                .select()
                .from(products)
                .where(eq(products.id, item.productId))
                .limit(1);
                
              if (productResult && productResult.length > 0) {
                product = productResult[0];
              }
            } catch (productError) {
              console.error(`📄 Fehler beim Abrufen des Produkts ${item.productId}:`, productError);
              // Fehler im Produkt sollte nicht zum Abbruch führen
            }
          }
          
          // Produkt- und Item-Informationen zusammenführen
          return {
            ...item,
            productDetails: product || {
              name: item.productName || "Unbekanntes Produkt",
              sku: item.sku || ""
            }
          };
        })
      );
      
      // Alle Daten zusammenführen und zurückgeben
      const pdfData = {
        order,
        items: enrichedItems,
        supplier,
        warehouse,
        // Zusätzliche Metadaten für die PDF-Erstellung
        metadata: {
          generatedAt: new Date().toISOString(),
          totalItems: items.length,
          totalAmount: order.totalAmount || items.reduce((sum, item) => sum + (item.totalPrice || 0), 0)
        }
      };
      
      console.log(`📄 PDF-Daten erfolgreich gesammelt, sende Antwort...`);
      res.json(pdfData);
      
    } catch (dataError) {
      console.error(`📄 Fehler beim Sammeln der PDF-Daten:`, dataError);
      
      // Im Fehlerfall eine Minimal-Struktur zurückgeben mit leeren Arrays für die Items
      res.json({
        order: orderResult[0],
        items: [],
        supplier: null,
        warehouse: null,
        metadata: {
          generatedAt: new Date().toISOString(),
          error: true,
          errorMessage: "Fehler beim Laden der vollständigen Daten"
        }
      });
    }
  } catch (error) {
    console.error("📄 Kritischer Fehler beim Sammeln der PDF-Daten:", error);
    res.status(500).json({
      error: "Fehler bei der PDF-Datenerstellung",
      message: error instanceof Error ? error.message : "Ein unerwarteter Fehler ist aufgetreten."
    });
  }
});

// API-Endpunkt zum manuellen Erstellen von Bestellpositionen
router.post("/order-items", async (req: Request, res: Response) => {
  try {
    const itemData = req.body;
    
    // Prüfen, ob alle Pflichtfelder vorhanden sind
    if (!itemData.orderId) {
      return res.status(400).json({ error: "Bestellungs-ID muss angegeben werden" });
    }
    
    if (!itemData.productName) {
      return res.status(400).json({ error: "Produktname muss angegeben werden" });
    }
    
    // Bestellposition erstellen mit Standardwerten für fehlende Felder
    const completeItemData = {
      orderId: itemData.orderId,
      productId: itemData.productId || null,
      productName: itemData.productName,
      quantity: itemData.quantity || 1,
      unitPrice: itemData.unitPrice || 0,
      totalPrice: itemData.totalPrice || (itemData.unitPrice || 0) * (itemData.quantity || 1),
      unit: itemData.unit || 'stk',
      vatRate: itemData.vatRate || 19,
      status: itemData.status || 'pending',
      positionNumber: itemData.positionNumber || 1,
      sku: itemData.sku || '',
      supplierSku: itemData.supplierSku || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log("Erstelle Bestellposition manuell:", JSON.stringify(completeItemData, null, 2));
    
    // Bestellposition in der Datenbank speichern
    const savedItem = await storage.createOrderItem(completeItemData);
    
    // Bestellung aktualisieren mit der Anzahl der Bestellpositionen
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, itemData.orderId));
    
    // Bestellung aktualisieren mit der Anzahl der Bestellpositionen
    await storage.updateOrder(itemData.orderId, {
      itemCount: items.length,
      lastModifiedAt: new Date()
    });
    
    res.status(201).json(savedItem);
  } catch (error) {
    console.error("Fehler beim Erstellen der Bestellposition:", error);
    res.status(500).json({ 
      error: "Fehler beim Erstellen der Bestellposition", 
      details: error.message 
    });
  }
});

export default router;