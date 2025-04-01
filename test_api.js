import fetch from 'node-fetch';

// API-Endpunkt und Parameter
const API_BASE_URL = 'https://openholidaysapi.org';
const year = 2024;
const startDate = `${year}-01-01`;
const endDate = `${year}-12-31`;
const url = `${API_BASE_URL}/PublicHolidays?countryIsoCode=DE&validFrom=${startDate}&validTo=${endDate}`;

console.log(`Fetching from URL: ${url}`);

// Fetch-Anfrage ausführen
fetch(url)
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log(`Found ${data.length} holidays`);
    // Die ersten 3 Feiertage anzeigen
    const sampleHolidays = data.slice(0, 3);
    sampleHolidays.forEach(holiday => {
      const nameDe = holiday.name.find(n => n.language === 'DE')?.text || holiday.name[0].text;
      const date = new Date(holiday.startDate);
      console.log(`  - ${date.toISOString().split('T')[0]} - ${nameDe}`);
    });
  })
  .catch(error => {
    console.error('Fehler beim Abrufen der Daten:', error);
  });