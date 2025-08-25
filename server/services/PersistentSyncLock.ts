/**
 * PERSISTENT SYNC LOCK - VERTEILTE DATENBANK-BASIERTE LOCKS
 * 
 * Ersetzt das in-memory syncLock System durch persistente DB-basierte Locks.
 * Bietet prozessübergreifende Synchronisation und Sicherheit bei Server-Restarts.
 * 
 * Features:
 * - DB-basierte Locks mit Timeout-Mechanismus
 * - Prozessübergreifende Synchronisation
 * - Automatische Lock-Bereinigung bei Timeout
 * - Sicherheit gegen Deadlocks durch TTL
 * - Recovery nach Server-Restart
 */

import { rawDb } from "../db";
import { syncLocks } from "@shared/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import { db } from "../db";

interface LockInfo {
  syncType: string;
  lockedAt: Date;
  lockedUntil: Date;
  remainingSeconds: number;
}

class PersistentSyncLock {
  private readonly defaultTimeoutMinutes = 30;
  private readonly cleanupIntervalMs = 60000; // 1 Minute
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
    console.log('🔒 PersistentSyncLock initialisiert - DB-basierte verteilte Locks aktiv');
  }

  /**
   * Versucht ein Lock zu erwerben
   * @param syncType Eindeutiger Lock-Identifier
   * @param timeoutMinutes Timeout in Minuten (default: 30)
   * @returns true wenn Lock erfolgreich erworben, false wenn bereits belegt
   */
  async acquire(syncType: string, timeoutMinutes?: number): Promise<boolean> {
    const timeout = timeoutMinutes || this.defaultTimeoutMinutes;
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + timeout * 60 * 1000);

    try {
      // Bereinige abgelaufene Locks
      await this.cleanupExpiredLocks();

      // Prüfe ob Lock bereits existiert und noch gültig
      const existingLock = await db
        .select()
        .from(syncLocks)
        .where(
          and(
            eq(syncLocks.syncType, syncType),
            sql`${syncLocks.lockedUntil} > NOW()`
          )
        )
        .limit(1);

      if (existingLock.length > 0) {
        console.log(`🔒 Lock für ${syncType} bereits aktiv bis ${existingLock[0].lockedUntil.toISOString()}`);
        return false;
      }

      // Versuche Lock zu erstellen
      await db.insert(syncLocks).values({
        syncType,
        lockedAt: now,
        lockedUntil,
      });

      console.log(`✅ Lock für ${syncType} erfolgreich erworben (läuft ab: ${lockedUntil.toISOString()})`);
      return true;

    } catch (error) {
      // Bei Unique-Constraint-Verletzung: Lock bereits vorhanden
      if (error instanceof Error && error.message.includes('duplicate key')) {
        console.log(`🔒 Lock für ${syncType} bereits von anderem Prozess erworben`);
        return false;
      }

      console.error(`Fehler beim Erwerben des Locks für ${syncType}:`, error);
      return false;
    }
  }

  /**
   * Gibt ein Lock frei
   * @param syncType Lock-Identifier
   * @returns true wenn Lock erfolgreich freigegeben
   */
  async release(syncType: string): Promise<boolean> {
    try {
      const result = await db
        .delete(syncLocks)
        .where(eq(syncLocks.syncType, syncType))
        .returning();

      if (result.length > 0) {
        console.log(`🔓 Lock für ${syncType} erfolgreich freigegeben`);
        return true;
      } else {
        console.log(`⚠️ Kein aktives Lock für ${syncType} gefunden`);
        return true; // Nicht als Fehler behandeln
      }

    } catch (error) {
      console.error(`Fehler beim Freigeben des Locks für ${syncType}:`, error);
      return false;
    }
  }

  /**
   * Prüft ob ein Lock aktiv ist
   * @param syncType Lock-Identifier
   * @returns true wenn Lock aktiv und gültig
   */
  async isLocked(syncType: string): Promise<boolean> {
    try {
      const result = await db
        .select()
        .from(syncLocks)
        .where(
          and(
            eq(syncLocks.syncType, syncType),
            sql`${syncLocks.lockedUntil} > NOW()`
          )
        )
        .limit(1);

      return result.length > 0;

    } catch (error) {
      console.error(`Fehler beim Prüfen des Lock-Status für ${syncType}:`, error);
      return false;
    }
  }

  /**
   * Verlängert ein bestehendes Lock
   * @param syncType Lock-Identifier
   * @param additionalMinutes Zusätzliche Minuten
   * @returns true wenn Lock erfolgreich verlängert
   */
  async extend(syncType: string, additionalMinutes: number): Promise<boolean> {
    try {
      const newExpiry = new Date(Date.now() + additionalMinutes * 60 * 1000);
      
      const result = await db
        .update(syncLocks)
        .set({ lockedUntil: newExpiry })
        .where(
          and(
            eq(syncLocks.syncType, syncType),
            sql`${syncLocks.lockedUntil} > NOW()`
          )
        )
        .returning();

      if (result.length > 0) {
        console.log(`⏰ Lock für ${syncType} verlängert bis ${newExpiry.toISOString()}`);
        return true;
      } else {
        console.log(`⚠️ Kein aktives Lock für ${syncType} zum Verlängern gefunden`);
        return false;
      }

    } catch (error) {
      console.error(`Fehler beim Verlängern des Locks für ${syncType}:`, error);
      return false;
    }
  }

  /**
   * Gibt alle aktiven Locks zurück
   * @returns Array mit Lock-Informationen
   */
  async getActiveLocks(): Promise<LockInfo[]> {
    try {
      const locks = await db
        .select()
        .from(syncLocks)
        .where(sql`${syncLocks.lockedUntil} > NOW()`)
        .orderBy(syncLocks.lockedAt);

      const now = new Date();
      
      return locks.map(lock => ({
        syncType: lock.syncType,
        lockedAt: lock.lockedAt,
        lockedUntil: lock.lockedUntil,
        remainingSeconds: Math.max(0, Math.round((lock.lockedUntil.getTime() - now.getTime()) / 1000))
      }));

    } catch (error) {
      console.error('Fehler beim Abrufen aktiver Locks:', error);
      return [];
    }
  }

  /**
   * Bereinigt alle abgelaufenen Locks
   * @returns Anzahl bereinigter Locks
   */
  async cleanupExpiredLocks(): Promise<number> {
    try {
      const result = await db
        .delete(syncLocks)
        .where(sql`${syncLocks.lockedUntil} <= NOW()`)
        .returning();

      if (result.length > 0) {
        console.log(`🧹 ${result.length} abgelaufene Locks bereinigt`);
      }

      return result.length;

    } catch (error) {
      console.error('Fehler beim Bereinigen abgelaufener Locks:', error);
      return 0;
    }
  }

  /**
   * Erzwingt die Freigabe eines Locks (Admin-Funktion)
   * @param syncType Lock-Identifier
   * @returns true wenn Lock erfolgreich freigegeben
   */
  async forceRelease(syncType: string): Promise<boolean> {
    try {
      const result = await db
        .delete(syncLocks)
        .where(eq(syncLocks.syncType, syncType))
        .returning();

      if (result.length > 0) {
        console.log(`🔨 Lock für ${syncType} ZWANGS-freigegeben`);
        return true;
      } else {
        console.log(`⚠️ Kein Lock für ${syncType} zum Zwangs-Freigeben gefunden`);
        return false;
      }

    } catch (error) {
      console.error(`Fehler beim Zwangs-Freigeben des Locks für ${syncType}:`, error);
      return false;
    }
  }

  /**
   * Bereinigt ALLE Locks (Recovery-Funktion)
   * @returns Anzahl bereinigter Locks
   */
  async clearAllLocks(): Promise<number> {
    try {
      const result = await db
        .delete(syncLocks)
        .returning();

      console.log(`🗑️ ALLE Locks bereinigt: ${result.length} Locks entfernt`);
      return result.length;

    } catch (error) {
      console.error('Fehler beim Bereinigen aller Locks:', error);
      return 0;
    }
  }

  /**
   * Statistiken über Lock-Nutzung
   */
  async getLockStatistics(): Promise<{
    activeLocks: number;
    totalLocksToday: number;
    averageLockDurationMinutes: number;
    oldestActiveLock?: string;
  }> {
    try {
      // Aktive Locks zählen
      const activeLocks = await db
        .select({ count: sql<number>`count(*)` })
        .from(syncLocks)
        .where(sql`${syncLocks.lockedUntil} > NOW()`);

      // Locks von heute zählen (aus allen Locks - aktive + bereits abgelaufene)
      const todayLocks = await db
        .select({ count: sql<number>`count(*)` })
        .from(syncLocks)
        .where(sql`${syncLocks.lockedAt} >= CURRENT_DATE`);

      // Ältester aktiver Lock
      const oldestLock = await db
        .select()
        .from(syncLocks)
        .where(sql`${syncLocks.lockedUntil} > NOW()`)
        .orderBy(syncLocks.lockedAt)
        .limit(1);

      // Durchschnittliche Lock-Dauer (vereinfacht)
      const avgDuration = await db
        .select({ 
          avg: sql<number>`AVG(EXTRACT(EPOCH FROM (${syncLocks.lockedUntil} - ${syncLocks.lockedAt})) / 60)` 
        })
        .from(syncLocks)
        .where(sql`${syncLocks.lockedAt} >= CURRENT_DATE - INTERVAL '7 days'`);

      return {
        activeLocks: activeLocks[0]?.count || 0,
        totalLocksToday: todayLocks[0]?.count || 0,
        averageLockDurationMinutes: Math.round(avgDuration[0]?.avg || 0),
        oldestActiveLock: oldestLock[0]?.syncType
      };

    } catch (error) {
      console.error('Fehler beim Abrufen der Lock-Statistiken:', error);
      return {
        activeLocks: 0,
        totalLocksToday: 0,
        averageLockDurationMinutes: 0
      };
    }
  }

  /**
   * Startet den automatischen Cleanup-Timer
   */
  private startCleanupTimer(): void {
    // Bereinige abgelaufene Locks alle 1 Minute
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupExpiredLocks();
      } catch (error) {
        console.error('Fehler beim automatischen Lock-Cleanup:', error);
      }
    }, this.cleanupIntervalMs);

    console.log('⏰ Automatischer Lock-Cleanup gestartet (alle 1 Minute)');
  }

  /**
   * Stoppt den Cleanup-Timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('⏹️ Automatischer Lock-Cleanup gestoppt');
    }
  }

  /**
   * Cleanup beim Service-Shutdown
   */
  async shutdown(): Promise<void> {
    this.stopCleanupTimer();
    await this.cleanupExpiredLocks();
    console.log('🔒 PersistentSyncLock heruntergefahren');
  }
}

// Singleton-Instanz
let persistentSyncLockInstance: PersistentSyncLock | null = null;

export function getPersistentSyncLockInstance(): PersistentSyncLock {
  if (!persistentSyncLockInstance) {
    persistentSyncLockInstance = new PersistentSyncLock();
  }
  return persistentSyncLockInstance;
}

export { PersistentSyncLock };