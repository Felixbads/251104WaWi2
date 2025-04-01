import { apiRequest } from '../queryClient';

/**
 * API-Funktionen für die Wettervorhersage
 */

export interface CurrentWeather {
  location: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  description: string;
  icon: string;
}

export interface ForecastDay {
  date: string;
  temperature: {
    min: number;
    max: number;
  };
  humidity: number;
  description: string;
  icon: string;
}

export interface HolidayInfo {
  date: string;
  name: string;
  type: 'PUBLIC_HOLIDAY' | 'SCHOOL_HOLIDAY';
  state?: string; // Bundesland (falls zutreffend)
}

/**
 * Ruft aktuelle Wetterdaten ab
 * @param location Standort (optional, Standard ist Bad Schandau)
 */
export async function getCurrentWeather(location: string = 'Bad Schandau,DE'): Promise<CurrentWeather> {
  try {
    const response = await fetch('/api/weather/current');
    if (!response.ok) {
      throw new Error('Fehler beim Abrufen der aktuellen Wetterdaten');
    }
    const data = await response.json();
    return data as CurrentWeather;
  } catch (error) {
    console.error('Fehler beim Abrufen der aktuellen Wetterdaten:', error);
    throw error;
  }
}

/**
 * Ruft die Wettervorhersage ab
 * @param days Anzahl der Tage (optional, Standard ist 7)
 * @param location Standort (optional, Standard ist Bad Schandau)
 */
export async function getWeatherForecast(days: number = 7, location: string = 'Bad Schandau,DE'): Promise<ForecastDay[]> {
  try {
    const response = await fetch(`/api/weather/forecast?days=${days}`);
    if (!response.ok) {
      throw new Error('Fehler beim Abrufen der Wettervorhersage');
    }
    const data = await response.json();
    return data as ForecastDay[];
  } catch (error) {
    console.error('Fehler beim Abrufen der Wettervorhersage:', error);
    throw error;
  }
}

/**
 * Ruft Feiertage und Schulferien im angegebenen Zeitraum ab
 * 
 * @param startDate Startdatum (Format: YYYY-MM-DD)
 * @param endDate Enddatum (Format: YYYY-MM-DD)
 */
export async function getHolidays(startDate: string, endDate: string): Promise<HolidayInfo[]> {
  try {
    const response = await fetch(`/api/holidays?startDate=${startDate}&endDate=${endDate}`);
    if (!response.ok) {
      throw new Error('Fehler beim Abrufen der Feiertage');
    }
    const data = await response.json();
    return data as HolidayInfo[];
  } catch (error) {
    console.error('Fehler beim Abrufen der Feiertage:', error);
    throw error;
  }
}

/**
 * Manuell eine Wettervorhersage-Synchronisierung auslösen
 */
export async function syncWeatherForecast(): Promise<any> {
  try {
    const response = await fetch('/api/weather/sync/forecast', {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Fehler bei der Wettervorhersage-Synchronisierung');
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fehler bei der Wettervorhersage-Synchronisierung:', error);
    throw error;
  }
}

/**
 * Manuell eine historische Wetterdaten-Synchronisierung auslösen
 * 
 * @param startDate Startdatum (optional)
 * @param endDate Enddatum (optional)
 * @param batchSize Anzahl der Tage pro Batch (optional)
 */
export async function syncHistoricalWeather(
  startDate?: string,
  endDate?: string,
  batchSize: number = 10
): Promise<any> {
  try {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    params.append('batchSize', batchSize.toString());
    
    const response = await fetch(`/api/weather/sync/historical?${params.toString()}`, {
      method: 'POST'
    });
    if (!response.ok) {
      throw new Error('Fehler bei der historischen Wetterdaten-Synchronisierung');
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fehler bei der historischen Wetterdaten-Synchronisierung:', error);
    throw error;
  }
}