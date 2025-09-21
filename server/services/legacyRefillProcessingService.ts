import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { z } from "zod";
import {
  stockMovements,
  insertStockMovementSchema
} from "../../shared/warehouse3.schema";
import { fifoDeplete } from "./inventoryTransactions";

// Types für den Legacy Refill Service
export interface LegacyRefillProcessingResult {
  success: boolean;
  refillId: number;
  movementsCreated: number;
  totalQuantityProcessed: number;
  batchesProcessed: number;
  warnings: string[];
  errors?: string[];
}

export interface LegacyRefillCommitData {
  refillId: number;
  performedBy: number;
  notes?: string;
}

// Validation Schema
export const legacyRefillCommitSchema = z.object({
  refillId: z.number().positive(),
  performedBy: z.number().positive(),
  notes: z.string().optional()
});

export type LegacyRefillCommit = z.infer<typeof legacyRefillCommitSchema>;

/**
 * Legacy Refill Processing Service
 * 
 * Arbeitet mit den bestehenden refills/refill_details Tabellen
 * Konvertiert diese in inventory_movements für Lagerverwaltung
 */
export class LegacyRefillProcessingService {
  
  /**
   * Verarbeitet einen Legacy-Refill (aus refills Tabelle)
   */
  async processLegacyRefillAdded(data: LegacyRefillCommit): Promise<LegacyRefillProcessingResult> {
    console.log(`[LEGACY_REFILL] Starting refill commit for refill ${data.refillId}`);
    
    try {
      // 1. Legacy Refill-Daten laden 
      const refill = await this.loadLegacyRefill(data.refillId);
      if (!refill) {
        return this.createFailResult(data.refillId, ["Legacy Refill nicht gefunden"]);
      }

      // 2. Prüfen ob bereits verarbeitet (Idempotenz)
      const existingMovements = await this.checkExistingMovements(data.refillId, "REFILL_ADDED");
      if (existingMovements.length > 0) {
        console.log(`[LEGACY_REFILL] Refill ${data.refillId} already processed, skipping`);
        return {
          success: true,
          refillId: data.refillId,
          movementsCreated: 0,
          totalQuantityProcessed: 0,
          batchesProcessed: 0,
          warnings: ["Refill wurde bereits verarbeitet"]
        };
      }

      // 3. Legacy Refill-Details laden (mit "added" Mengen)
      const refillDetails = await this.loadLegacyRefillDetails(data.refillId);
      if (refillDetails.length === 0) {
        return this.createFailResult(data.refillId, ["Keine Refill-Details gefunden"]);
      }

      // 4. Warehouse ermitteln (Legacy refills haben keine direkte warehouse_id)
      const warehouseId = await this.determineWarehouseFromMachine(refill.machine_id);
      if (!warehouseId) {
        return this.createFailResult(data.refillId, ["Lager für Automat nicht gefunden"]);
      }

      // 5. Für jeden Detail-Eintrag mit "added" > 0: Lagerbewegung erstellen
      let totalMovements = 0;
      let totalQuantity = 0;
      let totalBatches = 0;
      const warnings: string[] = [];

      for (const detail of refillDetails) {
        if (detail.added && detail.added > 0) {
          const result = await this.processLegacyRefillDetailFEFO(
            refill,
            detail,
            warehouseId,
            data.performedBy,
            data.notes
          );
          
          if (result.success) {
            totalMovements += result.movementsCreated;
            totalQuantity += result.quantityProcessed;
            totalBatches += result.batchesProcessed;
          } else {
            warnings.push(`Produkt ${detail.product_id}: ${result.errors?.join(", ") || "Fehler"}`);
          }
        }
      }

      console.log(`[LEGACY_REFILL] Refill ${data.refillId} processed: ${totalMovements} movements, ${totalQuantity} quantity, ${totalBatches} batches`);

      return {
        success: true,
        refillId: data.refillId,
        movementsCreated: totalMovements,
        totalQuantityProcessed: totalQuantity,
        batchesProcessed: totalBatches,
        warnings
      };

    } catch (error: unknown) {
      console.error(`[LEGACY_REFILL] Error processing refill ${data.refillId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      return this.createFailResult(data.refillId, [`Verarbeitungsfehler: ${errorMessage}`]);
    }
  }

  // ---- PRIVATE HELPER METHODS ----

  private async loadLegacyRefill(refillId: number): Promise<any | null> {
    const result = await db.execute(sql`
      SELECT id, machine_id, datetime, status, operator
      FROM refills 
      WHERE id = ${refillId}
      LIMIT 1
    `);
    
    return result.rows[0] || null;
  }

  private async loadLegacyRefillDetails(refillId: number): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT 
        id, refill_id, product_id, product_name, 
        quantity, added, removed, 
        previous_stock, current_stock,
        datetime
      FROM refill_details 
      WHERE refill_id = ${refillId}
        AND added > 0  -- Nur Hinzufügungen verarbeiten
    `);
    
    return result.rows;
  }

  private async determineWarehouseFromMachine(machineId: number): Promise<number | null> {
    // Versuche Machine→Warehouse Zuordnung zu finden
    const result = await db.execute(sql`
      SELECT warehouse_id 
      FROM machine_warehouse_assignments 
      WHERE machine_id = ${machineId}
      LIMIT 1
    `);
    
    if (result.rows[0]) {
      return result.rows[0].warehouse_id as number;
    }

    // Fallback: Verwende Lager ID 1 (Hauptlager)
    console.log(`[LEGACY_REFILL] No warehouse assignment for machine ${machineId}, using warehouse 1`);
    return 1;
  }

  private async checkExistingMovements(refillId: number, movementType: string): Promise<any[]> {
    return await db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.referenceId, refillId.toString()),
          eq(stockMovements.source, "REFILL"),
          eq(stockMovements.movementType, movementType)
        )
      );
  }

  private async processLegacyRefillDetailFEFO(
    refill: any,
    detail: any,
    warehouseId: number,
    performedBy: number,
    notes?: string
  ): Promise<{
    success: boolean;
    movementsCreated: number;
    quantityProcessed: number;
    batchesProcessed: number;
    errors?: string[];
  }> {
    try {
      // Konvertiere product_id von string zu number falls nötig
      const productId = typeof detail.product_id === 'string' ? 
        parseInt(detail.product_id) : detail.product_id;

      if (!productId || isNaN(productId)) {
        return {
          success: false,
          movementsCreated: 0,
          quantityProcessed: 0,
          batchesProcessed: 0,
          errors: [`Ungültige Produkt-ID: ${detail.product_id}`]
        };
      }

      // FEFO-Entnahme aus dem Lager verwenden (OUT = Entnahme vom Lager)
      const depleteData = {
        warehouseId,
        productId,
        quantityToDeplete: detail.added,
        movementType: "OUT" as const, // Schema erlaubt nur OUT/TRANSFER/ADJUSTMENT
        referenceType: "REFILL" as const,
        referenceId: refill.id.toString(),
        notes: `Refill Auffüllung: ${detail.product_name || 'Unbekanntes Produkt'}${notes ? ` - ${notes}` : ''}`,
        performedBy,
        machineId: refill.machine_id
      };

      const result = await fifoDeplete(db, depleteData);

      if (!result.success) {
        return {
          success: false,
          movementsCreated: 0,
          quantityProcessed: 0,
          batchesProcessed: 0,
          errors: result.errors || ["FEFO-Entnahme fehlgeschlagen"]
        };
      }

      return {
        success: true,
        movementsCreated: result.movements?.length || 0,
        quantityProcessed: result.totalDepleted || 0,
        batchesProcessed: result.batchesProcessed?.length || 0
      };

    } catch (error: unknown) {
      console.error(`[LEGACY_REFILL] FEFO error for product ${detail.product_id}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter FEFO-Fehler';
      return {
        success: false,
        movementsCreated: 0,
        quantityProcessed: 0,
        batchesProcessed: 0,
        errors: [`FEFO-Fehler: ${errorMessage}`]
      };
    }
  }

  private createFailResult(refillId: number, errors: string[]): LegacyRefillProcessingResult {
    return {
      success: false,
      refillId,
      movementsCreated: 0,
      totalQuantityProcessed: 0,
      batchesProcessed: 0,
      warnings: [],
      errors
    };
  }
}

// Export singleton instance
export const legacyRefillProcessingService = new LegacyRefillProcessingService();