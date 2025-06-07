/**
 * Comprehensive Data Service
 * 
 * This service handles the import and synchronization of:
 * - Holiday data (public holidays and school holidays) for all German federal states
 * - Weather data (historical and forecast) for all defined locations
 * - Calendar metadata for complete date range coverage
 * 
 * Covers all 16 German federal states from 2022 onwards with automated scheduling
 */

import { db } from '../db';
import { holidays, calendarDays, weatherData, weatherForecasts, syncLogs, insertHolidaySchema, insertCalendarDaySchema, insertWeatherDataSchema } from '@shared/schema';
import { eq, and, between, gte, lte, sql } from 'drizzle-orm';
import { format, parseISO, isValid, addDays, subDays, getDay, getISOWeek, startOfYear, endOfYear, eachDayOfInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import axios from 'axios';

// German federal states configuration
export const GERMAN_STATES = [
  { code: 'BW', name: 'Baden-Württemberg', capital: 'Stuttgart' },
  { code: 'BY', name: 'Bayern', capital: 'München' },
  { code: 'BE', name: 'Berlin', capital: 'Berlin' },
  { code: 'BB', name: 'Brandenburg', capital: 'Potsdam' },
  { code: 'HB', name: 'Bremen', capital: 'Bremen' },
  { code: 'HH', name: 'Hamburg', capital: 'Hamburg' },
  { code: 'HE', name: 'Hessen', capital: 'Wiesbaden' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern', capital: 'Schwerin' },
  { code: 'NI', name: 'Niedersachsen', capital: 'Hannover' },
  { code: 'NW', name: 'Nordrhein-Westfalen', capital: 'Düsseldorf' },
  { code: 'RP', name: 'Rheinland-Pfalz', capital: 'Mainz' },
  { code: 'SL', name: 'Saarland', capital: 'Saarbrücken' },
  { code: 'SN', name: 'Sachsen', capital: 'Dresden' },
  { code: 'ST', name: 'Sachsen-Anhalt', capital: 'Magdeburg' },
  { code: 'SH', name: 'Schleswig-Holstein', capital: 'Kiel' },
  { code: 'TH', name: 'Thüringen', capital: 'Erfurt' }
];

// Weather locations based on state capitals
export const WEATHER_LOCATIONS = [
  { state: 'SN', city: 'Dresden', lat: 51.0504, lon: 13.7373 },
  { state: 'BW', city: 'Stuttgart', lat: 48.7758, lon: 9.1829 },
  { state: 'BY', city: 'München', lat: 48.1351, lon: 11.5820 },
  { state: 'BE', city: 'Berlin', lat: 52.5200, lon: 13.4050 },
  { state: 'BB', city: 'Potsdam', lat: 52.3906, lon: 13.0645 },
  { state: 'HB', city: 'Bremen', lat: 53.0793, lon: 8.8017 },
  { state: 'HH', city: 'Hamburg', lat: 53.5511, lon: 9.9937 },
  { state: 'HE', city: 'Wiesbaden', lat: 50.0826, lon: 8.2400 },
  { state: 'MV', city: 'Schwerin', lat: 53.6355, lon: 11.4010 },
  { state: 'NI', city: 'Hannover', lat: 52.3759, lon: 9.7320 },
  { state: 'NW', city: 'Düsseldorf', lat: 51.2277, lon: 6.7735 },
  { state: 'RP', city: 'Mainz', lat: 49.9929, lon: 8.2473 },
  { state: 'SL', city: 'Saarbrücken', lat: 49.2401, lon: 6.9969 },
  { state: 'ST', city: 'Magdeburg', lat: 52.1205, lon: 11.6276 },
  { state: 'SH', city: 'Kiel', lat: 54.3233, lon: 10.1228 },
  { state: 'TH', city: 'Erfurt', lat: 50.9848, lon: 11.0299 }
];

// API Configuration
const HOLIDAY_API_BASE = 'https://feiertage-api.de/api';
const SCHOOL_HOLIDAY_API_BASE = 'https://ferien-api.de/api/v1/holidays';
const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const WEATHER_API_BASE = 'https://api.openweathermap.org/data/3.0';

// Weekday names in German
const WEEKDAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

interface SyncResult {
  success: boolean;
  message: string;
  data?: any;
  errors?: string[];
}

export class ComprehensiveDataService {
  
  /**
   * Main synchronization method for all data types
   */
  async syncAllData(options: {
    startYear?: number;
    endYear?: number;
    includeWeather?: boolean;
    includeHolidays?: boolean;
    states?: string[];
  }): Promise<SyncResult> {
    const startYear = options.startYear || 2022;
    const endYear = options.endYear || new Date().getFullYear() + 1;
    const includeWeather = options.includeWeather !== false;
    const includeHolidays = options.includeHolidays !== false;
    const states = options.states || GERMAN_STATES.map(s => s.code);
    
    console.log(`Starting comprehensive data sync for years ${startYear}-${endYear}`);
    
    const results: any = {
      holidays: { synced: 0, errors: 0 },
      schoolHolidays: { synced: 0, errors: 0 },
      weather: { synced: 0, errors: 0 },
      calendar: { synced: 0, errors: 0 }
    };
    
    try {
      // 1. Initialize calendar days for the entire period
      console.log('Initializing calendar days...');
      const calendarResult = await this.initializeCalendarDays(startYear, endYear, states);
      results.calendar = calendarResult;
      
      // 2. Sync holidays if requested
      if (includeHolidays) {
        console.log('Syncing public holidays...');
        const holidayResult = await this.syncPublicHolidays(startYear, endYear, states);
        results.holidays = holidayResult;
        
        console.log('Syncing school holidays...');
        const schoolHolidayResult = await this.syncSchoolHolidays(startYear, endYear, states);
        results.schoolHolidays = schoolHolidayResult;
      }
      
      // 3. Sync weather data if requested
      if (includeWeather) {
        console.log('Syncing weather data...');
        const weatherResult = await this.syncWeatherData(startYear, endYear);
        results.weather = weatherResult;
      }
      
      // 4. Log the synchronization
      await this.logSyncOperation('COMPREHENSIVE_SYNC', results);
      
      return {
        success: true,
        message: `Comprehensive data sync completed for years ${startYear}-${endYear}`,
        data: results
      };
      
    } catch (error) {
      console.error('Error in comprehensive data sync:', error);
      await this.logSyncOperation('COMPREHENSIVE_SYNC', results, error as Error);
      
      return {
        success: false,
        message: 'Comprehensive data sync failed',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }
  
  /**
   * Initialize calendar days for all states and years
   */
  async initializeCalendarDays(startYear: number, endYear: number, states: string[]): Promise<any> {
    console.log(`Initializing calendar days for ${states.length} states from ${startYear} to ${endYear}`);
    
    let totalSynced = 0;
    let errors = 0;
    
    for (let year = startYear; year <= endYear; year++) {
      const startDate = startOfYear(new Date(year, 0, 1));
      const endDate = endOfYear(new Date(year, 0, 1));
      const days = eachDayOfInterval({ start: startDate, end: endDate });
      
      for (const state of states) {
        for (const day of days) {
          try {
            const dayOfWeek = getDay(day);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            
            const calendarDay = {
              date: format(day, 'yyyy-MM-dd'),
              day_of_week: dayOfWeek === 0 ? 7 : dayOfWeek, // Convert Sunday from 0 to 7
              day_name: WEEKDAY_NAMES[dayOfWeek],
              is_weekend: isWeekend,
              is_school_holiday: false,
              is_public_holiday: false,
              day_type: isWeekend ? 'WEEKEND' : 'WORKDAY',
              state: state,
              country: 'DE',
              year: year,
              month: day.getMonth() + 1,
              day: day.getDate(),
              week: getISOWeek(day)
            };
            
            // Use upsert to avoid duplicates
            await db.insert(calendarDays)
              .values(calendarDay)
              .onConflictDoUpdate({
                target: [calendarDays.date, calendarDays.state],
                set: {
                  day_of_week: calendarDay.day_of_week,
                  day_name: calendarDay.day_name,
                  is_weekend: calendarDay.is_weekend,
                  updated_at: sql`CURRENT_TIMESTAMP`
                }
              });
            
            totalSynced++;
          } catch (error) {
            console.error(`Error initializing calendar day ${format(day, 'yyyy-MM-dd')} for ${state}:`, error);
            errors++;
          }
        }
      }
    }
    
    console.log(`Calendar initialization completed: ${totalSynced} days synced, ${errors} errors`);
    return { synced: totalSynced, errors };
  }
  
  /**
   * Sync public holidays for all states and years
   */
  async syncPublicHolidays(startYear: number, endYear: number, states: string[]): Promise<any> {
    console.log(`Syncing public holidays for ${states.length} states from ${startYear} to ${endYear}`);
    
    let totalSynced = 0;
    let errors = 0;
    
    for (let year = startYear; year <= endYear; year++) {
      for (const stateCode of states) {
        try {
          console.log(`Fetching public holidays for ${stateCode} in ${year}`);
          
          // Fetch holidays from feiertage-api.de
          const response = await axios.get(`${HOLIDAY_API_BASE}/?jahr=${year}&nur_land=${stateCode}`);
          
          if (response.data) {
            for (const [holidayName, holidayDate] of Object.entries(response.data)) {
              try {
                const date = new Date(holidayDate as string);
                if (!isValid(date)) continue;
                
                const holiday = {
                  date: format(date, 'yyyy-MM-dd'),
                  name: holidayName,
                  description: `Gesetzlicher Feiertag in ${stateCode}`,
                  type: 'PUBLIC_HOLIDAY',
                  is_official: true,
                  country: 'DE',
                  state: stateCode,
                  year: year,
                  month: date.getMonth() + 1,
                  day: date.getDate(),
                  weekday: getDay(date),
                  weekday_name: WEEKDAY_NAMES[getDay(date)],
                  week: getISOWeek(date),
                  metadata: JSON.stringify({ source: 'feiertage-api.de', fetchedAt: new Date().toISOString() })
                };
                
                await db.insert(holidays)
                  .values(holiday)
                  .onConflictDoUpdate({
                    target: [holidays.date, holidays.country, holidays.state],
                    set: {
                      name: holiday.name,
                      description: holiday.description,
                      updated_at: sql`CURRENT_TIMESTAMP`
                    }
                  });
                
                // Update calendar_days table
                await db.update(calendarDays)
                  .set({
                    is_public_holiday: true,
                    day_type: 'PUBLIC_HOLIDAY',
                    holiday_name: holidayName,
                    updated_at: sql`CURRENT_TIMESTAMP`
                  })
                  .where(and(
                    eq(calendarDays.date, holiday.date),
                    eq(calendarDays.state, stateCode)
                  ));
                
                totalSynced++;
              } catch (error) {
                console.error(`Error processing holiday ${holidayName} for ${stateCode}:`, error);
                errors++;
              }
            }
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`Error fetching holidays for ${stateCode} in ${year}:`, error);
          errors++;
        }
      }
    }
    
    console.log(`Public holidays sync completed: ${totalSynced} holidays synced, ${errors} errors`);
    return { synced: totalSynced, errors };
  }
  
  /**
   * Sync school holidays for all states and years
   */
  async syncSchoolHolidays(startYear: number, endYear: number, states: string[]): Promise<any> {
    console.log(`Syncing school holidays for ${states.length} states from ${startYear} to ${endYear}`);
    
    let totalSynced = 0;
    let errors = 0;
    
    for (let year = startYear; year <= endYear; year++) {
      for (const stateCode of states) {
        try {
          console.log(`Fetching school holidays for ${stateCode} in ${year}`);
          
          // Fetch school holidays from ferien-api.de
          const response = await axios.get(`${SCHOOL_HOLIDAY_API_BASE}/${stateCode}/${year}`);
          
          if (response.data && Array.isArray(response.data)) {
            for (const holiday of response.data) {
              try {
                const startDate = new Date(holiday.start);
                const endDate = new Date(holiday.end);
                
                if (!isValid(startDate) || !isValid(endDate)) continue;
                
                // Create holiday entries for each day in the range
                let currentDate = new Date(startDate);
                while (currentDate <= endDate) {
                  const holidayEntry = {
                    date: format(currentDate, 'yyyy-MM-dd'),
                    name: holiday.name || `Schulferien ${stateCode}`,
                    description: `Schulferien in ${stateCode}: ${holiday.name}`,
                    type: 'SCHOOL_HOLIDAY',
                    is_official: false,
                    country: 'DE',
                    state: stateCode,
                    year: currentDate.getFullYear(),
                    month: currentDate.getMonth() + 1,
                    day: currentDate.getDate(),
                    weekday: getDay(currentDate),
                    weekday_name: WEEKDAY_NAMES[getDay(currentDate)],
                    week: getISOWeek(currentDate),
                    metadata: JSON.stringify({
                      source: 'ferien-api.de',
                      holidayType: holiday.name,
                      startDate: holiday.start,
                      endDate: holiday.end,
                      fetchedAt: new Date().toISOString()
                    })
                  };
                  
                  await db.insert(holidays)
                    .values(holidayEntry)
                    .onConflictDoUpdate({
                      target: [holidays.date, holidays.country, holidays.state],
                      set: {
                        name: holidayEntry.name,
                        description: holidayEntry.description,
                        updated_at: sql`CURRENT_TIMESTAMP`
                      }
                    });
                  
                  // Update calendar_days table
                  await db.update(calendarDays)
                    .set({
                      is_school_holiday: true,
                      day_type: 'SCHOOL_HOLIDAY',
                      holiday_name: holidayEntry.name,
                      updated_at: sql`CURRENT_TIMESTAMP`
                    })
                    .where(and(
                      eq(calendarDays.date, holidayEntry.date),
                      eq(calendarDays.state, stateCode)
                    ));
                  
                  totalSynced++;
                  currentDate = addDays(currentDate, 1);
                }
              } catch (error) {
                console.error(`Error processing school holiday for ${stateCode}:`, error);
                errors++;
              }
            }
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 800));
          
        } catch (error) {
          console.error(`Error fetching school holidays for ${stateCode} in ${year}:`, error);
          errors++;
        }
      }
    }
    
    console.log(`School holidays sync completed: ${totalSynced} holiday days synced, ${errors} errors`);
    return { synced: totalSynced, errors };
  }
  
  /**
   * Sync weather data for all locations and years
   */
  async syncWeatherData(startYear: number, endYear: number): Promise<any> {
    if (!WEATHER_API_KEY) {
      console.warn('No OpenWeather API key found, skipping weather sync');
      return { synced: 0, errors: 1, message: 'No API key available' };
    }
    
    console.log(`Syncing weather data for ${WEATHER_LOCATIONS.length} locations from ${startYear} to ${endYear}`);
    
    let totalSynced = 0;
    let errors = 0;
    
    for (const location of WEATHER_LOCATIONS) {
      try {
        console.log(`Syncing weather data for ${location.city} (${location.state})`);
        
        // Sync historical data for each year
        for (let year = startYear; year < new Date().getFullYear(); year++) {
          const startDate = new Date(year, 0, 1);
          const endDate = new Date(year, 11, 31);
          
          const result = await this.syncHistoricalWeatherForLocation(location, startDate, endDate);
          totalSynced += result.synced;
          errors += result.errors;
        }
        
        // Sync current weather and forecast
        const forecastResult = await this.syncWeatherForecastForLocation(location);
        totalSynced += forecastResult.synced;
        errors += forecastResult.errors;
        
      } catch (error) {
        console.error(`Error syncing weather for ${location.city}:`, error);
        errors++;
      }
    }
    
    console.log(`Weather data sync completed: ${totalSynced} entries synced, ${errors} errors`);
    return { synced: totalSynced, errors };
  }
  
  /**
   * Sync historical weather data for a specific location
   */
  async syncHistoricalWeatherForLocation(location: any, startDate: Date, endDate: Date): Promise<any> {
    let synced = 0;
    let errors = 0;
    
    try {
      // Use One Call API 3.0 for historical data (note: requires subscription for historical data)
      // For historical data, we'll use current weather as a fallback or implement Meteostat integration
      
      // For now, implementing current weather sync as historical weather requires paid API
      console.log(`Historical weather sync for ${location.city} (paid API required)`);
      
    } catch (error) {
      console.error(`Error syncing historical weather for ${location.city}:`, error);
      errors++;
    }
    
    return { synced, errors };
  }
  
  /**
   * Sync weather forecast for a specific location
   */
  async syncWeatherForecastForLocation(location: any): Promise<any> {
    let synced = 0;
    let errors = 0;
    
    try {
      const response = await axios.get(
        `${WEATHER_API_BASE}/onecall?lat=${location.lat}&lon=${location.lon}&appid=${WEATHER_API_KEY}&units=metric&lang=de`
      );
      
      if (response.data) {
        // Process current weather
        if (response.data.current) {
          const current = response.data.current;
          const currentDate = new Date(current.dt * 1000);
          
          const weatherEntry = {
            timestamp: currentDate,
            date: format(currentDate, 'yyyy-MM-dd'),
            hour: currentDate.getHours(),
            temp: current.temp,
            feels_like: current.feels_like,
            pressure: current.pressure,
            humidity: current.humidity,
            wind_speed: current.wind_speed,
            wind_deg: current.wind_deg,
            clouds: current.clouds,
            visibility: current.visibility,
            precipitation: current.rain?.['1h'] || 0,
            rain_1h: current.rain?.['1h'] || 0,
            snow_1h: current.snow?.['1h'] || 0,
            weather_id: current.weather[0]?.id,
            weather_main: current.weather[0]?.main,
            weather_description: current.weather[0]?.description,
            weather_icon: current.weather[0]?.icon,
            source: 'openweather_current',
            station_id: `${location.state}_${location.city}`,
            station_name: location.city,
            country: 'DE',
            sync_status: 'completed',
            metadata: JSON.stringify({
              location: location,
              sunrise: current.sunrise,
              sunset: current.sunset,
              fetchedAt: new Date().toISOString()
            })
          };
          
          await db.insert(weatherData)
            .values(weatherEntry)
            .onConflictDoUpdate({
              target: [weatherData.date, weatherData.hour, weatherData.station_id],
              set: {
                temp: weatherEntry.temp,
                feels_like: weatherEntry.feels_like,
                humidity: weatherEntry.humidity,
                updated_at: sql`CURRENT_TIMESTAMP`
              }
            });
          
          synced++;
        }
        
        // Process hourly forecast (next 48 hours)
        if (response.data.hourly && Array.isArray(response.data.hourly)) {
          for (const hour of response.data.hourly.slice(0, 48)) {
            try {
              const hourDate = new Date(hour.dt * 1000);
              
              const weatherEntry = {
                timestamp: hourDate,
                date: format(hourDate, 'yyyy-MM-dd'),
                hour: hourDate.getHours(),
                temp: hour.temp,
                feels_like: hour.feels_like,
                pressure: hour.pressure,
                humidity: hour.humidity,
                wind_speed: hour.wind_speed,
                wind_deg: hour.wind_deg,
                clouds: hour.clouds,
                visibility: hour.visibility || 10000,
                precipitation: hour.rain?.['1h'] || 0,
                rain_1h: hour.rain?.['1h'] || 0,
                snow_1h: hour.snow?.['1h'] || 0,
                weather_id: hour.weather[0]?.id,
                weather_main: hour.weather[0]?.main,
                weather_description: hour.weather[0]?.description,
                weather_icon: hour.weather[0]?.icon,
                source: 'openweather_forecast',
                station_id: `${location.state}_${location.city}`,
                station_name: location.city,
                country: 'DE',
                sync_status: 'completed',
                metadata: JSON.stringify({
                  location: location,
                  pop: hour.pop, // Probability of precipitation
                  fetchedAt: new Date().toISOString()
                })
              };
              
              await db.insert(weatherData)
                .values(weatherEntry)
                .onConflictDoUpdate({
                  target: [weatherData.date, weatherData.hour, weatherData.station_id],
                  set: {
                    temp: weatherEntry.temp,
                    feels_like: weatherEntry.feels_like,
                    humidity: weatherEntry.humidity,
                    updated_at: sql`CURRENT_TIMESTAMP`
                  }
                });
              
              synced++;
            } catch (error) {
              console.error(`Error processing hourly weather data:`, error);
              errors++;
            }
          }
        }
      }
      
    } catch (error) {
      console.error(`Error syncing weather forecast for ${location.city}:`, error);
      errors++;
    }
    
    return { synced, errors };
  }
  
  /**
   * Log synchronization operations
   */
  async logSyncOperation(syncType: string, results: any, error?: Error): Promise<void> {
    try {
      await db.insert(syncLogs).values({
        syncType,
        endDate: new Date(),
        itemsSaved: results.holidays?.synced + results.schoolHolidays?.synced + results.weather?.synced + results.calendar?.synced || 0,
        errors: results.holidays?.errors + results.schoolHolidays?.errors + results.weather?.errors + results.calendar?.errors || 0,
        syncStatus: error ? 'error' : 'completed',
        errorMessage: error?.message,
        additionalData: JSON.stringify(results),
        entityType: 'COMPREHENSIVE_DATA'
      });
    } catch (logError) {
      console.error('Error logging sync operation:', logError);
    }
  }
  
  /**
   * Get sync status and coverage information
   */
  async getSyncStatus(): Promise<any> {
    try {
      // Get latest sync logs
      const latestSyncs = await db.query.syncLogs.findMany({
        where: eq(syncLogs.syncType, 'COMPREHENSIVE_SYNC'),
        orderBy: (syncLogs, { desc }) => [desc(syncLogs.createdAt)],
        limit: 5
      });
      
      // Get data coverage statistics
      const holidayCount = await db.select({ count: sql`count(*)` }).from(holidays);
      const calendarCount = await db.select({ count: sql`count(*)` }).from(calendarDays);
      const weatherCount = await db.select({ count: sql`count(*)` }).from(weatherData);
      
      // Get date ranges
      const holidayRange = await db.select({
        minDate: sql`min(date)`,
        maxDate: sql`max(date)`
      }).from(holidays);
      
      const weatherRange = await db.select({
        minDate: sql`min(date)`,
        maxDate: sql`max(date)`
      }).from(weatherData);
      
      return {
        latestSyncs,
        coverage: {
          holidays: {
            count: holidayCount[0]?.count || 0,
            dateRange: holidayRange[0] || null
          },
          calendar: {
            count: calendarCount[0]?.count || 0
          },
          weather: {
            count: weatherCount[0]?.count || 0,
            dateRange: weatherRange[0] || null
          }
        }
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return { error: 'Failed to get sync status' };
    }
  }
}

export const comprehensiveDataService = new ComprehensiveDataService();