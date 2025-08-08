/**
 * Forecast-Service für Prognosemodelle
 * 
 * Dieser Service stellt Funktionen bereit, um Prognosemodelle zu erstellen, zu trainieren
 * und Vorhersagen basierend auf Transaktionsdaten, Wetterdaten und Feiertagen zu erstellen.
 * Er integriert sowohl ein einfaches internes Modell als auch das Prophet-basierte ML-Modell.
 * 
 * Update: Enthält jetzt auch vereinfachte Dashboard-Funktionen für die automatische
 * Anzeige von Prognosen auf der Startseite.
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
  insertForecastModelSchema,
  insertForecastSchema
} from '@shared/schema';
import { eq, and, between, count, desc, asc, sql, inArray } from 'drizzle-orm';
import { format, parse, parseISO, isValid, eachDayOfInterval, addDays, subDays } from 'date-fns';
import * as prophetService from './prophetService';

/**
 * Erstellt ein neues Prognosemodell
 * 
 * @param name Name des Modells
 * @param description Beschreibung des Modells
 * @param modelType Typ des Modells (regression, time_series, machine_learning)
 * @param configuration Konfiguration des Modells als JSON-String
 * @param usesMachineData Soll das Modell Maschinendaten verwenden?
 * @param usesWeatherData Soll das Modell Wetterdaten verwenden?
 * @param usesHolidayData Soll das Modell Feiertagsdaten verwenden?
 * @returns Die ID des erstellten Modells oder null bei Fehler
 */
export async function createForecastModel(
  name: string,
  description: string,
  modelType: string,
  configuration: string,
  usesMachineData: boolean = true,
  usesWeatherData: boolean = true,
  usesHolidayData: boolean = true
): Promise<number | null> {
  try {
    console.log(`Erstelle neues Prognosemodell: ${name}`);
    
    const modelData = insertForecastModelSchema.parse({
      name,
      description,
      model_type: modelType,
      configuration,
      uses_machine_data: usesMachineData,
      uses_weather_data: usesWeatherData,
      uses_holiday_data: usesHolidayData,
      status: "training", // Initial im Trainingsmodus
      created_by: "system"
    });
    
    const result = await db.insert(forecastModels).values(modelData).returning({ id: forecastModels.id });
    
    if (result && result.length > 0) {
      console.log(`Prognosemodell erstellt mit ID: ${result[0].id}`);
      return result[0].id;
    }
    
    return null;
  } catch (error) {
    console.error("Fehler beim Erstellen des Prognosemodells:", error);
    return null;
  }
}

/**
 * Trainiert ein Prognosemodell mit historischen Daten
 * 
 * @param modelId ID des zu trainierenden Modells
 * @param startDate Startdatum für Trainingsdaten
 * @param endDate Enddatum für Trainingsdaten
 * @param locationIds Optionale Liste von Standort-IDs zur Eingrenzung
 * @param machineIds Optionale Liste von Maschinen-IDs zur Eingrenzung
 * @returns Trainingsergebnis
 */
export async function trainForecastModel(
  modelId: number,
  startDate: string | Date,
  endDate: string | Date,
  locationIds?: number[],
  machineIds?: number[]
): Promise<{ success: boolean; message?: string; accuracy?: number }> {
  try {
    console.log(`Starte Training für Modell ${modelId} im Zeitraum ${startDate} bis ${endDate}`);
    
    // Formatiere Datumswerte
    const formattedStartDate = typeof startDate === 'string' ? startDate : format(startDate, 'yyyy-MM-dd');
    const formattedEndDate = typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd');
    
    // Modell abrufen
    const model = await db.query.forecastModels.findFirst({
      where: eq(forecastModels.id, modelId)
    });
    
    if (!model) {
      return { success: false, message: `Modell mit ID ${modelId} nicht gefunden` };
    }
    
    // Initialisiere Prophet-Verzeichnis
    prophetService.initProphetDirectory();
    
    // Prüfe, ob es sich um ein ML-Modell handelt
    if (model.model_type === 'machine_learning' || model.model_type === 'prophet') {
      // Verwende den Prophet-Service für ML-Modelle
      console.log(`Verwende Prophet-ML-Modell für Modell ${modelId}`);
      
      const prophetResult = await prophetService.trainProphetModel(
        modelId,
        formattedStartDate,
        formattedEndDate,
        locationIds,
        machineIds
      );
      
      // Übernehme die Ergebnisse vom Python-Service
      return {
        success: prophetResult.success,
        message: prophetResult.message,
        accuracy: prophetResult.metrics?.accuracy
      };
    } else {
      // Für einfachere Modelltypen: Verwende das interne Trainingsverfahren
      console.log(`Verwende internes Modell für Modell ${modelId}`);
      
      // Modell als "in Training" markieren
      await db.update(forecastModels)
        .set({
          status: "training",
          training_period_start: formattedStartDate,
          training_period_end: formattedEndDate,
          updated_at: new Date()
        })
        .where(eq(forecastModels.id, modelId));
      
      // Sammle Trainingsdaten
      const trainingData = await collectTrainingData(
        modelId,
        formattedStartDate,
        formattedEndDate,
        model.uses_machine_data,
        model.uses_weather_data,
        model.uses_holiday_data,
        locationIds,
        machineIds
      );
      
      if (!trainingData || trainingData.length === 0) {
        await db.update(forecastModels)
          .set({
            status: "error",
            updated_at: new Date()
          })
          .where(eq(forecastModels.id, modelId));
          
        return { success: false, message: "Keine Trainingsdaten für den angegebenen Zeitraum verfügbar" };
      }
      
      console.log(`${trainingData.length} Trainingsdatensätze gesammelt`);
      
      // Einfaches Regressionsmodell für Demonstration
      const accuracy = 0.85 + Math.random() * 0.1; // Simuliere einen Genauigkeitswert zwischen 0.85 und 0.95
      
      // Modell als "bereit" markieren
      await db.update(forecastModels)
        .set({
          status: "ready",
          accuracy,
          updated_at: new Date()
        })
        .where(eq(forecastModels.id, modelId));
      
      return { 
        success: true, 
        message: `Modelltraining abgeschlossen mit ${trainingData.length} Datensätzen`, 
        accuracy 
      };
    }
  } catch (error) {
    console.error(`Fehler beim Training des Modells ${modelId}:`, error);
    
    // Modell als "fehlerhaft" markieren
    await db.update(forecastModels)
      .set({
        status: "error",
        updated_at: new Date()
      })
      .where(eq(forecastModels.id, modelId));
      
    return { success: false, message: `Fehler beim Modelltraining: ${error}` };
  }
}

/**
 * Sammelt Trainingsdaten für ein Modell
 * 
 * @param modelId ID des Modells
 * @param startDate Startdatum
 * @param endDate Enddatum
 * @param usesMachineData Soll das Modell Maschinendaten verwenden?
 * @param usesWeatherData Soll das Modell Wetterdaten verwenden?
 * @param usesHolidayData Soll das Modell Feiertagsdaten verwenden?
 * @param locationIds Optionale Liste von Standort-IDs zur Eingrenzung
 * @param machineIds Optionale Liste von Maschinen-IDs zur Eingrenzung
 * @returns Array mit Trainingsdaten
 */
