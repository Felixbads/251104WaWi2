/**
 * Timezone utility functions for the German warehouse system
 * Ensures all timestamps use Europe/Berlin timezone
 */

/**
 * Get current time in Europe/Berlin timezone
 * Uses the established pattern from notificationService.ts
 * @returns Date object representing current time in Berlin timezone
 */
export function getBerlinTime(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
}

/**
 * Convert any timestamp to Europe/Berlin timezone
 * @param timestamp - Date or ISO string to convert
 * @returns Date object in Berlin timezone
 */
export function toBerlinTime(timestamp: Date | string): Date {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return new Date(date.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
}

/**
 * Format date in German locale with Berlin timezone
 * @param date - Date to format
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string
 */
export function formatBerlinTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options
  };
  
  return date.toLocaleString('de-DE', defaultOptions);
}

/**
 * Create ISO string with explicit Berlin timezone offset
 * @param date - Date to convert
 * @returns ISO string with timezone offset
 */
export function toBerlinISOString(date: Date = new Date()): string {
  const berlinTime = toBerlinTime(date);
  return berlinTime.toISOString();
}