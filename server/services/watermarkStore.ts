/**
 * WatermarkStore für historische Vendon-Synchronisation
 * 
 * Diese Klasse verwaltet Watermarks (last_updated_at Timestamps) für jede Maschine
 * um Delta-Synchronisation zu ermöglichen. Implementiert die Anforderungen aus
 * der Spezifikation für idempotente und wiederaufsetzbare Synchronisation.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { vendonWatermarks, type InsertVendonWatermark, type VendonWatermark } from '@shared/schema';

export interface WatermarkOptions {
  machineId: string;
  lastUpdatedAt: Date;
}

export class WatermarkStore {
  /**
   * Holt den Watermark für eine spezifische Maschine
   * @param machineId Die Vendon Machine ID
   * @returns Watermark-Eintrag oder null wenn nicht vorhanden
   */
  async getWatermark(machineId: string): Promise<VendonWatermark | null> {
    try {
      const result = await db
        .select()
        .from(vendonWatermarks)
        .where(eq(vendonWatermarks.machineId, machineId))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error(`Fehler beim Abrufen des Watermarks für Maschine ${machineId}:`, error);
      return null;
    }
  }

  /**
   * Setzt den Watermark für eine spezifische Maschine
   * @param machineId Die Vendon Machine ID
   * @param lastUpdatedAt Der letzte updated_at Timestamp
   * @returns Erfolg (true/false)
   */
  async setWatermark(machineId: string, lastUpdatedAt: Date): Promise<boolean> {
    try {
      const watermarkData: InsertVendonWatermark = {
        machineId,
        lastUpdatedAt
      };

      // Upsert: Insert or Update if exists
      await db
        .insert(vendonWatermarks)
        .values(watermarkData)
        .onConflictDoUpdate({
          target: vendonWatermarks.machineId,
          set: {
            lastUpdatedAt: sql`EXCLUDED.last_updated_at`,
            updatedAt: sql`NOW()`
          }
        });

      console.log(`Watermark gesetzt für Maschine ${machineId}: ${lastUpdatedAt.toISOString()}`);
      return true;
    } catch (error) {
      console.error(`Fehler beim Setzen des Watermarks für Maschine ${machineId}:`, error);
      return false;
    }
  }

  /**
   * Holt den letzten updated_at Timestamp für eine Maschine
   * @param machineId Die Vendon Machine ID
   * @returns Timestamp oder null wenn nicht vorhanden
   */
  async getLastUpdatedAt(machineId: string): Promise<Date | null> {
    const watermark = await this.getWatermark(machineId);
    return watermark ? watermark.lastUpdatedAt : null;
  }

  /**
   * Aktualisiert den Watermark nur wenn der neue Timestamp neuer ist
   * @param machineId Die Vendon Machine ID
   * @param newTimestamp Der neue Timestamp
   * @returns Erfolg (true/false)
   */
  async updateWatermarkIfNewer(machineId: string, newTimestamp: Date): Promise<boolean> {
    try {
      const currentWatermark = await this.getWatermark(machineId);
      
      // Wenn kein Watermark vorhanden oder neuer Timestamp ist neuer
      if (!currentWatermark || newTimestamp > currentWatermark.lastUpdatedAt) {
        return await this.setWatermark(machineId, newTimestamp);
      }
      
      // Kein Update nötig
      console.log(`Watermark für Maschine ${machineId} ist bereits aktueller: ${currentWatermark.lastUpdatedAt.toISOString()} >= ${newTimestamp.toISOString()}`);
      return true;
    } catch (error) {
      console.error(`Fehler beim bedingten Update des Watermarks für Maschine ${machineId}:`, error);
      return false;
    }
  }

  /**
   * Aktualisiert den Watermark basierend auf dem Maximum der updated_at Werte aus Transaktionen
   * @param machineId Die Vendon Machine ID
   * @param transactions Array von Transaktionen mit updated_at Feldern
   * @returns Erfolg (true/false)
   */
  async updateWatermarkFromTransactions(machineId: string, transactions: any[]): Promise<boolean> {
    if (transactions.length === 0) {
      console.log(`Keine Transaktionen zum Aktualisieren des Watermarks für Maschine ${machineId}`);
      return true;
    }

    try {
      // Finde den maximalen updated_at Wert aus den Transaktionen
      const maxUpdatedAt = transactions.reduce((max, transaction) => {
        if (transaction.updated_at) {
          const transactionDate = new Date(transaction.updated_at);
          return transactionDate > max ? transactionDate : max;
        }
        return max;
      }, new Date(0)); // Beginne mit dem Unix-Epoch

      if (maxUpdatedAt.getTime() === 0) {
        console.log(`Keine updated_at Felder in Transaktionen für Maschine ${machineId}`);
        return true;
      }

      return await this.updateWatermarkIfNewer(machineId, maxUpdatedAt);
    } catch (error) {
      console.error(`Fehler beim Aktualisieren des Watermarks aus Transaktionen für Maschine ${machineId}:`, error);
      return false;
    }
  }

  /**
   * Löscht den Watermark für eine spezifische Maschine (für Tests/Reset)
   * @param machineId Die Vendon Machine ID
   * @returns Erfolg (true/false)
   */
  async deleteWatermark(machineId: string): Promise<boolean> {
    try {
      await db
        .delete(vendonWatermarks)
        .where(eq(vendonWatermarks.machineId, machineId));

      console.log(`Watermark gelöscht für Maschine ${machineId}`);
      return true;
    } catch (error) {
      console.error(`Fehler beim Löschen des Watermarks für Maschine ${machineId}:`, error);
      return false;
    }
  }

  /**
   * Holt alle Watermarks (für Monitoring/Debug)
   * @returns Array aller Watermarks
   */
  async getAllWatermarks(): Promise<VendonWatermark[]> {
    try {
      return await db.select().from(vendonWatermarks);
    } catch (error) {
      console.error('Fehler beim Abrufen aller Watermarks:', error);
      return [];
    }
  }

  /**
   * Erstellt einen Watermark-Eintrag für den ersten Lauf (Bootstrap)
   * @param machineId Die Vendon Machine ID
   * @param startDate Startdatum für die historische Synchronisation
   * @returns Erfolg (true/false)
   */
  async initializeWatermark(machineId: string, startDate: Date = new Date(0)): Promise<boolean> {
    try {
      const existing = await this.getWatermark(machineId);
      if (existing) {
        console.log(`Watermark für Maschine ${machineId} bereits vorhanden: ${existing.lastUpdatedAt.toISOString()}`);
        return true;
      }

      return await this.setWatermark(machineId, startDate);
    } catch (error) {
      console.error(`Fehler beim Initialisieren des Watermarks für Maschine ${machineId}:`, error);
      return false;
    }
  }
}

// Singleton-Instanz exportieren
export const watermarkStore = new WatermarkStore();