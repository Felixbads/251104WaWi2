/**
 * Enhanced Forecast Service
 * 
 * Advanced forecasting engine implementing the requirements from the uploaded document:
 * - Stockout status tracking and compensation
 * - Weather-based forecasting with location-specific adjustments
 * - Holiday and vacation period integration
 * - Transparent forecast explanations
 * - Location-type specific factors (tourist vs. commuter locations)
 */

import { db } from '../db';
import { 
  forecastModels, 
  forecasts, 
  transactions, 
  weatherData, 
  holidays, 
  machines, 
  locations,
  calendarOverview,
  events,
  inventoryBatches,
  warehouses,
  products,
  insertForecastSchema
} from '@shared/schema';
import { eq, and, between, count, desc, asc, sql, inArray, gte, lte, isNull, or } from 'drizzle-orm';
import { format, parse, parseISO, isValid, eachDayOfInterval, addDays, subDays, startOfDay, endOfDay } from 'date-fns';
import { de } from 'date-fns/locale';

export interface StockoutAnalysis {
  productId: string;
  machineId: number;
  stockoutDays: string[];
  demandLoss: number;
  recommendedIncrease: number;
}

export interface LocationProfile {
  id: number;
  name: string;
  type: 'tourist' | 'commuter' | 'mixed' | 'indoor' | 'outdoor';
  weatherSensitivity: number; // 0-1
  holidaySensitivity: number; // 0-1
  weekendMultiplier: number;
}

export interface ForecastExplanation {
  date: string;
  baselineDemand: number;
  weatherAdjustment: number;
  holidayAdjustment: number;
  stockoutCompensation: number;
  finalForecast: number;
  factors: string[];
  explanation: string;
  confidence: number;
}

export interface EnhancedForecastResult {
  machineId: number;
  locationId: number;
  productId: string;
  forecasts: ForecastExplanation[];
  totalDemand: number;
  averageConfidence: number;
  warnings: string[];
}

/**
 * Analyzes stockout patterns for demand loss calculation
 */
export async function analyzeStockoutPatterns(
  machineId: number,
  productId: string,
  startDate: string,
  endDate: string
): Promise<StockoutAnalysis> {
  try {
    // Find stockout events for this machine and product
    const stockoutQuery = `
      SELECT DISTINCT 
        DATE(event_datetime) as stockout_date,
        event_type,
        description
      FROM events 
      WHERE machine_id = $1 
        AND (
          LOWER(description) LIKE '%out of stock%' 
          OR LOWER(description) LIKE '%empty%'
          OR LOWER(description) LIKE '%ausverkauft%'
          OR event_type = 'STOCKOUT'
        )
        AND event_datetime BETWEEN $2 AND $3
      ORDER BY stockout_date
    `;

    const stockoutResult = await db.execute(sql.raw(stockoutQuery, [machineId, startDate, endDate]));
    const stockoutDays = stockoutResult.rows.map((row: any) => row.stockout_date as string);

    // Calculate average daily demand for non-stockout days
    const demandQuery = `
      SELECT 
        DATE(datetime) as sale_date,
        SUM(quantity) as daily_quantity
      FROM transactions 
      WHERE machine_id = $1 
        AND product_name = $2
        AND datetime BETWEEN $3 AND $4
        AND DATE(datetime) NOT IN (${stockoutDays.map((_, i) => `$${i + 5}`).join(',')})
      GROUP BY DATE(datetime)
      HAVING SUM(quantity) > 0
    `;

    const params = [machineId, productId, startDate, endDate, ...stockoutDays];
    const demandResult = await db.execute(sql.raw(demandQuery, params));
    
    const averageDailyDemand = demandResult.rows.length > 0 
      ? demandResult.rows.reduce((sum, row: any) => sum + parseFloat(row.daily_quantity || '0'), 0) / demandResult.rows.length
      : 0;

    // Calculate demand loss (stockout days * average demand)
    const demandLoss = stockoutDays.length * averageDailyDemand;
    
    // Recommend 20% increase in stock if frequent stockouts
    const recommendedIncrease = stockoutDays.length > 2 ? 0.2 : 0;

    return {
      productId,
      machineId,
      stockoutDays,
      demandLoss,
      recommendedIncrease
    };
  } catch (error) {
    console.error('Error analyzing stockout patterns:', error);
    return {
      productId,
      machineId,
      stockoutDays: [],
      demandLoss: 0,
      recommendedIncrease: 0
    };
  }
}

