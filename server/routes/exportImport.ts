import { Router, type Request, type Response } from "express";
import * as XLSX from "xlsx";
import { storage } from "../storage";
import { rawDb } from "../db";
import { z } from "zod";
import { 
  insertSupplierSchema, 
  insertProductSchema,
  insertOrderSchema,
  insertOrderItemSchema,
  insertTransactionSchema
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
    const suppliersResult = await rawDb.query('SELECT * FROM suppliers ORDER BY name');
    
    // Überprüfen, ob Daten vorhanden sind
    if (!suppliersResult || !suppliersResult.rows || suppliersResult.rows.length === 0) {
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
    const productsResult = await rawDb.query('SELECT * FROM products ORDER BY product_name');
    let products = [];
    
    // Array-Format oder Objekt-Format mit data-Property überprüfen
    if (productsResult) {
      if (Array.isArray(productsResult)) {
        products = productsResult;
      } else if (productsResult.data && Array.isArray(productsResult.data)) {
        products = productsResult.data;
      }
    }
    
    // Immer eine Antwort senden, auch wenn keine Produkte vorhanden sind
    // Das wird dazu führen, dass eine leere Excel-Datei zurückgegeben wird statt einer Fehlermeldung
    
    // XLSX-Arbeitsmappe erstellen
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(products.length > 0 ? products : [{
      id: null,
      productName: "Keine Produkte vorhanden",
      sku: "",
      createdAt: new Date()
    }]);
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

// Export von Transaktionen
router.get("/export/transactions", async (req: Request, res: Response) => {
  try {
    // Parameter für Datumsbereich abrufen
    const startDateParam = req.query.startDate as string;
    const endDateParam = req.query.endDate as string;
    const limitParam = req.query.limit as string;
    
    let transactions = [];
    
    // Transaktionen je nach Parametern abrufen
    if (startDateParam && endDateParam) {
      // Datumsbereich konvertieren
      const startDate = new Date(startDateParam);
      const endDate = new Date(endDateParam);
      const limit = limitParam ? parseInt(limitParam) : 1000;
      
      // Daten mit Datumsbereich abrufen
      transactions = await storage.getTransactionsByDateRange(startDate, endDate, limit);
    } else {
      // Alle Transaktionen abrufen (mit Limit)
      const limit = limitParam ? parseInt(limitParam) : 1000;
      transactions = await storage.getTransactions(limit);
    }
    
    // Überprüfen, ob Daten vorhanden sind
    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ error: "Keine Transaktionen gefunden" });
    }
    
    // XLSX-Arbeitsmappe erstellen
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(transactions);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transaktionen");
    
    // Dateiname mit Datumsbereich erstellen, falls vorhanden
    let filename = "transaktionen_export_";
    if (startDateParam && endDateParam) {
      const startFormatted = new Date(startDateParam).toISOString().split('T')[0];
      const endFormatted = new Date(endDateParam).toISOString().split('T')[0];
      filename += `${startFormatted}_bis_${endFormatted}`;
    } else {
      filename += new Date().toISOString().split('T')[0];
    }
    filename += ".xlsx";
    
    // Als Buffer zurückgeben
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    
    // HTTP-Header setzen
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    
    // Buffer als Antwort senden
    res.send(buffer);
  } catch (error) {
    console.error("Fehler beim Exportieren der Transaktionen:", error);
    res.status(500).json({ error: "Fehler beim Exportieren der Transaktionen" });
  }
});

// Import-Routen

