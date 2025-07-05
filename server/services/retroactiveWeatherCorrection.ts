/**
 * RETROAKTIVE WETTERKORREKTUR SERVICE
 * 
 * Dieser Service korrigiert täglich die Wetterdaten für vergangene Transaktionen,
 * um sicherzustellen, dass jede Transaktion die richtigen Wetterdaten zugeordnet hat.
 * 
 * Funktionsweise:
 * - Läuft jeden Morgen um 6:00 Uhr
 * - Holt historische Wetterdaten für die letzten 7 Tage
 * - Korrigiert Transaktionen mit ungenauen oder fehlenden Wetterdaten
 * - Verbessert die Genauigkeit des Prognosemodells
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as cron from 'node-cron';

interface WeatherData {
  timestamp: number;
  temperature: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  weatherCondition: string;
  icon: string;
  description: string;
}

interface TransactionWeatherUpdate {
  transactionId: number;
  datetime: Date;
  weatherData: WeatherData;
}

class RetroactiveWeatherCorrectionService {
  private readonly OPENWEATHER_API_KEY: string;
  private readonly OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/3.0/onecall/timemachine';
  private readonly BAD_SCHANDAU_LAT = 50.9243;
  private readonly BAD_SCHANDAU_LON = 14.1561;

  constructor() {
    this.OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '';
    if (!this.OPENWEATHER_API_KEY) {
      console.warn('[RetroactiveWeather] OpenWeather API key nicht gefunden');
    }
  }

  /**
   * Hauptfunktion für die tägliche retroaktive Wetterkorrektur
   */
  async performDailyWeatherCorrection(): Promise<void> {
    try {
      console.info('[RetroactiveWeather] Starte tägliche Wetterkorrektur...');
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7); // Letzte 7 Tage korrigieren

      // 1. Identifiziere Transaktionen ohne oder mit ungenauen Wetterdaten
      const transactionsToCorrect = await this.identifyTransactionsForCorrection(startDate, endDate);
      
      if (transactionsToCorrect.length === 0) {
        console.info('[RetroactiveWeather] Keine Transaktionen zur Korrektur gefunden');
        return;
      }

      console.info(`[RetroactiveWeather] ${transactionsToCorrect.length} Transaktionen identifiziert für Wetterkorrektur`);

      // 2. Hole historische Wetterdaten für die benötigten Zeiträume
      const weatherData = await this.fetchHistoricalWeatherData(startDate, endDate);

      // 3. Ordne Wetterdaten den Transaktionen zu und aktualisiere sie
      await this.updateTransactionsWithWeatherData(transactionsToCorrect, weatherData);

      console.info('[RetroactiveWeather] Tägliche Wetterkorrektur erfolgreich abgeschlossen');
    } catch (error) {
      console.error('[RetroactiveWeather] Fehler bei der täglichen Wetterkorrektur:', error);
      throw error;
    }
  }

  /**
   * Identifiziert Transaktionen, die eine Wetterkorrektur benötigen
   */
  private async identifyTransactionsForCorrection(startDate: Date, endDate: Date): Promise<TransactionWeatherUpdate[]> {
    try {
      const result = await db.execute(sql`
        SELECT 
          id as "transactionId",
          datetime,
          weather_data as "weatherData"
        FROM transactions 
        WHERE datetime >= ${startDate.toISOString()}
          AND datetime <= ${endDate.toISOString()}
          AND (
            weather_data IS NULL 
            OR weather_data = ''
            OR JSON_EXTRACT(weather_data, '$.source') != 'historical_correction'
          )
        ORDER BY datetime ASC
      `);

      return result.rows.map((row: any) => ({
        transactionId: row.transactionId,
        datetime: new Date(row.datetime),
        weatherData: row.weatherData ? JSON.parse(row.weatherData) : null
      }));
    } catch (error) {
      console.error('[RetroactiveWeather] Fehler beim Identifizieren von Transaktionen:', error);
      throw error;
    }
  }

  /**
   * Holt historische Wetterdaten für den angegebenen Zeitraum
   */
  private async fetchHistoricalWeatherData(startDate: Date, endDate: Date): Promise<Map<string, WeatherData>> {
    const weatherMap = new Map<string, WeatherData>();
    
    if (!this.OPENWEATHER_API_KEY) {
      console.warn('[RetroactiveWeather] OpenWeather API key fehlt - überspringe historische Datenabfrage');
      return weatherMap;
    }

    try {
      // Iteriere über jeden Tag im Zeitraum
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const timestamp = Math.floor(currentDate.getTime() / 1000);
        const dateKey = currentDate.toISOString().split('T')[0];

        try {
          const weatherData = await this.fetchWeatherForTimestamp(timestamp);
          if (weatherData) {
            weatherMap.set(dateKey, weatherData);
            console.debug(`[RetroactiveWeather] Wetterdaten für ${dateKey} abgerufen`);
          }
        } catch (error) {
          console.warn(`[RetroactiveWeather] Fehler beim Abrufen der Wetterdaten für ${dateKey}:`, error);
        }

        // Pause zwischen API-Aufrufen (Rate Limiting)
        await this.sleep(1100); // 1.1 Sekunden Pause

        currentDate.setDate(currentDate.getDate() + 1);
      }

      console.info(`[RetroactiveWeather] ${weatherMap.size} Tage mit Wetterdaten abgerufen`);
      return weatherMap;
    } catch (error) {
      console.error('[RetroactiveWeather] Fehler beim Abrufen historischer Wetterdaten:', error);
      throw error;
    }
  }

  /**
   * Holt Wetterdaten für einen spezifischen Zeitstempel
   */
  private async fetchWeatherForTimestamp(timestamp: number): Promise<WeatherData | null> {
    try {
      const url = `${this.OPENWEATHER_BASE_URL}?lat=${this.BAD_SCHANDAU_LAT}&lon=${this.BAD_SCHANDAU_LON}&dt=${timestamp}&appid=${this.OPENWEATHER_API_KEY}&units=metric&lang=de`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const current = data.data[0]; // Erste Stunde des Tages

      return {
        timestamp: current.dt,
        temperature: current.temp,
        humidity: current.humidity,
        pressure: current.pressure,
        windSpeed: current.wind_speed * 3.6, // m/s zu km/h
        weatherCondition: current.weather[0].main,
        icon: current.weather[0].icon,
        description: current.weather[0].description
      };
    } catch (error) {
      console.error(`[RetroactiveWeather] API-Fehler für Timestamp ${timestamp}:`, error);
      return null;
    }
  }

  /**
   * Aktualisiert Transaktionen mit korrigierten Wetterdaten
   */
  private async updateTransactionsWithWeatherData(
    transactions: TransactionWeatherUpdate[],
    weatherMap: Map<string, WeatherData>
  ): Promise<void> {
    let updatedCount = 0;

    try {
      for (const transaction of transactions) {
        const dateKey = transaction.datetime.toISOString().split('T')[0];
        const weatherData = weatherMap.get(dateKey);

        if (weatherData) {
          const correctedWeatherData = {
            ...weatherData,
            source: 'historical_correction',
            correctedAt: new Date().toISOString(),
            originalData: transaction.weatherData
          };

          await db.execute(sql`
            UPDATE transactions 
            SET weather_data = ${JSON.stringify(correctedWeatherData)}
            WHERE id = ${transaction.transactionId}
          `);

          updatedCount++;
        }
      }

      console.info(`[RetroactiveWeather] ${updatedCount} Transaktionen mit korrigierten Wetterdaten aktualisiert`);
    } catch (error) {
      console.error('[RetroactiveWeather] Fehler beim Aktualisieren der Transaktionen:', error);
      throw error;
    }
  }

  /**
   * Holt erweiterte Wettervorhersage für Prognosemodell (7-14 Tage)
   */
  async getExtendedWeatherForecast(days: number = 14): Promise<WeatherData[]> {
    if (!this.OPENWEATHER_API_KEY) {
      console.warn('[RetroactiveWeather] OpenWeather API key fehlt - verwende Standard-Vorhersage');
      return [];
    }

    try {
      const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${this.BAD_SCHANDAU_LAT}&lon=${this.BAD_SCHANDAU_LON}&appid=${this.OPENWEATHER_API_KEY}&units=metric&lang=de&exclude=minutely,alerts`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Kombiniere tägliche Vorhersage mit stündlichen Daten
      const forecast: WeatherData[] = [];
      
      // Erste 7 Tage aus daily forecast
      for (let i = 0; i < Math.min(days, data.daily.length); i++) {
        const day = data.daily[i];
        forecast.push({
          timestamp: day.dt,
          temperature: day.temp.day,
          humidity: day.humidity,
          pressure: day.pressure,
          windSpeed: day.wind_speed * 3.6,
          weatherCondition: day.weather[0].main,
          icon: day.weather[0].icon,
          description: day.weather[0].description
        });
      }

      console.info(`[RetroactiveWeather] Erweiterte Wettervorhersage für ${forecast.length} Tage abgerufen`);
      return forecast;
    } catch (error) {
      console.error('[RetroactiveWeather] Fehler beim Abrufen der erweiterten Wettervorhersage:', error);
      return [];
    }
  }

  /**
   * Startet den täglichen Cron-Job für die Wetterkorrektur
   */
  scheduleDailyCorrection(): void {
    // Läuft jeden Tag um 6:00 Uhr
    cron.schedule('0 6 * * *', async () => {
      console.info('[RetroactiveWeather] Tägliche Wetterkorrektur gestartet (Cron-Job)');
      try {
        await this.performDailyWeatherCorrection();
      } catch (error) {
        console.error('[RetroactiveWeather] Fehler bei automatischer Wetterkorrektur:', error);
      }
    });

    console.info('[RetroactiveWeather] Täglicher Cron-Job für Wetterkorrektur eingerichtet (6:00 Uhr)');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const retroactiveWeatherService = new RetroactiveWeatherCorrectionService();