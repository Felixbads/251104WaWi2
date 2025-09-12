/**
 * Utility-Funktionen für die Stringverarbeitung
 */

/**
 * Normalisiert einen Produktnamen für konsistente Vergleiche und Duplikaterkennung
 * - Entfernt Leerzeichen am Anfang und Ende
 * - Konvertiert in Kleinbuchstaben
 * - Ersetzt mehrere Leerzeichen durch ein einzelnes
 * - Normalisiert Kommas, Punkte und andere Satzzeichen
 * - Vereinheitlicht Formatierung von Volumensangaben (z.B. "0,5l" zu "05l")
 * - Standardisiert Klammern und deren Inhalt
 * - Entfernt spezielle Markierungen wie "ver. Sorten"
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
  
  // Spezielle Normalisierungen für Volumenangaben
  // z.B. "0,5l", "0.5l", "0,5 l", "0.5 l" alle zu "05l" normalisieren
  normalized = normalized.replace(/(\d+)[,\.](\d+)\s*l/g, '$1$2l');
  
  // Standardisiere "0,33l" zu "033l" etc.
  normalized = normalized.replace(/0[,\.](\d+)\s*l/g, '0$1l');
  
  // Kommas in Listen durch Leerzeichen ersetzen
  normalized = normalized.replace(/,\s*/g, ' ');
  
  // Standardisiere Markierungen für "verschiedene Sorten"
  normalized = normalized.replace(/ver(\.|sch\.|schiedene)?\s*sorten/g, 'ver sorten');
  
  // Entferne spezielle Markierungen in eckigen Klammern und standardisiere sie
  normalized = normalized.replace(/\[\s*vegan\s*\]/gi, 'vegan');
  normalized = normalized.replace(/\[\s*natursüß\s*\]/gi, 'natursüß');
  normalized = normalized.replace(/\[\s*edamer\s*art\s*\]/gi, 'edamer art');
  normalized = normalized.replace(/\[\s*bergkäse\s*\]/gi, 'bergkäse');
  normalized = normalized.replace(/\[\s*camenbert\s*art\s*\]/gi, 'camenbert art');
  
  // Apostroph-Normalisierung (entferne Apostrophe)
  normalized = normalized.replace(/['']/g, '');
  
  // Sonderzeichen entfernen, die nicht relevant für den Produktnamen sind
  // aber deutsche Umlaute, Zahlen, Buchstaben und Bindestriche beibehalten
  normalized = normalized.replace(/[^\wäöüßÄÖÜ\s\-\(\)]/g, '');
  
  // Standardisiere Klammern und deren Inhalt (keine Leerzeichen direkt nach/vor Klammern)
  normalized = normalized.replace(/\(\s+/g, '(');
  normalized = normalized.replace(/\s+\)/g, ')');
  
  // Standardisiere Kommas in Klammern
  normalized = normalized.replace(/\(([^,\)]*),([^\)]*)\)/g, '($1 $2)');
  
  // Entferne überflüssige Leerzeichen nach der Normalisierung
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * SECURITY: Escapes HTML characters to prevent HTML injection attacks
 * Critical für E-Mail-Templates mit dynamischen Inhalten
 * 
 * @param text Der zu escapende Text
 * @returns HTML-sicherer Text
 */
export function escapeHtml(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  
  const str = String(text);
  const escapeMap: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;'
  };
  
  return str.replace(/[&<>"'`/]/g, (match) => escapeMap[match]);
}

/**
 * SECURITY: Escapes text for plain text email content
 * Verhindert Injection-Angriffe in Text-E-Mails
 * 
 * @param text Der zu escapende Text
 * @returns Text-sicherer Inhalt
 */
export function escapeText(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  
  const str = String(text);
  
  // Entferne gefährliche Kontrollzeichen und normalisiere Zeilenumbrüche
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Entferne Kontrollzeichen
    .replace(/\r\n/g, '\n') // Normalisiere Windows-Zeilenumbrüche
    .replace(/\r/g, '\n') // Normalisiere Mac-Zeilenumbrüche
    .trim();
}

/**
 * SECURITY: Sicherer Umgang mit Arrays - verhindert Laufzeitfehler
 * 
 * @param array Potentiell undefined/null Array
 * @returns Leeres Array falls Input invalid, sonst das ursprüngliche Array
 */
export function safeArray<T>(array: T[] | null | undefined): T[] {
  return Array.isArray(array) ? array : [];
}

/**
 * SECURITY: Sicherer Zugriff auf Objekt-Properties
 * 
 * @param obj Das Objekt
 * @param defaultValue Standardwert falls undefined/null
 * @returns Das Objekt oder den Standardwert
 */
export function safeObject<T>(obj: T | null | undefined, defaultValue: T): T {
  return obj !== null && obj !== undefined ? obj : defaultValue;
}