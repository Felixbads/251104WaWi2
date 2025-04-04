/**
 * Service zum Importieren von Vendon-Transaktionsdaten aus einer Excel-Datei
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { transactions, insertTransactionSchema } from '@shared/schema';
import { db } from '../db';
import { InsertTransaction } from '@shared/schema';
import { storage } from '../storage';

/**
 * Service-Klasse für den Import von Vendon-Transaktionen aus Excel-Dateien
 */
export class VendonExcelImporter {
  /**
   * Importiert Vendon-Transaktionen aus einer Excel-Datei
   * 
   * @param filePath Dateipfad zur Excel-Datei
   * @param options Importoptionen
   * @returns Statistik über den Importvorgang
   */
  async importTransactionsFromExcel(
    filePath: string | Buffer,
    options: {
      sheetName?: string;
      headerMappings?: Record<string, string>;
      skipRows?: number;
      maxRows?: number;
    } = {}
  ): Promise<{
    total: number;
    saved: number;
    duplicates: number;
    errors: number;
    errorDetails: any[];
  }> {
    console.log(`Starte Import von Vendon-Transaktionen aus Excel-Datei...`);
    
    // Statistik für den Importvorgang
    const stats = {
      total: 0,
      saved: 0,
      duplicates: 0,
      errors: 0,
      errorDetails: [] as any[]
    };
    
    try {
      // Excel-Datei lesen (entweder aus Dateipfad oder direkt aus Buffer)
      const workbook = typeof filePath === 'string' 
        ? XLSX.readFile(filePath)
        : XLSX.read(filePath, { type: 'buffer' });
      
      // Arbeitsblatt auswählen (erstes Blatt, falls nicht anders angegeben)
      const sheetName = options.sheetName || workbook.SheetNames[0];
      if (!workbook.SheetNames.includes(sheetName)) {
        throw new Error(`Arbeitsblatt "${sheetName}" nicht in der Excel-Datei gefunden.`);
      }
      
      const worksheet = workbook.Sheets[sheetName];
      
      // In JSON konvertieren
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: options.headerMappings ? 1 : undefined,
        range: options.skipRows ? options.skipRows : undefined
      });
      
      // Wenn maxRows gesetzt ist, begrenzen wir die Anzahl der zu verarbeitenden Zeilen
      const maxRows = options.maxRows;
      if (maxRows && maxRows > 0 && maxRows < jsonData.length) {
        console.log(`Begrenzung auf ${maxRows} Zeilen (von insgesamt ${jsonData.length})`);
        jsonData.length = maxRows;
      }
      
      stats.total = jsonData.length;
      console.log(`${stats.total} Zeilen aus Excel-Datei werden verarbeitet.`);
      
      // Verarbeite jede Zeile und konvertiere sie in das richtige Format
      for (let index = 0; index < jsonData.length; index++) {
        const row = jsonData[index];
        try {
          // Mapping der Excel-Spalten zu den Datenbankfeldern, falls bereitgestellt
          const mappedRow = options.headerMappings 
            ? this.mapRowUsingHeaderMappings(row, options.headerMappings)
            : row;
          
          // Konvertiere die Daten in das Transaction-Format
          const transactionData = await this.convertExcelRowToTransaction(mappedRow);
          
          if (!transactionData) {
            console.warn(`Zeile ${index + 1}: Konnte keine gültige Transaktion erzeugen.`);
            stats.errors++;
            stats.errorDetails.push({
              row: index + 1,
              error: 'Ungültige Transaktionsdaten',
              data: mappedRow
            });
            continue;
          }
          
          // Prüfe, ob die Transaktion bereits existiert (über vendonId)
          if (transactionData.vendonId) {
            const existingTransaction = await storage.getTransactionByVendonId(transactionData.vendonId);
            
            if (existingTransaction) {
              console.log(`Zeile ${index + 1}: Transaktion mit vendonId ${transactionData.vendonId} existiert bereits.`);
              stats.duplicates++;
              continue;
            }
          }
          
          // Transaktion in der Datenbank speichern
          const createdTransaction = await storage.createTransaction(transactionData);
          
          if (createdTransaction) {
            stats.saved++;
            
            // Statusspalte aktualisieren, wenn es ein Batch ist
            if (index % 50 === 0 || index === jsonData.length - 1) {
              console.log(`Importfortschritt: ${index + 1}/${jsonData.length} (${Math.round((index + 1) / jsonData.length * 100)}%)`);
              console.log(`  - Gespeichert: ${stats.saved}, Duplikate: ${stats.duplicates}, Fehler: ${stats.errors}`);
            }
          } else {
            console.error(`Zeile ${index + 1}: Fehler beim Speichern der Transaktion.`);
            stats.errors++;
            stats.errorDetails.push({
              row: index + 1,
              error: 'Konnte Transaktion nicht speichern',
              data: transactionData
            });
          }
        } catch (error) {
          console.error(`Fehler beim Verarbeiten der Zeile ${index + 1}:`, error);
          stats.errors++;
          stats.errorDetails.push({
            row: index + 1,
            error: error instanceof Error ? error.message : 'Unbekannter Fehler',
            data: row
          });
        }
      }
      
