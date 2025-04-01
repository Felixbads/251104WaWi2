import axios from 'axios';
import { format } from 'date-fns';

const API_BASE_URL = 'https://openholidaysapi.org';

async function fetchHolidays(year) {
  try {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    // OpenHolidaysAPI für Feiertage (PublicHolidays)
    const url = `${API_BASE_URL}/PublicHolidays`;
    const params = {
      countryIsoCode: 'DE',
      validFrom: startDate,
      validTo: endDate,
    };
    
    console.log(`Fetching public holidays for year ${year} from ${url}`);
    const response = await axios.get(url, { params });
    const holidays = response.data;
    
    console.log(`Found ${holidays.length} public holidays`);
    
    // Process and show the first 3 holidays
    const sampleHolidays = holidays.slice(0, 3);
    sampleHolidays.forEach(holiday => {
      const nameDe = holiday.name.find(n => n.language === 'DE')?.text || holiday.name[0].text;
      const date = new Date(holiday.startDate);
      console.log(`  - ${format(date, 'yyyy-MM-dd')} - ${nameDe}`);
    });
    
    return holidays;
  } catch (error) {
    console.error('Error fetching holidays:', error);
    return [];
  }
}

async function main() {
  const year = 2024;
  await fetchHolidays(year);
}

main();