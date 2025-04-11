import { Request, Response, Router } from "express";
import { db } from "../db";
import { orders, orderItems } from "@shared/schema";
import { storage } from "../storage";
import { eq, and, like, ilike, or, desc, asc, isNull, isNotNull, sql, count } from "drizzle-orm";

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

    // Anzahl der Bestellpositionen für jede Bestellung abrufen
    const ordersWithItemCount = await Promise.all(
      ordersList.map(async (order) => {
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

    // Metadaten für Pagination
    const meta = {
      total,
      offset: Number(offset),
      limit: Number(limit),
      page: Math.floor(Number(offset) / Number(limit)) + 1,
      pages: Math.ceil(total / Number(limit)),
    };

    res.json({
      data: ordersWithItemCount,
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

    // Benutzer-Informationen hinzufügen
    if (req.user && req.user.id) {
      orderData.createdById = req.user.id;
      orderData.createdByName = req.user.username || "System";
    } else {
      orderData.createdById = 1; // System-ID
      orderData.createdByName = "System";
    }

    // Bestellpositionen trennen
    const { orderItems: itemsArray, ...orderOnly } = orderData;

    // Bestellung erstellen
    const newOrder = await storage.createOrder(orderOnly);

    // Bestellpositionen erstellen
    if (itemsArray && Array.isArray(itemsArray) && itemsArray.length > 0) {
      const orderItemsWithId = itemsArray.map((item, index) => ({
        ...item,
        orderId: newOrder.id,
        positionNumber: item.positionNumber || index + 1
      }));

      await Promise.all(
        orderItemsWithId.map(item => storage.createOrderItem(item))
      );
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
    const orderItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, newOrder.id));

    res.status(201).json({
      ...completeOrder[0],
      orderItems
    });
  } catch (error) {
    console.error("Fehler beim Erstellen der Bestellung:", error);
    res.status(500).json({ error: "Fehler beim Erstellen der Bestellung" });
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

// Wareneingang erfassen
router.post("/:id/receipt", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const {
      receiptDate,
      receiptNumber,
      deliveryNoteNumber,
      qualityCheckPassed,
      notes,
      receivedItems
    } = req.body;

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
    if (order[0].status !== "ordered" && order[0].status !== "partial") {
      return res.status(400).json({ 
        error: "Wareneingang kann nur für Bestellungen im Status 'ordered' oder 'partial' erfasst werden" 
      });
    }

    // Prüfen, ob es sich um einen vollständigen oder teilweisen Wareneingang handelt
    const allOrderItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    let isComplete = true;
    let hasDelivery = false;

    // Bestellpositionen aktualisieren
    if (receivedItems && Array.isArray(receivedItems)) {
      for (const receivedItem of receivedItems) {
        const orderItem = allOrderItems.find(item => item.id === receivedItem.orderItemId);
        
        if (!orderItem) {
          continue; // Position nicht gefunden
        }

        // Überprüfen, ob vollständig geliefert
        if (receivedItem.receivedQuantity > 0) {
          hasDelivery = true;
          
          if (receivedItem.receivedQuantity < orderItem.quantity) {
            isComplete = false;
          }

          // Wareneingang für diese Position erfassen
          await storage.updateOrderItem(orderItem.id, {
            quantityDelivered: (orderItem.quantityDelivered || 0) + receivedItem.receivedQuantity,
            qualityIssues: receivedItem.qualityIssues || false,
            damageDescription: receivedItem.damageDescription || null,
            updatedAt: new Date()
          });
        } else {
          isComplete = false;
        }
      }
    }

    // Wenn keine Lieferung dabei ist, Fehler zurückgeben
    if (!hasDelivery) {
      return res.status(400).json({ error: "Keine Liefermengen angegeben" });
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

    // Statushistorie aktualisieren
    const statusHistory = order[0].statusHistory 
      ? JSON.parse(order[0].statusHistory) 
      : [];

    statusHistory.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      note: `Wareneingang erfasst: ${isComplete ? 'Vollständig' : 'Teilweise'}`
    });

    updateData.statusHistory = JSON.stringify(statusHistory);

    // Bestellung aktualisieren
    const updatedOrder = await storage.updateOrder(orderId, updateData);

    // Lagerbestand aktualisieren für jede Position mit Wareneingang
    if (receivedItems && Array.isArray(receivedItems)) {
      for (const receivedItem of receivedItems) {
        if (receivedItem.receivedQuantity <= 0) continue;
        
        // Finde die entsprechende Bestellposition für Produkt-ID und Lager-ID
        const orderItem = allOrderItems.find(item => item.id === receivedItem.orderItemId);
        if (!orderItem || !orderItem.productId) continue;
        
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
      order: updatedOrder
    });
  } catch (error) {
    console.error("Fehler beim Erfassen des Wareneingangs:", error);
    res.status(500).json({ error: "Fehler beim Erfassen des Wareneingangs" });
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

export default router;