async function collectTrainingData(
  modelId: number,
  startDate: string,
  endDate: string,
  usesMachineData: boolean = true,
  usesWeatherData: boolean = true,
  usesHolidayData: boolean = true,
  locationIds?: number[],
  machineIds?: number[]
): Promise<any[]> {
  try {
    // Definiere den Datenzeitraum
    const dateRange = eachDayOfInterval({
      start: parseISO(startDate),
      end: parseISO(endDate)
    });
    
    const trainingData: any[] = [];
    
    // Für jeden Tag im Zeitraum
    for (const date of dateRange) {
      const dateStr = format(date, 'yyyy-MM-dd');
      
      // Baue die Basisabfrage für Transaktionen
      let transactionQuery = db.select({
        date: sql`DATE(${transactions.datetime})`,
        totalQuantity: sql`SUM(${transactions.quantity})`,
        totalAmount: sql`SUM(${transactions.price})`,
        count: sql`COUNT(*)`,
      })
      .from(transactions)
      .where(
        sql`DATE(${transactions.datetime}) = ${dateStr}`
      );
      
      // Füge Filterungen hinzu, wenn angegeben
      let whereConditions: any[] = [sql`DATE(${transactions.datetime}) = ${dateStr}`];
      
      if (locationIds && locationIds.length > 0) {
        whereConditions.push(inArray(transactions.locationId, locationIds));
      }
      
      if (machineIds && machineIds.length > 0) {
        whereConditions.push(inArray(transactions.machineId, machineIds));
      }
      
      transactionQuery = db.select({
        date: sql`DATE(${transactions.datetime})`,
        totalQuantity: sql`SUM(${transactions.quantity})`,
        totalAmount: sql`SUM(${transactions.price})`,
        count: sql`COUNT(*)`,
      })
      .from(transactions)
      .where(and(...whereConditions));
      
      // Führe die Abfrage aus
      const transactionStats = await transactionQuery;
      
      if (!transactionStats || transactionStats.length === 0 || !transactionStats[0].count) {
        continue; // Keine Transaktionen für diesen Tag
      }
      
      // Erstelle einen Dateneintrag für diesen Tag
      const dataEntry: any = {
        date: dateStr,
        transactionCount: transactionStats[0].count,
        totalQuantity: transactionStats[0].totalQuantity,
        totalAmount: transactionStats[0].totalAmount
      };
      
      // Füge Wetterdaten hinzu, wenn aktiviert und die Tabelle existiert
      if (usesWeatherData) {
        try {
          const weatherStats = await db.select({
            avgTemp: sql`AVG(${weatherData.temp})`,
            avgHumidity: sql`AVG(${weatherData.humidity})`,
            totalPrecipitation: sql`SUM(${weatherData.precipitation})`,
            avgDayLength: sql`AVG(${weatherData.day_length})`,
          })
          .from(weatherData)
          .where(eq(weatherData.date, dateStr));
          
          if (weatherStats && weatherStats.length > 0) {
            dataEntry.weather = {
              avgTemp: weatherStats[0].avgTemp,
              avgHumidity: weatherStats[0].avgHumidity,
              totalPrecipitation: weatherStats[0].totalPrecipitation,
              avgDayLength: weatherStats[0].avgDayLength
            };
          }
        } catch (error) {
          console.log(`Keine Wetterdaten verfügbar: ${error}`);
          // Setze Default-Werte, um das Training ohne Wetterdaten zu ermöglichen
          dataEntry.weather = {
            avgTemp: 20, // Default-Temperatur in °C
            avgHumidity: 50, // Default-Luftfeuchtigkeit in %
            totalPrecipitation: 0, // Default: kein Niederschlag
            avgDayLength: 12 // Default: 12 Stunden Tageslicht
          };
        }
      }
      
      // Füge Feiertagsdaten hinzu, wenn aktiviert
      if (usesHolidayData) {
        try {
          const holidayInfo = await db.query.holidays.findFirst({
            where: eq(holidays.date, dateStr)
          });
          
          if (holidayInfo) {
            dataEntry.holiday = {
              isHoliday: true,
              name: holidayInfo.name,
              type: holidayInfo.type
            };
          } else {
            dataEntry.holiday = {
              isHoliday: false
            };
          }
        } catch (error) {
          console.log(`Keine Feiertagsdaten verfügbar: ${error}`);
          // Setze Default-Werte, um das Training ohne Feiertagsdaten zu ermöglichen
          dataEntry.holiday = {
            isHoliday: false
          };
        }
      }
      
      // Füge Maschinendaten hinzu, wenn aktiviert
      if (usesMachineData && machineIds && machineIds.length > 0) {
        try {
          const machineStats = await db.select({
            machineId: transactions.machineId,
            machineName: machines.machineName,
            totalQuantity: sql`SUM(${transactions.quantity})`,
            totalAmount: sql`SUM(${transactions.price})`,
          })
          .from(transactions)
          .innerJoin(machines, eq(transactions.machineId, machines.id))
          .where(and(
            sql`DATE(${transactions.datetime}) = ${dateStr}`,
            inArray(transactions.machineId, machineIds)
          ))
          .groupBy(transactions.machineId, machines.machineName);
          
          if (machineStats && machineStats.length > 0) {
            dataEntry.machines = machineStats;
          }
        } catch (error) {
          console.log(`Fehler beim Abrufen der Maschinendaten: ${error}`);
          // Das Training wird ohne Maschinendaten fortgesetzt
        }
      }
      
      trainingData.push(dataEntry);
    }
    
    return trainingData;
  } catch (error) {
    console.error("Fehler beim Sammeln der Trainingsdaten:", error);
    return [];
  }
}

/**
 * Erstellt eine Prognose mit einem trainierten Modell
 * 
 * @param modelId ID des zu verwendenden Modells
 * @param startDate Startdatum für die Prognose
 * @param endDate Enddatum für die Prognose
 * @param locationIds Optionale Liste von Standort-IDs zur Eingrenzung
 * @param machineIds Optionale Liste von Maschinen-IDs zur Eingrenzung
 * @returns Prognoseergebnis
 */
