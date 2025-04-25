import axios from 'axios';
import pg from 'pg';

// Type definition for pool
type PoolType = pg.Pool;

// Konfiguration für den Import
interface ImportConfig {
  startDate: string;
  endDate?: string;
  batchSize: number;
  requestDelay: number;
  maxRetries: number;
  retryDelay: number;
  saveProgressInterval: number;
}

// Status des Importvorgangs
interface ImportStatus {
  lastDate: string;
  lastOffset: number;
  isCompleted: boolean;
}

// Zusammenfassung des Importergebnisses
interface ImportSummary {
  daysProcessed: number;
  totalItems: number;
  savedItems: number;
  duplicateItems: number;
  errorItems: number;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
}

// Ergebnisobjekt des Importers
interface ImportResult {
  status: ImportStatus;
  summary: ImportSummary;
}

/**
 * Hilfsfunktion zum Verzögern der Ausführung
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Liest den aktuellen Sync-Status aus der Datenbank
 */
async function getSyncState(pool: PoolType, jobName: string): Promise<ImportStatus | null> {
  try {
    const result = await pool.query(
      'SELECT job_name, last_date, last_offset FROM sync_state WHERE job_name = $1',
      [jobName]
    );
    
    if (result.rowCount && result.rowCount > 0) {
      const { last_date, last_offset } = result.rows[0];
      return {
        lastDate: last_date,
        lastOffset: last_offset,
        isCompleted: false
      };
    }
    
    return null;
  } catch (error) {
    console.error('Fehler beim Abrufen des Sync-Status:', error);
    throw error;
  }
}

/**
 * Speichert den aktuellen Sync-Status in der Datenbank
 */
