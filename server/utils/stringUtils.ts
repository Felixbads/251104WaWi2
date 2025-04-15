/**
 * Utility-Funktionen für die Stringverarbeitung
 */

/**
 * Normalisiert einen Produktnamen für konsistente Vergleiche
 * - Entfernt Leerzeichen am Anfang und Ende
 * - Konvertiert in Kleinbuchstaben
 * - Ersetzt mehrere Leerzeichen durch ein einzelnes
 * - Entfernt Sonderzeichen, die nicht relevant für den Produktnamen sind
 * - Standardisiert Klammern und deren Inhalt
 * 
 * @param name Der zu normalisierende Produktname
 * @returns Normalisierter Produktname
 */
export function normalizeProductName(name: string): string {
  if (!name) return '';
  
  // Zu Kleinbuchstaben konvertieren und Leerzeichen am Anfang/Ende entfernen
  let normalized = name.trim().toLowerCase();
  
  // Mehrfache Leerzeichen durch einzelne ersetzen
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Sonderzeichen entfernen, die nicht relevant für den Produktnamen sind
  // aber deutsche Umlaute, Zahlen, Buchstaben und Bindestriche beibehalten
  normalized = normalized.replace(/[^\wäöüßÄÖÜ\s\-\(\)]/g, '');
  
  // Standardisiere Klammern und deren Inhalt (keine Leerzeichen direkt nach/vor Klammern)
  normalized = normalized.replace(/\(\s+/g, '(');
  normalized = normalized.replace(/\s+\)/g, ')');
  
  return normalized;
}