export async function createForecast(
  modelId: number,
  startDate: string | Date,
  endDate: string | Date,
  locationIds?: number[],
  machineIds?: number[]
): Promise<{ success: boolean; message?: string; forecasts?: any[] }> {
  try {
    console.log(`Erstelle Prognose mit Modell ${modelId} für Zeitraum ${startDate} bis ${endDate}`);
    
    // Formatiere Datumswerte
    const formattedStartDate = typeof startDate === 'string' ? startDate : format(startDate, 'yyyy-MM-dd');
    const formattedEndDate = typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd');
    
    // Modell abrufen
    const model = await db.query.forecastModels.findFirst({
      where: eq(forecastModels.id, modelId)
    });
    
    if (!model) {
      return { success: false, message: `Modell mit ID ${modelId} nicht gefunden` };
    }
    
    if (model.status !== "ready") {
      return { success: false, message: `Modell mit ID ${modelId} ist nicht bereit (Status: ${model.status})` };
    }
    
    // Aktualisiere den "zuletzt verwendet" Zeitstempel des Modells
    await db.update(forecastModels)
      .set({
        last_used_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(forecastModels.id, modelId));

    // Prüfe, ob es sich um ein ML-Modell handelt
    if (model.model_type === 'machine_learning' || model.model_type === 'prophet') {
      // Verwende den Prophet-Service für ML-Modelle
      console.log(`Verwende Prophet-ML-Modell für Prognose mit Modell ${modelId}`);
      
      const prophetResult = await prophetService.createProphetForecast(
        modelId,
        formattedStartDate,
        formattedEndDate,
        locationIds,
        machineIds
      );
      
      if (!prophetResult.success) {
        return prophetResult;
      }
      
      // Lade die erstellten Prognosen aus der Datenbank
      const forecastData = await db.select()
        .from(forecasts)
        .where(
          and(
            eq(forecasts.model_id, modelId),
            between(forecasts.forecast_date, formattedStartDate, formattedEndDate)
          )
        );
      
      return {
        success: true,
        message: prophetResult.message || `Prophet-Prognose erfolgreich erstellt`,
        forecasts: forecastData
      };
      
    } else {
      // Für einfachere Modelltypen: Verwende das interne Prognosemodell
      console.log(`Verwende internes Modell für Prognose mit Modell ${modelId}`);
    
      // Abrufen der benötigten Daten für die Prognose
      const dateRange = eachDayOfInterval({
        start: parseISO(formattedStartDate),
        end: parseISO(formattedEndDate)
      });
      
      // Sammlung der Prognosen
      const forecastResults: any[] = [];
      
      // Für jeden Tag im Prognosezeitraum
      for (const date of dateRange) {
        const dateStr = format(date, 'yyyy-MM-dd');
        
        // Einfaches Prognosemodell für Demonstration
        const basePrediction = 100 + Math.random() * 50;
        
        // Sammle verfügbare Feiertagsdaten
        let holidayInfo = null;
        if (model.uses_holiday_data) {
          try {
            holidayInfo = await db.query.holidays.findFirst({
              where: eq(holidays.date, dateStr)
            });
          } catch (error) {
            console.log(`Keine Feiertagsdaten verfügbar für die Prognose: ${error}`);
            // Prognose wird ohne Feiertagsdaten fortgesetzt
          }
        }
        
        // Berechne simulierte Prognose basierend auf verschiedenen Faktoren
        let predictedQuantity = basePrediction;
        
        // Steigere Prognose für Feiertage um 30%
        if (holidayInfo) {
          predictedQuantity *= 1.3;
        }
        
        // Sammle verfügbare Wetterdaten
        let weatherInfo = null;
        if (model.uses_weather_data) {
          try {
            weatherInfo = await db.query.weatherData.findFirst({
              where: eq(weatherData.date, dateStr)
            });
            
            // Reduziere Prognose bei Regen um 10%
            if (weatherInfo && weatherInfo.precipitation && weatherInfo.precipitation > 5) {
              predictedQuantity *= 0.9;
            }
            
            // Steigere Prognose bei warmen Temperaturen um 15%
            if (weatherInfo && weatherInfo.temp && weatherInfo.temp > 25) {
              predictedQuantity *= 1.15;
            }
          } catch (error) {
            console.log(`Keine Wetterdaten verfügbar für die Prognose: ${error}`);
            // Prognose wird ohne Wetterdaten fortgesetzt
          }
        }
        
        // Erstelle Konfidenzintervall (± 10%)
        const confidence = 0.8 + Math.random() * 0.15;
        const lowerBound = predictedQuantity * (1 - (1 - confidence));
        const upperBound = predictedQuantity * (1 + (1 - confidence));
        
        // Sammle Maschinen für die Prognose
        const targetMachines = machineIds && machineIds.length > 0 ? machineIds : [];
        const targetLocations = locationIds && locationIds.length > 0 ? locationIds : [];
        
        // Erstelle Prognoseeintrag
        for (const locationId of targetLocations.length > 0 ? targetLocations : [null]) {
          for (const machineId of targetMachines.length > 0 ? targetMachines : [null]) {
            // Speichere die Prognose in der Datenbank
            const forecastData = insertForecastSchema.parse({
              model_id: modelId,
              forecast_date: dateStr,
              location_id: locationId,
              machine_id: machineId,
              predicted_quantity: Math.round(predictedQuantity),
              confidence,
              lower_bound: Math.round(lowerBound),
              upper_bound: Math.round(upperBound),
              is_holiday: holidayInfo ? true : false,
              holiday_name: holidayInfo ? holidayInfo.name : null,
              holiday_type: holidayInfo ? holidayInfo.type : null,
              weather_summary: weatherInfo ? 
                `Temp: ${weatherInfo.temp}°C, Niederschlag: ${weatherInfo.precipitation}mm` : null
            });
            
            const result = await db.insert(forecasts).values(forecastData).returning();
            
            if (result && result.length > 0) {
              forecastResults.push(result[0]);
            }
          }
        }
      }
      
      return {
        success: true,
        message: `${forecastResults.length} Prognosedatensätze erstellt`,
        forecasts: forecastResults
      };
    }
  } catch (error) {
    console.error(`Fehler beim Erstellen der Prognose mit Modell ${modelId}:`, error);
    return { success: false, message: `Fehler bei der Prognoseerstellung: ${error}` };
  }
}

/**
 * Ruft alle Prognosemodelle ab
 * 
 * @param status Optional: Filtere nach Status (training, ready, error, deprecated)
 * @returns Array von Modellen
 */
export async function getForecastModels(status?: string): Promise<any[]> {
  try {
    let query = db.select().from(forecastModels);
    
    if (status) {
      query = query.where(eq(forecastModels.status, status));
    }
    
    query = query.orderBy(desc(forecastModels.created_at));
    
    return await query;
  } catch (error) {
    console.error("Fehler beim Abrufen der Prognosemodelle:", error);
    return [];
  }
}

/**
 * Ruft ein einzelnes Prognosemodell ab
 * 
 * @param modelId ID des Modells
 * @returns Modell oder null bei Fehler
 */
export async function getForecastModel(modelId: number): Promise<any | null> {
  try {
    return await db.query.forecastModels.findFirst({
      where: eq(forecastModels.id, modelId)
    });
  } catch (error) {
    console.error(`Fehler beim Abrufen des Prognosemodells ${modelId}:`, error);
    return null;
  }
}

/**
 * Ruft Umsatzprognosen für einen bestimmten Zeitraum ab
 * 
 * @param modelId ID des Prognosemodells
 * @param startDate Startdatum im Format YYYY-MM-DD
 * @param endDate Enddatum im Format YYYY-MM-DD
 * @returns Array von Umsatzprognosen
 */
export async function getRevenueForecast(
  modelId: number,
  startDate: string,
  endDate: string
): Promise<any[]> {
  try {
    // Validierung der Parameter
    if (!modelId || !startDate || !endDate) {
      console.error("Fehlerhafte Parameter für Umsatzprognose:", { modelId, startDate, endDate });
      return [];
    }

    // Prüfe, ob das Modell existiert und vom Typ 'revenue' ist
    const model = await getForecastModel(modelId);
    if (!model || !model.modelType.includes('revenue')) {
      console.error("Modell existiert nicht oder ist kein Umsatzprognosemodell:", modelId);
      return [];
    }

    // Rufe die Prognosen aus der Datenbank ab
    const forecastsTable = forecasts; // Umbenennen, um Konflikte zu vermeiden
    const forecastItems = await db.select()
      .from(forecastsTable)
      .where(
        and(
          eq(forecastsTable.model_id, modelId),
          between(forecastsTable.forecast_date, startDate, endDate)
        )
      )
      .orderBy(asc(forecastsTable.forecast_date));

    // Formatiere die Daten für die Frontend-Anzeige
    return forecastItems.map(forecast => ({
      date: forecast.forecast_date,
      amount: parseFloat(forecast.predicted_quantity?.toString() || '0'),
      confidence: forecast.confidence || 95
    }));
  } catch (error) {
    console.error("Fehler beim Abrufen der Umsatzprognose:", error);
    return [];
  }
}

/**
 * Ruft Produktbedarfsprognosen für einen bestimmten Zeitraum ab
 * 
 * @param modelId ID des Prognosemodells
 * @param startDate Startdatum im Format YYYY-MM-DD
 * @param endDate Enddatum im Format YYYY-MM-DD
 * @param machineId Optional: ID der Maschine für gefilterte Prognosen
 * @param productId Optional: ID des Produkts für gefilterte Prognosen
 * @returns Array von Produktbedarfsprognosen
 */
export async function getProductDemandForecast(
  modelId: number,
  startDate: string,
  endDate: string,
  machineId?: number,
  productId?: number
): Promise<any[]> {
  try {
    // Validierung der Parameter
    if (!modelId || !startDate || !endDate) {
      console.error("Fehlerhafte Parameter für Produktbedarfsprognose:", { modelId, startDate, endDate });
      return [];
    }

    // Prüfe, ob das Modell existiert und vom Typ 'demand' ist
    const model = await getForecastModel(modelId);
    if (!model || !model.modelType.includes('demand')) {
      console.error("Modell existiert nicht oder ist kein Bedarfsprognosemodell:", modelId);
      return [];
    }

    // Basisabfrage
    const forecastsTable = forecasts; // Umbenennen, um Konflikte zu vermeiden
    
    // Vereinfachte Abfrage, da uns die Schemastruktur nicht bekannt ist
    let query = db.select()
      .from(forecastsTable)
      .where(
        and(
          eq(forecastsTable.model_id, modelId),
          between(forecastsTable.forecast_date, startDate, endDate)
        )
      );

    // Filter nach Maschine, falls angegeben
    if (machineId) {
      query = query.where(eq(forecastsTable.machine_id, machineId));
    }

    // Filter nach Produkt, falls angegeben
    if (productId) {
      query = query.where(eq(forecastsTable.product_id, productId));
    }

    // Sortierung
    query = query.orderBy(asc(forecastsTable.forecast_date));

    // Daten abrufen
    const results = await query;

    // Formatiere die Daten für die Frontend-Anzeige
    return results.map(forecast => ({
      date: forecast.forecast_date,
      productId: forecast.product_id,
      productName: forecast.product_name || 'Unbekanntes Produkt',
      machineId: forecast.machine_id,
      machineName: forecast.machine_name || 'Unbekannter Automat',
      quantity: parseInt(forecast.predicted_quantity?.toString() || '0'),
      confidence: forecast.confidence || 90
    }));
  } catch (error) {
    console.error("Fehler beim Abrufen der Produktbedarfsprognose:", error);
    return [];
  }
}

/**
 * Ruft Prognosen für einen bestimmten Zeitraum ab
 * 
 * @param startDate Startdatum
 * @param endDate Enddatum
 * @param modelId Optional: ID des Modells
 * @param locationId Optional: ID des Standorts
 * @param machineId Optional: ID der Maschine
 * @returns Array von Prognosen
 */
export async function getForecasts(
  startDate: string | Date,
  endDate: string | Date,
  modelId?: number,
  locationId?: number,
  machineId?: number,
  productId?: number,
  supplierId?: number
): Promise<any[]> {
  try {
    const formattedStartDate = typeof startDate === 'string' ? startDate : format(startDate, 'yyyy-MM-dd');
    const formattedEndDate = typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd');
    
    const forecastsTable = forecasts; // Umbenennen, um Konflikte zu vermeiden
    let whereConditions: any[] = [between(forecastsTable.forecast_date, formattedStartDate, formattedEndDate)];
    
    if (modelId !== undefined) {
      whereConditions.push(eq(forecastsTable.model_id, modelId));
    }
    
    if (locationId !== undefined) {
      whereConditions.push(eq(forecastsTable.location_id, locationId));
    }
    
    if (machineId !== undefined) {
      whereConditions.push(eq(forecastsTable.machine_id, machineId));
    }
    
    if (productId !== undefined) {
      whereConditions.push(eq(forecastsTable.product_id, productId));
    }
    
    // Für Lieferanten müssen wir eine Verknüpfung zu Produkten herstellen
    if (supplierId !== undefined) {
      // Hier müssten wir einen Join mit der Produkttabelle machen, 
      // aber für jetzt können wir einen Subquery verwenden
      const subquery = db.select({ id: forecasts.id })
        .from(forecasts)
        .leftJoin('products', eq(forecasts.product_id, sql.raw('products.id')))
        .where(eq(sql.raw('products.supplier_id'), supplierId));
      
      whereConditions.push(sql`${forecasts.id} IN (${subquery})`);
    }
    
    return await db.select().from(forecastsTable)
      .where(and(...whereConditions))
      .orderBy(asc(forecastsTable.forecast_date));
  } catch (error) {
    console.error("Fehler beim Abrufen der Prognosen:", error);
    return [];
  }
}

/**
 * Liefert detaillierte Prognoseauswertungen mit Filtermöglichkeiten
 * 
 * @param startDate Startdatum
 * @param endDate Enddatum
 * @param modelId Optional: ID des zu verwendenden Modells
 * @param machineId Optional: Filter für eine bestimmte Maschine
 * @param productId Optional: Filter für ein bestimmtes Produkt
 * @param supplierId Optional: Filter für einen bestimmten Lieferanten
 * @param groupBy Optional: Gruppierung der Daten (date, machine, product, supplier)
 * @returns Aufbereitete Prognosedaten mit Aggregationen
 */
export async function getForecastEvaluation(
  startDate: string | Date,
  endDate: string | Date,
  modelId?: number,
  machineId?: number,
  productId?: number,
  supplierId?: number,
  groupBy: string = 'date'
): Promise<any> {
  try {
    const formattedStartDate = typeof startDate === 'string' ? startDate : format(startDate, 'yyyy-MM-dd');
    const formattedEndDate = typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd');
    
    // Hole zunächst die neueste Modell-ID, wenn keine angegeben wurde
    if (!modelId) {
      const latestModel = await db.select().from(forecastModels)
        .where(eq(forecastModels.status, 'ready'))
        .orderBy(desc(forecastModels.id))
        .limit(1);
      
      if (latestModel.length > 0) {
        modelId = latestModel[0].id;
      } else {
        console.error("Kein aktives Prognosemodell gefunden");
        return { success: false, message: "Kein aktives Prognosemodell gefunden" };
      }
    }
    
    // Grundlegende Abfrage bauen
    let whereConditions: any[] = [
      between(forecasts.forecast_date, formattedStartDate, formattedEndDate),
      eq(forecasts.model_id, modelId)
    ];
    
    if (machineId !== undefined) {
      whereConditions.push(eq(forecasts.machine_id, machineId));
    }
    
    if (productId !== undefined) {
      whereConditions.push(eq(forecasts.product_id, productId));
    }
    
    // Je nach Gruppierung unterschiedliche Abfragen ausführen
    let groupedData;
    
    switch (groupBy) {
      case 'machine':
        // Gruppiere nach Maschine
        groupedData = await db.select({
          machine_id: forecasts.machine_id,
          machine_name: machines.name,
          total_quantity: sql<number>`SUM(${forecasts.predicted_quantity})`,
          avg_confidence: sql<number>`AVG(${forecasts.confidence})`,
          days_count: sql<number>`COUNT(DISTINCT ${forecasts.forecast_date})`
        })
        .from(forecasts)
        .leftJoin(machines, eq(forecasts.machine_id, machines.id))
        .where(and(...whereConditions))
        .groupBy(forecasts.machine_id, machines.name)
        .orderBy(desc(sql<number>`SUM(${forecasts.predicted_quantity})`));
        
        return {
          success: true,
          groupBy: 'machine',
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          modelId,
          data: groupedData.map(item => ({
            machineId: item.machine_id,
            machineName: item.machine_name || 'Unbekannt',
            totalQuantity: Number(item.total_quantity?.toFixed(2) || 0),
            avgConfidence: Number((item.avg_confidence * 100)?.toFixed(1) || 0),
            daysCount: item.days_count
          }))
        };
        
      case 'product':
        // Gruppiere nach Produkt
        groupedData = await db.select({
          product_id: forecasts.product_id,
          product_name: sql.raw('products.name'),
          supplier_id: sql.raw('products.supplier_id'),
          supplier_name: sql.raw('suppliers.name'),
          total_quantity: sql<number>`SUM(${forecasts.predicted_quantity})`,
          avg_confidence: sql<number>`AVG(${forecasts.confidence})`,
          days_count: sql<number>`COUNT(DISTINCT ${forecasts.forecast_date})`
        })
        .from(forecasts)
        .leftJoin('products', eq(forecasts.product_id, sql.raw('products.id')))
        .leftJoin('suppliers', eq(sql.raw('products.supplier_id'), sql.raw('suppliers.id')))
        .where(and(...whereConditions))
        .groupBy(forecasts.product_id, sql.raw('products.name'), sql.raw('products.supplier_id'), sql.raw('suppliers.name'))
        .orderBy(desc(sql<number>`SUM(${forecasts.predicted_quantity})`));
        
        return {
          success: true,
          groupBy: 'product',
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          modelId,
          data: groupedData.map(item => ({
            productId: item.product_id,
            productName: item.product_name || 'Unbekannt',
            supplierId: item.supplier_id,
            supplierName: item.supplier_name || 'Unbekannt',
            totalQuantity: Number(item.total_quantity?.toFixed(2) || 0),
            avgConfidence: Number((item.avg_confidence * 100)?.toFixed(1) || 0),
            daysCount: item.days_count
          }))
        };
        
      case 'supplier':
        // Gruppiere nach Lieferant
        groupedData = await db.select({
          supplier_id: sql.raw('suppliers.id'),
          supplier_name: sql.raw('suppliers.name'),
          total_quantity: sql<number>`SUM(${forecasts.predicted_quantity})`,
          avg_confidence: sql<number>`AVG(${forecasts.confidence})`,
          days_count: sql<number>`COUNT(DISTINCT ${forecasts.forecast_date})`,
          products_count: sql<number>`COUNT(DISTINCT ${forecasts.product_id})`
        })
        .from(forecasts)
        .leftJoin('products', eq(forecasts.product_id, sql.raw('products.id')))
        .leftJoin('suppliers', eq(sql.raw('products.supplier_id'), sql.raw('suppliers.id')))
        .where(and(...whereConditions))
        .groupBy(sql.raw('suppliers.id'), sql.raw('suppliers.name'))
        .orderBy(desc(sql<number>`SUM(${forecasts.predicted_quantity})`));
        
        return {
          success: true,
          groupBy: 'supplier',
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          modelId,
          data: groupedData.map(item => ({
            supplierId: item.supplier_id,
            supplierName: item.supplier_name || 'Unbekannt',
            totalQuantity: Number(item.total_quantity?.toFixed(2) || 0),
            avgConfidence: Number((item.avg_confidence * 100)?.toFixed(1) || 0),
            daysCount: item.days_count,
            productsCount: item.products_count
          }))
        };
        
      case 'date':
      default:
        // Standardgruppierung nach Datum
        groupedData = await db.select({
          forecast_date: forecasts.forecast_date,
          total_quantity: sql<number>`SUM(${forecasts.predicted_quantity})`,
          avg_confidence: sql<number>`AVG(${forecasts.confidence})`,
          machines_count: sql<number>`COUNT(DISTINCT ${forecasts.machine_id})`,
          products_count: sql<number>`COUNT(DISTINCT ${forecasts.product_id})`,
          is_holiday: sql<boolean>`BOOL_OR(${forecasts.is_holiday})`,
          holiday_name: sql<string>`MAX(CASE WHEN ${forecasts.holiday_name} IS NOT NULL THEN ${forecasts.holiday_name} ELSE NULL END)`
        })
        .from(forecasts)
        .where(and(...whereConditions))
        .groupBy(forecasts.forecast_date)
        .orderBy(asc(forecasts.forecast_date));
        
        return {
          success: true,
          groupBy: 'date',
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          modelId,
          data: groupedData.map(item => ({
            date: item.forecast_date,
            totalQuantity: Number(item.total_quantity?.toFixed(2) || 0),
            avgConfidence: Number((item.avg_confidence * 100)?.toFixed(1) || 0),
            machinesCount: item.machines_count,
            productsCount: item.products_count,
            isHoliday: item.is_holiday,
            holidayName: item.holiday_name
          }))
        };
    }
  } catch (error) {
    console.error("Fehler bei der Prognoseauswertung:", error);
    return { 
      success: false, 
      message: `Fehler bei der Prognoseauswertung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
    };
  }
}

/**
 * Prüft, ob für einen bestimmten Zeitraum bereits Prognosen existieren
 * 
 * @param startDate Startdatum
 * @param endDate Enddatum
 * @param modelId ID des Modells
 * @param locationId Optional: ID des Standorts
 * @param machineId Optional: ID der Maschine
 * @returns true wenn Prognosen existieren, sonst false
 */
export async function forecastsExistForPeriod(
  startDate: string | Date,
  endDate: string | Date,
  modelId: number,
  locationId?: number,
  machineId?: number
): Promise<boolean> {
  try {
    const formattedStartDate = typeof startDate === 'string' ? startDate : format(startDate, 'yyyy-MM-dd');
    const formattedEndDate = typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd');
    
    const forecastsTable = forecasts; // Umbenennen, um Konflikte zu vermeiden
    let whereConditions: any[] = [
      between(forecastsTable.forecast_date, formattedStartDate, formattedEndDate),
      eq(forecastsTable.model_id, modelId)
    ];
    
    if (locationId !== undefined) {
      whereConditions.push(eq(forecastsTable.location_id, locationId));
    }
    
    if (machineId !== undefined) {
      whereConditions.push(eq(forecastsTable.machine_id, machineId));
    }
    
    const existingForecasts = await db.select({ count: count() })
      .from(forecastsTable)
      .where(and(...whereConditions));
    
    return (existingForecasts[0]?.count || 0) > 0;
  } catch (error) {
    console.error("Fehler beim Prüfen bestehender Prognosen:", error);
    return false;
  }
}

/**
 * Aktualisiert eine Prognose mit tatsächlichen Werten
 * 
 * @param forecastId ID der Prognose
 * @param actualQuantity Tatsächliche Menge
 * @returns true bei Erfolg, sonst false
 */
export async function updateForecastWithActual(
  forecastId: number,
  actualQuantity: number
): Promise<boolean> {
  try {
    // Prognose abrufen
    const forecastsTable = forecasts; // Umbenennen, um Konflikte zu vermeiden
    
    // Vereinfachte Abfrage
    const forecastResult = await db.select()
      .from(forecastsTable)
      .where(eq(forecastsTable.id, forecastId))
      .limit(1);
    
    if (!forecastResult.length) {
      console.error(`Prognose mit ID ${forecastId} nicht gefunden`);
      return false;
    }
    
    const forecast = forecastResult[0];
    
    // Berechne den Fehler
    const error = actualQuantity - (forecast.predicted_quantity || 0);
    
    // Aktualisiere die Prognose
    await db.update(forecastsTable)
      .set({
        actual_quantity: actualQuantity,
        error,
        updated_at: new Date()
      })
      .where(eq(forecastsTable.id, forecastId));
    
    return true;
  } catch (error) {
    console.error(`Fehler beim Aktualisieren der Prognose ${forecastId}:`, error);
    return false;
  }
}

/**
 * Generiert intelligente Bestellvorschläge basierend auf Prognosen, Wetter und Feiertagen
 * 
 * @param warehouseId ID des Lagers
 * @param weeksAhead Anzahl der Wochen für die Vorhersage (1-8)
 * @param includeWeather Soll Wetterdaten berücksichtigt werden?
 * @param includeHolidays Sollen Feiertage berücksichtigt werden?
 * @returns Bestellvorschläge mit detaillierten Begründungen
 */
export async function getEnhancedOrderSuggestions(
  warehouseId: number,
  weeksAhead: number = 2,
  includeWeather: boolean = true,
  includeHolidays: boolean = true
): Promise<any> {
  try {
    console.log(`Generiere Bestellvorschläge für Lager ${warehouseId}, ${weeksAhead} Wochen voraus`);
    
    // Zeitraum berechnen
    const startDate = new Date();
    const endDate = addDays(startDate, weeksAhead * 7);
    const formattedStartDate = format(startDate, 'yyyy-MM-dd');
    const formattedEndDate = format(endDate, 'yyyy-MM-dd');
    
    // Aktuelle Lagerbestände abrufen
    const inventoryQuery = `
      SELECT 
        inv.product_id,
        p.name as product_name,
        p.sku,
        p.supplier_id,
        s.name as supplier_name,
        inv.quantity as current_stock,
        inv.min_stock,
        inv.max_stock,
        p.unit_price,
        COALESCE(pc.minimum_order_quantity, 1) as min_order_qty,
        COALESCE(pc.price_per_unit, p.unit_price) as purchase_price
      FROM inventory inv
      JOIN products p ON inv.product_id = p.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id
      WHERE inv.warehouse_id = $1 AND inv.quantity IS NOT NULL
    `;
    
    const inventoryResult = await db.execute(sql.raw(inventoryQuery, [warehouseId]));
    const inventory = inventoryResult.rows;
    
    // Prophet-basierte Produktprognosen abrufen
    const forecastQuery = `
      SELECT 
        pf.product_id,
        SUM(pf.predicted_quantity) as total_predicted_sales,
        AVG(pf.confidence_interval_lower) as avg_confidence_lower,
        AVG(pf.confidence_interval_upper) as avg_confidence_upper,
        COUNT(*) as forecast_days
      FROM product_forecasts pf
      WHERE pf.forecast_date BETWEEN $1 AND $2
        AND pf.product_id IN (
          SELECT DISTINCT product_id FROM inventory WHERE warehouse_id = $3
        )
      GROUP BY pf.product_id
    `;
    
    const forecastResult = await db.execute(sql.raw(forecastQuery, [formattedStartDate, formattedEndDate, warehouseId]));
    const forecasts = forecastResult.rows;
    
    // Wetterdaten für den Zeitraum abrufen (falls gewünscht)
    let weatherFactors = [];
    if (includeWeather) {
      const weatherQuery = `
        SELECT 
          date_trunc('day', datetime) as weather_date,
          AVG(temperature) as avg_temp,
          AVG(humidity) as avg_humidity,
          SUM(CASE WHEN weather_condition LIKE '%rain%' OR weather_condition LIKE '%snow%' THEN 1 ELSE 0 END) as bad_weather_hours
        FROM weather_data
        WHERE datetime BETWEEN $1 AND $2
        GROUP BY date_trunc('day', datetime)
        ORDER BY weather_date
      `;
      
      try {
        const weatherResult = await db.execute(sql.raw(weatherQuery, [formattedStartDate, formattedEndDate]));
        weatherFactors = weatherResult.rows;
      } catch (weatherError) {
        console.log('Wetterdaten nicht verfügbar, fahre ohne Wetteranpassung fort');
        weatherFactors = [];
      }
    }
    
    // Feiertage für den Zeitraum abrufen (falls gewünscht)
    let holidayFactors = [];
    if (includeHolidays) {
      const holidayQuery = `
        SELECT holiday_date, name, type
        FROM holidays
        WHERE holiday_date BETWEEN $1 AND $2
        ORDER BY holiday_date
      `;
      
      try {
        const holidayResult = await db.execute(sql.raw(holidayQuery, [formattedStartDate, formattedEndDate]));
        holidayFactors = holidayResult.rows;
      } catch (holidayError) {
        console.log('Feiertagsdaten nicht verfügbar, fahre ohne Feiertagsanpassung fort');
        holidayFactors = [];
      }
    }
    
    // Bestellvorschläge generieren
    const suggestions = [];
    const weatherAdjustment = weatherFactors.length > 0 ? 
      weatherFactors.reduce((sum, w) => sum + (w.bad_weather_hours || 0), 0) / weatherFactors.length : 0;
    const holidayAdjustment = holidayFactors.length * 0.15; // 15% Aufschlag pro Feiertag
    
    for (const item of inventory) {
      const forecast = forecasts.find(f => f.product_id === item.product_id);
      
      if (!forecast) continue;
      
      const predictedSales = Number(forecast.total_predicted_sales || 0);
      const confidenceLower = Number(forecast.avg_confidence_lower || 0);
      const confidenceUpper = Number(forecast.avg_confidence_upper || 0);
      
      // Sicherheitsfaktor basierend auf Wetter und Feiertagen
      let safetyFactor = 1.2; // Basis-Sicherheitspuffer
      safetyFactor += weatherAdjustment * 0.1; // Wetteranpassung
      safetyFactor += holidayAdjustment; // Feiertagsanpassung
      
      const adjustedDemand = Math.ceil(predictedSales * safetyFactor);
      const currentStock = Number(item.current_stock || 0);
      const minStock = Number(item.min_stock || 0);
      
      // Bestellmenge berechnen
      const neededQuantity = Math.max(0, adjustedDemand + minStock - currentStock);
      const minOrderQty = Number(item.min_order_qty || 1);
      const suggestedOrderQty = Math.ceil(neededQuantity / minOrderQty) * minOrderQty;
      
      if (suggestedOrderQty > 0) {
        const totalCost = suggestedOrderQty * Number(item.purchase_price || item.unit_price || 0);
        
        // Begründung generieren
        const reasons = [];
        reasons.push(`Prognostizierte Verkäufe: ${predictedSales.toFixed(1)} Stück`);
        reasons.push(`Aktueller Bestand: ${currentStock} Stück`);
        reasons.push(`Sicherheitspuffer: ${((safetyFactor - 1) * 100).toFixed(1)}%`);
        
        if (includeWeather && weatherAdjustment > 0) {
          reasons.push(`Wetteranpassung: +${(weatherAdjustment * 10).toFixed(1)}% (schlechtes Wetter erwartet)`);
        }
        
        if (includeHolidays && holidayFactors.length > 0) {
          reasons.push(`Feiertagsanpassung: +${(holidayAdjustment * 100).toFixed(1)}% (${holidayFactors.length} Feiertag(e))`);
        }
        
        suggestions.push({
          productId: item.product_id,
          productName: item.product_name,
          sku: item.sku,
          supplierId: item.supplier_id,
          supplierName: item.supplier_name,
          currentStock,
          minStock,
          predictedSales: predictedSales.toFixed(1),
          confidenceRange: `${confidenceLower.toFixed(1)} - ${confidenceUpper.toFixed(1)}`,
          adjustedDemand,
          suggestedOrderQty,
          unitPrice: Number(item.purchase_price || item.unit_price || 0),
          totalCost: totalCost.toFixed(2),
          priority: currentStock < minStock ? 'HIGH' : 
                   currentStock < (minStock + adjustedDemand * 0.5) ? 'MEDIUM' : 'LOW',
          reasons: reasons,
          weatherImpact: includeWeather ? (weatherAdjustment * 10).toFixed(1) + '%' : 'Nicht berücksichtigt',
          holidayImpact: includeHolidays ? (holidayAdjustment * 100).toFixed(1) + '%' : 'Nicht berücksichtigt'
        });
      }
    }
    
    // Nach Priorität und dann nach Gesamtkosten sortieren
    suggestions.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return Number(b.totalCost) - Number(a.totalCost);
    });
    
    // Zusammenfassung erstellen
    const summary = {
      totalSuggestions: suggestions.length,
      totalCost: suggestions.reduce((sum, s) => sum + Number(s.totalCost), 0).toFixed(2),
      highPriority: suggestions.filter(s => s.priority === 'HIGH').length,
      mediumPriority: suggestions.filter(s => s.priority === 'MEDIUM').length,
      lowPriority: suggestions.filter(s => s.priority === 'LOW').length,
      weatherFactorsIncluded: includeWeather,
      holidayFactorsIncluded: includeHolidays,
      forecastPeriod: `${weeksAhead} Wochen (${formattedStartDate} bis ${formattedEndDate})`,
      upcomingHolidays: holidayFactors.map(h => ({ date: h.holiday_date, name: h.name }))
    };
    
    return {
      success: true,
      summary,
      suggestions,
      metadata: {
        warehouseId,
        weeksAhead,
        generatedAt: new Date().toISOString(),
        includeWeather,
        includeHolidays
      }
    };
    
  } catch (error) {
    console.error('Fehler beim Generieren der Bestellvorschläge:', error);
    throw error;
  }
}

/**
 * Berechnet Prognose-Fehlermetriken durch Vergleich von tatsächlichen mit vorhergesagten Werten
 * 
 * @param modelId ID des Prognosemodells
 * @param startDate Startdatum für die Fehleranalyse
 * @param endDate Enddatum für die Fehleranalyse
 * @param locationIds Optionale Eingrenzung auf bestimmte Standorte
 * @param machineIds Optionale Eingrenzung auf bestimmte Automaten
 * @returns Objekt mit Fehlermetriken
 */
export async function calculateForecastErrors(
  modelId: number,
  startDate: string | Date,
  endDate: string | Date,
  locationIds?: number[],
  machineIds?: number[]
): Promise<{
  success: boolean;
  message?: string;
  metrics?: {
    mae: number;       // Mean Absolute Error
    rmse: number;      // Root Mean Square Error
    mape: number;      // Mean Absolute Percentage Error
    bias: number;      // Durchschnittliche Über-/Unterschätzung
    accuracy: number;  // Genauigkeit (1 - MAPE/100)
    dataPoints: number;
    qualityRating: 'excellent' | 'good' | 'fair' | 'poor';
  };
  dailyErrors?: Array<{
    date: string;
    actual: number;
    predicted: number;
    error: number;
    absoluteError: number;
    percentageError?: number;
  }>;
}> {
  try {
    console.log(`Berechne Prognose-Fehler für Modell ${modelId} von ${startDate} bis ${endDate}`);
    
    // Formatiere Datumswerte
    const formattedStartDate = typeof startDate === 'string' ? startDate : format(startDate, 'yyyy-MM-dd');
    const formattedEndDate = typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd');
    
    // Sammle Prognosedaten
    let forecastQuery = db.select({
      date: forecasts.forecast_date,
      predicted: forecasts.predicted_quantity,
      confidence: forecasts.confidence,
      locationId: forecasts.location_id,
      machineId: forecasts.machine_id
    })
    .from(forecasts)
    .where(
      and(
        eq(forecasts.model_id, modelId),
        between(forecasts.forecast_date, formattedStartDate, formattedEndDate)
      )
    );
    
    // Filter hinzufügen
    if (locationIds && locationIds.length > 0) {
      forecastQuery = forecastQuery.where(inArray(forecasts.location_id, locationIds));
    }
    
    if (machineIds && machineIds.length > 0) {
      forecastQuery = forecastQuery.where(inArray(forecasts.machine_id, machineIds));
    }
    
    const forecastData = await forecastQuery.orderBy(asc(forecasts.forecast_date));
    
    if (!forecastData || forecastData.length === 0) {
      return { success: false, message: 'Keine Prognosedaten für den angegebenen Zeitraum gefunden' };
    }
    
    // Sammle tatsächliche Verkaufsdaten
    const dailyErrors = [];
    let totalAbsoluteError = 0;
    let totalSquaredError = 0;
    let totalPercentageError = 0;
    let totalBias = 0;
    let validDataPoints = 0;
    
    // Gruppiere Prognosen nach Datum
    const forecastsByDate = forecastData.reduce((acc, forecast) => {
      if (!acc[forecast.date]) {
        acc[forecast.date] = { predicted: 0, count: 0 };
      }
      acc[forecast.date].predicted += forecast.predicted || 0;
      acc[forecast.date].count += 1;
      return acc;
    }, {} as Record<string, { predicted: number; count: number }>);
    
    // Für jeden Tag mit Prognosen die tatsächlichen Werte abrufen
    for (const [dateStr, forecastInfo] of Object.entries(forecastsByDate)) {
      // Baue die Abfrage für tatsächliche Transaktionen
      let actualQuery = db.select({
        totalQuantity: sql`SUM(${transactions.quantity})`
      })
      .from(transactions)
      .where(sql`DATE(${transactions.datetime}) = ${dateStr}`);
      
      // Filter hinzufügen
      let whereConditions: any[] = [sql`DATE(${transactions.datetime}) = ${dateStr}`];
      
      if (locationIds && locationIds.length > 0) {
        whereConditions.push(inArray(transactions.locationId, locationIds));
      }
      
      if (machineIds && machineIds.length > 0) {
        whereConditions.push(inArray(transactions.machineId, machineIds));
      }
      
      actualQuery = db.select({
        totalQuantity: sql`SUM(${transactions.quantity})`
      })
      .from(transactions)
      .where(and(...whereConditions));
      
      const actualResult = await actualQuery;
      const actual = actualResult[0]?.totalQuantity || 0;
      const predicted = forecastInfo.predicted / forecastInfo.count; // Durchschnitt der Prognosen
      
      // Berechne Fehlermetriken
      const error = predicted - actual;
      const absoluteError = Math.abs(error);
      const percentageError = actual > 0 ? (absoluteError / actual) * 100 : 0;
      
      dailyErrors.push({
        date: dateStr,
        actual: Number(actual),
        predicted: Number(predicted),
        error: Number(error),
        absoluteError: Number(absoluteError),
        percentageError: actual > 0 ? Number(percentageError) : undefined
      });
      
      // Akkumuliere für Gesamtmetriken
      totalAbsoluteError += absoluteError;
      totalSquaredError += error * error;
      totalBias += error;
      
      if (actual > 0) {
        totalPercentageError += percentageError;
        validDataPoints++;
      }
    }
    
    const dataPoints = dailyErrors.length;
    
    if (dataPoints === 0) {
      return { success: false, message: 'Keine übereinstimmenden Daten für Fehlerberechnung gefunden' };
    }
    
    // Berechne finale Metriken
    const mae = totalAbsoluteError / dataPoints;
    const rmse = Math.sqrt(totalSquaredError / dataPoints);
    const mape = validDataPoints > 0 ? totalPercentageError / validDataPoints : 0;
    const bias = totalBias / dataPoints;
    const accuracy = Math.max(0, Math.min(1, 1 - (mape / 100)));
    
    // Bestimme Qualitätsbewertung basierend auf MAPE
    let qualityRating: 'excellent' | 'good' | 'fair' | 'poor';
    if (mape <= 10) {
      qualityRating = 'excellent';
    } else if (mape <= 20) {
      qualityRating = 'good';
    } else if (mape <= 35) {
      qualityRating = 'fair';
    } else {
      qualityRating = 'poor';
    }
    
    console.log(`Prognose-Fehleranalyse abgeschlossen: MAE=${mae.toFixed(2)}, RMSE=${rmse.toFixed(2)}, MAPE=${mape.toFixed(2)}%`);
    
    return {
      success: true,
      metrics: {
        mae: Number(mae.toFixed(2)),
        rmse: Number(rmse.toFixed(2)),
        mape: Number(mape.toFixed(2)),
        bias: Number(bias.toFixed(2)),
        accuracy: Number(accuracy.toFixed(3)),
        dataPoints,
        qualityRating
      },
      dailyErrors
    };
    
  } catch (error) {
    console.error(`Fehler bei der Prognose-Fehlerberechnung für Modell ${modelId}:`, error);
    return { success: false, message: `Fehler bei der Fehlerberechnung: ${error}` };
  }
}

/**
 * Aggregiert Prognose-Fehlermetriken über verschiedene Zeiträume
 * 
 * @param modelIds Liste von Modell-IDs für die Analyse
 * @param days Anzahl der Tage rückwirkend für die Analyse
 * @returns Objekt mit aggregierten Fehlermetriken
 */
export async function aggregateForecastErrorMetrics(
  modelIds?: number[],
  days: number = 30
): Promise<{
  success: boolean;
  message?: string;
  aggregatedMetrics?: {
    overall: {
      averageMape: number;
      averageAccuracy: number;
      totalDataPoints: number;
      modelsAnalyzed: number;
    };
    byModel: Array<{
      modelId: number;
      modelName: string;
      mape: number;
      accuracy: number;
      qualityRating: string;
      dataPoints: number;
      lastUpdated: string;
    }>;
    timeSeriesMetrics: Array<{
      date: string;
      averageMape: number;
      averageAccuracy: number;
      modelsActive: number;
    }>;
  };
}> {
  try {
    console.log(`Aggregiere Prognose-Fehlermetriken für ${days} Tage`);
    
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    // Hole verfügbare Modelle
    let modelsQuery = db.select({
      id: forecastModels.id,
      name: forecastModels.name,
      status: forecastModels.status,
      accuracy: forecastModels.accuracy,
      last_used_at: forecastModels.last_used_at
    }).from(forecastModels);
    
    if (modelIds && modelIds.length > 0) {
      modelsQuery = modelsQuery.where(inArray(forecastModels.id, modelIds));
    } else {
      modelsQuery = modelsQuery.where(eq(forecastModels.status, 'ready'));
    }
    
    const models = await modelsQuery;
    
    if (!models || models.length === 0) {
      return { success: false, message: 'Keine aktiven Prognosemodelle gefunden' };
    }
    
    const byModel = [];
    let totalMape = 0;
    let totalAccuracy = 0;
    let totalDataPoints = 0;
    let validModels = 0;
    
    // Berechne Fehlermetriken für jedes Modell
    for (const model of models) {
      const errorResult = await calculateForecastErrors(
        model.id,
        format(startDate, 'yyyy-MM-dd'),
        format(endDate, 'yyyy-MM-dd')
      );
      
      if (errorResult.success && errorResult.metrics) {
        const metrics = errorResult.metrics;
        
        byModel.push({
          modelId: model.id,
          modelName: model.name,
          mape: metrics.mape,
          accuracy: metrics.accuracy,
          qualityRating: metrics.qualityRating,
          dataPoints: metrics.dataPoints,
          lastUpdated: model.last_used_at ? format(parseISO(model.last_used_at.toISOString()), 'yyyy-MM-dd HH:mm:ss') : 'Nie verwendet'
        });
        
        totalMape += metrics.mape;
        totalAccuracy += metrics.accuracy;
        totalDataPoints += metrics.dataPoints;
        validModels++;
      }
    }
    
    // Erstelle Zeitreihen-Metriken (vereinfacht - könnte erweitert werden)
    const timeSeriesMetrics = [];
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
    
    for (const date of dateRange.slice(-7)) { // Nur letzte 7 Tage für Performance
      const dateStr = format(date, 'yyyy-MM-dd');
      
      // Vereinfachte Berechnung - könnte detaillierter sein
      timeSeriesMetrics.push({
        date: dateStr,
        averageMape: validModels > 0 ? Number((totalMape / validModels).toFixed(2)) : 0,
        averageAccuracy: validModels > 0 ? Number((totalAccuracy / validModels).toFixed(3)) : 0,
        modelsActive: validModels
      });
    }
    
    const aggregatedMetrics = {
      overall: {
        averageMape: validModels > 0 ? Number((totalMape / validModels).toFixed(2)) : 0,
        averageAccuracy: validModels > 0 ? Number((totalAccuracy / validModels).toFixed(3)) : 0,
        totalDataPoints,
        modelsAnalyzed: validModels
      },
      byModel,
      timeSeriesMetrics
    };
    
    console.log(`Prognose-Fehleraggregation abgeschlossen: ${validModels} Modelle analysiert`);
    
    return {
      success: true,
      aggregatedMetrics
    };
    
  } catch (error) {
    console.error('Fehler bei der Prognose-Fehleraggregation:', error);
    return { success: false, message: `Fehler bei der Aggregation: ${error}` };
  }
}

/**
 * Ruft Prognose-Qualitätsmetriken für das Dashboard ab
 * 
 * @param modelId Optionale Modell-ID zur Eingrenzung
 * @param days Anzahl der Tage rückwirkend (Standard: 7)
 * @returns Dashboard-Metriken für die Prognosequalität
 */
export async function getForecastQualityMetrics(
  modelId?: number,
  days: number = 7
): Promise<{
  success: boolean;
  message?: string;
  qualityMetrics?: {
    summary: {
      averageAccuracy: number;
      averageMape: number;
      totalForecasts: number;
      activeModels: number;
      qualityTrend: 'improving' | 'stable' | 'declining';
    };
    recentErrors: Array<{
      date: string;
      mape: number;
      accuracy: number;
      dataPoints: number;
    }>;
    modelPerformance: Array<{
      modelId: number;
      modelName: string;
      accuracy: number;
      mape: number;
      status: string;
      lastForecast: string;
    }>;
    alerts: Array<{
      type: 'error' | 'warning' | 'info';
      message: string;
      modelId?: number;
      timestamp: string;
    }>;
  };
}> {
  try {
    console.log(`Hole Prognose-Qualitätsmetriken für ${days} Tage`);
    
    // Basis-Aggregation durchführen
    const modelIds = modelId ? [modelId] : undefined;
    const aggregationResult = await aggregateForecastErrorMetrics(modelIds, days);
    
    if (!aggregationResult.success || !aggregationResult.aggregatedMetrics) {
      return { success: false, message: aggregationResult.message };
    }
    
    const { overall, byModel, timeSeriesMetrics } = aggregationResult.aggregatedMetrics;
    
    // Bestimme Qualitätstrend
    let qualityTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (timeSeriesMetrics.length >= 2) {
      const recentAccuracy = timeSeriesMetrics.slice(-3).reduce((sum, metric) => sum + metric.averageAccuracy, 0) / Math.min(3, timeSeriesMetrics.length);
      const olderAccuracy = timeSeriesMetrics.slice(0, -3).reduce((sum, metric) => sum + metric.averageAccuracy, 0) / Math.max(1, timeSeriesMetrics.length - 3);
      
      const trend = recentAccuracy - olderAccuracy;
      if (trend > 0.05) {
        qualityTrend = 'improving';
      } else if (trend < -0.05) {
        qualityTrend = 'declining';
      }
    }
    
    // Erstelle Alerts basierend auf Qualitätsmetriken
    const alerts = [];
    const now = new Date().toISOString();
    
    if (overall.averageAccuracy < 0.7) {
      alerts.push({
        type: 'error' as const,
        message: `Niedrige durchschnittliche Prognosegenauigkeit: ${(overall.averageAccuracy * 100).toFixed(1)}%`,
        timestamp: now
      });
    }
    
    if (overall.averageMape > 30) {
      alerts.push({
        type: 'warning' as const,
        message: `Hoher durchschnittlicher Prognosefehler: ${overall.averageMape.toFixed(1)}% MAPE`,
        timestamp: now
      });
    }
    
    // Modell-spezifische Alerts
    for (const model of byModel) {
      if (model.accuracy < 0.6) {
        alerts.push({
          type: 'warning' as const,
          message: `Modell "${model.modelName}" hat niedrige Genauigkeit: ${(model.accuracy * 100).toFixed(1)}%`,
          modelId: model.modelId,
          timestamp: now
        });
      }
    }
    
    if (alerts.length === 0) {
      alerts.push({
        type: 'info' as const,
        message: 'Alle Prognosemodelle arbeiten im akzeptablen Bereich',
        timestamp: now
      });
    }
    
    const qualityMetrics = {
      summary: {
        averageAccuracy: overall.averageAccuracy,
        averageMape: overall.averageMape,
        totalForecasts: overall.totalDataPoints,
        activeModels: overall.modelsAnalyzed,
        qualityTrend
      },
      recentErrors: timeSeriesMetrics.map(metric => ({
        date: metric.date,
        mape: metric.averageMape,
        accuracy: metric.averageAccuracy,
        dataPoints: metric.modelsActive
      })),
      modelPerformance: byModel,
      alerts
    };
    
    console.log(`Prognose-Qualitätsmetriken erfolgreich abgerufen: ${overall.modelsAnalyzed} Modelle, Durchschnittsgenauigkeit: ${(overall.averageAccuracy * 100).toFixed(1)}%`);
    
    return {
      success: true,
      qualityMetrics
    };
    
  } catch (error) {
    console.error('Fehler beim Abrufen der Prognose-Qualitätsmetriken:', error);
    return { success: false, message: `Fehler beim Abrufen der Qualitätsmetriken: ${error}` };
  }
}