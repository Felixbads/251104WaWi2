/**
 * Prophet-Service für die Verkaufsprognose
 * 
 * Dieser Service ist für die Anbindung des Python-basierten Prophet-Modells
 * an das TypeScript-Backend zuständig. Er ruft die Python-Skripte auf und
 * verarbeitet deren Ergebnisse.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { db } from '../db';
import { forecastModels, forecasts } from '@shared/schema';
import { eq, and, between } from 'drizzle-orm';

/**
 * Führt ein Python-Skript aus und gibt die Ergebnisse zurück
 * 
 * @param scriptPath Pfad zum Python-Skript
 * @param args Kommandozeilenargumente für das Skript
 * @returns Promise mit dem JSON-Output des Skripts
 */
async function runPythonScript(scriptPath: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    console.log(`Starte Python-Skript: ${scriptPath} ${args.join(' ')}`);
    
    // Vollständigen Pfad bestimmen (mit ES Modules kompatibel)
    // Pfad korrigieren: "server/python/prophet_forecast.py" anstelle von "../python/prophet_forecast.py"
    const correctedPath = scriptPath.replace('../', 'server/');
    const fullPath = path.resolve(process.cwd(), correctedPath);
    
    // Prüfen, ob das Skript existiert
    if (!fs.existsSync(fullPath)) {
      return reject(new Error(`Python-Skript nicht gefunden: ${fullPath}`));
    }
    
    // Python-Prozess starten
    const pythonProcess = spawn('python', [fullPath, ...args]);
    
    let output = '';
    let errorOutput = '';
    
    // Ausgabe sammeln
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    // Fehlerausgabe sammeln
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`Python-Fehler: ${data.toString()}`);
    });
    
    // Prozess beendet
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python-Prozess mit Code ${code} beendet. Fehler: ${errorOutput}`);
        return reject(new Error(`Python-Prozess fehlgeschlagen mit Code ${code}: ${errorOutput}`));
      }
      
      try {
        // Versuche die JSON-Daten aus der Ausgabe zu extrahieren
        // Entferne alle Logging-Ausgaben vor der JSON-Antwort
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonString = jsonMatch[0];
          const result = JSON.parse(jsonString);
          resolve(result);
        } else {
          console.error('Kein JSON in der Ausgabe gefunden');
          reject(new Error('Kein JSON in der Python-Ausgabe gefunden'));
        }
      } catch (error) {
        console.error(`Fehler beim Parsen der Python-Ausgabe: ${error}`);
        reject(new Error(`Ungültige Python-Ausgabe: ${output}`));
      }
    });
    
    // Prozess-Fehler
    pythonProcess.on('error', (error) => {
      console.error(`Fehler beim Starten des Python-Prozesses: ${error}`);
      reject(error);
    });
  });
}

/**
 * Trainiert ein Prophet-Modell mit historischen Daten
 * 
 * @param modelId ID des zu trainierenden Modells
 * @param startDate Startdatum für Trainingsdaten
 * @param endDate Enddatum für Trainingsdaten
 * @param locationIds Optionale Liste von Standort-IDs zur Eingrenzung
 * @param machineIds Optionale Liste von Maschinen-IDs zur Eingrenzung
 * @returns Trainingsergebnis
 */
export async function trainProphetModel(
  modelId: number,
  startDate: string,
  endDate: string,
  locationIds?: number[],
  machineIds?: number[]
): Promise<any> {
  try {
    console.log(`Starte Prophet-Training für Modell ${modelId} im Zeitraum ${startDate} bis ${endDate}`);
    
    // Aktualisiere den Modellstatus auf "training"
    await db.update(forecastModels)
      .set({
        status: "training",
        updated_at: new Date()
      })
      .where(eq(forecastModels.id, modelId));
    
    // Kommandozeilenargumente für das Python-Skript
    const args = [
      '--action', 'train',
      '--model-id', modelId.toString(),
      '--start-date', startDate,
      '--end-date', endDate
    ];
    
    // Füge Standort-IDs hinzu, wenn angegeben
    if (locationIds && locationIds.length > 0) {
      args.push('--location-ids', locationIds.join(','));
    }
    
    // Füge Maschinen-IDs hinzu, wenn angegeben
    if (machineIds && machineIds.length > 0) {
      args.push('--machine-ids', machineIds.join(','));
    }
    
    // Python-Skript ausführen
    const result = await runPythonScript('../python/prophet_forecast.py', args);
    
    console.log(`Prophet-Training abgeschlossen: ${JSON.stringify(result)}`);
    
    return result;
  } catch (error) {
    console.error(`Fehler beim Prophet-Training: ${error}`);
    
    // Bei Fehler: Modellstatus auf "error" setzen
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
 * Erstellt eine Prognose mit einem trainierten Prophet-Modell
 * 
 * @param modelId ID des zu verwendenden Modells
 * @param startDate Startdatum für die Prognose
 * @param endDate Enddatum für die Prognose
 * @param locationIds Optionale Liste von Standort-IDs zur Eingrenzung
 * @param machineIds Optionale Liste von Maschinen-IDs zur Eingrenzung
 * @returns Prognoseergebnis
 */
export async function createProphetForecast(
  modelId: number,
  startDate: string,
  endDate: string,
  locationIds?: number[],
  machineIds?: number[]
): Promise<any> {
  try {
    console.log(`Erstelle Prophet-Prognose mit Modell ${modelId} für Zeitraum ${startDate} bis ${endDate}`);
    
    // Modell abrufen und prüfen, ob es bereit ist
    const model = await db.query.forecastModels.findFirst({
      where: eq(forecastModels.id, modelId)
    });
    
    if (!model) {
      return { success: false, message: `Modell mit ID ${modelId} nicht gefunden` };
    }
    
    if (model.status !== "ready") {
      return { success: false, message: `Modell mit ID ${modelId} ist nicht bereit (Status: ${model.status})` };
    }
    
    // Kommandozeilenargumente für das Python-Skript
    const args = [
      '--action', 'forecast',
      '--model-id', modelId.toString(),
      '--start-date', startDate,
      '--end-date', endDate
    ];
    
    // Füge Standort-IDs hinzu, wenn angegeben
    if (locationIds && locationIds.length > 0) {
      args.push('--location-ids', locationIds.join(','));
    }
    
    // Füge Maschinen-IDs hinzu, wenn angegeben
    if (machineIds && machineIds.length > 0) {
      args.push('--machine-ids', machineIds.join(','));
    }
    
    // Python-Skript ausführen
    const result = await runPythonScript('../python/prophet_forecast.py', args);
    
    console.log(`Prophet-Prognose abgeschlossen: ${JSON.stringify(result)}`);
    
    // Erfolg/Misserfolg zurückgeben
    return result;
  } catch (error) {
    console.error(`Fehler bei der Prophet-Prognose: ${error}`);
    return { success: false, message: `Fehler bei der Prognoseerstellung: ${error}` };
  }
}

/**
 * Führt einen automatischen Trainingslauf für alle aktiven Modelle durch
 * 
 * @returns Ergebnis des automatischen Trainingslaufs
 */
export async function runAutoTraining(): Promise<any> {
  try {
    console.log("Starte automatischen Prophet-Trainingslauf");
    
    // Python-Skript ausführen (ohne zusätzliche Argumente)
    const result = await runPythonScript('../python/auto_trainer.py', []);
    
    console.log(`Automatischer Trainingslauf abgeschlossen: ${JSON.stringify(result)}`);
    
    return result;
  } catch (error) {
    console.error(`Fehler beim automatischen Training: ${error}`);
    return { success: false, message: `Fehler beim automatischen Training: ${error}` };
  }
}

/**
 * Initialisiert die Verzeichnisstruktur für Prophet-Modelle
 */
export function initProphetDirectory(): void {
  try {
    // In ES Modules ist __dirname nicht verfügbar, also verwenden wir eine Alternative
    const modelDir = path.resolve(process.cwd(), 'data/models');
    
    // Prüfe, ob das Verzeichnis existiert, und erstelle es bei Bedarf
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
      console.log(`Prophet-Modellverzeichnis erstellt: ${modelDir}`);
    }
  } catch (error) {
    console.error(`Fehler beim Initialisieren des Prophet-Verzeichnisses: ${error}`);
  }
}