      console.log(`Import abgeschlossen. Ergebnis: ${stats.total} Transaktionen verarbeitet`);
      console.log(`  - ${stats.saved} neue Transaktionen gespeichert`);
      console.log(`  - ${stats.duplicates} Duplikate übersprungen`);
      console.log(`  - ${stats.errors} Fehler bei der Verarbeitung`);
      
      return stats;
      
    } catch (error) {
      console.error('Fehler beim Importieren der Excel-Datei:', error);
      throw error;
    }
  }
  
  /**
   * Konvertiert eine Excel-Zeile in ein Transaction-Objekt
   * 
   * @param row Excel-Zeilendaten
   * @returns Transaction-Objekt oder null, wenn die Zeile nicht konvertiert werden konnte
   */
  private async convertExcelRowToTransaction(row: any): Promise<InsertTransaction | null> {
    try {
      // Extrahiere die Basis-Felder aus der Excel-Zeile
      const vendonId = this.extractStringField(row, ['Transaction ID', 'TransactionID', 'transaction_id', 'vendon_id', 'VendonId']);
      
      if (!vendonId) {
        console.warn('Zeile hat keine gültige vendonId, wird übersprungen');
        return null;
      }
      
      // Extrahiere weitere Felder
      const datetime = this.extractDateField(row, ['Datetime', 'Date', 'Datum', 'datetime', 'Zeit']);
      const machineId = this.extractNumberField(row, ['Machine ID', 'MachineID', 'machine_id']);
      const machineName = this.extractStringField(row, ['Machine Name', 'MachineName', 'machine_name', 'Gerätename']);
      const productId = this.extractStringField(row, ['Product ID', 'ProductID', 'product_id', 'Produkt-ID']);
      const productName = this.extractStringField(row, ['Product Name', 'ProductName', 'product_name', 'Produktname']);
      const price = this.extractNumberField(row, ['Price', 'price', 'Preis']);
      const priceVat = this.extractNumberField(row, ['Price VAT', 'PriceVAT', 'price_vat', 'Preis mit MwSt']);
      const priceWoVat = this.extractNumberField(row, ['Price w/o VAT', 'PriceWoVAT', 'price_wo_vat', 'Preis ohne MwSt']);
      const vat = this.extractNumberField(row, ['VAT', 'vat', 'MwSt']);
      const quantity = this.extractNumberField(row, ['Quantity', 'quantity', 'Menge']) || 1;
      const paymentMethod = this.extractStringField(row, ['Payment Method', 'PaymentMethod', 'payment_method', 'Zahlungsmethode']);
      const paymentType = this.extractStringField(row, ['Payment Type', 'PaymentType', 'payment_type', 'Zahlungstyp']);
      const status = this.extractStringField(row, ['Status', 'status', 'Status']) || 'completed';
      const currency = this.extractStringField(row, ['Currency', 'currency', 'Währung']) || 'EUR';
      const locationName = this.extractStringField(row, ['Location Name', 'LocationName', 'location_name', 'Standort']);
      
      // Optionale Felder
      const transactionDt = this.extractDateField(row, ['Transaction Date', 'TransactionDate', 'transaction_dt']);
      const registeredDt = this.extractDateField(row, ['Registered Date', 'RegisteredDate', 'registered_dt']);
      
      // Erstelle das Transaction-Objekt
      const transactionData: InsertTransaction = {
        vendonId: vendonId,
        machineId: machineId || null,
        machineName: machineName || null,
        
        // Datum und Zeit
        datetime: datetime || new Date(),
        transactionDt: transactionDt || null,
        registeredDt: registeredDt || null,
        
        // Produkt-Details
        productId: productId || null,
        productName: productName || null,
        selection: null,
        
        // Lager-Details
        stockId: null,
        article: null,
        
        // Mengen und Preis-Informationen
        quantity: quantity,
        price: price || 0,
        priceVat: priceVat || null,
        priceWoVat: priceWoVat || null,
        vat: vat || null,
        currency: currency,
        
        // Rabatt-Informationen
        discountCode: null,
        discountAmount: null,
        
        // Zahlungsinformationen
        paymentMethod: paymentMethod || null,
        paymentType: paymentType || null,
        
        // Metadaten
        source: 'excel-import',
        transactionData: null,
        note: null,
        metadata: JSON.stringify({ importedFromExcel: true, importDate: new Date().toISOString() }),
        extraData: null,
        amount: price || null,
        
        // Standort-Zuordnung
        locationId: null,
        locationName: locationName || null,
        
        // Weitere Felder
        transactionType: 'sale',
        status: status,
        coinCredit: null,
        cardCredit: null,
        cashlessCredit: null,
        isTest: false,
        
        // Verarbeitungs-Status
        syncedAt: new Date(),
        lastSync: null,
        processedAt: null,
        processingStatus: 'processed',
        processingError: null,
        
        // Datensatz-Tracking
        createdAt: new Date()
      };
      
      return transactionData;
    } catch (error) {
      console.error('Fehler beim Konvertieren der Excel-Zeile:', error);
      return null;
    }
  }
  
  /**
   * Extrahiert einen String-Wert aus einer Excel-Zeile
   * 
   * @param row Excel-Zeilendaten
   * @param possibleFieldNames Mögliche Feldnamen
   * @returns Extrahierter String oder null
   */
  private extractStringField(row: any, possibleFieldNames: string[]): string | null {
    for (const fieldName of possibleFieldNames) {
      if (row[fieldName] !== undefined && row[fieldName] !== null) {
        return String(row[fieldName]);
      }
    }
    return null;
  }
  
  /**
   * Extrahiert einen Zahlenwert aus einer Excel-Zeile
   * 
   * @param row Excel-Zeilendaten
   * @param possibleFieldNames Mögliche Feldnamen
   * @returns Extrahierter Zahlenwert oder null
   */
  private extractNumberField(row: any, possibleFieldNames: string[]): number | null {
    for (const fieldName of possibleFieldNames) {
      if (row[fieldName] !== undefined && row[fieldName] !== null) {
        const value = Number(row[fieldName]);
        return isNaN(value) ? null : value;
      }
    }
    return null;
  }
  
  /**
   * Extrahiert ein Datumswert aus einer Excel-Zeile
   * 
   * @param row Excel-Zeilendaten
   * @param possibleFieldNames Mögliche Feldnamen
   * @returns Extrahiertes Datum oder null
   */
  private extractDateField(row: any, possibleFieldNames: string[]): Date | null {
    for (const fieldName of possibleFieldNames) {
      if (row[fieldName] !== undefined && row[fieldName] !== null) {
        // Excel-Datum kann verschiedene Formate haben
        const value = row[fieldName];
        
        // Versuche, das Datum zu parsen
        try {
          // Wenn es bereits ein Date-Objekt ist
          if (value instanceof Date) {
            return value;
          }
          
          // Wenn es ein Excel-Serialdatum ist (Zahl)
          if (typeof value === 'number') {
            // Excel-Datum beginnt am 1. Januar 1900
            const excelEpoch = new Date(1899, 11, 30);
            const date = new Date(excelEpoch);
            date.setDate(excelEpoch.getDate() + value);
            return date;
          }
          
          // Sonst als String behandeln
          return new Date(value);
        } catch (error) {
          console.warn(`Konnte Datum aus Feld ${fieldName} nicht parsen:`, value);
        }
      }
    }
    return null;
  }
  
  /**
   * Mappt eine Zeile anhand der Header-Mappings
   * 
   * @param row Original-Zeilendaten
   * @param mappings Header-Mappings
   * @returns Gemappte Zeilendaten
   */
  private mapRowUsingHeaderMappings(row: any, mappings: Record<string, string>): any {
    const mappedRow: any = {};
    
    // Verwende Object.keys anstelle von Object.entries, um Kompatibilitätsprobleme zu vermeiden
    const keys = Object.keys(mappings);
    for (let i = 0; i < keys.length; i++) {
      const excelHeader = keys[i];
      const dbField = mappings[excelHeader];
      
      if (row[excelHeader] !== undefined) {
        mappedRow[dbField] = row[excelHeader];
      }
    }
    
    return mappedRow;
  }
}

// Singleton-Instanz
export const vendonExcelImporter = new VendonExcelImporter();