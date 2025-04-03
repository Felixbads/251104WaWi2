import { Router, type Request, type Response } from "express";
import * as XLSX from "xlsx";
import { storage } from "../storage";
import { z } from "zod";
import { 
  insertSupplierSchema, 
  insertProductSchema,
  insertOrderSchema,
  insertOrderItemSchema
} from "@shared/schema";
import fileUpload from "express-fileupload";

const router = Router();

// Hilfsfunktion zum Konvertieren von Daten in ein XLSX-Arbeitsblatt
function dataToWorksheet(data: any[]) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  return worksheet;
}

// Hilfsfunktion zum Erstellen einer XLSX-Arbeitsmappe mit mehreren Arbeitsblättern
function createWorkbook(sheets: Record<string, any[]>) {
  const workbook = XLSX.utils.book_new();
  
  // Für jedes Blatt in der sheets-Map
  Object.entries(sheets).forEach(([sheetName, data]) => {
    const worksheet = dataToWorksheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });
  
  return workbook;
}

// Export-Routen

// Export von Lieferanten
router.get("/export/suppliers", async (req: Request, res: Response) => {
  try {
    // Lieferanten aus dem Speicher abrufen
    const suppliersResult = await storage.getSuppliers();
    
    // Überprüfen, ob Daten vorhanden sind
    if (!suppliersResult || !suppliersResult.data || suppliersResult.data.length === 0) {
      return res.status(404).json({ error: "Keine Lieferanten gefunden" });
    }
    
    // Wir verwenden nur das data-Array aus dem Ergebnis
    const suppliers = suppliersResult.data;
    
    // XLSX-Arbeitsmappe erstellen
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(suppliers);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Lieferanten");
    
    // Als Buffer zurückgeben
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    
    // HTTP-Header setzen
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=lieferanten_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    // Buffer als Antwort senden
    res.send(buffer);
  } catch (error) {
    console.error("Fehler beim Exportieren der Lieferanten:", error);
    res.status(500).json({ error: "Fehler beim Exportieren der Lieferanten" });
  }
});

// Export von Produkten
router.get("/export/products", async (req: Request, res: Response) => {
  try {
    // Produkte aus dem Speicher abrufen
    const productsResult = await storage.getProducts();
    
    // Überprüfen, ob Produkte vorhanden sind
    if (!productsResult || !productsResult.data || productsResult.data.length === 0) {
      return res.status(404).json({ error: "Keine Produkte gefunden" });
    }
    
    // Wir verwenden das data-Array aus dem Ergebnis
    const products = productsResult.data;
    
    // Alle Produkte exportieren (inklusive Vendon-Produkte)
    // Das gibt dem Nutzer mehr Flexibilität
    
    // Eine Warnung hinzufügen, wenn es keine manuell hinzugefügten Produkte gibt
    const manualProducts = products.filter(p => !p.vendonId);
    const includesVendonProducts = manualProducts.length < products.length;
    
    // XLSX-Arbeitsmappe erstellen
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(products);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Produkte");
    
    // Als Buffer zurückgeben
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    
    // HTTP-Header setzen
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=produkte_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    // Buffer als Antwort senden
    res.send(buffer);
  } catch (error) {
    console.error("Fehler beim Exportieren der Produkte:", error);
    res.status(500).json({ error: "Fehler beim Exportieren der Produkte" });
  }
});

// Export von Bestellungen
router.get("/export/orders", async (req: Request, res: Response) => {
  try {
    // Bestellungen aus dem Speicher abrufen
    const ordersResult = await storage.getOrders();
    
    // Überprüfen, ob Daten vorhanden sind
    if (!ordersResult || !ordersResult.data || ordersResult.data.length === 0) {
      return res.status(404).json({ error: "Keine Bestellungen gefunden" });
    }
    
    // Wir verwenden das data-Array aus dem Ergebnis
    const orders = ordersResult.data;
    
    // Bestellpositionen abrufen
    const orderItemsResult = await storage.getOrderItems();
    const orderItems = orderItemsResult.data || [];
    
    // XLSX-Arbeitsmappe erstellen mit zwei Blättern
    const workbook = XLSX.utils.book_new();
    
    // Bestellungen-Arbeitsblatt hinzufügen
    const ordersWorksheet = XLSX.utils.json_to_sheet(orders);
    XLSX.utils.book_append_sheet(workbook, ordersWorksheet, "Bestellungen");
    
    // Bestellpositionen-Arbeitsblatt hinzufügen
    if (orderItems.length > 0) {
      const itemsWorksheet = XLSX.utils.json_to_sheet(orderItems);
      XLSX.utils.book_append_sheet(workbook, itemsWorksheet, "Bestellpositionen");
    }
    
    // Als Buffer zurückgeben
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    
    // HTTP-Header setzen
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=bestellungen_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    // Buffer als Antwort senden
    res.send(buffer);
  } catch (error) {
    console.error("Fehler beim Exportieren der Bestellungen:", error);
    res.status(500).json({ error: "Fehler beim Exportieren der Bestellungen" });
  }
});

