/**
 * Utility-Funktionen für die Stringverarbeitung
 */

/**
 * Normalisiert einen Produktnamen für konsistente Vergleiche
 * - Entfernt Leerzeichen am Anfang und Ende
 * - Konvertiert in Kleinbuchstaben
 * - Ersetzt mehrere Leerzeichen durch ein einzelnes
 * 
 * @param name Der zu normalisierende Produktname
 * @returns Normalisierter Produktname
 */
export function normalizeProductName(name: string): string {
  if (!name) return '';
  // Entferne Leerzeichen am Anfang und Ende, konvertiere zu Kleinbuchstaben
  // und ersetze mehrere aufeinanderfolgende Leerzeichen durch ein einzelnes
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}