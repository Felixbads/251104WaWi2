import fs from 'fs';
import path from 'path';
import { InsertTransaction, InsertMachine } from '@shared/schema';
import { storage } from '../storage';

// VendonApi-Typ für Typisierung
interface VendonApi {
  getTransactions: (startDate: Date, endDate: Date, machineId?: string, offset?: number, limit?: number) => Promise<any>;
}

// Definiere Interface für den Speicherzugriff
interface DatabaseStorage {
  getMachineByVendonId: (vendonId: string) => Promise<any>;
  createMachine: (machine: InsertMachine) => Promise<any>;
  getTransactionByVendonId: (vendonId: string) => Promise<any>;
  createTransaction: (transaction: InsertTransaction) => Promise<any>;
  updateTransaction: (id: number, transaction: Partial<InsertTransaction>) => Promise<any>;
}

/**
 * Service für den Bulk-Export und Import von Transaktionen
 * Diese Klasse dient als Workaround für die Paginierungsprobleme bei der Vendon-API
 */
export class BulkTransactionExporter {
  private api: VendonApi;
  private storage: DatabaseStorage;
  private exportDir: string;

  constructor(api: VendonApi, storage: DatabaseStorage) {
    this.api = api;
    this.storage = storage;
    
    // Exportverzeichnis erstellen, falls es nicht existiert
    this.exportDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Exportiert alle Transaktionen für einen bestimmten Zeitraum in eine JSON-Datei
   */
  public async exportTransactions(
    startDate: Date, 
    endDate: Date, 
    batchSize: number = 100,
    progressCallback?: (page: number, total: number) => void
  ): Promise<string> {
    console.log(`Bulk-Export von Transaktionen gestartet für Zeitraum ${startDate.toISOString()} - ${endDate.toISOString()}`);
    
    // Dateiname basierend auf Start- und Enddatum
    const filename = `transactions_${this.formatDateForFilename(startDate)}_${this.formatDateForFilename(endDate)}.json`;
    const filePath = path.join(this.exportDir, filename);
    
    // Falls die Datei bereits existiert, lösche sie
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Variablen für die Paginierung
    let page = 1;
    let allTransactions: any[] = [];
    let hasMoreTransactions = true;
    
    // Solange es weitere Transaktionen gibt, holen und speichern
    while (hasMoreTransactions) {
      console.log(`Hole Transaktionen für Zeitraum, Seite ${page} mit Batch-Größe ${batchSize}`);
      
      try {
        // Berechne den Offset für diese Anfrage
        const offset = (page - 1) * batchSize;
        
        // Hole Transaktionen von der API
        const result = await this.api.getTransactions(
          startDate,
          endDate,
          undefined, // keine Maschinen-ID-Filterung
          offset,
          batchSize
        );
        
        const transactions = result.data;
        
        // Wenn keine Transaktionen zurückgegeben wurden, breche die Schleife ab
        if (!transactions || transactions.length === 0) {
          console.log(`Keine weiteren Transaktionen gefunden.`);
          hasMoreTransactions = false;
          break;
        }
        
        console.log(`${transactions.length} Transaktionen auf Seite ${page} gefunden`);
        
        // Füge die Transaktionen zum Gesamtergebnis hinzu
        allTransactions = [...allTransactions, ...transactions];
        
        // Callback für Fortschrittsanzeige, falls bereitgestellt
        if (progressCallback) {
          progressCallback(page, allTransactions.length);
        }
        
        // Wenn weniger Transaktionen als die Batch-Größe zurückgegeben wurden, breche die Schleife ab
        if (transactions.length < batchSize) {
          console.log(`Letzte Seite erreicht (${transactions.length} < ${batchSize}).`);
          hasMoreTransactions = false;
          break;
        }
        
        // Nächste Seite
        page++;
      } catch (error) {
        console.error(`Fehler beim Abrufen von Transaktionen auf Seite ${page}:`, error);
        throw error;
      }
    }
    
    // Speichere die Transaktionen in einer JSON-Datei
    console.log(`Speichere ${allTransactions.length} Transaktionen in Datei ${filePath}`);
    fs.writeFileSync(filePath, JSON.stringify(allTransactions, null, 2));
    
    console.log(`Bulk-Export abgeschlossen. Datei gespeichert unter: ${filePath}`);
    return filePath;
  }
  
  /**
   * Importiert Transaktionen aus einer JSON-Datei in die Datenbank
   */
  public async importTransactions(
    filePath: string, 
    forceUpdate: boolean = false,
    progressCallback?: (current: number, total: number) => void
  ): Promise<{
    total: number;
    saved: number;
    updated: number;
    duplicates: number;
    errors: number;
  }> {
    console.log(`Starte Import von Transaktionen aus Datei ${filePath}`);
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(filePath)) {
      throw new Error(`Datei ${filePath} existiert nicht`);
    }
    
    // Lade die Transaktionen aus der JSON-Datei
    const transactionsJson = fs.readFileSync(filePath, 'utf-8');
    const transactions = JSON.parse(transactionsJson);
    
    console.log(`${transactions.length} Transaktionen aus Datei geladen`);
    
    // Statistiken
    let stats = {
      total: transactions.length,
      saved: 0,
      updated: 0,
      duplicates: 0,
      errors: 0
    };
    
    // Verarbeite jede Transaktion
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      
      try {
        // Fortschritt berichten
        if (progressCallback && i % 10 === 0) {
          progressCallback(i, transactions.length);
        }
        
        // Prüfe, ob die Transaktion eine ID hat
        if (!transaction.id && !transaction.transaction_id) {
          console.error("Transaktion ohne ID übersprungen:", transaction);
          stats.errors++;
          continue;
        }
        
        // Prüfe, ob die Maschine existiert
        let machineId: number;
        if (transaction.machine_id) {
          const machineVendonId = transaction.machine_id.toString();
          let machineData = await this.storage.getMachineByVendonId(machineVendonId);
          
          if (!machineData) {
            // Erstelle einen minimalen Maschinendatensatz, wenn er nicht existiert
            const newMachine: InsertMachine = {
              vendonId: machineVendonId,
              machineName: transaction.machine_name || `Maschine ${machineVendonId}`,
              lastSync: new Date()
            };
            machineData = await this.storage.createMachine(newMachine);
          }
          
          machineId = machineData.id;
        } else {
          console.warn(`Transaktion ${transaction.id || transaction.transaction_id} hat keine Maschinen-ID. Verwende Standardwert.`);
          machineId = 1; // Standardwert, wenn keine Maschinen-ID vorhanden ist
        }
        
        // Finde Produktname
        let productName = transaction.name || 'Unbekanntes Produkt';
        if (transaction.name) {
          productName = transaction.name;
        } else if (transaction.product_name) {
          productName = transaction.product_name;
        } else if (transaction.product && transaction.product.name) {
          productName = transaction.product.name;
        }
        
        // Datetime aus verschiedenen möglichen Formaten konvertieren
        let transactionDate: Date;
        if (transaction.datetime) {
          if (typeof transaction.datetime === 'number') {
            // Unix-Timestamp (Sekunden oder Millisekunden)
            transactionDate = new Date(
              transaction.datetime > 1577836800000 // Wenn > 01.01.2020 in Millisekunden
                ? transaction.datetime // Ist bereits in Millisekunden
                : transaction.datetime * 1000 // Konvertiere Sekunden zu Millisekunden
            );
          } else {
            // String-Datum
            transactionDate = new Date(transaction.datetime);
          }
        } else {
          console.warn(`Transaktion ${transaction.id || transaction.transaction_id} hat kein Datum. Verwende aktuelles Datum.`);
          transactionDate = new Date();
        }
        
        // Erstelle das vollständige Transaktionsobjekt
        const newTransaction: InsertTransaction = {
          vendonId: (transaction.id || transaction.transaction_id).toString(),
          machineId: machineId,
          machineName: transaction.machine_name || 'Unbekannte Maschine',
          datetime: transactionDate,
          transactionDt: transaction.transaction_dt ? new Date(transaction.transaction_dt * 1000) : null,
          registeredDt: transaction.registered_dt ? new Date(transaction.registered_dt * 1000) : null,
          updatedAt: transaction.updated_at ? new Date(transaction.updated_at * 1000) : null,
          amount: transaction.amount || 0,
          price: transaction.price || 0,
          priceVat: transaction.price_vat || null,
          priceWoVat: transaction.price_wo_vat || null,
          vat: transaction.vat || null,
          quantity: transaction.quantity || 1,
          productId: transaction.product_id ? transaction.product_id.toString() : null,
          productName: productName,
          stockId: transaction.stock_id ? transaction.stock_id.toString() : null,
          selection: transaction.selection || null,
          paymentMethod: transaction.payment_method || null,
          status: transaction.status || null,
          currency: transaction.currency || null,
          coinCredit: transaction.coin_credit || 0,
          cardCredit: transaction.card_credit || 0,
          cashlessCredit: transaction.cashless_credit || 0,
          discountCode: transaction.discount_code || null,
          discountAmount: transaction.discount_amount || null,
          locationId: null, // Wir setzen locationId auf null, um FK-Constraint-Fehler zu vermeiden
          locationName: transaction.location_name || null,
          note: transaction.note || null,
          transactionData: transaction.transaction_data ? JSON.stringify(transaction.transaction_data) : null,
          metadata: transaction.metadata ? JSON.stringify(transaction.metadata) : null,
          source: transaction.source || "vendon",
          isTest: transaction.is_test === true,
          extraData: JSON.stringify(transaction)
        };
        
        // Prüfe, ob die Transaktion bereits existiert
        if (newTransaction.vendonId) {
          try {
            const existingTransaction = await this.storage.getTransactionByVendonId(newTransaction.vendonId);
            
            if (existingTransaction) {
              // Bei manueller Synchronisierung werden manchmal Transaktionen fälschlicherweise als Duplikate erkannt
              // Zusätzliche Überprüfung des Datums, um sicherzustellen, dass es tatsächlich die gleiche Transaktion ist
              const existingDate = existingTransaction.datetime.getTime();
              const newDate = newTransaction.datetime.getTime();
              
              if (existingDate === newDate && !forceUpdate) {
                // Überspringe nur echte Duplikate (gleiche ID UND gleiches Datum), wenn nicht forceUpdate
                console.log(`Echtes Duplikat gefunden: ${newTransaction.vendonId} mit Datum ${new Date(existingDate).toISOString()}`);
                stats.duplicates++;
              } else if (forceUpdate) {
                // Bei forceUpdate aktualisieren wir die bestehende Transaktion
                console.log(`Force Update aktiviert - Aktualisiere Transaktion: ${newTransaction.vendonId}`);
                try {
                  await this.storage.updateTransaction(existingTransaction.id, newTransaction);
                  console.log(`Transaktion ${newTransaction.vendonId} erfolgreich aktualisiert.`);
                  stats.updated++;
                } catch (error) {
                  console.error(`Fehler beim Aktualisieren der Transaktion ${newTransaction.vendonId}:`, error);
                  stats.errors++;
                }
              } else {
                // Wenn das Datum unterschiedlich ist, trotz gleicher ID, könnten es verschiedene Transaktionen sein
                console.log(`Warnung: Transaktion mit ID ${newTransaction.vendonId} könnte ein Duplikat sein, hat aber ein anderes Datum.`);
                // Speichern mit modifizierter vendonId, um Duplikat zu vermeiden
                const modifiedTransaction = {
                  ...newTransaction,
                  vendonId: `${newTransaction.vendonId}_${newDate}`
                };
                console.log(`Speichere Transaktion mit modifizierter ID: ${modifiedTransaction.vendonId}`);
                await this.storage.createTransaction(modifiedTransaction);
                console.log(`Transaktion mit modifizierter ID ${modifiedTransaction.vendonId} gespeichert.`);
                stats.saved++;
              }
            } else {
              // Speichere neue Transaktion
              console.log(`Neue Transaktion ${newTransaction.vendonId} wird gespeichert...`);
              const savedTransaction = await this.storage.createTransaction(newTransaction);
              console.log(`Transaktion ${savedTransaction.vendonId} (ID: ${savedTransaction.id}) erfolgreich gespeichert.`);
              stats.saved++;
            }
          } catch (transError) {
            console.error(`Kritischer Fehler beim Speichern von Transaktion ${newTransaction.vendonId}:`, transError);
            stats.errors++;
          }
        } else {
          console.error("Transaktion konnte nicht gespeichert werden, weil die vendonId fehlt");
          stats.errors++;
        }
      } catch (error) {
        console.error(`Fehler beim Importieren von Transaktion an Index ${i}:`, error);
        stats.errors++;
      }
      
      // Detaillierter Status-Update nach jedem Batch
      if (i % 20 === 0 || i === transactions.length - 1) {
        console.log(`Import-Fortschritt: ${i + 1}/${transactions.length} (${Math.round((i + 1) / transactions.length * 100)}%)`);
        console.log(`  - Gespeichert: ${stats.saved}, Aktualisiert: ${stats.updated}, Duplikate: ${stats.duplicates}, Fehler: ${stats.errors}`);
      }
    }
    
    console.log(`Bulk-Import abgeschlossen. Ergebnis: ${stats.total} Transaktionen verarbeitet`);
    console.log(`  - ${stats.saved} neue Transaktionen gespeichert`);
    console.log(`  - ${stats.updated} bestehende Transaktionen aktualisiert`);
    console.log(`  - ${stats.duplicates} Duplikate übersprungen`);
    console.log(`  - ${stats.errors} Fehler bei der Verarbeitung`);
    
    return stats;
  }
  
  /**
   * Hilfs-Methode zum Formatieren eines Datums für Dateinamen
   */
  private formatDateForFilename(date: Date): string {
    return date.toISOString()
      .replace(/:/g, '-')
      .replace(/\./g, '-')
      .replace(/T/g, '_')
      .replace(/Z/g, '');
  }
}