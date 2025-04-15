/**
 * Synchronisierungs-Sperrsystem
 * 
 * Dieses Modul hilft dabei, zu verhindern, dass mehrere Synchronisierungsprozesse gleichzeitig laufen,
 * was zu Duplikaten führen kann.
 */
import { storage } from "../storage";

// In-Memory-Locks für verschiedene Synchronisationsprozesse
const locks: Record<string, boolean> = {};

/**
 * Konstanten für verschiedene Synchronisationstypen
 */
export const SYNC_TYPE = {
  PRODUCTS: 'products',
  TRANSACTIONS: 'transactions',
  MACHINES: 'machines',
  EVENTS: 'events',
  REFILLS: 'refills',
};

/**
 * Versucht, eine Sperre für den angegebenen Synchronisationstyp zu erhalten
 * 
 * @param syncType Der Typ der Synchronisation, für die eine Sperre benötigt wird
 * @param maxLockTimeMinutes Maximale Zeit in Minuten, für die ein Lock als aktiv betrachtet wird
 * @returns true, wenn die Sperre erfolgreich erhalten wurde, sonst false
 */
export async function acquireSyncLock(syncType: string, maxLockTimeMinutes: number = 10): Promise<boolean> {
  // Prüfe zuerst das In-Memory Lock (für den aktuellen Server)
  if (locks[syncType]) {
    console.log(`In-Memory-Lock für ${syncType} ist bereits aktiv, überspringe Synchronisation`);
    return false;
  }
  
  try {
    // Prüfe dann das Datenbanklock (für alle Server-Instanzen)
    // Finde den neuesten Sync-Log-Eintrag für diesen Typ
    const runningSync = await storage.getLatestRunningSyncLog(syncType);
    
    if (runningSync) {
      // Prüfe, ob die Synchronisation vor zu langer Zeit gestartet wurde
      // (möglicherweise abgestürzt oder hängengeblieben)
      const now = new Date();
      const lockStartTime = new Date(runningSync.startDate);
      const diffMinutes = (now.getTime() - lockStartTime.getTime()) / (1000 * 60);
      
      if (diffMinutes < maxLockTimeMinutes) {
        // Der Lock ist noch aktiv, überspringe
        console.log(`Datenbanklock für ${syncType} ist aktiv (gestartet vor ${diffMinutes.toFixed(2)} Minuten), überspringe Synchronisation`);
        return false;
      } else {
        // Der Lock ist zu alt, markiere als fehlgeschlagen und erlaube eine neue Synchronisation
        console.log(`Datenbanklock für ${syncType} ist zu alt (${diffMinutes.toFixed(2)} Minuten), markiere als fehlgeschlagen`);
        await storage.updateSyncLog(runningSync.id, {
          syncStatus: 'error',
          endDate: new Date(),
          errorMessage: `Synchronisation wurde automatisch als fehlgeschlagen markiert nach ${maxLockTimeMinutes} Minuten Inaktivität`
        });
      }
    }
    
    // Setze das In-Memory Lock
    locks[syncType] = true;
    return true;
  } catch (error) {
    console.error(`Fehler beim Erwerben des Synchronisationslocks für ${syncType}:`, error);
    return false;
  }
}

/**
 * Gibt die Sperre für den angegebenen Synchronisationstyp frei
 * 
 * @param syncType Der Typ der Synchronisation, für die die Sperre freigegeben werden soll
 */
export function releaseSyncLock(syncType: string): void {
  // Gib nur das In-Memory Lock frei
  // Der Datenbanklock wird durch den Sync-Status im Log-Eintrag gesteuert
  locks[syncType] = false;
  console.log(`Synchronisationslock für ${syncType} freigegeben`);
}