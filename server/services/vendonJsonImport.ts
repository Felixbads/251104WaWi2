/**
 * Service zum Importieren von Vendon-Transaktionsdaten aus JSON-Dateien
 * Speziell für den Import großer Datenmengen optimiert
 */

import { transactions, insertTransactionSchema } from '@shared/schema';
import { db } from '../db';
import { InsertTransaction } from '@shared/schema';
import { storage } from '../storage';
import { z } from 'zod';

// Erstelle ein modifiziertes Schema für den JSON-Import, das String-Daten in Datumsobjekte konvertiert
const jsonImportTransactionSchema = insertTransactionSchema.extend({
  // Konvertiere String-Daten in Date-Objekte
  datetime: z.union([z.date(), z.string().transform(val => new Date(val))]),
  transactionDt: z.union([z.date(), z.string().transform(val => new Date(val)), z.null()]).optional(),
  registeredDt: z.union([z.date(), z.string().transform(val => new Date(val)), z.null()]).optional(),
  syncedAt: z.union([z.date(), z.string().transform(val => new Date(val)), z.null()]).optional(),
  createdAt: z.union([z.date(), z.string().transform(val => new Date(val)), z.null()]).optional(),
  updatedAt: z.union([z.date(), z.string().transform(val => new Date(val)), z.null()]).optional(),
});

/**
 * Service-Klasse für den Import von Vendon-Transaktionen aus JSON-Dateien
 */
export class VendonJsonImporter {
  /**
   * Importiert Vendon-Transaktionen aus einem JSON-Objekt
   * 
   * @param jsonData Array von Transaktionsdaten
   * @param options Importoptionen
   * @returns Statistik über den Importvorgang
   */
  async importTransactionsFromJson(
    jsonData: any[],
    options: {
      skipExistingCheck?: boolean;
    } = {}
  ): Promise<{
    total: number;
    saved: number;
    duplicates: number;
    errors: number;
    errorDetails: any[];
  }> {
    console.log(`Starte Import von ${jsonData.length} Vendon-Transaktionen aus JSON-Daten...`);
    
    // Statistik für den Importvorgang
    const stats = {
      total: 0,
      saved: 0,
      duplicates: 0,
      errors: 0,
      errorDetails: [] as any[]
    };
    
    try {
      // Status aktualisieren
      stats.total = jsonData.length;
      
      // Verarbeite jede Transaktion
      for (let index = 0; index < jsonData.length; index++) {
        const item = jsonData[index];
        
        try {
          // Wenn die Transaktion bereits ein gültiges Objekt ist, verarbeite es direkt
          const transactionData: InsertTransaction = item;
          
          // Prüfe, ob alle notwendigen Felder vorhanden sind
          if (!transactionData.vendonId) {
            throw new Error('Transaktion hat keine gültige vendonId');
          }
          
          // Prüfe, ob diese Transaktion bereits existiert (falls gewünscht)
          if (!options.skipExistingCheck) {
            const existingTransaction = await storage.getTransactionByVendonId(transactionData.vendonId);
            
            if (existingTransaction) {
              console.log(`Transaktion ${transactionData.vendonId} existiert bereits.`);
              stats.duplicates++;
              continue;
            }
          }
          
          // Validiere mit Schema
          let validTransactionData;
          try {
            // Verwende das modifizierte Schema für den JSON-Import
            validTransactionData = jsonImportTransactionSchema.parse(transactionData);
          } catch (validationError) {
            console.error(`Validierungsfehler bei Transaktion ${transactionData.vendonId}:`, validationError);
            stats.errors++;
            stats.errorDetails.push({
              vendonId: transactionData.vendonId,
              error: validationError instanceof Error ? validationError.message : 'Validierungsfehler',
              data: transactionData
            });
            continue;
          }
          
          // In die Datenbank speichern
          await storage.createTransaction(validTransactionData);
          stats.saved++;
          
          // Log bei jedem 100. Eintrag
          if (stats.saved % 100 === 0 || stats.saved === 1) {
            console.log(`${stats.saved} Transaktionen gespeichert...`);
          }
          
        } catch (error) {
          console.error(`Fehler beim Verarbeiten von Transaktion #${index}:`, error);
          stats.errors++;
          stats.errorDetails.push({
            index,
            error: error instanceof Error ? error.message : 'Unbekannter Fehler',
            data: item
          });
        }
      }
      
      console.log(`Import abgeschlossen. Ergebnis: ${stats.total} Transaktionen verarbeitet`);
      console.log(`  - ${stats.saved} neue Transaktionen gespeichert`);
      console.log(`  - ${stats.duplicates} Duplikate übersprungen`);
      console.log(`  - ${stats.errors} Fehler bei der Verarbeitung`);
      
      return stats;
      
    } catch (error) {
      console.error('Fehler beim Importieren der JSON-Daten:', error);
      throw error;
    }
  }
}

// Singleton-Instanz
export const vendonJsonImporter = new VendonJsonImporter();