// Import-Routen

// Validierungsschema für den Lieferantenimport
const supplierImportSchema = z.array(
  insertSupplierSchema.omit({ id: true })
);

// Import von Lieferanten
router.post("/import/suppliers", async (req: Request, res: Response) => {
  try {
    // Datei aus dem Request
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "Keine Datei hochgeladen" });
    }
    
    const file = Array.isArray(req.files.file) ? req.files.file[0] : req.files.file;
    
    // XLSX-Datei lesen
    const workbook = XLSX.read(file.data);
    
    // Erstes Arbeitsblatt auswählen
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // In JSON konvertieren
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // Daten validieren
    try {
      const validatedData = supplierImportSchema.parse(jsonData);
      
      // Ergebnisse für den Import speichern
      const results = {
        success: 0,
        errors: 0,
        errorMessages: [] as string[]
      };
      
      // Jede Zeile in der Datenbank speichern
      for (const supplier of validatedData) {
        try {
          await storage.createSupplier(supplier);
          results.success++;
        } catch (error) {
          results.errors++;
          results.errorMessages.push(`Fehler beim Importieren von ${supplier.name}: ${error}`);
        }
      }
      
      res.json({
        message: `Import abgeschlossen. ${results.success} Lieferanten erfolgreich importiert, ${results.errors} Fehler.`,
        results
      });
    } catch (error) {
      console.error("Validierungsfehler:", error);
      return res.status(400).json({ error: "Die Daten entsprechen nicht dem erwarteten Format", details: error });
    }
  } catch (error) {
    console.error("Fehler beim Importieren der Lieferanten:", error);
    res.status(500).json({ error: "Fehler beim Importieren der Lieferanten" });
  }
});

// Validierungsschema für den Produktimport
const productImportSchema = z.array(
  insertProductSchema.omit({ id: true, vendonId: true })
);

// Import von Produkten
router.post("/import/products", async (req: Request, res: Response) => {
  try {
    // Datei aus dem Request
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "Keine Datei hochgeladen" });
    }
    
    const file = Array.isArray(req.files.file) ? req.files.file[0] : req.files.file;
    
    // XLSX-Datei lesen
    const workbook = XLSX.read(file.data);
    
    // Erstes Arbeitsblatt auswählen
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // In JSON konvertieren
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // Daten validieren
    try {
      const validatedData = productImportSchema.parse(jsonData);
      
      // Ergebnisse für den Import speichern
      const results = {
        success: 0,
        errors: 0,
        errorMessages: [] as string[]
      };
      
      // Alle existierenden Produkte abrufen um Duplikate zu prüfen
      const existingProducts = await storage.getProducts();
      const existingSkus = new Set(existingProducts.map(p => p.sku));
      
      // Jede Zeile in der Datenbank speichern, überspringen wenn SKU existiert
      for (const product of validatedData) {
        try {
          // Prüfen ob das Produkt bereits existiert (mittels SKU)
          if (product.sku && existingSkus.has(product.sku)) {
            results.errors++;
            results.errorMessages.push(`Produkt mit SKU ${product.sku} existiert bereits`);
            continue;
          }
          
          await storage.createProduct({
            ...product,
            vendonId: null // Sicherstellen, dass kein vendonId gesetzt ist
          });
          results.success++;
        } catch (error) {
          results.errors++;
          results.errorMessages.push(`Fehler beim Importieren von ${product.productName}: ${error}`);
        }
      }
      
      res.json({
        message: `Import abgeschlossen. ${results.success} Produkte erfolgreich importiert, ${results.errors} Fehler.`,
        results
      });
    } catch (error) {
      console.error("Validierungsfehler:", error);
      return res.status(400).json({ error: "Die Daten entsprechen nicht dem erwarteten Format", details: error });
    }
  } catch (error) {
    console.error("Fehler beim Importieren der Produkte:", error);
    res.status(500).json({ error: "Fehler beim Importieren der Produkte" });
  }
});