/**
 * Determines location profile based on machine data and historical patterns
 */
export async function getLocationProfile(locationId: number): Promise<LocationProfile> {
  try {
    // Get location info
    const location = await db.query.locations.findFirst({
      where: eq(locations.id, locationId)
    });

    if (!location) {
      throw new Error(`Location ${locationId} not found`);
    }

    // Analyze transaction patterns to determine location type
    const patternQuery = `
      SELECT 
        EXTRACT(DOW FROM datetime) as day_of_week,
        EXTRACT(HOUR FROM datetime) as hour,
        COUNT(*) as transaction_count,
        AVG(price) as avg_price
      FROM transactions t
      JOIN machines m ON t.machine_id = m.id
      WHERE m.location_id = $1
        AND datetime >= NOW() - INTERVAL '90 days'
      GROUP BY day_of_week, hour
      ORDER BY day_of_week, hour
    `;

    const patternResult = await db.execute(sql.raw(patternQuery, [locationId]));
    const patterns = patternResult.rows as any[];

    // Determine location type based on patterns
    let locationType: LocationProfile['type'] = 'mixed';
    let weatherSensitivity = 0.3;
    let holidaySensitivity = 0.2;
    let weekendMultiplier = 1.0;

    // Check if outdoor based on location name
    const name = location.name?.toLowerCase() || '';
    if (name.includes('outdoor') || name.includes('park') || name.includes('wanderweg') || name.includes('tourist')) {
      locationType = 'outdoor';
      weatherSensitivity = 0.6;
      holidaySensitivity = 0.5;
      weekendMultiplier = 1.4;
    } else if (name.includes('indoor') || name.includes('office') || name.includes('büro')) {
      locationType = 'indoor';
      weatherSensitivity = 0.1;
      holidaySensitivity = 0.1;
      weekendMultiplier = 0.7;
    } else if (name.includes('tourist') || name.includes('sehenswürdigkeit')) {
      locationType = 'tourist';
      weatherSensitivity = 0.5;
      holidaySensitivity = 0.6;
      weekendMultiplier = 1.5;
    }

    // Analyze weekend vs weekday patterns
    const weekendCount = patterns.filter((p: any) => p.day_of_week === 0 || p.day_of_week === 6).length;
    const weekdayCount = patterns.filter((p: any) => p.day_of_week >= 1 && p.day_of_week <= 5).length;
    
    if (weekendCount > weekdayCount * 0.8) {
      locationType = 'tourist';
      weekendMultiplier = 1.3;
    }

    return {
      id: locationId,
      name: location.name || 'Unknown',
      type: locationType,
      weatherSensitivity,
      holidaySensitivity,
      weekendMultiplier
    };
  } catch (error) {
    console.error('Error determining location profile:', error);
    return {
      id: locationId,
      name: 'Unknown',
      type: 'mixed',
      weatherSensitivity: 0.3,
      holidaySensitivity: 0.2,
      weekendMultiplier: 1.0
    };
  }
}

/**
 * Gets weather impact factor for a given date and location type
 */
