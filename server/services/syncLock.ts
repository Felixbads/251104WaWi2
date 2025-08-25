import { db } from '../db';
import { syncLocks } from '@shared/schema';
import { eq, lt, and } from 'drizzle-orm';
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
  WEATHER = 'weather',
  VENDON_QUICK_SYNC = 'vendon_quick_sync',
  VENDON_FULL_SYNC = 'vendon_full_sync',
  VENDON_SIMPLE_SYNC = 'vendon_simple_sync'
}

/**
 * PERSISTENT DB-LOCKS - ERSETZT IN-MEMORY LOCKS
 * Verhindert Race Conditions zwischen mehreren Node-Instanzen und nach Restarts
 * Basierend auf Analyse-Empfehlung: INSERT ... ON CONFLICT für Lock-Erwerb
 */

// Lock-Timeout in Millisekunden (5 Minuten)
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

// Cleanup interval (alle 60 Sekunden)
const CLEANUP_INTERVAL_MS = 60 * 1000;

/**
 * Versucht, ein Lock für einen bestimmten Synchronisierungstyp zu erwerben
 * Verwendet INSERT ... ON CONFLICT für atomare Lock-Operationen
 * @param syncType Der Typ der Synchronisierung
 * @param owner Optional: Kennung des Lock-Besitzers
 * @returns true, wenn das Lock erfolgreich erworben wurde, false sonst
 */
export async function acquireSyncLock(syncType: string, owner: string = 'system'): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TIMEOUT_MS);
  const lockedUntil = expiresAt;

  try {
    // Zuerst: Cleanup abgelaufener Locks für diesen syncType
    await db
      .delete(syncLocks)
      .where(
        and(
          eq(syncLocks.syncType, syncType),
          lt(syncLocks.expiresAt, now)
        )
      );

    // Versuche Lock zu erwerben mit INSERT
    // Wenn syncType bereits existiert, schlägt der INSERT fehl wegen UNIQUE constraint
    const result = await db
      .insert(syncLocks)
      .values({
        syncType,
        owner,
        expiresAt,
        lockedAt: now,
        lockedUntil,
        createdAt: now
      })
      .returning();

    if (result.length > 0) {
      console.log(`✅ Lock für ${syncType} erfolgreich erworben (Besitzer: ${owner}, läuft ab: ${expiresAt.toISOString()})`);
      return true;
    }
    
    return false;
  } catch (error: any) {
    // Unique constraint violation bedeutet Lock existiert bereits
    if (error?.code === '23505' || error?.message?.includes('unique')) {
      // Prüfe ob das existierende Lock abgelaufen ist
      const existingLock = await db
        .select()
        .from(syncLocks)
        .where(eq(syncLocks.syncType, syncType))
        .limit(1);

      if (existingLock.length > 0 && existingLock[0].expiresAt <= now) {
        // Lock ist abgelaufen, versuche es zu übernehmen
        const updated = await db
          .update(syncLocks)
          .set({
            owner,
            expiresAt,
            lockedAt: now,
            lockedUntil
          })
          .where(
            and(
              eq(syncLocks.syncType, syncType),
              lt(syncLocks.expiresAt, now)
            )
          )
          .returning();

        if (updated.length > 0) {
          console.log(`✅ Abgelaufenes Lock für ${syncType} erfolgreich übernommen (Besitzer: ${owner})`);
          return true;
        }
      }

      console.log(`❌ Lock für ${syncType} existiert bereits und ist noch gültig`);
      return false;
    }

    console.error(`❌ Fehler beim Erwerben des Locks für ${syncType}:`, error);
    return false;
  }
}

/**
 * Gibt ein Lock für einen bestimmten Synchronisierungstyp frei
 * @param syncType Der Typ der Synchronisierung
 * @param owner Optional: Kennung des Lock-Besitzers (zur Überprüfung)
 * @returns true, wenn das Lock erfolgreich freigegeben wurde, false sonst
 */
export async function releaseSyncLock(syncType: string, owner: string = 'system'): Promise<boolean> {
  try {
    // Wenn owner angegeben, nur freigeben wenn owner übereinstimmt
    const condition = owner !== 'system' 
      ? and(eq(syncLocks.syncType, syncType), eq(syncLocks.owner, owner))
      : eq(syncLocks.syncType, syncType);

    const result = await db
      .delete(syncLocks)
      .where(condition)
      .returning();

    if (result.length > 0) {
      console.log(`🔓 Lock für ${syncType} erfolgreich freigegeben`);
      return true;
    }

    console.log(`ℹ️ Kein Lock für ${syncType} vorhanden oder Besitzer stimmt nicht überein`);
    return true; // Kein Fehler wenn Lock nicht existiert
  } catch (error) {
    console.error(`❌ Fehler beim Freigeben des Locks für ${syncType}:`, error);
    return false;
  }
}

