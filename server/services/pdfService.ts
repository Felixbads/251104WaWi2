/**
 * PDF-Service - Generiert PDFs mit direktem Datenbankzugriff
 * Diese neue Implementation umgeht die Probleme mit dem Daten-Fetching im Frontend
 */

import { db } from '../db';
import { orders, orderItems, suppliers, warehouses, products } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { generatePDF } from './pdfServiceUtils';
import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';

// Diese Funktion wird vom alten Code erwartet
// Wir behalten den alten Namen, verbessern aber die Implementation
export async function createOrderPdf(orderId: number): Promise<Buffer> {
  console.log("PDF generieren für Bestellung:", orderId);
  
  try {
    const pdfBuffer = await generatePdf({ id: orderId });
    return pdfBuffer;
  } catch (error) {
    console.error("Fehler bei der PDF-Generierung:", error);
    throw error;
  }
}

export async function generatePdf(orderId: any) {
  console.log("PDF generieren für Bestellung:", orderId);
  
  // Wenn orderId ein Objekt ist, extrahiere die ID
  const id = typeof orderId === 'object' ? orderId.id : orderId;
  
  try {
    // Bestellung abrufen
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, parseInt(id)))
      .limit(1);
    
    if (!orderResult || orderResult.length === 0) {
      console.error("Bestellung nicht gefunden:", id);
      throw new Error("Bestellung nicht gefunden");
    }
    
    const order = orderResult[0];
    console.log("Bestellung gefunden:", order.orderNumber);
    
    // Bestellpositionen abrufen
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, parseInt(id)));
    
    console.log(`${items.length} Bestellpositionen gefunden`);
    
    if (items.length === 0) {
      console.warn("Warnung: Keine Bestellpositionen gefunden für Bestellung", id);
    }
    
    // Lieferanten-Informationen (falls vorhanden)
    let supplier = null;
    if (order.supplierId) {
      try {
        const supplierResult = await db
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, order.supplierId as number))
          .limit(1);
        
        if (supplierResult && supplierResult.length > 0) {
          supplier = supplierResult[0];
          console.log("Lieferant gefunden:", supplier.name);
        }
      } catch (error) {
        console.error("Fehler beim Abrufen des Lieferanten:", error);
      }
    }
    
    // Lager-Informationen (falls vorhanden)
    let warehouse = null;
    if (order.locationId) {
      try {
        const warehouseResult = await db
          .select()
          .from(warehouses)
          .where(eq(warehouses.id, order.locationId as number))
          .limit(1);
        
        if (warehouseResult && warehouseResult.length > 0) {
          warehouse = warehouseResult[0];
          console.log("Lager gefunden:", warehouse.name);
        }
      } catch (error) {
        console.error("Fehler beim Abrufen des Lagers:", error);
      }
    }
    
    // Angereicherte Bestellpositionen mit Produktdetails
    const enrichedItems = await Promise.all(
      items.map(async (item, index) => {
        let product = null;
        
        if (item.productId) {
          try {
            const productResult = await db
              .select()
              .from(products)
              .where(eq(products.id, item.productId as number))
              .limit(1);
              
            if (productResult && productResult.length > 0) {
              product = productResult[0];
              console.log(`Produkt gefunden für Position ${index+1}:`, product.productName);
            } else {
              console.warn(`Kein Produkt gefunden für ID ${item.productId} (Position ${index+1})`);
            }
          } catch (error) {
            console.error(`Fehler beim Abrufen des Produkts ${item.productId}:`, error);
          }
        } else {
          console.log(`Position ${index+1} hat keine Produkt-ID, verwende direkten Namen:`, item.productName);
        }
        
        return {
          ...item,
          productDetails: product
        };
      })
    );
    
    // Gesamtpreis berechnen
    const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    console.log("Gesamtbetrag der Bestellung:", totalAmount);
    
    // Template laden und PDF generieren
    const pdfBuffer = await generateOrderPDFFromTemplate(order, enrichedItems, supplier, warehouse, totalAmount);
    console.log("PDF erfolgreich generiert");
    return pdfBuffer;
  } catch (error) {
    console.error("Fehler bei der PDF-Generierung:", error);
    throw error;
  }
}