export async function getWeatherImpactFactor(
  date: string,
  locationProfile: LocationProfile
): Promise<{ factor: number; description: string }> {
  try {
    // Get weather data for the date
    const weatherQuery = `
      SELECT 
        temp,
        weather_main,
        weather_description,
        rain_1h,
        snow_1h,
        wind_speed,
        humidity
      FROM weather_data 
      WHERE date = $1 
      ORDER BY hour DESC 
      LIMIT 1
    `;

    const weatherResult = await db.execute(sql.raw(weatherQuery, [date]));
    
    if (weatherResult.rows.length === 0) {
      return { factor: 1.0, description: 'Keine Wetterdaten verfügbar' };
    }

    const weather = weatherResult.rows[0] as any;
    let factor = 1.0;
    let description = '';

    // Temperature impact
    const temp = parseFloat(weather.temp) || 20;
    if (temp > 25) {
      factor += locationProfile.weatherSensitivity * 0.3; // Hot weather increases outdoor sales
      description += `Warmes Wetter (+${Math.round(locationProfile.weatherSensitivity * 30)}%), `;
    } else if (temp < 5) {
      factor -= locationProfile.weatherSensitivity * 0.2; // Cold weather decreases outdoor sales
      description += `Kaltes Wetter (-${Math.round(locationProfile.weatherSensitivity * 20)}%), `;
    }

    // Rain/Snow impact
    const precipitation = parseFloat(weather.rain_1h || '0') + parseFloat(weather.snow_1h || '0');
    if (precipitation > 1) {
      factor -= locationProfile.weatherSensitivity * 0.4; // Rain significantly reduces outdoor sales
      description += `Niederschlag (-${Math.round(locationProfile.weatherSensitivity * 40)}%), `;
    }

    // Wind impact for outdoor locations
    const windSpeed = parseFloat(weather.wind_speed) || 0;
    if (windSpeed > 10 && locationProfile.type === 'outdoor') {
      factor -= 0.15;
      description += 'Starker Wind (-15%), ';
    }

    // Clean up description
    description = description.replace(/, $/, '');
    if (!description) {
      description = `${weather.weather_description || 'Normales Wetter'} (${temp}°C)`;
    }

    return { 
      factor: Math.max(0.2, Math.min(2.0, factor)), // Limit between 20% and 200%
      description 
    };
  } catch (error) {
    console.error('Error calculating weather impact:', error);
    return { factor: 1.0, description: 'Wetterdaten nicht verfügbar' };
  }
}

/**
 * Gets holiday impact factor for a given date and location
 */
export async function getHolidayImpactFactor(
  date: string,
  locationProfile: LocationProfile,
  state: string = 'SN' // Default to Saxony
): Promise<{ factor: number; description: string; isHoliday: boolean }> {
  try {
    // Check calendar overview for holiday information
    const holidayQuery = `
      SELECT 
        is_weekend,
        ${state.toLowerCase()}_is_public_holiday as is_public_holiday,
        ${state.toLowerCase()}_is_school_holiday as is_school_holiday,
        ${state.toLowerCase()}_holiday_name as holiday_name,
        ${state.toLowerCase()}_status as status
      FROM calendar_overview 
      WHERE date = $1
    `;

    const holidayResult = await db.execute(sql.raw(holidayQuery, [date]));
    
    if (holidayResult.rows.length === 0) {
      return { factor: 1.0, description: 'Normaler Werktag', isHoliday: false };
    }

    const holiday = holidayResult.rows[0] as any;
    let factor = 1.0;
    let description = 'Normaler Tag';
    let isHoliday = false;

    // Weekend impact
    if (holiday.is_weekend) {
      factor *= locationProfile.weekendMultiplier;
      description = 'Wochenende';
    }

    // Public holiday impact
    if (holiday.is_public_holiday) {
      factor += locationProfile.holidaySensitivity * 0.5;
      description = holiday.holiday_name || 'Feiertag';
      isHoliday = true;
    }

    // School holiday impact (especially for tourist locations)
    if (holiday.is_school_holiday) {
      if (locationProfile.type === 'tourist') {
        factor += locationProfile.holidaySensitivity * 0.3;
        description += holiday.is_public_holiday ? ' + Schulferien' : 'Schulferien';
      }
      isHoliday = true;
    }

    // Bridge day detection (holiday on Mon/Fri creates long weekend)
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();
    if (holiday.is_public_holiday && (dayOfWeek === 1 || dayOfWeek === 5)) {
      factor += 0.2; // Additional boost for bridge days
      description += ' (Brückentag)';
    }

    return { 
      factor: Math.max(0.3, Math.min(2.5, factor)), // Limit between 30% and 250%
      description,
      isHoliday
    };
  } catch (error) {
    console.error('Error calculating holiday impact:', error);
    return { factor: 1.0, description: 'Normaler Tag', isHoliday: false };
  }
}