/**
 * Prüft, ob ein Lock für einen bestimmten Synchronisierungstyp existiert
 * @param syncType Der Typ der Synchronisierung
 * @returns true, wenn das Lock existiert und gültig ist, false sonst
 */
export async function isSyncLocked(syncType: string): Promise<boolean> {
  const now = new Date();

  try {
    const result = await db
      .select()
      .from(syncLocks)
      .where(
        and(
          eq(syncLocks.syncType, syncType),
          lt(now, syncLocks.expiresAt)
        )
      )
      .limit(1);

    return result.length > 0;
  } catch (error) {
    console.error(`❌ Fehler beim Prüfen des Locks für ${syncType}:`, error);
    return false;
  }
}

/**
 * Gibt alle aktiven Locks zurück
 * @returns Ein Array mit Informationen zu allen aktiven Locks
 */
export async function getActiveLocks(): Promise<Array<{
  syncType: string;
  acquiredAt: Date;
  owner: string;
  expiresAt: Date;
  remainingSeconds: number;
}>> {
  const now = new Date();

  try {
    const result = await db
      .select()
      .from(syncLocks)
      .where(lt(now, syncLocks.expiresAt));

    return result.map(lock => ({
      syncType: lock.syncType,
      acquiredAt: lock.lockedAt,
      owner: lock.owner,
      expiresAt: lock.expiresAt,
      remainingSeconds: Math.round((lock.expiresAt.getTime() - now.getTime()) / 1000)
    }));
  } catch (error) {
    console.error('❌ Fehler beim Abrufen aktiver Locks:', error);
    return [];
  }
}

/**
 * Bereinigt abgelaufene Locks aus der Datenbank
 * Diese Funktion wird periodisch aufgerufen
 */
export async function cleanupExpiredLocks(): Promise<void> {
  const now = new Date();

  try {
    const result = await db
      .delete(syncLocks)
      .where(lt(syncLocks.expiresAt, now))
      .returning();

    if (result.length > 0) {
      console.log(`🧹 ${result.length} abgelaufene Locks wurden bereinigt`);
    }
  } catch (error) {
    console.error('❌ Fehler beim Bereinigen abgelaufener Locks:', error);
  }
}

/**
 * Erweiterte Lock-Erwerbung mit mehreren Versuchen
 * Wartet zwischen Versuchen und gibt nach maxAttempts auf
 * @param syncType Der Typ der Synchronisierung
 * @param owner Kennung des Lock-Besitzers
 * @param maxAttempts Maximale Anzahl von Versuchen
 * @param retryDelayMs Wartezeit zwischen Versuchen in Millisekunden
 * @returns true, wenn das Lock erfolgreich erworben wurde, false sonst
 */
export async function acquireSyncLockWithRetry(
  syncType: string,
  owner: string = 'system',
  maxAttempts: number = 3,
  retryDelayMs: number = 1000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const acquired = await acquireSyncLock(syncType, owner);
    
    if (acquired) {
      return true;
    }

    if (attempt < maxAttempts) {
      console.log(`⏳ Lock für ${syncType} nicht verfügbar, warte ${retryDelayMs}ms (Versuch ${attempt}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }

  console.log(`❌ Lock für ${syncType} konnte nach ${maxAttempts} Versuchen nicht erworben werden`);
  return false;
}

/**
 * Setzt alle Locks zurück (nur für Notfälle/Entwicklung)
 * WARNUNG: Dies kann laufende Synchronisationen unterbrechen!
 */
export async function resetAllLocks(): Promise<void> {
  try {
    const result = await db.delete(syncLocks).returning();
    console.warn(`⚠️ WARNUNG: ${result.length} Locks wurden zurückgesetzt!`);
  } catch (error) {
    console.error('❌ Fehler beim Zurücksetzen aller Locks:', error);
  }
}

// Einrichten eines periodischen Tasks zur Bereinigung abgelaufener Locks
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Startet die periodische Bereinigung abgelaufener Locks
 */
export function startLockCleanup(): void {
  if (cleanupInterval) {
    console.log('⚠️ Lock-Cleanup läuft bereits');
    return;
  }

  cleanupInterval = setInterval(cleanupExpiredLocks, CLEANUP_INTERVAL_MS);
  console.log('✅ Periodische Lock-Bereinigung gestartet (alle 60 Sekunden)');
  
  // Initiale Bereinigung
  cleanupExpiredLocks();
}

/**
 * Stoppt die periodische Bereinigung
 */
export function stopLockCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('🛑 Periodische Lock-Bereinigung gestoppt');
  }
}

// Automatisch starten wenn das Modul geladen wird
startLockCleanup();

// Cleanup bei Prozess-Ende
process.on('SIGINT', () => {
  stopLockCleanup();
});

process.on('SIGTERM', () => {
  stopLockCleanup();
});