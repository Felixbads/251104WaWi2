/**
 * BATCH VENDON PROCESSOR - LÖST N+1-QUERY-PROBLEM KOMPLETT
 * 
 * Ersetzt die einzelnen SELECT-Duplikatsprüfungen durch:
 * - Batch-basierte IN(...) Queries
 * - INSERT ... ON CONFLICT für automatische Duplikatbehandlung
 * - Transaktionssichere Bulk-Operationen
 * - Keine N+1-Queries mehr
 */

import { rawDb } from "../db";
import { storage } from "../storage";
import { DuplicatePreventionService } from "./DuplicatePreventionService";
import { 
  InsertTransaction, 
  InsertEvent,
  InsertRefill 
} from "@shared/schema";

export interface BatchProcessResult {
  totalItems: number;
  newItems: number;
  duplicates: number;
  errors: string[];
}

export class BatchVendonProcessor {
  private duplicateService: DuplicatePreventionService;

  constructor() {
    this.duplicateService = new DuplicatePreventionService();
  }

  /**
   * Verarbeitet Transaktionen batch-basiert ohne N+1-Queries
   */
  async processTransactionsBatch(apiTransactions: any[]): Promise<BatchProcessResult> {
    if (apiTransactions.length === 0) {
      return { totalItems: 0, newItems: 0, duplicates: 0, errors: [] };
    }

    console.log(`📦 Verarbeite ${apiTransactions.length} Transaktionen batch-basiert...`);

    // Extrahiere alle vendon_ids für batch-Duplikatsprüfung
    const vendonIds = apiTransactions.map(t => t.transaction_id.toString());
    
    // Batch-basierte Duplikatsprüfung mit einer einzigen Query
    const existingVendonIds = await this.duplicateService.checkExistingTransactions(vendonIds);
    console.log(`🔍 ${existingVendonIds.length} existierende Transaktionen gefunden`);

    // Filtere neue Transaktionen heraus
    const newTransactions = apiTransactions.filter(t => 
      !existingVendonIds.includes(t.transaction_id.toString())
    );

    if (newTransactions.length === 0) {
      console.log('✅ Alle Transaktionen bereits vorhanden - keine neuen Datensätze');
      return { 
        totalItems: apiTransactions.length, 
        newItems: 0, 
        duplicates: apiTransactions.length, 
        errors: [] 
      };
    }

    // Konvertiere zu Insert-Objekten
    const insertTransactions: InsertTransaction[] = newTransactions.map(apiTransaction => ({
      vendonId: apiTransaction.transaction_id.toString(),
      machineId: null, // Wird später aufgelöst
      machineName: apiTransaction.machine_name || '',
      datetime: this.parseVendonDate(apiTransaction.datetime),
      productName: apiTransaction.product_name || 'Unbekanntes Produkt',
      price: apiTransaction.price,
      quantity: apiTransaction.quantity || 1,
      source: 'vendon_api',
      paymentMethod: apiTransaction.payment_method || 'unknown',
      status: 'completed',
      currency: 'EUR'
    }));

    const errors: string[] = [];

    // Batch-Insert mit automatischer Duplikatsbehandlung
    try {
      await this.duplicateService.bulkInsertTransactions(insertTransactions);
      console.log(`✅ ${newTransactions.length} neue Transaktionen gespeichert`);
    } catch (error: any) {
      const errorMsg = `Batch-Insert Transaktionen fehlgeschlagen: ${error.message}`;
      console.error(`❌ ${errorMsg}`);
      errors.push(errorMsg);
    }

    return {
      totalItems: apiTransactions.length,
      newItems: newTransactions.length,
      duplicates: existingVendonIds.length,
      errors
    };
  }