/**
 * Calculates baseline demand using historical data, excluding stockout days
 */
export async function calculateBaselineDemand(
  machineId: number,
  productId: string,
  targetDate: string,
  daysBack: number = 30
): Promise<number> {
  try {
    const startDate = format(subDays(new Date(targetDate), daysBack), 'yyyy-MM-dd');
    
    // Get stockout days to exclude
    const stockoutAnalysis = await analyzeStockoutPatterns(machineId, productId, startDate, targetDate);
    
    // Calculate average demand excluding stockout days
    const demandQuery = `
      SELECT 
        AVG(daily_quantity) as avg_demand
      FROM (
        SELECT 
          DATE(datetime) as sale_date,
          SUM(quantity) as daily_quantity
        FROM transactions 
        WHERE machine_id = $1 
          AND product_name = $2
          AND datetime BETWEEN $3 AND $4
          ${stockoutAnalysis.stockoutDays.length > 0 
            ? `AND DATE(datetime) NOT IN (${stockoutAnalysis.stockoutDays.map((_, i) => `$${i + 5}`).join(',')})`
            : ''
          }
        GROUP BY DATE(datetime)
        HAVING SUM(quantity) > 0
      ) daily_sales
    `;

    const params = [machineId, productId, startDate, targetDate, ...stockoutAnalysis.stockoutDays];
    const result = await db.execute(sql.raw(demandQuery, params));
    
    return parseFloat((result.rows[0] as any)?.avg_demand || '0');
  } catch (error) {
    console.error('Error calculating baseline demand:', error);
    return 0;
  }
}

/**
 * Creates enhanced forecasts with detailed explanations
 */