// Flexibles Validierungsschema für den Lieferantenimport
const supplierImportSchema = z.array(
  z.object({
    name: z.string().min(1, "Lieferantenname ist erforderlich"),
    contactPerson: z.string().optional().nullable().or(z.literal("")),
    phone: z.string().optional().nullable().or(z.literal("")),
    email: z.string().optional().nullable().or(z.literal("")),
    website: z.string().optional().nullable().or(z.literal("")),
    address: z.string().optional().nullable().or(z.literal("")),
    city: z.string().optional().nullable().or(z.literal("")),
    postalCode: z.string().optional().nullable().or(z.literal("")),
    country: z.string().optional().nullable().or(z.literal("")),
    status: z.enum(["active", "inactive"]).default("active").optional(),
    notes: z.string().optional().nullable().or(z.literal("")),
    paymentTerms: z.string().optional().nullable().or(z.literal("")),
    deliveryTerms: z.string().optional().nullable().or(z.literal("")),
    minimumOrderValue: z.number().optional().nullable(),
    deliveryDays: z.string().optional().nullable().or(z.literal("")),
    taxId: z.string().optional().nullable().or(z.literal("")),
    accountNumber: z.string().optional().nullable().or(z.literal("")),
    bankDetails: z.string().optional().nullable().or(z.literal("")),
  }).passthrough() // Erlaubt zusätzliche Felder, die in der Excel-Datei vorhanden sein könnten
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
    const rawData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log("Rohdaten aus Excel:", JSON.stringify(rawData.slice(0, 3), null, 2));
    
    // Daten normalisieren für die Validierung
    const normalizedData = rawData.map(row => {
      // Hilfsmap zur Umwandlung der möglichen Feldnamen
      const fieldMapping: Record<string, string> = {
        'Name': 'name',
        'Lieferant': 'name',
        'Firma': 'name',
        'Lieferantenname': 'name',
        'Ansprechpartner': 'contactPerson',
        'Kontaktperson': 'contactPerson',
        'E-Mail': 'email',
        'Email': 'email',
        'E-mail': 'email',
        'Telefon': 'phone',
        'Tel': 'phone',
        'Telefonnummer': 'phone',
        'Website': 'website',
        'Webseite': 'website',
        'URL': 'website',
        'Adresse': 'address',
        'Straße': 'address',
        'Stadt': 'city',
        'Ort': 'city',
        'PLZ': 'postalCode',
        'Postleitzahl': 'postalCode',
        'Land': 'country',
        'Status': 'status',
        'Notizen': 'notes',
        'Bemerkungen': 'notes',
        'Zahlungsbedingungen': 'paymentTerms',
        'Lieferbedingungen': 'deliveryTerms',
        'Mindestbestellwert': 'minimumOrderValue',
        'Liefertage': 'deliveryDays',
        'Steuernummer': 'taxId',
        'USt-ID': 'taxId',
        'Kontonummer': 'accountNumber',
        'Bankverbindung': 'bankDetails'
      };
      
      // Normalisiertes Zeilenobject
      const normalizedRow: Record<string, any> = {};
      
      // Iteriere über die Originalfelder und wende die Mapping-Logik an
      Object.entries(row).forEach(([key, value]) => {
        // Standardisieren des Feldnamens
        const standardKey = fieldMapping[key] || key;
        
        // Typkonvertierungen für spezielle Felder
        if (standardKey === 'status' && typeof value === 'string') {
          // Status-Werte normalisieren
          normalizedRow[standardKey] = value.toLowerCase() === 'inaktiv' ? 'inactive' : 'active';
        } else if (standardKey === 'minimumOrderValue' && value !== null && value !== undefined) {
          // Zahlen-String in Number konvertieren
          const numValue = Number(value);
          normalizedRow[standardKey] = isNaN(numValue) ? null : numValue;
        } else {
          // Standardfall
          normalizedRow[standardKey] = value;
        }
      });
      
      // Stelle sicher, dass name immer ein String ist
      if (!normalizedRow.name || typeof normalizedRow.name !== 'string') {
        normalizedRow.name = String(normalizedRow.name || '');
      }
      
      return normalizedRow;
    });
    
    console.log("Normalisierte Daten:", JSON.stringify(normalizedData.slice(0, 3), null, 2));
    
    // Daten validieren
    try {
      const validatedData = supplierImportSchema.parse(normalizedData);
      
      // Ergebnisse für den Import speichern
      const results = {
        success: 0,
        errors: 0,
        errorMessages: [] as string[]
      };
      
      // Jede Zeile in der Datenbank speichern
      for (const supplier of validatedData) {
        try {
          // Nur die benötigten Felder auswählen, um zu verhindern, dass zusätzliche Felder
          // die beim .passthrough() durchgerutscht sind, an die Datenbank übergeben werden
          const insertData = {
            name: supplier.name,
            contactPerson: supplier.contactPerson || null,
            phone: supplier.phone || null,
            email: supplier.email || null,
            website: supplier.website || null,
            address: supplier.address || null,
            city: supplier.city || null,
            postalCode: supplier.postalCode || null,
            country: supplier.country || 'Deutschland',
            status: supplier.status || 'active',
            notes: supplier.notes || null,
            paymentTerms: supplier.paymentTerms || null,
            deliveryTerms: supplier.deliveryTerms || null,
            minimumOrderValue: supplier.minimumOrderValue || null,
            deliveryDays: supplier.deliveryDays || null,
            taxId: supplier.taxId || null,
            accountNumber: supplier.accountNumber || null,
            bankDetails: supplier.bankDetails || null
          };
          
          await storage.createSupplier(insertData);
          results.success++;
        } catch (error) {
          results.errors++;
          results.errorMessages.push(`Fehler beim Importieren von ${supplier.name}: ${error}`);
          console.error(`Fehler beim Importieren von ${supplier.name}:`, error);
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
      const existingProductsResult = await rawDb.query('SELECT * FROM products');
      const existingSkus = new Set(existingProductsResult.rows.map(p => p.sku));
      
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

// Validierungsschema für den Transaktionsimport
const transactionImportSchema = z.array(
  insertTransactionSchema
);

// Import von Transaktionen
router.post("/import/transactions", async (req: Request, res: Response) => {
  try {
    // Datei aus dem Request
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "Keine Datei hochgeladen" });
    }
    
    const file = Array.isArray(req.files.file) ? req.files.file[0] : req.files.file;
    
    // XLSX-Datei lesen
    const workbook = XLSX.read(file.data);
    
    // Erstes Arbeitsblatt auswählen (oder spezifisches, falls angegeben)
    const sheetName = req.body.sheetName || workbook.SheetNames[0];
    if (!workbook.SheetNames.includes(sheetName)) {
      return res.status(400).json({ 
        error: `Arbeitsblatt "${sheetName}" nicht in der Excel-Datei gefunden.` 
      });
    }
    
    // In JSON konvertieren
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    console.log(`${jsonData.length} Zeilen aus Excel-Datei geladen.`);
    
    // Ergebnisse für den Import speichern
    const results = {
      total: jsonData.length,
      saved: 0,
      duplicates: 0,
      errors: 0,
      errorDetails: [] as any[]
    };
    
    // Jede Zeile in der Datenbank speichern
    for (let index = 0; index < jsonData.length; index++) {
      const row = jsonData[index];
      try {
        // Versuche, vendonId zu extrahieren (kann unterschiedlich benannt sein)
        const vendonId = row.vendonId || row.vendon_id || row.transaction_id || row.id;
        
        if (!vendonId) {
          console.warn(`Zeile ${index + 1}: Keine vendonId gefunden, überspringe...`);
          results.errors++;
          results.errorDetails.push({
            row: index + 1,
            error: 'Keine vendonId gefunden',
            data: row
          });
          continue;
        }
        
        // Prüfe, ob die Transaktion bereits existiert
        const existingTransaction = await storage.getTransactionByVendonId(vendonId.toString());
        
        if (existingTransaction) {
          console.log(`Zeile ${index + 1}: Transaktion mit vendonId ${vendonId} existiert bereits.`);
          results.duplicates++;
          continue;
        }
        
        // Konvertiere Datumsfelder
        const transactionData: any = { ...row };
        
        // Setze vendonId korrekt
        transactionData.vendonId = vendonId.toString();
        
        // Konvertiere Datum
        if (transactionData.datetime) {
          if (typeof transactionData.datetime === 'number') {
            // Excel Datum als Zahl
            const date = new Date((transactionData.datetime - 25569) * 86400 * 1000);
            transactionData.datetime = date;
          } else if (typeof transactionData.datetime === 'string') {
            // String-Datum
            transactionData.datetime = new Date(transactionData.datetime);
          }
        } else {
          // Fallback: aktuelles Datum
          transactionData.datetime = new Date();
        }
        
        // Setze Standardwerte für Pflichtfelder
        transactionData.price = transactionData.price || 0;
        transactionData.source = transactionData.source || 'excel-import';
        
        // Transaktion in der Datenbank speichern
        await storage.createTransaction(transactionData);
        results.saved++;
        
        // Statusmeldung bei größeren Importen
        if (index % 50 === 0 || index === jsonData.length - 1) {
          console.log(`Importfortschritt: ${index + 1}/${jsonData.length} (${Math.round((index + 1) / jsonData.length * 100)}%)`);
        }
      } catch (error) {
        console.error(`Fehler beim Verarbeiten der Zeile ${index + 1}:`, error);
        results.errors++;
        results.errorDetails.push({
          row: index + 1,
          error: error instanceof Error ? error.message : 'Unbekannter Fehler',
          data: row
        });
      }
    }
    
    // Sende Ergebnis zurück
    res.json({
      status: 'success',
      message: `Import abgeschlossen. ${results.saved} Transaktionen erfolgreich importiert.`,
      results: {
        total: results.total,
        saved: results.saved,
        duplicates: results.duplicates,
        errors: results.errors,
        errorDetails: results.errorDetails.slice(0, 10) // Begrenzen auf 10 Fehlerdetails
      }
    });
  } catch (error) {
    console.error("Fehler beim Importieren der Transaktionen:", error);
    res.status(500).json({ 
      status: 'error',
      error: "Fehler beim Importieren der Transaktionen",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;