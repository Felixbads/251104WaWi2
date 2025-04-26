/**
 * API-Routen für Prognosemodelle, Wetterdaten und Feiertage
 */

import { Express, Request, Response } from "express";
import * as forecastService from "../services/forecastService";
import * as prophetService from "../services/prophetService";
import * as meteostatService from "../services/meteostatService";
import * as holidayService from "../services/holidayService";
import * as openWeatherService from "../services/openWeatherService";
import { z } from "zod";
import { format } from "date-fns";
import { db } from "../db";
import { forecasts, locations } from "@shared/schema";
import { eq, and, between, sql } from "drizzle-orm";

// API-Prefix
const API_PREFIX = "/api";

// Schema für die Erstellung eines Prognosemodells
const createModelSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  description: z.string().optional(),
  modelType: z.string().min(1, "Modelltyp ist erforderlich"),
  configuration: z.string().default("{}"),
  usesMachineData: z.boolean().default(true),
  usesWeatherData: z.boolean().default(true),
  usesHolidayData: z.boolean().default(true)
});

// Schema für das Training eines Modells
const trainModelSchema = z.object({
  modelId: z.number().int().positive(),
  startDate: z.string().min(1, "Startdatum ist erforderlich"),
  endDate: z.string().min(1, "Enddatum ist erforderlich"),
  locationIds: z.array(z.number().int().positive()).optional(),
  machineIds: z.array(z.number().int().positive()).optional()
});

// Schema für die Erstellung einer Prognose
const createForecastSchema = z.object({
  modelId: z.number().int().positive(),
  startDate: z.string().min(1, "Startdatum ist erforderlich"),
  endDate: z.string().min(1, "Enddatum ist erforderlich"),
  locationIds: z.array(z.number().int().positive()).optional(),
  machineIds: z.array(z.number().int().positive()).optional()
});

// Schema für das Abrufen von Prognosen
const getForecastsSchema = z.object({
  startDate: z.string().min(1, "Startdatum ist erforderlich"),
  endDate: z.string().min(1, "Enddatum ist erforderlich"),
  modelId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  machineId: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
  supplierId: z.number().int().positive().optional()
});

// Schema für das Synchronisieren von Wetterdaten
const syncWeatherDataSchema = z.object({
  startDate: z.string().min(1, "Startdatum ist erforderlich"),
  endDate: z.string().min(1, "Enddatum ist erforderlich"),
  stationId: z.string().optional()
});

// Schema für das Synchronisieren von Feiertagen
const syncHolidaysSchema = z.object({
  year: z.number().int().positive(),
  state: z.string().optional()
});

// Schema für die Aktualisierung einer Prognose mit tatsächlichen Werten
const updateForecastSchema = z.object({
  forecastId: z.number().int().positive(),
  actualQuantity: z.number().positive()
});

// Schema für das Abrufen fehlender Wetterdaten
const getMissingWeatherDataSchema = z.object({
  startDate: z.string().min(1, "Startdatum ist erforderlich"),
  endDate: z.string().min(1, "Enddatum ist erforderlich"),
  stationId: z.string().optional()
});

// Schema für das Abrufen fehlender Feiertage
const getMissingHolidaysSchema = z.object({
  startYear: z.number().int().positive(),
  endYear: z.number().int().positive(),
  state: z.string().optional(),
  includeSchoolHolidays: z.boolean().default(true)
});

/**
 * Registriert alle Prognose- und Datendienst-Routen
 * 
 * @param app Express-Anwendung
 */