async function saveSyncState(pool: PoolType, jobName: string, status: ImportStatus): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO sync_state (job_name, last_date, last_offset, updated_at) 
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (job_name) 
       DO UPDATE SET last_date = $2, last_offset = $3, updated_at = NOW()`,
      [jobName, status.lastDate, status.lastOffset]
    );
    console.log(`Sync-Status gespeichert: ${status.lastDate}, Offset: ${status.lastOffset}`);
  } catch (error) {
    console.error('Fehler beim Speichern des Sync-Status:', error);
    throw error;
  }
}

/**
 * Ruft die Vendon API auf, um Transaktionen für einen bestimmten Tag und Offset abzurufen
 */
async function fetchVendonTransactions(date: string, offset: number, limit: number, retryCount = 0, maxRetries = 3, retryDelay = 5000): Promise<any> {
  try {
    // API-Endpunkt für die Vendon-API
    const apiUrl = 'http://api.vendon.net/rest/v1.8.0/stats/vends';
    
    // Authentifizierungstoken aus der Umgebungsvariable
    const authToken = process.env.VENDON_API_TOKEN;
    
    if (!authToken) {
      throw new Error('VENDON_API_TOKEN Umgebungsvariable nicht gesetzt');
    }
    
    console.log(`API-Anfrage: GET ${apiUrl} für Datum ${date}, Offset: ${offset}, Limit: ${limit}`);
    
    // API-Anfrage mit Datum, Offset und Limit
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      params: {
        date_from: date,
        date_to: date,
        offset: offset,
        limit: limit,
        expand: 'machine,product',
        sort: 'id'
      }
    });
    
    // API-Antwort enthält die Transaktionen, die Gesamtzahl und einen Status
    return response.data;
  } catch (error) {
    console.error(`Fehler beim Abrufen der Vendon-Transaktionen für ${date}, Offset ${offset}:`, error);
    
    // Bei Netzwerkfehlern oder API-Fehlern, Wiederholungen durchführen
    if (retryCount < maxRetries) {
      console.log(`Wiederhole Anfrage in ${retryDelay}ms (Versuch ${retryCount + 1}/${maxRetries})`);
      await sleep(retryDelay);
      return fetchVendonTransactions(date, offset, limit, retryCount + 1, maxRetries, retryDelay);
    }
    
    throw error;
  }
}

/**
 * Speichert die Transaktionen in der Datenbank
 */
async function saveTransactions(pool: PoolType, transactions: any[]): Promise<{ saved: number, duplicates: number, errors: number }> {
  let saved = 0;
  let duplicates = 0;
  let errors = 0;
  
  if (!transactions || transactions.length === 0) {
    return { saved, duplicates, errors };
  }
  
  // Transaktionen einzeln in die Datenbank einfügen
  // Wir verwenden ON CONFLICT DO NOTHING, um Duplikate zu ignorieren
  for (const transaction of transactions) {
    try {
      // Prüfe, ob die Transaktion bereits existiert
      const vendonId = transaction.id;
      const checkResult = await pool.query(
        'SELECT id FROM transactions WHERE vendon_id = $1',
        [vendonId]
      );
      
      if (checkResult.rowCount && checkResult.rowCount > 0) {
        console.log(`Transaktion ${vendonId} existiert bereits.`);
        duplicates++;
        continue;
      }
      
      // Produktname aus der Transaktion extrahieren
      const productName = transaction.name || 
                          (transaction.product && transaction.product.name) || 
                          'Unbekanntes Produkt';
      
      console.log(`Produktname direkt aus transaction.name: "${productName}"`);
      
      // Maschinendaten aus der Transaktion extrahieren
      const machineId = transaction.machine_id || 
                         (transaction.machine && transaction.machine.id) || 
                         null;
      const machineName = (transaction.machine && transaction.machine.name) || 
                          'Unbekannte Maschine';
      
      // Datum und Preis extrahieren
      const datetime = transaction.date || new Date().toISOString();
      const price = parseFloat(transaction.price) || 0;
      
      // Transaktion in die Datenbank einfügen
      await pool.query(
        `INSERT INTO transactions (
          vendon_id, datetime, machine_id, machine_name, 
          product_id, product_name, quantity, price, source, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (vendon_id) DO NOTHING`,
        [
          vendonId,
          datetime,
          machineId,
          machineName,
          transaction.product_id || null,
          productName,
          transaction.quantity || 1,
          price,
          'history-import', // Quelle als "history-import" markieren
        ]
      );
      
      saved++;
    } catch (error) {
      console.error(`Fehler beim Speichern der Transaktion:`, error);
      errors++;
    }
  }
  
  return { saved, duplicates, errors };
}

/**
 * Importiert die Vendon-Transaktionen für einen bestimmten Zeitraum
 */
export async function importVendonHistory(pool: Pool, config: ImportConfig): Promise<ImportResult> {
  console.log('Starte Vendon Historical Import mit Konfiguration:', config);
  
  const jobName = 'vendon_history_import';
  const startTime = new Date();
  const summary: ImportSummary = {
    daysProcessed: 0,
    totalItems: 0,
    savedItems: 0,
    duplicateItems: 0,
    errorItems: 0,
    startTime,
    endTime: startTime,
    durationSeconds: 0
  };
  
  // Importstatus abrufen oder initialisieren
  let status = await getSyncState(pool, jobName) || {
    lastDate: config.startDate,
    lastOffset: 0,
    isCompleted: false
  };
  
  console.log(`Import wird fortgesetzt ab Datum ${status.lastDate}, Offset ${status.lastOffset}`);
  
  // Aktuelles Datum als Enddatum verwenden, wenn keines angegeben ist
  const endDate = config.endDate || new Date().toISOString().split('T')[0];
  
  // Datum in Date-Objekt konvertieren
  let currentDate = new Date(status.lastDate);
  const targetEndDate = new Date(endDate);
  
  // Schleife über alle Tage
  while (currentDate <= targetEndDate) {
    const dateStr = currentDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    let currentOffset = currentDate.getTime() === new Date(status.lastDate).getTime() ? status.lastOffset : 0;
    let hasMoreItems = true;
    
    console.log(`Verarbeite Datum: ${dateStr}, beginnend bei Offset: ${currentOffset}`);
    
    while (hasMoreItems) {
      try {
        // Hole Transaktionen vom Vendon API
        const response = await fetchVendonTransactions(dateStr, currentOffset, config.batchSize, 0, config.maxRetries, config.retryDelay);
        
        const transactions = response.vends || [];
        const totalCount = response.total || 0;
        
        // Aktualisiere den Fortschrittszähler
        currentOffset += transactions.length;
        
        // Speichere die Transaktionen in der Datenbank
        const { saved, duplicates, errors } = await saveTransactions(pool, transactions);
        
        summary.totalItems += transactions.length;
        summary.savedItems += saved;
        summary.duplicateItems += duplicates;
        summary.errorItems += errors;
        
        // Überprüfe, ob weitere Elemente abgerufen werden müssen
        hasMoreItems = currentOffset < totalCount;
        
        // Aktualisiere den Status
        status.lastDate = dateStr;
        status.lastOffset = currentOffset;
        
        console.log(`Für Datum ${dateStr}: ${saved} neue Transaktionen gespeichert, ${duplicates} Duplikate gefunden, ${errors} Fehler.`);
        console.log(`Aktuelle Anzahl: ${currentOffset}, Limit: ${config.batchSize}, Gesamt: ${totalCount}`);
        
        // Status regelmäßig speichern
        if (summary.totalItems % (config.batchSize * config.saveProgressInterval) === 0) {
          await saveSyncState(pool, jobName, status);
        }
        
        // Kurze Pause zwischen den API-Anfragen
        if (hasMoreItems) {
          await sleep(config.requestDelay);
        }
      } catch (error) {
        console.error(`Fehler beim Verarbeiten des Datums ${dateStr} mit Offset ${currentOffset}:`, error);
        
        // Bei einem Fehler den aktuellen Status speichern und fortfahren
        await saveSyncState(pool, jobName, status);
        
        // Weitermachen mit dem nächsten Tag
        hasMoreItems = false;
        summary.errorItems++;
      }
    }
    
    // Nächster Tag
    currentDate.setDate(currentDate.getDate() + 1);
    summary.daysProcessed++;
    
    // Status für den neuen Tag aktualisieren
    status.lastDate = currentDate.toISOString().split('T')[0];
    status.lastOffset = 0;
    
    // Status nach jedem verarbeiteten Tag speichern
    await saveSyncState(pool, jobName, status);
  }
  
  // Import-Abschluss
  status.isCompleted = true;
  const endTime = new Date();
  summary.endTime = endTime;
  summary.durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
  
  console.log(`Vendon Historical Import abgeschlossen:`);
  console.log(`- Tage verarbeitet: ${summary.daysProcessed}`);
  console.log(`- Gesamt Transaktionen: ${summary.totalItems}`);
  console.log(`- Gespeichert: ${summary.savedItems}`);
  console.log(`- Duplikate: ${summary.duplicateItems}`);
  console.log(`- Fehler: ${summary.errorItems}`);
  console.log(`- Dauer: ${summary.durationSeconds} Sekunden`);
  
  return { status, summary };
}