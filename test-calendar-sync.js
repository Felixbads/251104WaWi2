// Test-Script für die Synchronisierung der Kalenderübersicht
import fetch from 'node-fetch';

async function testCalendarSync() {
  console.log('Starte Test der Kalenderübersicht-Synchronisierung...');
  
  try {
    // Test für einen kleinen Zeitraum (nur Monat Januar 2023)
    const startYear = '2023';
    const endYear = '2023';
    
    console.log(`Teste Synchronisierung für Jahr ${startYear}`);
    
    // Die API zum Synchronisieren aufrufen
    const syncResult = await syncCalendarOverviewByYear(startYear, endYear);
    console.log('Synchronisierung abgeschlossen:', syncResult);
    
    // Jetzt versuchen wir, Kalenderübersichtsdaten für Januar 2023 abzurufen
    const startDate = '2023-01-01';
    const endDate = '2023-01-31';
    
    console.log(`Rufe Kalenderübersichtsdaten für ${startDate} bis ${endDate} ab...`);
    
    // Überprüfen, ob Daten für Bayern vorhanden sind
    const calendarData = await getCalendarOverview(startDate, endDate);
    console.log(`Kalenderübersichtsdaten abgerufen: ${calendarData.length} Einträge`);
    
    // Überprüfen, ob Daten für Bayern vorhanden sind
    const bayernEntries = calendarData.filter(entry => 
      entry.bayern_status !== undefined || 
      entry.bayern_holiday_name !== undefined
    );
    
    console.log(`Einträge mit Bayern-Daten: ${bayernEntries.length}`);
    
    if (bayernEntries.length > 0) {
      console.log('Beispieldatensatz für Bayern:', bayernEntries[0]);
    }
    
    // Prüfen, ob Feiertage korrekt eingefügt wurden
    const holidays = calendarData.filter(entry => 
      Object.keys(entry).some(key => key.endsWith('_holiday_name') && entry[key])
    );
    
    console.log(`Einträge mit Feiertagen: ${holidays.length}`);
    
    if (holidays.length > 0) {
      console.log('Beispiel-Feiertag:', holidays[0]);
    }
    
  } catch (error) {
    console.error('Fehler beim Testen der Kalenderübersicht:', error);
  }
}

// Funktion zum Aufrufen der Synchronisierung nach Jahren
async function syncCalendarOverviewByYear(startYear, endYear) {
  const response = await fetch(
    `http://localhost:3000/api/calendar/overview/sync?startYear=${startYear}&endYear=${endYear}`,
    { method: 'POST' }
  );
  
  if (!response.ok) {
    throw new Error(`Fehler bei der Synchronisierung: ${response.status} - ${await response.text()}`);
  }
  
  return await response.json();
}

// Funktion zum Abrufen der Kalenderübersichtsdaten
async function getCalendarOverview(startDate, endDate) {
  const response = await fetch(
    `http://localhost:3000/api/calendar/overview?startDate=${startDate}&endDate=${endDate}`
  );
  
  if (!response.ok) {
    throw new Error(`Fehler beim Abrufen von Kalenderübersichtsdaten: ${response.status} - ${await response.text()}`);
  }
  
  return await response.json();
}

// Script ausführen
testCalendarSync()
  .then(() => console.log('Test abgeschlossen.'))
  .catch(error => console.error('Test fehlgeschlagen:', error));