  /**
   * Verarbeitet Events batch-basiert ohne N+1-Queries
   */
  async processEventsBatch(apiEvents: any[]): Promise<BatchProcessResult> {
    if (apiEvents.length === 0) {
      return { totalItems: 0, newItems: 0, duplicates: 0, errors: [] };
    }

    console.log(`📦 Verarbeite ${apiEvents.length} Events batch-basiert...`);

    // Extrahiere alle vendon_ids
    const vendonIds = apiEvents.map(e => e.id.toString());
    
    // Batch-basierte Duplikatsprüfung
    const existingVendonIds = await this.duplicateService.checkExistingEvents(vendonIds);
    console.log(`🔍 ${existingVendonIds.length} existierende Events gefunden`);

    // Filtere neue Events
    const newEvents = apiEvents.filter(e => 
      !existingVendonIds.includes(e.id.toString())
    );

    if (newEvents.length === 0) {
      console.log('✅ Alle Events bereits vorhanden');
      return { 
        totalItems: apiEvents.length, 
        newItems: 0, 
        duplicates: apiEvents.length, 
        errors: [] 
      };
    }

    // Konvertiere zu Insert-Objekten
    const insertEvents: InsertEvent[] = newEvents.map(apiEvent => ({
      vendonId: apiEvent.id.toString(),
      machineId: null,
      machineName: '',
      datetime: this.parseVendonDate(apiEvent.datetime),
      eventType: apiEvent.event_type,
      description: apiEvent.description || '',
      severity: 'info',
      status: 'logged'
    }));

    const errors: string[] = [];

    try {
      await this.duplicateService.bulkInsertEvents(insertEvents);
      console.log(`✅ ${newEvents.length} neue Events gespeichert`);
    } catch (error: any) {
      const errorMsg = `Batch-Insert Events fehlgeschlagen: ${error.message}`;
      console.error(`❌ ${errorMsg}`);
      errors.push(errorMsg);
    }

    return {
      totalItems: apiEvents.length,
      newItems: newEvents.length,
      duplicates: existingVendonIds.length,
      errors
    };
  }

  /**
   * Verarbeitet Refills batch-basiert ohne N+1-Queries
   */
  async processRefillsBatch(apiRefills: any[]): Promise<BatchProcessResult> {
    if (apiRefills.length === 0) {
      return { totalItems: 0, newItems: 0, duplicates: 0, errors: [] };
    }

    console.log(`📦 Verarbeite ${apiRefills.length} Refills batch-basiert...`);

    // Extrahiere alle vendon_ids
    const vendonIds = apiRefills.map(r => r.id.toString());
    
    // Batch-basierte Duplikatsprüfung
    const existingVendonIds = await this.duplicateService.checkExistingRefills(vendonIds);
    console.log(`🔍 ${existingVendonIds.length} existierende Refills gefunden`);

    // Filtere neue Refills
    const newRefills = apiRefills.filter(r => 
      !existingVendonIds.includes(r.id.toString())
    );

    if (newRefills.length === 0) {
      console.log('✅ Alle Refills bereits vorhanden');
      return { 
        totalItems: apiRefills.length, 
        newItems: 0, 
        duplicates: apiRefills.length, 
        errors: [] 
      };
    }

    // Konvertiere zu Insert-Objekten
    const insertRefills: InsertRefill[] = newRefills.map(apiRefill => ({
      vendonId: apiRefill.id.toString(),
      machineId: null, // Wird später aufgelöst
      machineName: apiRefill.machine_name || '',
      datetime: this.parseVendonDate(apiRefill.datetime),
      productName: apiRefill.product_name || 'Unbekanntes Produkt',
      quantity: apiRefill.quantity || 1,
      cost: apiRefill.cost || 0,
      source: 'vendon_api',
      status: 'completed'
    }));

    const errors: string[] = [];

    try {
      await this.duplicateService.bulkInsertRefills(insertRefills);
      console.log(`✅ ${newRefills.length} neue Refills gespeichert`);
    } catch (error: any) {
      const errorMsg = `Batch-Insert Refills fehlgeschlagen: ${error.message}`;
      console.error(`❌ ${errorMsg}`);
      errors.push(errorMsg);
    }

    return {
      totalItems: apiRefills.length,
      newItems: newRefills.length,
      duplicates: existingVendonIds.length,
      errors
    };
  }

  /**
   * Parst Vendon-Datum in JavaScript Date
   */
  private parseVendonDate(vendonDate: string): Date {
    if (!vendonDate) {
      return new Date();
    }

    try {
      // Vendon verwendet ISO-Format
      return new Date(vendonDate);
    } catch (error) {
      console.warn(`⚠️ Ungültiges Datum: ${vendonDate}, verwende aktuelles Datum`);
      return new Date();
    }
  }
}

// Singleton instance
let batchVendonProcessorInstance: BatchVendonProcessor | null = null;

export function getBatchVendonProcessorInstance(): BatchVendonProcessor {
  if (!batchVendonProcessorInstance) {
    batchVendonProcessorInstance = new BatchVendonProcessor();
  }
  return batchVendonProcessorInstance;
}