export async function createEnhancedForecast(
  machineId: number,
  productId: string,
  startDate: string,
  endDate: string,
  state: string = 'SN'
): Promise<EnhancedForecastResult> {
  try {
    // Get machine and location info
    const machine = await db.query.machines.findFirst({
      where: eq(machines.id, machineId),
      with: { location: true }
    });

    if (!machine?.location?.id) {
      throw new Error(`Machine ${machineId} or location not found`);
    }

    const locationProfile = await getLocationProfile(machine.location.id);
    const stockoutAnalysis = await analyzeStockoutPatterns(machineId, productId, 
      format(subDays(new Date(startDate), 90), 'yyyy-MM-dd'), startDate);

    const forecasts: ForecastExplanation[] = [];
    const warnings: string[] = [];
    let totalDemand = 0;
    let totalConfidence = 0;

    // Generate daily forecasts
    const dateRange = eachDayOfInterval({
      start: new Date(startDate),
      end: new Date(endDate)
    });

    for (const date of dateRange) {
      const dateStr = format(date, 'yyyy-MM-dd');
      
      // Calculate baseline demand
      const baselineDemand = await calculateBaselineDemand(machineId, productId, dateStr);
      
      // Get weather impact
      const weatherImpact = await getWeatherImpactFactor(dateStr, locationProfile);
      
      // Get holiday impact
      const holidayImpact = await getHolidayImpactFactor(dateStr, locationProfile, state);
      
      // Apply adjustments
      const weatherAdjustment = baselineDemand * (weatherImpact.factor - 1);
      const holidayAdjustment = baselineDemand * (holidayImpact.factor - 1);
      const stockoutCompensation = stockoutAnalysis.recommendedIncrease > 0 
        ? baselineDemand * stockoutAnalysis.recommendedIncrease 
        : 0;

      const finalForecast = Math.max(0, 
        baselineDemand + weatherAdjustment + holidayAdjustment + stockoutCompensation
      );

      // Calculate confidence based on data quality
      let confidence = 0.8;
      if (stockoutAnalysis.stockoutDays.length > 5) confidence -= 0.2;
      if (baselineDemand === 0) confidence -= 0.3;
      if (weatherImpact.factor === 1.0 && holidayImpact.factor === 1.0) confidence += 0.1;
      confidence = Math.max(0.1, Math.min(1.0, confidence));

      // Build explanation
      const factors: string[] = [];
      let explanation = `Für ${machine.location?.name || 'Standort'} am ${format(date, 'dd.MM.yyyy', { locale: de })} `;

      if (holidayImpact.isHoliday) {
        factors.push(`${holidayImpact.description}`);
        explanation += `wird erhöhter Absatz erwartet, da ${holidayImpact.description}. `;
      }

      if (Math.abs(weatherImpact.factor - 1) > 0.1) {
        factors.push(`Wetter: ${weatherImpact.description}`);
        explanation += `Wetter: ${weatherImpact.description}. `;
      }

      if (stockoutCompensation > 0) {
        factors.push(`Ausverkauf-Kompensation (+${Math.round(stockoutAnalysis.recommendedIncrease * 100)}%)`);
        explanation += `Erhöhte Nachbestellung empfohlen aufgrund ${stockoutAnalysis.stockoutDays.length} Ausverkaufstagen. `;
      }

      if (baselineDemand > 0) {
        explanation += `Durchschnittlicher Absatz: ${baselineDemand.toFixed(1)} Stück.`;
      }

      const forecastExplanation: ForecastExplanation = {
        date: dateStr,
        baselineDemand,
        weatherAdjustment,
        holidayAdjustment,
        stockoutCompensation,
        finalForecast,
        factors,
        explanation: explanation.trim(),
        confidence
      };

      forecasts.push(forecastExplanation);
      totalDemand += finalForecast;
      totalConfidence += confidence;
    }

    // Generate warnings
    if (stockoutAnalysis.stockoutDays.length > 2) {
      warnings.push(`Häufige Ausverkaufssituationen (${stockoutAnalysis.stockoutDays.length} Tage) - Lagerbestand erhöhen`);
    }

    if (totalDemand / forecasts.length < 1) {
      warnings.push('Niedrige prognostizierte Nachfrage - Standort überprüfen');
    }

    const highWeatherImpactDays = forecasts.filter(f => Math.abs(f.weatherAdjustment) > f.baselineDemand * 0.3);
    if (highWeatherImpactDays.length > forecasts.length * 0.3) {
      warnings.push('Hohe Wetterabhängigkeit - kurzfristige Anpassungen empfohlen');
    }

    return {
      machineId,
      locationId: machine.location?.id || 0,
      productId,
      forecasts,
      totalDemand,
      averageConfidence: totalConfidence / forecasts.length,
      warnings
    };
  } catch (error) {
    console.error('Error creating enhanced forecast:', error);
    throw error;
  }
}

/**
 * Saves enhanced forecast to database
 */
