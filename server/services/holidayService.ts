/**
 * Minimaler Feiertags-Service (vorübergehend vereinfacht)
 * Um Server-Start zu ermöglichen während der ursprüngliche Service repariert wird
 */

// Dummy-Export um Import-Fehler zu vermeiden
export async function syncMissingHolidays(): Promise<number> {
  console.log('Feiertags-Synchronisierung ist vorübergehend deaktiviert');
  return 0;
}

// Dummy-Export für andere Services die darauf angewiesen sind
export const holidayService = {
  getHolidaysForDate: async () => [],
  isHoliday: async () => null,
  syncHolidaysForYear: async () => 0
};