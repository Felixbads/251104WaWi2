import { Request, Response, Router } from "express";
import { db } from "../db";
import { suppliers } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendEmail, createOrderSubject, createOrderEmailTemplate, createOrderItemsTable } from "../services/emailService";

// Temporäre Definition für fehlende Tabellen
const orders = {
  name: 'orders',
  id: { name: 'id' },
  supplierId: { name: 'supplier_id' },
  status: { name: 'status' },
  orderNumber: { name: 'order_number' },
  supplierName: { name: 'supplier_name' },
  updatedAt: { name: 'updated_at' }
};

const orderItems = {
  name: 'order_items',
  orderId: { name: 'order_id' }
};

const router = Router();

// E-Mail für eine Bestellung senden
router.post("/order/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    const { to, from, subject, emailBody } = req.body;

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
    }

    if (!to || !from) {
      return res.status(400).json({ error: "E-Mail-Adressen (Absender und Empfänger) müssen angegeben werden" });
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

    // E-Mail-Inhalt konstruieren
    const finalHtml = emailBody
      ? emailBody
      : createOrderEmailTemplate(order, supplier || { name: order.supplierName || "Unbekannter Lieferant" });
    
    // HTML für E-Mail mit Tabelle ergänzen
    const htmlContent = finalHtml.replace('{{orderItems}}', itemsTable);
    
    // E-Mail senden
    const result = await sendEmail({
      to,
      from,
      subject: subject || createOrderSubject(order.orderNumber, order.supplierName || ""),
      html: htmlContent
    });

    if (result) {
      // Bestellung als versandt markieren, wenn sie noch im Entwurfsstatus ist
      if (order.status === 'draft') {
        await db
          .update(orders)
          .set({
            status: 'shipped',
            updatedAt: new Date()
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
        technicalDetails: "Fehler beim Senden über SendGrid API"
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

export default router;