export async function saveEnhancedForecast(
  modelId: number,
  enhancedForecast: EnhancedForecastResult
): Promise<void> {
  try {
    const forecastsToSave = enhancedForecast.forecasts.map(forecast => ({
      model_id: modelId,
      forecast_date: forecast.date,
      machine_id: enhancedForecast.machineId,
      location_id: enhancedForecast.locationId,
      product_id: enhancedForecast.productId,
      predicted_quantity: Math.round(forecast.finalForecast),
      confidence: forecast.confidence,
      lower_bound: Math.max(0, Math.round(forecast.finalForecast * 0.7)),
      upper_bound: Math.round(forecast.finalForecast * 1.3),
      weather_summary: forecast.factors.find(f => f.includes('Wetter:')) || null,
      is_holiday: forecast.factors.some(f => f.includes('Feiertag') || f.includes('Ferien')),
      holiday_name: forecast.factors.find(f => f.includes('Feiertag') || f.includes('Ferien')) || null,
      features: JSON.stringify({
        explanation: forecast.explanation,
        factors: forecast.factors,
        baselineDemand: forecast.baselineDemand,
        weatherAdjustment: forecast.weatherAdjustment,
        holidayAdjustment: forecast.holidayAdjustment,
        stockoutCompensation: forecast.stockoutCompensation
      })
    }));

    await db.insert(forecasts).values(forecastsToSave);
    console.log(`Saved ${forecastsToSave.length} enhanced forecasts for machine ${enhancedForecast.machineId}`);
  } catch (error) {
    console.error('Error saving enhanced forecast:', error);
    throw error;
  }
}

/**
 * Gets comprehensive forecast dashboard data
 */
export async function getForecastDashboard(
  warehouseId?: number,
  dateRange: number = 7
): Promise<{
  forecasts: EnhancedForecastResult[];
  summary: {
    totalMachines: number;
    averageConfidence: number;
    highDemandDays: number;
    totalWarnings: number;
  };
  warnings: string[];
}> {
  try {
    const startDate = format(new Date(), 'yyyy-MM-dd');
    const endDate = format(addDays(new Date(), dateRange), 'yyyy-MM-dd');

    // Get machines to forecast - using raw SQL for flexibility
    let machinesQuery = `
      SELECT m.id, m.name, m.location_id, l.name as location_name
      FROM machines m
      LEFT JOIN locations l ON m.location_id = l.id
      WHERE 1=1
    `;
    const queryParams: any[] = [];
    
    if (warehouseId) {
      machinesQuery += ` AND m.warehouse_id = $1`;
      queryParams.push(warehouseId);
    }
    
    machinesQuery += ` ORDER BY m.name`;

    const machinesResult = await db.execute(sql.raw(machinesQuery, queryParams));
    const machinesList = machinesResult.rows as any[];
    const forecasts: EnhancedForecastResult[] = [];
    const allWarnings: string[] = [];

    // Generate forecasts for each machine's top products
    for (const machine of machinesList) {
      // Get top 3 products for this machine
      const topProductsQuery = `
        SELECT 
          product_name,
          SUM(quantity) as total_sales
        FROM transactions 
        WHERE machine_id = $1 
          AND datetime >= NOW() - INTERVAL '30 days'
        GROUP BY product_name
        ORDER BY total_sales DESC
        LIMIT 3
      `;

      const topProductsResult = await db.execute(sql.raw(topProductsQuery, [machine.id]));
      
      for (const product of topProductsResult.rows) {
        const productData = product as any;
        if (productData.product_name) {
          try {
            const forecast = await createEnhancedForecast(
              machine.id,
              productData.product_name,
              startDate,
              endDate
            );
            forecasts.push(forecast);
            allWarnings.push(...forecast.warnings);
          } catch (error) {
            console.error(`Error creating forecast for machine ${machine.id}, product ${productData.product_name}:`, error);
          }
        }
      }
    }

    // Calculate summary
    const summary = {
      totalMachines: machinesList.length,
      averageConfidence: forecasts.length > 0 
        ? forecasts.reduce((sum, f) => sum + f.averageConfidence, 0) / forecasts.length 
        : 0,
      highDemandDays: forecasts.reduce((sum, f) => 
        sum + f.forecasts.filter(day => day.finalForecast > day.baselineDemand * 1.3).length, 0),
      totalWarnings: allWarnings.length
    };

    return {
      forecasts,
      summary,
      warnings: Array.from(new Set(allWarnings)) // Remove duplicates
    };
  } catch (error) {
    console.error('Error generating forecast dashboard:', error);
    throw error;
  }
}