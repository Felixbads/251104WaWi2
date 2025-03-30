/**
 * API-Routen für Prognosemodelle, Wetterdaten und Feiertage
 */

import { Express, Request, Response } from "express";
import * as forecastService from "../services/forecastService";
import * as meteostatService from "../services/meteostatService";
import * as holidayService from "../services/holidayService";
import * as openWeatherService from "../services/openWeatherService";
import { z } from "zod";

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
  machineId: z.number().int().positive().optional()
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
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Ungültige Daten", details: error.errors });
      }
      
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
        machineId: req.query.machineId ? parseInt(req.query.machineId as string, 10) : undefined
      };
      
      const validatedData = getForecastsSchema.parse(queryParams);
      
      const forecasts = await forecastService.getForecasts(
        validatedData.startDate,
        validatedData.endDate,
        validatedData.modelId,
        validatedData.locationId,
        validatedData.machineId
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
    includeSchoolHolidays: z.boolean().default(true)
  });

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

  // Alle Feiertagstypen synchronisieren
  app.post(`${API_PREFIX}/holidays/sync-all`, async (req: Request, res: Response) => {
    try {
      const validatedData = syncAllHolidaysSchema.parse(req.body);
      
      const result = await holidayService.syncAllHolidays(
        validatedData.year,
        validatedData.state ? [validatedData.state] : undefined
      );
      
      res.json(result);
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
   * Datenabdeckungs-Routen
   */

  // Datenabdeckung abrufen
  app.get(`${API_PREFIX}/data-coverage`, async (_req: Request, res: Response) => {
    try {
      // Aktualisiere die Abdeckungen, bevor sie abgerufen werden
      await meteostatService.updateWeatherDataCoverage();
      await holidayService.updateHolidayDataCoverage();
      await openWeatherService.updateWeatherDataCoverage();
      
      const result = await import("../db").then(({ db }) => {
        const { dataCoverage } = require("@shared/schema");
        return db.select().from(dataCoverage);
      });
      
      res.json(result);
    } catch (error) {
      console.error("Fehler beim Abrufen der Datenabdeckung:", error);
      res.status(500).json({ error: "Interner Serverfehler" });
    }
  });
}