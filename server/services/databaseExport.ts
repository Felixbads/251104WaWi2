import { db } from '../db';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { 
  users, 
  products, 
  suppliers, 
  machines, 
  transactions, 
  orders, 
  orderItems,
  locations,
  stocks,
  warehouses,
  inventoryItems,
  syncLogs,
  weatherData,
  weatherForecasts,
  weatherHistorical,
  holidays,
  refills
} from '../../shared/schema';
import { count, eq, and, SQL } from 'drizzle-orm';

/**
 * Service für den vollständigen Datenbank-Export und -Import
 */
class DatabaseExportService {
  private exportDir: string;

  constructor() {
    // Stelle sicher, dass das Export-Verzeichnis existiert
    this.exportDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Formatiert ein Datum für die Verwendung in Dateinamen
   */
  private formatDateForFilename(date: Date): string {
    return date.toISOString().replace(/[:.]/g, '_').replace('T', '_').split('Z')[0];
  }

  /**
   * Exportiert alle Datenbanktabellen in eine XLSX-Datei
   * @returns Pfad zur exportierten Datei
   */
  public async exportDatabase(): Promise<string> {
    console.log(`Vollständiger Datenbank-Export gestartet`);
    const startTime = Date.now();

    // Erstelle einen Dateinamen basierend auf dem aktuellen Datum
    const filename = `db_export_${this.formatDateForFilename(new Date())}.xlsx`;
    const filePath = path.join(this.exportDir, filename);

    try {
      // Sammle die Daten aus allen Tabellen
      console.log('Sammle Daten aus allen Tabellen...');
      
      // Zähle zuerst, wie viele Datensätze in jeder Tabelle sind
      const userCount = await db.select({ count: count() }).from(users);
      const productCount = await db.select({ count: count() }).from(products);
      const supplierCount = await db.select({ count: count() }).from(suppliers);
      const machineCount = await db.select({ count: count() }).from(machines);
      const transCount = await db.select({ count: count() }).from(transactions);
      const orderCount = await db.select({ count: count() }).from(orders);
      const orderItemCount = await db.select({ count: count() }).from(orderItems);
      const locationCount = await db.select({ count: count() }).from(locations);
      const stockCount = await db.select({ count: count() }).from(stocks);
      const warehouseCount = await db.select({ count: count() }).from(warehouses);
      const inventoryItemCount = await db.select({ count: count() }).from(inventoryItems);
      const syncLogCount = await db.select({ count: count() }).from(syncLogs);
      const weatherDataCount = await db.select({ count: count() }).from(weatherData);
      const weatherForecastCount = await db.select({ count: count() }).from(weatherForecasts);
      const weatherHistoricalCount = await db.select({ count: count() }).from(weatherHistorical);
      const holidayCount = await db.select({ count: count() }).from(holidays);
      const refillCount = await db.select({ count: count() }).from(refills);
      
      console.log('Anzahl der Datensätze:');
      console.log(`- Benutzer: ${userCount[0].count}`);
      console.log(`- Produkte: ${productCount[0].count}`);
      console.log(`- Lieferanten: ${supplierCount[0].count}`);
      console.log(`- Automaten: ${machineCount[0].count}`);
      console.log(`- Transaktionen: ${transCount[0].count}`);
      console.log(`- Bestellungen: ${orderCount[0].count}`);
      console.log(`- Bestellpositionen: ${orderItemCount[0].count}`);
      console.log(`- Standorte: ${locationCount[0].count}`);
      console.log(`- Bestände: ${stockCount[0].count}`);
      console.log(`- Lager: ${warehouseCount[0].count}`);
      console.log(`- Lagerbestände: ${inventoryItemCount[0].count}`);
      console.log(`- Sync-Logs: ${syncLogCount[0].count}`);
      console.log(`- Wetterdaten: ${weatherDataCount[0].count}`);
      console.log(`- Wetterprognosen: ${weatherForecastCount[0].count}`);
      console.log(`- Wetter-Historie: ${weatherHistoricalCount[0].count}`);
      console.log(`- Feiertage: ${holidayCount[0].count}`);
      console.log(`- Auffüllungen: ${refillCount[0].count}`);

      // Hole die Daten aus allen Tabellen
      const userData = await db.select().from(users);
      const productData = await db.select().from(products);
      const supplierData = await db.select().from(suppliers);
      const machineData = await db.select().from(machines);
      
      // Bei großen Tabellen wie Transaktionen ggf. aufteilen, um Speicherprobleme zu vermeiden
      const BATCH_SIZE = 10000;
      let transactionData: any[] = [];
      const totalTransactions = transCount[0].count;
      
      for (let offset = 0; offset < totalTransactions; offset += BATCH_SIZE) {
        console.log(`Lade Transaktionen ${offset + 1} bis ${Math.min(offset + BATCH_SIZE, totalTransactions)} von ${totalTransactions}...`);
        const batch = await db.select().from(transactions).limit(BATCH_SIZE).offset(offset);
        transactionData = [...transactionData, ...batch];
      }
      
      const orderData = await db.select().from(orders);
      const orderItemData = await db.select().from(orderItems);
      const locationData = await db.select().from(locations);
      
      // Große Tabelle: Bestände
      let stocksData: any[] = [];
      const totalStocks = stockCount[0].count;
      
      for (let offset = 0; offset < totalStocks; offset += BATCH_SIZE) {
        console.log(`Lade Bestände ${offset + 1} bis ${Math.min(offset + BATCH_SIZE, totalStocks)} von ${totalStocks}...`);
        const batch = await db.select().from(stocks).limit(BATCH_SIZE).offset(offset);
        stocksData = [...stocksData, ...batch];
      }
      
      const warehouseData = await db.select().from(warehouses);
      
      // Große Tabelle: Lagerbestände
      let inventoryItemsData: any[] = [];
      const totalInventoryItems = inventoryItemCount[0].count;
      
      for (let offset = 0; offset < totalInventoryItems; offset += BATCH_SIZE) {
        console.log(`Lade Lagerbestände ${offset + 1} bis ${Math.min(offset + BATCH_SIZE, totalInventoryItems)} von ${totalInventoryItems}...`);
        const batch = await db.select().from(inventoryItems).limit(BATCH_SIZE).offset(offset);
        inventoryItemsData = [...inventoryItemsData, ...batch];
      }
      
      const syncLogsData = await db.select().from(syncLogs);
      
      // Große Tabelle: Wetterdaten
      let weatherDataItems: any[] = [];
      const totalWeatherData = weatherDataCount[0].count;
      
      for (let offset = 0; offset < totalWeatherData; offset += BATCH_SIZE) {
        console.log(`Lade Wetterdaten ${offset + 1} bis ${Math.min(offset + BATCH_SIZE, totalWeatherData)} von ${totalWeatherData}...`);
        const batch = await db.select().from(weatherData).limit(BATCH_SIZE).offset(offset);
        weatherDataItems = [...weatherDataItems, ...batch];
      }
      
      // Wetterprognosen
      let weatherForecastsData: any[] = [];
      const totalWeatherForecasts = weatherForecastCount[0].count;
      
      for (let offset = 0; offset < totalWeatherForecasts; offset += BATCH_SIZE) {
        console.log(`Lade Wetterprognosen ${offset + 1} bis ${Math.min(offset + BATCH_SIZE, totalWeatherForecasts)} von ${totalWeatherForecasts}...`);
        const batch = await db.select().from(weatherForecasts).limit(BATCH_SIZE).offset(offset);
        weatherForecastsData = [...weatherForecastsData, ...batch];
      }
      
      // Wetter-Historie
      let weatherHistoricalData: any[] = [];
      const totalWeatherHistorical = weatherHistoricalCount[0].count;
      
      for (let offset = 0; offset < totalWeatherHistorical; offset += BATCH_SIZE) {
        console.log(`Lade Wetter-Historie ${offset + 1} bis ${Math.min(offset + BATCH_SIZE, totalWeatherHistorical)} von ${totalWeatherHistorical}...`);
        const batch = await db.select().from(weatherHistorical).limit(BATCH_SIZE).offset(offset);
        weatherHistoricalData = [...weatherHistoricalData, ...batch];
      }
      
      const holidaysData = await db.select().from(holidays);
      
      // Große Tabelle: Auffüllungen
      let refillsData: any[] = [];
      const totalRefills = refillCount[0].count;
      
      for (let offset = 0; offset < totalRefills; offset += BATCH_SIZE) {
        console.log(`Lade Auffüllungen ${offset + 1} bis ${Math.min(offset + BATCH_SIZE, totalRefills)} von ${totalRefills}...`);
        const batch = await db.select().from(refills).limit(BATCH_SIZE).offset(offset);
        refillsData = [...refillsData, ...batch];
      }

      // Erstelle Export-Metadaten mit Zeitstempel und Zusammenfassung
      const metadata = {
        exportedAt: new Date().toISOString(),
        tablesExported: 17,
        totalRecords: userCount[0].count + productCount[0].count + supplierCount[0].count +
                     machineCount[0].count + transCount[0].count + orderCount[0].count +
                     orderItemCount[0].count + locationCount[0].count + stockCount[0].count +
                     warehouseCount[0].count + inventoryItemCount[0].count + syncLogCount[0].count +
                     weatherDataCount[0].count + weatherForecastCount[0].count +
                     weatherHistoricalCount[0].count + holidayCount[0].count + refillCount[0].count,
        recordsPerTable: {
          users: userCount[0].count,
          products: productCount[0].count,
          suppliers: supplierCount[0].count,
          machines: machineCount[0].count,
          transactions: transCount[0].count,
          orders: orderCount[0].count,
          orderItems: orderItemCount[0].count,
          locations: locationCount[0].count,
          stocks: stockCount[0].count,
          warehouses: warehouseCount[0].count,
          inventoryItems: inventoryItemCount[0].count,
          syncLogs: syncLogCount[0].count,
          weatherData: weatherDataCount[0].count,
          weatherForecasts: weatherForecastCount[0].count,
          weatherHistorical: weatherHistoricalCount[0].count,
          holidays: holidayCount[0].count,
          refills: refillCount[0].count
        }
      };

      // Erstelle eine XLSX-Arbeitsmappe
      console.log('Erstelle XLSX-Arbeitsmappe...');
      const workbook = XLSX.utils.book_new();

      // Füge Metadaten hinzu
      const metadataSheet = XLSX.utils.json_to_sheet([metadata]);
      XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Metadaten');

      // Füge für jede Tabelle ein Arbeitsblatt hinzu
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(userData), 'Benutzer');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productData), 'Produkte');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(supplierData), 'Lieferanten');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(machineData), 'Automaten');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactionData), 'Transaktionen');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(orderData), 'Bestellungen');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(orderItemData), 'Bestellpositionen');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(locationData), 'Standorte');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(stocksData), 'Bestände');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(warehouseData), 'Lager');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(inventoryItemsData), 'Lagerbestände');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(syncLogsData), 'Synchronisierungslogs');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(weatherDataItems), 'Wetterdaten');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(weatherForecastsData), 'Wetterprognosen');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(weatherHistoricalData), 'Wetter-Historie');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(holidaysData), 'Feiertage');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(refillsData), 'Auffüllungen');

      // Schreibe die Arbeitsmappe in eine Datei
      console.log(`Schreibe Daten in ${filePath}...`);
      XLSX.writeFile(workbook, filePath);

      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      console.log(`Vollständiger Datenbank-Export abgeschlossen in ${durationSeconds.toFixed(2)} Sekunden. Datei: ${filePath}`);

      return filePath;
    } catch (error) {
      console.error('Fehler beim Exportieren der Datenbank:', error);
      throw error;
    }
  }

  /**
   * Importiert bestimmte Tabellen aus einer XLSX-Datei in die Datenbank
   * @param filePath Pfad zur XLSX-Datei
   * @param options Importoptionen (z.B. nur bestimmte Tabellen, vendonId-Behandlung)
   * @returns Statistiken über den Import
   */
  public async importDatabase(
    filePath: string, 
    options: {
      tables?: string[],
      skipVendonData?: boolean,
      forceUpdate?: boolean
    } = {}
  ): Promise<any> {
    console.log(`Datenbank-Import gestartet aus Datei: ${filePath}`);
    const startTime = Date.now();

    try {
      // Prüfe, ob die Datei existiert
      if (!fs.existsSync(filePath)) {
        throw new Error(`Datei ${filePath} existiert nicht`);
      }

      // Lese die XLSX-Datei
      console.log('Lese XLSX-Datei...');
      const workbook = XLSX.readFile(filePath);

      // Prüfe, ob die Metadaten vorhanden sind
      if (!workbook.Sheets['Metadaten']) {
        throw new Error('Ungültiges Datenbankexport-Format: Keine Metadaten gefunden');
      }

      // Lese die Metadaten
      const metadataSheet = workbook.Sheets['Metadaten'];
      const metadata = XLSX.utils.sheet_to_json(metadataSheet)[0] as any;
      console.log('Export-Metadaten:', metadata);

      // Definiere die zu importierenden Tabellen
      const tablesToImport = options.tables || Object.keys(metadata.recordsPerTable);
      console.log('Zu importierende Tabellen:', tablesToImport);

      // Statistiken für den Import
      const stats = {
        tablesImported: 0,
        recordsImported: 0,
        recordsSkipped: 0,
        errors: 0,
        tableStats: {} as Record<string, { imported: number, skipped: number, errors: number }>
      };

      // Importiere jede ausgewählte Tabelle
      for (const tableName of tablesToImport) {
        stats.tableStats[tableName] = { imported: 0, skipped: 0, errors: 0 };
        
        // Überspringe die Tabelle, wenn kein entsprechendes Arbeitsblatt existiert
        const sheetName = this.getSheetNameForTable(tableName);
        if (!workbook.Sheets[sheetName]) {
          console.log(`Tabelle ${tableName} wird übersprungen: Kein Arbeitsblatt gefunden`);
          continue;
        }

        // Lese die Daten aus dem Arbeitsblatt
        console.log(`Importiere Tabelle ${tableName}...`);
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        // Überspringe leere Tabellen
        if (data.length === 0) {
          console.log(`Tabelle ${tableName} ist leer, wird übersprungen`);
          continue;
        }

        // Importiere die Daten, je nach Tabelle unterschiedlich
        try {
          // Für jede Tabelle den entsprechenden Import-Prozess durchführen
          // Beachte dabei die vendonId-Behandlung
          const result = await this.importTableData(tableName, data, options);
          
          stats.tablesImported++;
          stats.recordsImported += result.imported;
          stats.recordsSkipped += result.skipped;
          stats.errors += result.errors;
          
          stats.tableStats[tableName] = result;
          
          console.log(`Import von ${tableName} abgeschlossen: ${result.imported} importiert, ${result.skipped} übersprungen, ${result.errors} Fehler`);
        } catch (error) {
          console.error(`Fehler beim Importieren der Tabelle ${tableName}:`, error);
          stats.errors++;
          stats.tableStats[tableName].errors++;
        }
      }

      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      console.log(`Datenbank-Import abgeschlossen in ${durationSeconds.toFixed(2)} Sekunden.`);
      console.log(`Statistik: ${stats.recordsImported} Datensätze importiert, ${stats.recordsSkipped} übersprungen, ${stats.errors} Fehler`);

      return stats;
    } catch (error) {
      console.error('Fehler beim Importieren der Datenbank:', error);
      throw error;
    }
  }

  /**
   * Gibt den Arbeitsblattnamen für eine Tabelle zurück
   */
  private getSheetNameForTable(tableName: string): string {
    const sheetMapping: Record<string, string> = {
      'users': 'Benutzer',
      'products': 'Produkte',
      'suppliers': 'Lieferanten',
      'machines': 'Automaten',
      'transactions': 'Transaktionen',
      'orders': 'Bestellungen',
      'orderItems': 'Bestellpositionen',
      'locations': 'Standorte',
      'stocks': 'Bestände',
      'warehouses': 'Lager',
      'inventoryItems': 'Lagerbestände',
      'syncLogs': 'Synchronisierungslogs',
      'weatherData': 'Wetterdaten',
      'weatherForecasts': 'Wetterprognosen',
      'weatherHistorical': 'Wetter-Historie',
      'holidays': 'Feiertage',
      'refills': 'Auffüllungen'
    };

    return sheetMapping[tableName] || tableName;
  }

  /**
   * Importiert die Daten einer Tabelle in die Datenbank
   */
  private async importTableData(
    tableName: string, 
    data: any[], 
    options: {
      skipVendonData?: boolean,
      forceUpdate?: boolean
    }
  ): Promise<{ imported: number, skipped: number, errors: number }> {
    const stats = { imported: 0, skipped: 0, errors: 0 };

    // Überspringe, wenn keine Daten vorhanden sind
    if (!data || data.length === 0) {
      return stats;
    }

    try {
      // Verarbeite die Daten je nach Tabellentyp
      switch (tableName) {
        case 'users':
          // Benutzer-Import: überschreibe keine bestehenden Benutzer, außer bei forceUpdate
          for (const item of data) {
            try {
              // Prüfe, ob der Benutzer bereits existiert
              const existingUser = await db.select().from(users).where(eq(users.id, item.id));
              
              if (existingUser.length > 0) {
                // Benutzer existiert bereits
                if (options.forceUpdate) {
                  // Aktualisiere den Benutzer, wenn forceUpdate aktiviert ist
                  await db.update(users).set({
                    username: item.username,
                    email: item.email,
                    name: item.name,
                    role: item.role,
                    // Vorsicht mit Passwörtern: nicht überschreiben, wenn nicht ausdrücklich angegeben
                    ...(item.password_hash ? { password_hash: item.password_hash } : {})
                  }).where(eq(users.id, item.id));
                  stats.imported++;
                } else {
                  stats.skipped++;
                }
              } else {
                // Benutzer existiert noch nicht, erstelle ihn neu
                await db.insert(users).values({
                  id: item.id,
                  username: item.username,
                  email: item.email,
                  password_hash: item.password_hash,
                  name: item.name,
                  role: item.role,
                  createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
                  updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date()
                });
                stats.imported++;
              }
            } catch (error) {
              console.error(`Fehler beim Importieren des Benutzers ID ${item.id}:`, error);
              stats.errors++;
            }
          }
          break;

        case 'products':
          // Produkt-Import: Vendon-Produkte nicht überschreiben, wenn skipVendonData aktiviert ist
          for (const item of data) {
            try {
              const existingProduct = await db.select().from(products).where(eq(products.id, item.id));
              
              // Überspringe Vendon-Produkte, wenn skipVendonData aktiviert ist
              if (options.skipVendonData && item.vendonId) {
                stats.skipped++;
                continue;
              }
              
              if (existingProduct.length > 0) {
                // Produkt existiert bereits
                if (options.forceUpdate) {
                  // Aktualisiere das Produkt, wenn forceUpdate aktiviert ist
                  await db.update(products).set({
                    name: item.name,
                    description: item.description,
                    price: item.price,
                    supplierId: item.supplierId,
                    sku: item.sku,
                    barcode: item.barcode,
                    imageUrl: item.imageUrl,
                    measurementUnit: item.measurementUnit,
                    unitSize: item.unitSize,
                    // Bei Vendon-Daten nur nutzerergänzte Felder aktualisieren
                    ...(item.vendonId ? {
                      custom1: item.custom1,
                      custom2: item.custom2,
                      custom3: item.custom3,
                      notes: item.notes
                    } : {
                      vendonId: item.vendonId,
                      vendonName: item.vendonName,
                      category: item.category,
                      active: item.active,
                      custom1: item.custom1,
                      custom2: item.custom2,
                      custom3: item.custom3,
                      notes: item.notes
                    })
                  }).where(eq(products.id, item.id));
                  stats.imported++;
                } else {
                  stats.skipped++;
                }
              } else {
                // Produkt existiert noch nicht, erstelle es neu
                await db.insert(products).values({
                  id: item.id,
                  name: item.name,
                  description: item.description,
                  price: item.price,
                  supplierId: item.supplierId,
                  vendonId: item.vendonId,
                  vendonName: item.vendonName,
                  sku: item.sku,
                  barcode: item.barcode,
                  imageUrl: item.imageUrl,
                  category: item.category,
                  active: item.active === true || item.active === 'true' || item.active === 1,
                  measurementUnit: item.measurementUnit,
                  unitSize: item.unitSize,
                  custom1: item.custom1,
                  custom2: item.custom2,
                  custom3: item.custom3,
                  notes: item.notes,
                  createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
                  updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date()
                });
                stats.imported++;
              }
            } catch (error) {
              console.error(`Fehler beim Importieren des Produkts ID ${item.id}:`, error);
              stats.errors++;
            }
          }
          break;

        // Weitere Tabellen nach Bedarf implementieren
        case 'suppliers':
          for (const item of data) {
            try {
              const existingSupplier = await db.select().from(suppliers).where(eq(suppliers.id, item.id));
              
              if (existingSupplier.length > 0) {
                if (options.forceUpdate) {
                  await db.update(suppliers).set({
                    name: item.name,
                    contactName: item.contactName,
                    contactEmail: item.contactEmail,
                    contactPhone: item.contactPhone,
                    notes: item.notes,
                    address: item.address,
                    city: item.city,
                    postalCode: item.postalCode,
                    country: item.country,
                    website: item.website
                  }).where(eq(suppliers.id, item.id));
                  stats.imported++;
                } else {
                  stats.skipped++;
                }
              } else {
                await db.insert(suppliers).values({
                  id: item.id,
                  name: item.name,
                  contactName: item.contactName,
                  contactEmail: item.contactEmail,
                  contactPhone: item.contactPhone,
                  notes: item.notes,
                  address: item.address,
                  city: item.city,
                  postalCode: item.postalCode,
                  country: item.country,
                  website: item.website,
                  createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
                  updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date()
                });
                stats.imported++;
              }
            } catch (error) {
              console.error(`Fehler beim Importieren des Lieferanten ID ${item.id}:`, error);
              stats.errors++;
            }
          }
          break;

        case 'warehouses':
          for (const item of data) {
            try {
              const existingWarehouse = await db.select().from(warehouses).where(eq(warehouses.id, item.id));
              
              if (existingWarehouse.length > 0) {
                if (options.forceUpdate) {
                  await db.update(warehouses).set({
                    name: item.name,
                    description: item.description,
                    address: item.address,
                    city: item.city,
                    postalCode: item.postalCode,
                    country: item.country,
                    locationId: item.locationId,
                    isDefault: item.isDefault === true || item.isDefault === 'true' || item.isDefault === 1
                  }).where(eq(warehouses.id, item.id));
                  stats.imported++;
                } else {
                  stats.skipped++;
                }
              } else {
                await db.insert(warehouses).values({
                  id: item.id,
                  name: item.name,
                  description: item.description,
                  address: item.address,
                  city: item.city,
                  postalCode: item.postalCode,
                  country: item.country,
                  locationId: item.locationId,
                  isDefault: item.isDefault === true || item.isDefault === 'true' || item.isDefault === 1,
                  createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
                  updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date()
                });
                stats.imported++;
              }
            } catch (error) {
              console.error(`Fehler beim Importieren des Lagers ID ${item.id}:`, error);
              stats.errors++;
            }
          }
          break;

        case 'inventoryItems':
          for (const item of data) {
            try {
              const existingInventoryItem = await db.select().from(inventoryItems)
                .where(and(
                  eq(inventoryItems.warehouseId, item.warehouseId),
                  eq(inventoryItems.productId, item.productId)
                ));
              
              if (existingInventoryItem.length > 0) {
                if (options.forceUpdate) {
                  await db.update(inventoryItems).set({
                    quantity: item.quantity,
                    minQuantity: item.minQuantity,
                    maxQuantity: item.maxQuantity,
                    reorderPoint: item.reorderPoint,
                    lastRefillDate: item.lastRefillDate ? new Date(item.lastRefillDate) : null,
                    notes: item.notes
                  }).where(eq(inventoryItems.id, item.id));
                  stats.imported++;
                } else {
                  stats.skipped++;
                }
              } else {
                await db.insert(inventoryItems).values({
                  id: item.id,
                  warehouseId: item.warehouseId,
                  productId: item.productId,
                  quantity: item.quantity,
                  minQuantity: item.minQuantity,
                  maxQuantity: item.maxQuantity,
                  reorderPoint: item.reorderPoint,
                  lastRefillDate: item.lastRefillDate ? new Date(item.lastRefillDate) : null,
                  notes: item.notes,
                  createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
                  updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date()
                });
                stats.imported++;
              }
            } catch (error) {
              console.error(`Fehler beim Importieren des Lagerbestands ID ${item.id}:`, error);
              stats.errors++;
            }
          }
          break;
          
        // Füge hier weitere Tabellen-Importe hinzu...
          
        default:
          console.log(`Import für Tabelle ${tableName} ist noch nicht implementiert, wird übersprungen`);
          stats.skipped += data.length;
          break;
      }
    } catch (error) {
      console.error(`Allgemeiner Fehler beim Importieren der Tabelle ${tableName}:`, error);
      stats.errors += data.length;
    }

    return stats;
  }

  /**
   * Listet alle verfügbaren Datenbank-Export-Dateien auf
   */
  public listDatabaseExports(): { name: string, path: string, size: number, created: Date }[] {
    const files = fs.readdirSync(this.exportDir)
      .filter(file => file.startsWith('db_export_') && file.endsWith('.xlsx'));
    
    return files.map(file => {
      const filePath = path.join(this.exportDir, file);
      const stats = fs.statSync(filePath);
      
      return {
        name: file,
        path: filePath,
        size: stats.size,
        created: stats.ctime
      };
    }).sort((a, b) => b.created.getTime() - a.created.getTime()); // Sortiere nach Erstelldatum (neuste zuerst)
  }
}

export const databaseExport = new DatabaseExportService();