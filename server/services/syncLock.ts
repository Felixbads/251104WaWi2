/**
 * Synchronisierungs-Sperrmechanismus
 * Verhindert, dass mehrere Synchronisierungsprozesse desselben Typs gleichzeitig laufen
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

// Konstanten für Sync-Typen
export const SYNC_TYPE = {
  PRODUCTS: 'products',
  TRANSACTIONS: 'transactions',
  MACHINES: 'machines',
  EVENTS: 'events',
  REFILLS: 'refills',
  HISTORICAL: 'historical'
};

// Timeout für Sperren in Millisekunden (60 Minuten)
const LOCK_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Versucht, eine Sperre für einen bestimmten Synchronisationstyp zu erwerben
 * @param syncType - Der Typ der Synchronisation
 * @returns True, wenn die Sperre erfolgreich erworben wurde, sonst False
 */
export async function acquireSyncLock(syncType: string): Promise<boolean> {
  try {
    // Prüfen, ob bereits eine aktive Sperre existiert
    const existingLocks = await db.execute(
      sql`SELECT * FROM sync_locks WHERE sync_type = ${syncType} AND locked_until > NOW()`
    );

    // db.execute gibt ein Ergebnis zurück, das wir als Array behandeln müssen
    const existingLocksArray = existingLocks as unknown as any[];
    
    if (existingLocksArray.length > 0) {
      console.log(`Eine Sperre für ${syncType} existiert bereits und ist noch aktiv.`);
      return false;
    }

    // Alte abgelaufene Sperren löschen
    await db.execute(
      sql`DELETE FROM sync_locks WHERE sync_type = ${syncType} OR locked_until <= NOW()`
    );

    // Neue Sperre erstellen
    const lockedUntil = new Date(Date.now() + LOCK_TIMEOUT_MS);
    
    await db.execute(
      sql`INSERT INTO sync_locks (sync_type, locked_at, locked_until) 
          VALUES (${syncType}, NOW(), ${lockedUntil})`
    );
    
    console.log(`Sperre für ${syncType} erfolgreich erworben. Gültig bis ${lockedUntil}.`);
    return true;
  } catch (error) {
    console.error(`Fehler beim Erwerben der Sperre für ${syncType}:`, error);
    
    // Bei Datenbankproblemen besser durchlassen als blockieren
    return true;
  }
}

/**
 * Gibt eine Sperre für einen bestimmten Synchronisationstyp frei
 * @param syncType - Der Typ der Synchronisation
 */
export async function releaseSyncLock(syncType: string): Promise<void> {
  try {
    await db.execute(
      sql`DELETE FROM sync_locks WHERE sync_type = ${syncType}`
    );
    console.log(`Sperre für ${syncType} freigegeben.`);
  } catch (error) {
    console.error(`Fehler beim Freigeben der Sperre für ${syncType}:`, error);
  }
}

/**
 * Überprüft, ob eine Sperre für einen bestimmten Synchronisationstyp aktiv ist
 * @param syncType - Der Typ der Synchronisation
 * @returns True, wenn eine aktive Sperre existiert, sonst False
 */
export async function isSyncLocked(syncType: string): Promise<boolean> {
  try {
    const existingLocks = await db.execute(
      sql`SELECT * FROM sync_locks WHERE sync_type = ${syncType} AND locked_until > NOW()`
    );
    
    // db.execute gibt ein Ergebnis zurück, das wir als Array behandeln müssen
    const existingLocksArray = existingLocks as unknown as any[];
    
    return existingLocksArray.length > 0;
  } catch (error) {
    console.error(`Fehler beim Überprüfen der Sperre für ${syncType}:`, error);
    // Bei Fehlern vorsichtshalber als "nicht gesperrt" betrachten
    return false;
  }
}

/**
 * Gibt alle aktiven Sperren zurück
 * @returns Eine Liste aller aktiven Sperren
 */
export async function getAllSyncLocks(): Promise<any[]> {
  try {
    const result = await db.execute(
      sql`SELECT * FROM sync_locks WHERE locked_until > NOW()`
    );
    // Konvertiere das Ergebnis in ein Array für die Rückgabe
    return result as unknown as any[];
  } catch (error) {
    console.error('Fehler beim Abrufen aller Sperren:', error);
    return [];
  }
}