// Validierungsschema für den Bestellungsimport
const orderImportSchema = z.array(
  insertOrderSchema.omit({ id: true })
);

// Validierungsschema für den Bestellpositionsimport
const orderItemImportSchema = z.array(
  insertOrderItemSchema.omit({ id: true })
);

// Import von Bestellungen
router.post("/import/orders", async (req: Request, res: Response) => {
  try {
    // Datei aus dem Request
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "Keine Datei hochgeladen" });
    }
    
    const file = Array.isArray(req.files.file) ? req.files.file[0] : req.files.file;
    
    // XLSX-Datei lesen
    const workbook = XLSX.read(file.data);
    
    // Prüfen, ob beide erforderlichen Blätter vorhanden sind
    if (!workbook.SheetNames.includes("Bestellungen") || !workbook.SheetNames.includes("Bestellpositionen")) {
      return res.status(400).json({ 
        error: "Die Datei muss Arbeitsblätter mit den Namen 'Bestellungen' und 'Bestellpositionen' enthalten" 
      });
    }
    
    // Arbeitsblätter in JSON konvertieren
    const ordersData = XLSX.utils.sheet_to_json(workbook.Sheets["Bestellungen"]);
    const orderItemsData = XLSX.utils.sheet_to_json(workbook.Sheets["Bestellpositionen"]);
    
    // Daten validieren
    try {
      const validatedOrders = orderImportSchema.parse(ordersData);
      const validatedOrderItems = orderItemImportSchema.parse(orderItemsData);
      
      // Ergebnisse für den Import speichern
      const results = {
        ordersSuccess: 0,
        ordersErrors: 0,
        itemsSuccess: 0,
        itemsErrors: 0,
        errorMessages: [] as string[]
      };
      
      // Mapping von temporären IDs zu tatsächlichen IDs
      const idMapping = new Map<number, number>();
      
      // Bestellungen importieren
      for (const order of validatedOrders) {
        try {
          const tempId = order.id; // Temporäre ID aus der Datei
          
          // ID entfernen, damit eine neue generiert wird
          const { id, ...orderData } = order;
          
          // Bestellung erstellen
          const createdOrder = await storage.createOrder(orderData);
          
          // ID-Mapping speichern
          idMapping.set(tempId, createdOrder.id);
          
          results.ordersSuccess++;
        } catch (error) {
          results.ordersErrors++;
          results.errorMessages.push(`Fehler beim Importieren der Bestellung: ${error}`);
        }
      }
      
      // Bestellpositionen importieren
      for (const item of validatedOrderItems) {
        try {
          const tempOrderId = item.orderId;
          
          // Prüfen, ob ein Mapping für diese Bestellungs-ID existiert
          if (!idMapping.has(tempOrderId)) {
            results.itemsErrors++;
            results.errorMessages.push(`Keine passende Bestellung für Position mit tempOrderId ${tempOrderId} gefunden`);
            continue;
          }
          
          // ID ersetzen
          const realOrderId = idMapping.get(tempOrderId) as number;
          const { id, ...itemData } = item;
          
          // Bestellposition erstellen
          await storage.createOrderItem({
            ...itemData,
            orderId: realOrderId
          });
          
          results.itemsSuccess++;
        } catch (error) {
          results.itemsErrors++;
          results.errorMessages.push(`Fehler beim Importieren der Bestellposition: ${error}`);
        }
      }
      
      res.json({
        message: `Import abgeschlossen. ${results.ordersSuccess} Bestellungen und ${results.itemsSuccess} Positionen erfolgreich importiert.`,
        results
      });
    } catch (error) {
      console.error("Validierungsfehler:", error);
      return res.status(400).json({ error: "Die Daten entsprechen nicht dem erwarteten Format", details: error });
    }
  } catch (error) {
    console.error("Fehler beim Importieren der Bestellungen:", error);
    res.status(500).json({ error: "Fehler beim Importieren der Bestellungen" });
  }
});

export default router;