// Direkte PDF-Generierung mit einem Backend-Endpunkt
export async function generateOrderPDF(req: Request, res: Response) {
  const orderId = parseInt(req.params.id);
  
  if (isNaN(orderId)) {
    return res.status(400).json({ error: "Ungültige Bestellungs-ID" });
  }
  
  try {
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
    
    // Bestellpositionen abrufen
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    // Lieferanten-Informationen (falls vorhanden)
    let supplier = null;
    if (order.supplierId) {
      try {
        const supplierResult = await db
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, order.supplierId as number))
          .limit(1);
        
        if (supplierResult && supplierResult.length > 0) {
          supplier = supplierResult[0];
        }
      } catch (error) {
        console.error("Fehler beim Abrufen des Lieferanten:", error);
      }
    }
    
    // Lager-Informationen (falls vorhanden)
    let warehouse = null;
    if (order.locationId) {
      try {
        const warehouseResult = await db
          .select()
          .from(warehouses)
          .where(eq(warehouses.id, order.locationId as number))
          .limit(1);
        
        if (warehouseResult && warehouseResult.length > 0) {
          warehouse = warehouseResult[0];
        }
      } catch (error) {
        console.error("Fehler beim Abrufen des Lagers:", error);
      }
    }
    
    // Angereicherte Bestellpositionen mit Produktdetails
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        let product = null;
        
        if (item.productId) {
          try {
            const productResult = await db
              .select()
              .from(products)
              .where(eq(products.id, item.productId as number))
              .limit(1);
              
            if (productResult && productResult.length > 0) {
              product = productResult[0];
            }
          } catch (error) {
            console.error(`Fehler beim Abrufen des Produkts ${item.productId}:`, error);
          }
        }
        
        return {
          ...item,
          productDetails: product
        };
      })
    );
    
    // Gesamtpreis berechnen
    const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    
    // Template laden und PDF generieren
    const pdfBuffer = await generateOrderPDFFromTemplate(order, enrichedItems, supplier, warehouse, totalAmount);
    
    // PDF als Download senden
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Bestellung_${order.orderNumber || orderId}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error("Fehler bei der PDF-Generierung:", error);
    res.status(500).json({ 
      error: "PDF konnte nicht generiert werden",
      details: error instanceof Error ? error.message : "Unbekannter Fehler"
    });
  }
}

// Hilfsfunktion zum Generieren des PDFs aus einem HTML-Template
async function generateOrderPDFFromTemplate(order: any, items: any[], supplier: any, warehouse: any, totalAmount: number) {
  try {
    // Vereinfachtes HTML-Template (dynamisch anpassbar)
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Bestellung ${order.orderNumber || order.id}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .logo { max-width: 150px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .info-box { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f2f2f2; }
            .right { text-align: right; }
            .total-row { font-weight: bold; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">Bestellung ${order.orderNumber || order.id}</div>
              <div>Datum: ${new Date(order.orderDate).toLocaleDateString('de-DE')}</div>
            </div>
            <div>
              <img class="logo" src="data:image/png;base64,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" alt="Logo">
            </div>
          </div>
          
          <div style="display: flex; justify-content: space-between;">
            <div class="info-box">
              <strong>Lieferant:</strong><br>
              ${supplier ? supplier.name : (order.supplierName || 'Nicht angegeben')}<br>
              ${supplier && supplier.contactPerson ? supplier.contactPerson + '<br>' : ''}
              ${supplier && supplier.address ? supplier.address + '<br>' : ''}
              ${supplier && supplier.email ? 'Email: ' + supplier.email + '<br>' : ''}
              ${supplier && supplier.phone ? 'Tel: ' + supplier.phone : ''}
            </div>
            
            <div class="info-box">
              <strong>Lieferadresse:</strong><br>
              ${warehouse ? warehouse.name : (order.locationName || 'Nicht angegeben')}<br>
              ${warehouse && warehouse.address ? warehouse.address + '<br>' : ''}
              ${warehouse && warehouse.contactPerson ? 'Ansprechpartner: ' + warehouse.contactPerson + '<br>' : ''}
              ${warehouse && warehouse.phone ? 'Tel: ' + warehouse.phone : ''}
            </div>
          </div>
          
          <table>
            <tr>
              <th>#</th>
              <th>Artikel-Nr.</th>
              <th>Bezeichnung</th>
              <th class="right">Menge</th>
              <th>Einheit</th>
              <th class="right">Einzelpreis</th>
              <th class="right">Gesamtpreis</th>
            </tr>
            
            ${items.map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${item.productId || ''}</td>
                <td>${item.productName || (item.productDetails ? (item.productDetails.name || '') : '')}</td>
                <td class="right">${item.quantity || 0}</td>
                <td>${item.unit || 'stk'}</td>
                <td class="right">${formatPrice(item.unitPrice || 0)} €</td>
                <td class="right">${formatPrice(item.totalPrice || 0)} €</td>
              </tr>
            `).join('')}
            
            <tr class="total-row">
              <td colspan="5"></td>
              <td class="right">Gesamt:</td>
              <td class="right">${formatPrice(totalAmount)} €</td>
            </tr>
          </table>
          
          <div>
            <strong>Lieferdatum:</strong> ${order.expectedDeliveryDate ? formatDate(order.expectedDeliveryDate) : 'Nicht festgelegt'}<br>
            ${order.notes ? `<strong>Anmerkungen:</strong> ${order.notes}` : ''}
          </div>
          
          <div class="footer">
            <p>Elbsandstein Proviant & Quartier GmbH</p>
          </div>
        </body>
      </html>
    `;
    
    // PDF generieren
    const pdfBuffer = await generatePDF(htmlTemplate);
    return pdfBuffer;
  } catch (error) {
    console.error("Fehler beim Generieren des PDF-Templates:", error);
    throw error;
  }
}

// Hilfsfunktionen zur Formatierung
function formatPrice(price: number): string {
  return price.toFixed(2).replace('.', ',');
}

function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('de-DE');
}