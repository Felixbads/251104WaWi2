/**
 * BugTracker-Hilfsfunktionen für verbesserte Fehlerdiagnose und -protokollierung
 */

import fs from 'fs';
import path from 'path';

// Pfad zur Log-Datei
const LOG_FILE = path.join(process.cwd(), 'debug_log.txt');

// Gewährleisten, dass die Log-Datei existiert
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, '# Debug-Log für Lagerhaltungssystem\n\n', 'utf8');
}

/**
 * Log-Nachricht in die Debug-Protokolldatei und auf die Konsole schreiben
 */
export function logDebug(category: string, message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${category}] ${message}${data ? "\nDATA: " + JSON.stringify(data, null, 2) : ''}`;
  
  console.log(logEntry);
  
  // In Log-Datei speichern
  try {
    fs.appendFileSync(LOG_FILE, logEntry + '\n\n', 'utf8');
  } catch (error) {
    console.error('Fehler beim Schreiben der Log-Datei:', error);
  }
}

/**
 * Fehlerobjekt protokollieren
 */
export function logError(category: string, message: string, error: any): void {
  const errorMessage = error?.message || 'Unbekannter Fehler';
  const errorStack = error?.stack || '';
  
  logDebug(
    `ERROR:${category}`, 
    `${message}\nErrorMessage: ${errorMessage}`,
    { stack: errorStack }
  );
}

/**
 * SQL-Abfrage und Parameter protokollieren
 */
export function logQuery(queryName: string, sqlQuery: string, params?: any[]): void {
  logDebug('SQL', `Query: ${queryName}`, {
    sql: sqlQuery,
    params: params || []
  });
}

/**
 * Aktuelle Logs abrufen
 */
export function getLogs(limit = 100): string[] {
  try {
    const logContent = fs.readFileSync(LOG_FILE, 'utf8');
    const logEntries = logContent.split('\n\n').filter(entry => entry.trim());
    return logEntries.slice(-limit);
  } catch (error) {
    console.error('Fehler beim Lesen der Log-Datei:', error);
    return ['Fehler beim Lesen der Logs'];
  }
}

/**
 * Log-Datei leeren
 */
export function clearLogs(): void {
  try {
    fs.writeFileSync(LOG_FILE, '# Debug-Log für Lagerhaltungssystem\n\n', 'utf8');
    console.log('Log-Datei wurde geleert');
  } catch (error) {
    console.error('Fehler beim Leeren der Log-Datei:', error);
  }
}

// Exportiere das komplette BugTracker-Objekt
export default {
  logDebug,
  logError,
  logQuery,
  getLogs,
  clearLogs
};