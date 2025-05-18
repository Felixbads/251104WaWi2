import express from 'express';
import { db } from '../db';
import { orders, orderItems, suppliers, warehouses, products } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import puppeteer from 'puppeteer';

const router = express.Router();

// PDF Endpunkt für Bestellungen
router.get('/orders/:id', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    
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
          .where(eq(suppliers.id, order.supplierId))
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
          .where(eq(warehouses.id, order.locationId))
          .limit(1);
        
        if (warehouseResult && warehouseResult.length > 0) {
          warehouse = warehouseResult[0];
        }
      } catch (error) {
        console.error("Fehler beim Abrufen des Lagers:", error);
      }
    }
    
    // Produkt-Details für die Bestellpositionen abrufen
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        let product = null;
        
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
    
    // HTML-Template für das PDF
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
              <div>Datum: ${formatDate(order.orderDate)}</div>
            </div>
            <div>
              <div class="title">Elbsandstein Proviant</div>
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
            
            ${enrichedItems.length > 0 ? enrichedItems.map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${item.productId || ''}</td>
                <td>${item.productName || (item.productDetails ? (item.productDetails.name || item.productDetails.productName || '') : '')}</td>
                <td class="right">${item.quantity || 0}</td>
                <td>${item.unit || 'stk'}</td>
                <td class="right">${formatPrice(item.unitPrice || 0)} €</td>
                <td class="right">${formatPrice(item.totalPrice || 0)} €</td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="7" style="text-align: center; padding: 20px;">Keine Produkte in dieser Bestellung</td>
              </tr>
            `}
            
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
    
    // PDF mit Puppeteer generieren
    try {
      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
      });
      
      const page = await browser.newPage();
      await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });
      
      await browser.close();
      
      // PDF-Datei zum Download bereitstellen
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Bestellung_${order.orderNumber || order.id}.pdf"`);
      res.send(pdfBuffer);
      
    } catch (pdfError) {
      console.error('Fehler bei der PDF-Generierung:', pdfError);
      
      // FALLBACK: Wenn PDF-Generierung fehlschlägt, JSON-Daten zurückgeben
      res.status(500).json({ 
        error: 'PDF konnte nicht generiert werden',
        data: { order, items: enrichedItems, supplier, warehouse }
      });
    }
    
  } catch (error) {
    console.error('Allgemeiner Fehler:', error);
    res.status(500).json({ 
      error: 'Ein Fehler ist aufgetreten',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// Hilfsfunktionen
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('de-DE');
}

function formatPrice(price: number): string {
  return price.toFixed(2).replace('.', ',');
}

export default router;