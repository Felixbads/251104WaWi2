import { db } from '../db';
import { sql } from 'drizzle-orm';

/**
 * Aufzählung der unterstützten Synchronisierungstypen
 */
export enum SYNC_TYPE {
  PRODUCTS = 'products',
  MACHINES = 'machines',
  TRANSACTIONS = 'transactions',
  REFILLS = 'refills',
  EVENTS = 'events',
  WAREHOUSES = 'warehouses',
  WEATHER = 'weather'
}

/**
 * Lock-Manager für sichere Synchronisierungsoperationen
 * Verhindert, dass mehrere Prozesse gleichzeitig die gleichen Daten synchronisieren
 */

const locks: Record<string, {
  acquiredAt: Date,
  owner: string,
  expiresAt: Date
}> = {};

// Lock-Timeout in Millisekunden (5 Minuten)
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Versucht, ein Lock für einen bestimmten Synchronisierungstyp zu erwerben
 * @param syncType Der Typ der Synchronisierung
 * @param owner Optional: Kennung des Lock-Besitzers
 * @returns true, wenn das Lock erfolgreich erworben wurde, false sonst
 */
export async function acquireSyncLock(syncType: string, owner: string = 'system'): Promise<boolean> {
  const now = new Date();
  
  // Prüfe, ob das Lock bereits existiert
  if (locks[syncType]) {
    // Prüfe, ob das Lock abgelaufen ist
    if (locks[syncType].expiresAt > now) {
      console.log(`Lock für ${syncType} existiert bereits und ist noch gültig (Besitzer: ${locks[syncType].owner})`);
      return false;
    }
    
    // Lock ist abgelaufen, kann übernommen werden
    console.log(`Lock für ${syncType} ist abgelaufen und wird übernommen`);
  }
  
  // Lock erwerben
  const expiresAt = new Date(now.getTime() + LOCK_TIMEOUT_MS);
  locks[syncType] = {
    acquiredAt: now,
    owner,
    expiresAt
  };
  
  console.log(`Lock für ${syncType} erfolgreich erworben (Besitzer: ${owner}, läuft ab: ${expiresAt.toISOString()})`);
  return true;
}

/**
 * Gibt ein Lock für einen bestimmten Synchronisierungstyp frei
 * @param syncType Der Typ der Synchronisierung
 * @param owner Optional: Kennung des Lock-Besitzers (zur Überprüfung)
 * @returns true, wenn das Lock erfolgreich freigegeben wurde, false sonst
 */
export async function releaseSyncLock(syncType: string, owner: string = 'system'): Promise<boolean> {
  // Prüfe, ob das Lock existiert
  if (!locks[syncType]) {
    console.log(`Kein Lock für ${syncType} vorhanden, nichts freizugeben`);
    return true;
  }
  
  // Prüfe optional, ob der angegebene Besitzer übereinstimmt
  if (owner !== 'system' && locks[syncType].owner !== owner) {
    console.warn(`Lock für ${syncType} kann nicht freigegeben werden, da der Besitzer nicht übereinstimmt`);
    return false;
  }
  
  // Lock freigeben
  delete locks[syncType];
  console.log(`Lock für ${syncType} erfolgreich freigegeben`);
  return true;
}

/**
 * Prüft, ob ein Lock für einen bestimmten Synchronisierungstyp existiert
 * @param syncType Der Typ der Synchronisierung
 * @returns true, wenn das Lock existiert und gültig ist, false sonst
 */
export function isSyncLocked(syncType: string): boolean {
  const now = new Date();
  
  // Prüfe, ob das Lock existiert und noch gültig ist
  return Boolean(locks[syncType] && locks[syncType].expiresAt > now);
}

/**
 * Gibt alle aktiven Locks zurück
 * @returns Ein Array mit Informationen zu allen aktiven Locks
 */
export function getActiveLocks(): Array<{
  syncType: string;
  acquiredAt: Date;
  owner: string;
  expiresAt: Date;
  remainingSeconds: number;
}> {
  const now = new Date();
  
  return Object.entries(locks)
    .filter(([_, lock]) => lock.expiresAt > now)
    .map(([syncType, lock]) => ({
      syncType,
      acquiredAt: lock.acquiredAt,
      owner: lock.owner,
      expiresAt: lock.expiresAt,
      remainingSeconds: Math.round((lock.expiresAt.getTime() - now.getTime()) / 1000)
    }));
}

/**
 * Bereinigt abgelaufene Locks
 */
export function cleanupExpiredLocks(): void {
  const now = new Date();
  let cleanedCount = 0;
  
  for (const [syncType, lock] of Object.entries(locks)) {
    if (lock.expiresAt <= now) {
      delete locks[syncType];
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`${cleanedCount} abgelaufene Locks wurden bereinigt`);
  }
}

// Einrichten eines periodischen Tasks zur Bereinigung abgelaufener Locks (alle 5 Minuten)
setInterval(cleanupExpiredLocks, 5 * 60 * 1000);