export function registerForecastRoutes(app: Express): void {
  /**
   * Prognosemodell-Routen
   */
  
  // Alle Modelle abrufen
  app.get(`${API_PREFIX}/forecast/models`, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const models = await forecastService.getForecastModels(status);
      res.json(models);
    } catch (error) {
      console.error("Fehler beim Abrufen der Prognosemodelle:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  // Ein Modell abrufen
  app.get(`${API_PREFIX}/forecast/models/:id`, async (req: Request, res: Response) => {
    try {
      const modelId = parseInt(req.params.id, 10);
      const model = await forecastService.getForecastModel(modelId);
      
      if (!model) {
        return res.status(404).json({ error: `Modell mit ID ${modelId} nicht gefunden` });
      }
      
      res.json(model);
    } catch (error) {
      console.error(`Fehler beim Abrufen des Modells ${req.params.id}:`, error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  // Neues Modell erstellen
  app.post(`${API_PREFIX}/forecast/models`, async (req: Request, res: Response) => {
    try {
      const validatedData = createModelSchema.parse(req.body);
      
      const modelId = await forecastService.createForecastModel(
        validatedData.name,
        validatedData.description || "",
        validatedData.modelType,
        validatedData.configuration,
        validatedData.usesMachineData,
        validatedData.usesWeatherData,
        validatedData.usesHolidayData
      );
      
      if (!modelId) {
        return res.status(500).json({ error: "Fehler beim Erstellen des Prognosemodells" });
      }
      
      const model = await forecastService.getForecastModel(modelId);
      res.status(201).json(model);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error("Fehler beim Erstellen des Prognosemodells:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  // Modell trainieren
  app.post(`${API_PREFIX}/forecast/models/:id/train`, async (req: Request, res: Response) => {
    try {
      const modelId = parseInt(req.params.id, 10);
      const validatedData = trainModelSchema.parse({ ...req.body, modelId });
      
      const result = await forecastService.trainForecastModel(
        validatedData.modelId,
        validatedData.startDate,
        validatedData.endDate,
        validatedData.locationIds,
        validatedData.machineIds
      );
      
      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error(`Fehler beim Training des Modells ${req.params.id}:`, error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  // Prognose erstellen
  app.post(`${API_PREFIX}/forecast/create`, async (req: Request, res: Response) => {
    try {
      console.log("Erhalte Anfrage zum Erstellen einer Prognose mit Daten:", JSON.stringify(req.body));
      
      // Stelle sicher, dass die Daten vorhanden sind
      if (!req.body.modelId || !req.body.startDate || !req.body.endDate) {
        console.error("Fehlende Daten beim Erstellen der Prognose:", JSON.stringify(req.body));
        return res.status(400).json({ 
          error: "Fehler bei der Validierung der Daten", 
          details: [
            { code: "missing_data", message: "Erforderliche Felder fehlen" },
            req.body.modelId ? null : { code: "invalid_type", expected: "number", received: null, path: ["modelId"], message: "Required" },
            req.body.startDate ? null : { code: "invalid_type", expected: "string", received: null, path: ["startDate"], message: "Required" },
            req.body.endDate ? null : { code: "invalid_type", expected: "string", received: null, path: ["endDate"], message: "Required" }
          ].filter(Boolean)
        });
      }
      
      try {
        const validatedData = createForecastSchema.parse(req.body);
        
        const result = await forecastService.createForecast(
          validatedData.modelId,
          validatedData.startDate,
          validatedData.endDate,
          validatedData.locationIds,
          validatedData.machineIds
        );
        
        if (!result.success) {
          return res.status(400).json({ error: result.message });
        }
        
        res.status(201).json(result);
      } catch (validationError) {
        console.error("Validierungsfehler beim Erstellen der Prognose:", validationError);
        
        if (validationError instanceof z.ZodError) {
          return res.status(400).json({ error: "Ungültige Daten", details: validationError.errors });
        }
        
        console.error("Fehler beim Erstellen der Prognose:", validationError);
        res.status(500).json({ error: "Interner Serverfehler" });
      }
    } catch (error) {
      console.error("Fehler beim Erstellen der Prognose:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  // Prognosen abrufen
  app.get(`${API_PREFIX}/forecast/data`, async (req: Request, res: Response) => {
    try {
      const queryParams = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        modelId: req.query.modelId ? parseInt(req.query.modelId as string, 10) : undefined,
        locationId: req.query.locationId ? parseInt(req.query.locationId as string, 10) : undefined,
        machineId: req.query.machineId ? parseInt(req.query.machineId as string, 10) : undefined,
        productId: req.query.productId ? parseInt(req.query.productId as string, 10) : undefined,
        supplierId: req.query.supplierId ? parseInt(req.query.supplierId as string, 10) : undefined
      };
      
      const validatedData = getForecastsSchema.parse(queryParams);
      
      const forecasts = await forecastService.getForecasts(
        validatedData.startDate,
        validatedData.endDate,
        validatedData.modelId,
        validatedData.locationId,
        validatedData.machineId,
        validatedData.productId,
        validatedData.supplierId
      );
      
      res.json(forecasts);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error("Fehler beim Abrufen der Prognosen:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  
  // Erweiterte Prognoseauswertung mit detaillierten Filtermöglichkeiten
  app.get(`${API_PREFIX}/forecast/evaluation`, async (req: Request, res: Response) => {
    try {
      const queryParams = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        modelId: req.query.modelId ? parseInt(req.query.modelId as string, 10) : undefined,
        machineId: req.query.machineId ? parseInt(req.query.machineId as string, 10) : undefined,
        productId: req.query.productId ? parseInt(req.query.productId as string, 10) : undefined,
        supplierId: req.query.supplierId ? parseInt(req.query.supplierId as string, 10) : undefined,
        groupBy: req.query.groupBy as string || 'date'
      };
      
      // Validiere Parameter
      if (!queryParams.startDate || !queryParams.endDate) {
        return res.status(400).json({ error: "Start- und Enddatum sind erforderlich" });
      }
      
      // Hole aktives Modell, wenn keins angegeben
      if (!queryParams.modelId) {
        const activeModels = await forecastService.getForecastModels('ready');
        if (activeModels && activeModels.length > 0) {
          queryParams.modelId = activeModels[0].id;
        }
      }
      
      // Rufe erweiterte Prognoseauswertung ab
      const evaluation = await forecastService.getForecastEvaluation(
        queryParams.startDate,
        queryParams.endDate,
        queryParams.modelId,
        queryParams.machineId,
        queryParams.productId,
        queryParams.supplierId,
        queryParams.groupBy
      );
      
      res.json(evaluation);
    } catch (error) {
      console.error("Fehler bei der Prognoseauswertung:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  
  // Detaillierte Prognoseanalyse für umfangreiche Filterung und Visualisierung
  app.get(`${API_PREFIX}/forecast/detailed`, async (req: Request, res: Response) => {
    try {
      const queryParams = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        modelId: req.query.modelId ? parseInt(req.query.modelId as string, 10) : undefined,
        locationId: req.query.locationId ? parseInt(req.query.locationId as string, 10) : undefined,
        machineId: req.query.machineId ? parseInt(req.query.machineId as string, 10) : undefined,
        productId: req.query.productId ? parseInt(req.query.productId as string, 10) : undefined,
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string, 10) : undefined,
        groupBy: (req.query.groupBy as 'day' | 'product' | 'machine' | 'location') || 'day'
      };
      
      // Validiere Parameter
      if (!queryParams.startDate || !queryParams.endDate) {
        return res.status(400).json({ error: "Start- und Enddatum sind erforderlich" });
      }
      
      // Hole aktives Modell, wenn keins angegeben
      if (!queryParams.modelId) {
        const activeModels = await forecastService.getForecastModels('ready');
        if (activeModels && activeModels.length > 0) {
          queryParams.modelId = activeModels[0].id;
        } else {
          return res.status(404).json({ error: "Kein aktives Prognosemodell gefunden" });
        }
      }
      
      const { startDate, endDate, modelId, locationId, machineId, productId, categoryId, groupBy } = queryParams;
      
      // Erstelle Basis-SQL-Abfrage je nach Gruppierung
      let forecasts;
      
      if (groupBy === 'day') {
        // Gruppierung nach Tag mit Raw SQL für bessere Flexibilität
        forecasts = await db.execute(sql`
          SELECT 
            f.forecast_date,
            SUM(f.predicted_quantity) as predicted_quantity,
            SUM(f.lower_bound) as lower_bound,
            SUM(f.upper_bound) as upper_bound,
            BOOL_OR(f.is_holiday) as is_holiday,
            MAX(f.holiday_name) as holiday_name,
            AVG(f.confidence) as confidence,
            MAX(f.weather_summary) as weather_summary
          FROM 
            forecasts f
          WHERE 
            f.model_id = ${modelId}
            AND f.forecast_date BETWEEN ${startDate} AND ${endDate}
            ${locationId ? sql`AND f.location_id = ${locationId}` : sql``}
            ${machineId ? sql`AND f.machine_id = ${machineId}` : sql``}
            ${productId ? sql`AND f.product_id = ${productId}::text` : sql``}
          GROUP BY 
            f.forecast_date
          ORDER BY 
            f.forecast_date
        `);
      } 
      else if (groupBy === 'product') {
        // Gruppierung nach Produkt
        forecasts = await db.execute(sql`
          SELECT 
            p.id as product_id,
            p.name as product_name,
            p.category as category_name,
            SUM(f.predicted_quantity) as predicted_quantity,
            AVG(f.confidence) as confidence,
            SUM(f.lower_bound) as lower_bound,
            SUM(f.upper_bound) as upper_bound
          FROM 
            forecasts f
            LEFT JOIN products p ON f.product_id = p.id::text
          WHERE 
            f.model_id = ${modelId}
            AND f.forecast_date BETWEEN ${startDate} AND ${endDate}
            ${locationId ? sql`AND f.location_id = ${locationId}` : sql``}
            ${machineId ? sql`AND f.machine_id = ${machineId}` : sql``}
            ${categoryId ? sql`AND p.category_id = ${categoryId}` : sql``}
          GROUP BY 
            p.id, p.name, p.category
          ORDER BY 
            SUM(f.predicted_quantity) DESC
        `);
      } 
      else if (groupBy === 'machine') {
        // Gruppierung nach Automat
        forecasts = await db.execute(sql`
          SELECT 
            m.id as machine_id,
            m.name as machine_name,
            l.id as location_id,
            l.name as location_name,
            SUM(f.predicted_quantity) as predicted_quantity,
            AVG(f.confidence) as confidence,
            SUM(f.lower_bound) as lower_bound,
            SUM(f.upper_bound) as upper_bound
          FROM 
            forecasts f
            LEFT JOIN machines m ON f.machine_id = m.id
            LEFT JOIN locations l ON f.location_id = l.id
          WHERE 
            f.model_id = ${modelId}
            AND f.forecast_date BETWEEN ${startDate} AND ${endDate}
            ${locationId ? sql`AND f.location_id = ${locationId}` : sql``}
            ${productId ? sql`AND f.product_id = ${productId}::text` : sql``}
          GROUP BY 
            m.id, m.name, l.id, l.name
          ORDER BY 
            SUM(f.predicted_quantity) DESC
        `);
      } 
      else if (groupBy === 'location') {
        // Gruppierung nach Standort
        forecasts = await db.execute(sql`
          SELECT 
            l.id as location_id,
            l.name as location_name,
            COUNT(DISTINCT m.id) as machine_count,
            SUM(f.predicted_quantity) as predicted_quantity,
            AVG(f.confidence) as confidence,
            SUM(f.lower_bound) as lower_bound,
            SUM(f.upper_bound) as upper_bound
          FROM 
            forecasts f
            LEFT JOIN locations l ON f.location_id = l.id
            LEFT JOIN machines m ON f.machine_id = m.id
          WHERE 
            f.model_id = ${modelId}
            AND f.forecast_date BETWEEN ${startDate} AND ${endDate}
            ${machineId ? sql`AND f.machine_id = ${machineId}` : sql``}
            ${productId ? sql`AND f.product_id = ${productId}::text` : sql``}
          GROUP BY 
            l.id, l.name
          ORDER BY 
            SUM(f.predicted_quantity) DESC
        `);
      }
      
      if (!forecasts || forecasts.length === 0) {
        return res.json([]);
      }
      
      // Für tägliche Prognosen, füge Trendinformation hinzu
      if (groupBy === 'day' && Array.isArray(forecasts) && forecasts.length > 1) {
        // Sortiere nach Datum
        forecasts.sort((a: any, b: any) => {
          return new Date(a.forecast_date).getTime() - new Date(b.forecast_date).getTime();
        });
        
        // Berechne Trend für jeden Tag im Vergleich zum Vortag
        for (let i = 1; i < forecasts.length; i++) {
          const today = forecasts[i].predicted_quantity;
          const yesterday = forecasts[i-1].predicted_quantity;
          
          if (today > yesterday * 1.1) {
            forecasts[i].trend = 'up'; // 10% oder mehr Steigerung
          } else if (today < yesterday * 0.9) {
            forecasts[i].trend = 'down'; // 10% oder mehr Rückgang
          } else {
            forecasts[i].trend = 'neutral'; // Stabil
          }
        }
        
        // Der erste Tag hat keinen Vortags-Vergleich
        forecasts[0].trend = 'neutral';
      }
      
      res.json(forecasts);
    } catch (error) {
      console.error("Fehler bei der detaillierten Prognoseanalyse:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  
  // Aktuelle Prognosen für das Dashboard abrufen (14 Tage)
  app.get(`${API_PREFIX}/forecast/dashboard`, async (req: Request, res: Response) => {
    try {
      // Aktuelles Datum und Datum in 14 Tagen
      const today = new Date();
      const twoWeeksFromNow = new Date(today);
      twoWeeksFromNow.setDate(today.getDate() + 14);
      
      // Formatiere Daten für DB-Abfrage
      const startDate = format(today, 'yyyy-MM-dd');
      const endDate = format(twoWeeksFromNow, 'yyyy-MM-dd');
      
      // Hole das erste aktive Modell, wenn keins angegeben ist
      const activeModels = await forecastService.getForecastModels('ready');
      
      if (!activeModels || activeModels.length === 0) {
        return res.json([]);
      }
      
      // Nehme das neueste aktive Modell (nach ID sortiert)
      const latestModelId = activeModels[0].id;
      
      // Hole die Prognosen für den angegebenen Zeitraum
      const forecastData = await db.select({
        forecast_date: forecasts.forecast_date,
        location_id: forecasts.location_id,
        location_name: locations.name,
        predicted_quantity: sql<number>`SUM(${forecasts.predicted_quantity})`,
        confidence: sql<number>`AVG(${forecasts.confidence})`,
        is_holiday: sql<boolean>`CASE WHEN MAX(CASE WHEN ${forecasts.is_holiday} THEN 1 ELSE 0 END) > 0 THEN true ELSE false END`,
        holiday_name: sql<string>`MAX(CASE WHEN ${forecasts.holiday_name} IS NOT NULL THEN ${forecasts.holiday_name} ELSE NULL END)`
      })
      .from(forecasts)
      .leftJoin(locations, eq(forecasts.location_id, locations.id))
      .where(
        and(
          eq(forecasts.model_id, latestModelId),
          between(forecasts.forecast_date, startDate, endDate)
        )
      )
      .groupBy(forecasts.forecast_date, forecasts.location_id, locations.name)
      .orderBy(forecasts.forecast_date, locations.name);
      
      // Formatiere die Ergebnisse für die Frontend-Anzeige
      const dashboardForecasts = forecastData.map(row => ({
        date: row.forecast_date,
        locationId: row.location_id,
        locationName: row.location_name || 'Alle Standorte',
        predictedQuantity: parseFloat(row.predicted_quantity.toFixed(2)),
        confidence: row.confidence ? parseFloat((row.confidence * 100).toFixed(1)) : null,
        isHoliday: row.is_holiday,
        holidayName: row.holiday_name
      }));
      
      res.json(dashboardForecasts);
    } catch (error) {
      console.error("Fehler beim Abrufen der Dashboard-Prognosen:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  
  // Automatisches Training des Default-Prognosemodells
  app.post(`${API_PREFIX}/forecast/auto-train`, async (req: Request, res: Response) => {
    try {
      console.log("Starte automatische Initialisierung des Prognosemodells");
      
      // 1. Verfügbare Modelle abrufen
      const models = await forecastService.getForecastModels();
      
      if (!models || !Array.isArray(models) || models.length === 0) {
        console.error('Keine Prognosemodelle verfügbar');
        return res.status(404).json({ 
          success: false, 
          message: 'Keine Prognosemodelle verfügbar. Bitte erstellen Sie zunächst ein Modell.' 
        });
      }
      
      // 2. Default-Modell auswählen oder das erste nehmen
      const defaultModel = models.find(m => m.is_default) || models[0];
      
      // 3. Start- und Enddatum für das Training berechnen (letzte 180 Tage)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 180);
      
      // 4. Daten formatieren
      const formattedStartDate = format(startDate, 'yyyy-MM-dd');
      const formattedEndDate = format(endDate, 'yyyy-MM-dd');
      
      // 5. Um die Validierung zu umgehen (die trainModelSchema benötigt startDate und endDate),
      // übergeben wir die Daten direkt an die Trainer-Funktion statt über das Schema zu gehen
      try {
        // 6. Modelltraining asynchron starten und nach Abschluss Prognosen erstellen
        forecastService.trainForecastModel(
          defaultModel.id,
          formattedStartDate,
          formattedEndDate
        ).then(async (result) => {
          console.log(`Automatisches Training abgeschlossen: ${JSON.stringify(result)}`);
          
          if (result.success) {
            try {
              // Aktuelles Datum und Datum in 14 Tagen für die Prognoseerstellung
              const now = new Date();
              const futureDate = new Date(now);
              futureDate.setDate(now.getDate() + 14);
              
              const forecastStartDate = format(now, 'yyyy-MM-dd');
              const forecastEndDate = format(futureDate, 'yyyy-MM-dd');
              
              console.log(`Training erfolgreich - erstelle nun Prognose für die nächsten 14 Tage (${forecastStartDate} bis ${forecastEndDate})`);
              
              // Prognosen für die nächsten 14 Tage erstellen
              const forecastResult = await forecastService.createForecast(
                defaultModel.id,
                forecastStartDate,
                forecastEndDate
              );
              
              console.log(`Prognosen erstellt: ${JSON.stringify(forecastResult)}`);
            } catch (forecastError) {
              console.error(`Fehler beim Erstellen der Prognosen nach Training: ${forecastError}`);
            }
          }
        }).catch(error => {
          console.error(`Fehler beim automatischen Training: ${error}`);
        });
        
        // 7. Sofort eine Antwort zurückgeben
        res.json({
          success: true,
          message: 'Prognosemodell-Initialisierung im Hintergrund gestartet',
          modelId: defaultModel.id,
          modelName: defaultModel.name,
          trainingPeriodStart: formattedStartDate,
          trainingPeriodEnd: formattedEndDate
        });
      } catch (trainError) {
        console.error("Fehler beim Starten des Trainings:", trainError);
        res.status(500).json({ 
          success: false, 
          message: "Fehler beim Starten des Trainings", 
          error: String(trainError)
        });
      }
    } catch (error) {
      console.error("Fehler bei der automatischen Initialisierung des Prognosemodells:", error);
      res.status(500).json({ 
        success: false, 
        message: "Fehler bei der automatischen Initialisierung des Prognosemodells", 
        error: String(error)
      });
    }
  });

  // Prognose mit tatsächlichen Werten aktualisieren
  app.put(`${API_PREFIX}/forecast/:id/actual`, async (req: Request, res: Response) => {
    try {
      const forecastId = parseInt(req.params.id, 10);
      const validatedData = updateForecastSchema.parse({ ...req.body, forecastId });
      
      const success = await forecastService.updateForecastWithActual(
        validatedData.forecastId,
        validatedData.actualQuantity
      );
      
      if (!success) {
        return res.status(404).json({ error: `Prognose mit ID ${forecastId} nicht gefunden` });
      }
      
      res.json({ success: true, message: "Prognose erfolgreich aktualisiert" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error(`Fehler beim Aktualisieren der Prognose ${req.params.id}:`, error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  /**
   * Wetterdaten-Routen
   */
   
  // OpenWeather API-Nutzungsstatistiken abrufen
  app.get(`${API_PREFIX}/weather/api-usage`, async (req: Request, res: Response) => {
    try {
      const usage = openWeatherService.getApiUsageStats();
      res.status(200).json(usage);
    } catch (error) {
      console.error('Fehler beim Abrufen der API-Nutzungsstatistiken:', error);
      res.status(500).json({
        status: 'error',
        message: `Fehler beim Abrufen der API-Nutzungsstatistiken: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      });
    }
  });

  // Wetterdaten synchronisieren (Meteostat)
  app.post(`${API_PREFIX}/weather/sync`, async (req: Request, res: Response) => {
    try {
      const validatedData = syncWeatherDataSchema.parse(req.body);
      
      const result = await meteostatService.syncWeatherData(
        validatedData.startDate,
        validatedData.endDate,
        validatedData.stationId
      );
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error("Fehler bei der Wettersynchronisation mit Meteostat:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  
  // OpenWeather Wettervorhersage synchronisieren
  app.post(`${API_PREFIX}/weather/forecast/sync`, async (req: Request, res: Response) => {
    try {
      console.log('Starte Wettervorhersage-Synchronisation mit OpenWeather');
      
      // Überprüfe, ob API-Schlüssel vorhanden ist
      if (!process.env.OPENWEATHER_API_KEY) {
        return res.status(500).json({
          status: 'error',
          message: 'OpenWeather API-Schlüssel fehlt. Bitte fügen Sie ihn zu den Umgebungsvariablen hinzu.'
        });
      }
      
      // Erlaube Überschreiben der Standard-Koordinaten (Dresden)
      const { lat, lon } = req.body;
      
      // Starte Synchronisierung
      const result = await openWeatherService.syncWeatherForecast(lat, lon);
      
      res.status(200).json({
        status: result.status,
        message: result.message || 'Wettervorhersage-Synchronisation abgeschlossen',
        stats: {
          saved: result.saved,
          errors: result.errors,
          duplicates: result.duplicates
        }
      });
    } catch (error) {
      console.error('Fehler bei der Wettervorhersage-Synchronisation mit OpenWeather:', error);
      res.status(500).json({
        status: 'error',
        message: `Fehler bei der Wettervorhersage-Synchronisation: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      });
    }
  });
  
  // OpenWeather historische Wetterdaten synchronisieren
  app.post(`${API_PREFIX}/weather/historical/sync`, async (req: Request, res: Response) => {
    try {
      console.log('Starte historische Wetterdaten-Synchronisation mit OpenWeather');
      
      // Überprüfe, ob API-Schlüssel vorhanden ist
      if (!process.env.OPENWEATHER_API_KEY) {
        return res.status(500).json({
          status: 'error',
          message: 'OpenWeather API-Schlüssel fehlt. Bitte fügen Sie ihn zu den Umgebungsvariablen hinzu.'
        });
      }
      
      const { date, lat, lon } = req.body;
      
      if (!date) {
        return res.status(400).json({
          status: 'error',
          message: 'Datum (date) ist erforderlich'
        });
      }
      
      // Starte Synchronisierung
      const result = await openWeatherService.syncHistoricalWeather(date, lat, lon);
      
      res.status(200).json({
        status: result.status,
        message: result.message || 'Historische Wetterdaten-Synchronisation abgeschlossen',
        stats: {
          saved: result.saved,
          errors: result.errors,
          duplicates: result.duplicates
        }
      });
    } catch (error) {
      console.error('Fehler bei der historischen Wetterdaten-Synchronisation mit OpenWeather:', error);
      res.status(500).json({
        status: 'error',
        message: `Fehler bei der historischen Wetterdaten-Synchronisation: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      });
    }
  });
  
  // Fehlende historische Wetterdaten von OpenWeather synchronisieren
  app.post(`${API_PREFIX}/weather/historical/sync-missing`, async (req: Request, res: Response) => {
    try {
      console.log('Starte Synchronisation fehlender historischer Wetterdaten mit OpenWeather');
      
      // Überprüfe, ob API-Schlüssel vorhanden ist
      if (!process.env.OPENWEATHER_API_KEY) {
        return res.status(500).json({
          status: 'error',
          message: 'OpenWeather API-Schlüssel fehlt. Bitte fügen Sie ihn zu den Umgebungsvariablen hinzu.'
        });
      }
      
      const { startDate, endDate, maxDays, lat, lon } = req.body;
      
      if (!startDate) {
        return res.status(400).json({
          status: 'error',
          message: 'Startdatum (startDate) ist erforderlich'
        });
      }
      
      // Starte Synchronisierung
      const results = await openWeatherService.syncMissingHistoricalWeather(startDate, endDate, maxDays);
      
      res.status(200).json({
        status: 'success',
        message: `Synchronisation fehlender historischer Wetterdaten abgeschlossen (${results.length} Datensätze)`,
        results
      });
    } catch (error) {
      console.error('Fehler bei der Synchronisation fehlender historischer Wetterdaten mit OpenWeather:', error);
      res.status(500).json({
        status: 'error',
        message: `Fehler bei der Synchronisation fehlender historischer Wetterdaten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      });
    }
  });
  
  // Fehlende OpenWeather-Wetterdaten abrufen
  app.get(`${API_PREFIX}/weather/historical/missing`, async (req: Request, res: Response) => {
    try {
      console.log('Prüfe auf fehlende historische Wetterdaten');
      
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      if (!startDate) {
        return res.status(400).json({
          status: 'error',
          message: 'Startdatum (startDate) ist erforderlich'
        });
      }
      
      // Frage fehlende Daten ab
      const missingDates = await openWeatherService.getMissingHistoricalWeatherDates(startDate, endDate);
      
      res.status(200).json({
        status: 'success',
        message: `${missingDates.length} fehlende historische Wetterdaten gefunden`,
        missingDates
      });
    } catch (error) {
      console.error('Fehler beim Abrufen fehlender historischer Wetterdaten:', error);
      res.status(500).json({
        status: 'error',
        message: `Fehler beim Abrufen fehlender historischer Wetterdaten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      });
    }
  });
  
  // Historische Wetterdaten seit 01.01.2023 synchronisieren (mit API-Limitierung)
  app.post(`${API_PREFIX}/weather/historical/sync-from-2023`, async (req: Request, res: Response) => {
    try {
      console.log('Starte Synchronisation historischer Wetterdaten seit 01.01.2023 mit OpenWeather');
      
      // Überprüfe, ob API-Schlüssel vorhanden ist
      if (!process.env.OPENWEATHER_API_KEY) {
        return res.status(500).json({
          status: 'error',
          message: 'OpenWeather API-Schlüssel fehlt. Bitte fügen Sie ihn zu den Umgebungsvariablen hinzu.'
        });
      }
      
      const { batchSize } = req.body;
      
      // Starte Synchronisierung mit API-Limitierung
      const result = await openWeatherService.syncHistoricalWeatherFrom2023(batchSize || 20);
      
      res.status(200).json({
        status: result.status,
        message: result.message,
        processedDays: result.processedDays,
        totalMissingDays: result.totalMissingDays
      });
    } catch (error) {
      console.error('Fehler bei der historischen Wetterdaten-Synchronisation seit 2023:', error);
      res.status(500).json({
        status: 'error',
        message: `Fehler bei der historischen Wetterdaten-Synchronisation seit 2023: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      });
    }
  });

  // Datenabdeckung prüfen
  app.get(`${API_PREFIX}/weather/missing`, async (req: Request, res: Response) => {
    try {
      const queryParams = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        stationId: req.query.stationId as string | undefined
      };
      
      const validatedData = getMissingWeatherDataSchema.parse(queryParams);
      
      const missingRanges = await meteostatService.getMissingWeatherDataRanges(
        validatedData.startDate,
        validatedData.endDate,
        validatedData.stationId
      );
      
      res.json({ missingRanges });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error("Fehler beim Abrufen fehlender Wetterdaten:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  // Fehlende Wetterdaten synchronisieren
  app.post(`${API_PREFIX}/weather/sync-missing`, async (req: Request, res: Response) => {
    try {
      const validatedData = syncWeatherDataSchema.parse(req.body);
      
      const result = await meteostatService.syncMissingWeatherData(
        validatedData.startDate,
        validatedData.endDate,
        validatedData.stationId
      );
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error("Fehler bei der Synchronisation fehlender Wetterdaten:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  
  // Aktuelle Wetterdaten abrufen
  app.get(`${API_PREFIX}/weather/current`, async (req: Request, res: Response) => {
    try {
      // Default-Standort verwenden (kann später parametrisiert werden)
      const location = "Dresden,DE"; 
      const weatherData = await openWeatherService.getCurrentWeather(location);
      
      res.json(weatherData);
    } catch (error) {
      console.error("Fehler beim Abrufen aktueller Wetterdaten:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  
  // Wettervorhersage abrufen
  app.get(`${API_PREFIX}/weather/forecast`, async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 5;
      // Default-Standort verwenden (kann später parametrisiert werden)
      const location = "Dresden,DE"; 
      const forecastData = await openWeatherService.getWeatherForecast(location, days);
      
      res.json(forecastData);
    } catch (error) {
      console.error("Fehler beim Abrufen der Wettervorhersage:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  
  // Umsatzprognose abrufen
  app.get(`${API_PREFIX}/forecast/revenue`, async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate und endDate sind erforderlich" });
      }
      
      // Verwende das neueste Modell für die Umsatzprognose
      const models = await forecastService.getForecastModels();
      let revenueModel = models.find(m => m.modelType.includes('revenue'));
      
      if (!revenueModel) {
        return res.status(404).json({ error: "Kein Umsatzprognosemodell gefunden" });
      }
      
      const revenueForecast = await forecastService.getRevenueForecast(
        revenueModel.id,
        startDate,
        endDate
      );
      
      res.json(revenueForecast);
    } catch (error) {
      console.error("Fehler beim Abrufen der Umsatzprognose:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  
  // Warenbedarf-Prognose abrufen
  app.get(`${API_PREFIX}/forecast/demand`, async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const machineId = req.query.machineId ? parseInt(req.query.machineId as string) : undefined;
      const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate und endDate sind erforderlich" });
      }
      
      // Verwende das neueste Modell für die Bedarfsprognose
      const models = await forecastService.getForecastModels();
      let demandModel = models.find(m => m.modelType.includes('demand'));
      
      if (!demandModel) {
        return res.status(404).json({ error: "Kein Bedarfsprognosemodell gefunden" });
      }
      
      const demandForecast = await forecastService.getProductDemandForecast(
        demandModel.id,
        startDate,
        endDate,
        machineId,
        productId
      );
      
      res.json(demandForecast);
    } catch (error) {
      console.error("Fehler beim Abrufen der Bedarfsprognose:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  /**
   * Feiertags-Routen
   */

  // Schema für die Synchronisation aller Feiertagsarten
  const syncAllHolidaysSchema = z.object({
    year: z.number().int().positive(),
    state: z.string().optional(),
    allStates: z.boolean().default(false), // Option für alle Bundesländer
    includeSchoolHolidays: z.boolean().default(true)
  });

  // Die Feiertags-Routen wurden in die holidays.ts verschoben
  // Dort werden sie über einen express.Router() definiert und in der routes.ts registriert
  // Die folgenden Routen wurden auskommentiert, um Konflikte zu vermeiden
  
  /*
  // Öffentliche Feiertage synchronisieren
  app.post(`${API_PREFIX}/holidays/sync`, async (req: Request, res: Response) => {
    try {
      const validatedData = syncHolidaysSchema.parse(req.body);
      
      const result = await holidayService.syncHolidays(
        validatedData.year,
        validatedData.state ? [validatedData.state] : undefined
      );
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error("Fehler bei der Feiertagssynchronisation:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  
  // Schulferien synchronisieren
  app.post(`${API_PREFIX}/holidays/sync-school`, async (req: Request, res: Response) => {
    try {
      const validatedData = syncHolidaysSchema.parse(req.body);
      
      const result = await holidayService.syncSchoolHolidays(
        validatedData.year,
        validatedData.state ? [validatedData.state] : undefined
      );
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error("Fehler bei der Schulferien-Synchronisation:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  */

  // Alle Feiertagstypen synchronisieren
  app.post(`${API_PREFIX}/holidays/sync-all`, async (req: Request, res: Response) => {
    try {
      const validatedData = syncAllHolidaysSchema.parse(req.body);
      
      // Liste aller deutschen Bundesländer
      const ALL_GERMAN_STATES = [
        'SN', 'BB', 'BE', 'BW', 'BY', 'HB', 'HE', 'HH', 
        'MV', 'NI', 'NW', 'RP', 'SH', 'SL', 'ST', 'TH'
      ];
      
      // Wenn alle Bundesländer synchronisiert werden sollen, verwenden wir die vollständige Liste
      const statesToSync = validatedData.allStates ? ALL_GERMAN_STATES : 
                          (validatedData.state ? [validatedData.state] : ['SN']); // Default-Bundesland SN
      
      console.log(`Synchronisiere alle Feiertage für Jahr ${validatedData.year} und ${validatedData.allStates ? 'alle Bundesländer' : `Bundesland ${validatedData.state || 'SN'}`}`);
      
      // Aufruf der Holiday-Service-Methode mit dem korrekten Format
      const result = await holidayService.syncAllHolidays({
        years: [validatedData.year],
        states: statesToSync
      });
      
      res.json({
        success: true,
        data: {
          year: validatedData.year,
          states: statesToSync,
          allStates: validatedData.allStates,
          ...result
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error("Fehler bei der Feiertags- und Schulferien-Synchronisation:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  // Fehlende Feiertage prüfen
  app.get(`${API_PREFIX}/holidays/missing`, async (req: Request, res: Response) => {
    try {
      const queryParams = {
        startYear: parseInt(req.query.startYear as string, 10),
        endYear: parseInt(req.query.endYear as string, 10),
        state: req.query.state as string | undefined
      };
      
      const validatedData = getMissingHolidaysSchema.parse(queryParams);
      
      const missingYears = await holidayService.getMissingHolidayYears(
        validatedData.startYear,
        validatedData.endYear,
        validatedData.state
      );
      
      res.json({ missingYears });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error("Fehler beim Abrufen fehlender Feiertage:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  // Fehlende Feiertage synchronisieren
  app.post(`${API_PREFIX}/holidays/sync-missing`, async (req: Request, res: Response) => {
    try {
      const validatedData = getMissingHolidaysSchema.parse(req.body);
      
      const result = await holidayService.syncMissingHolidays(
        validatedData.startYear,
        validatedData.endYear,
        validatedData.state,
        validatedData.includeSchoolHolidays
      );
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error("Fehler bei der Synchronisation fehlender Feiertage:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  // Feiertage nach Zeitraum abrufen
  app.get(`${API_PREFIX}/holidays/by-date-range`, async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, type, state, limit } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate und endDate sind erforderlich" });
      }
      
      // Validierung
      const schema = z.object({
        startDate: z.string(),
        endDate: z.string(),
        type: z.string().optional(),
        state: z.string().optional(),
        limit: z.string().transform(val => parseInt(val, 10)).optional()
      });
      
      const validatedData = schema.parse({
        startDate,
        endDate,
        type,
        state,
        limit
      });
      
      const holidays = await holidayService.getHolidaysByDateRange(
        validatedData.startDate,
        validatedData.endDate,
        validatedData.type,
        validatedData.state,
        validatedData.limit
      );
      
      res.json(holidays);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
      console.error("Fehler beim Abrufen der Feiertage:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });

  /**
   * Prophet-spezifische Routen
   */

  // Batch-Automatisches Training aller Modelle (separate Route)
  app.post(`${API_PREFIX}/forecast/batch-auto-train`, async (_req: Request, res: Response) => {
    try {
      console.log("Starte automatisches Training aller aktiven Modelle");
      
      // Initialisiere Prophet-Verzeichnis
      prophetService.initProphetDirectory();
      
      // Führe Auto-Training aus
      const result = await prophetService.runAutoTraining();
      
      if (!result.success) {
        return res.status(500).json({
          error: result.message || 'Fehler beim automatischen Training',
          details: result
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Automatisches Training abgeschlossen',
        details: result
      });
    } catch (error) {
      console.error("Fehler beim automatischen Training:", error);
      res.status(500).json({
        error: `Fehler beim automatischen Training: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      });
    }
  });

  /**
   * Datenabdeckungs-Routen
   */

  // Datenabdeckung abrufen
  app.get(`${API_PREFIX}/data-coverage`, async (_req: Request, res: Response) => {
    try {
      // Importiere die benötigten Services
      const { transactionService } = await import("../services/transactionService");
      
      // Aktualisiere die Abdeckungen, bevor sie abgerufen werden
      await meteostatService.updateWeatherDataCoverage();
      await holidayService.updateHolidayDataCoverage();
      await openWeatherService.updateWeatherDataCoverage();
      
      // Aktualisiere auch die Transaktionsdatenabdeckung
      await transactionService.updateTransactionDataCoverage();
      
      // Daten direkt aus der Datenbank holen ohne require
      const { db } = await import("../db");
      const schema = await import("@shared/schema");
      const result = await db.select().from(schema.dataCoverage);
      
      res.json(result);
    } catch (error) {
      console.error("Fehler beim Abrufen der Datenabdeckung:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
  
  // Monatliche Transaktionsdaten für die Visualisierung abrufen
  app.get(`${API_PREFIX}/data-coverage/monthly-transactions`, async (req: Request, res: Response) => {
    try {
      const { transactionService } = await import("../services/transactionService");
      
      // Start- und Enddatum aus den Query-Parametern extrahieren (optional)
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      
      if (req.query.startDate && typeof req.query.startDate === 'string') {
        startDate = new Date(req.query.startDate);
      }
      
      if (req.query.endDate && typeof req.query.endDate === 'string') {
        endDate = new Date(req.query.endDate);
      }
      
      // Monatliche Transaktionsdaten abrufen
      const monthlyData = await transactionService.getMonthlyTransactionData(startDate, endDate);
      
      res.json(monthlyData);
    } catch (error) {
      console.error("Fehler beim Abrufen der monatlichen Transaktionsdaten:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
}