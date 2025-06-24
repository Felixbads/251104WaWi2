/**
 * Test-Skript für das Prophet-basierte Prognosemodell
 */

import fetch from 'node-fetch';
const API_URL = 'http://localhost:5000/api';

/**
 * Erstellt ein neues Prophet-Prognosemodell
 */
async function createProphetModel() {
  try {
    console.log('Erstelle neues Prophet-Prognosemodell...');
    
    const response = await fetch(`${API_URL}/forecast/models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Prophet Testmodell',
        description: 'Automatisch erstelltes Testmodell mit Prophet',
        modelType: 'prophet',
        usesMachineData: true,
        usesWeatherData: true,
        usesHolidayData: true
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Fehler beim Erstellen des Modells:', data);
      return null;
    }
    
    console.log('Modell erfolgreich erstellt:', data);
    return data.id;
  } catch (error) {
    console.error('Fehler beim Erstellen des Modells:', error);
    return null;
  }
}

/**
 * Trainiert ein Prognosemodell
 */
async function trainModel(modelId) {
  try {
    console.log(`Trainiere Modell ${modelId}...`);
    
    // Trainiere für die letzten 90 Tage
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];
    
    console.log(`Trainingszeitraum: ${formattedStartDate} bis ${formattedEndDate}`);
    
    const response = await fetch(`${API_URL}/forecast/models/${modelId}/train`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startDate: formattedStartDate,
        endDate: formattedEndDate
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Fehler beim Training des Modells:', data);
      return false;
    }
    
    console.log('Modell erfolgreich trainiert:', data);
    return true;
  } catch (error) {
    console.error('Fehler beim Training des Modells:', error);
    return false;
  }
}

/**
 * Erstellt eine Prognose mit einem trainierten Modell
 */
async function createForecast(modelId) {
  try {
    console.log(`Erstelle Prognose mit Modell ${modelId}...`);
    
    // Prognose für die nächsten 14 Tage
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 14);
    
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];
    
    console.log(`Prognosezeitraum: ${formattedStartDate} bis ${formattedEndDate}`);
    
    const response = await fetch(`${API_URL}/forecast/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        modelId,
        startDate: formattedStartDate,
        endDate: formattedEndDate
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Fehler bei der Erstellung der Prognose:', data);
      return false;
    }
    
    console.log('Prognose erfolgreich erstellt:', data);
    return true;
  } catch (error) {
    console.error('Fehler bei der Erstellung der Prognose:', error);
    return false;
  }
}

/**
 * Startet einen automatischen Trainingslauf
 */
async function runAutoTraining() {
  try {
    console.log('Starte automatischen Trainingslauf...');
    
    const response = await fetch(`${API_URL}/forecast/auto-train`, {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Fehler beim automatischen Training:', data);
      return false;
    }
    
    console.log('Automatischer Trainingslauf erfolgreich:', data);
    return true;
  } catch (error) {
    console.error('Fehler beim automatischen Training:', error);
    return false;
  }
}

/**
 * Führt die vollständige Testsuite aus
 */
async function runTests() {
  try {
    // Erstelle ein neues Modell
    const modelId = await createProphetModel();
    if (!modelId) {
      console.error('Test fehlgeschlagen: Konnte kein Modell erstellen');
      return;
    }
    
    // Trainiere das Modell
    const trainSuccess = await trainModel(modelId);
    if (!trainSuccess) {
      console.error('Test fehlgeschlagen: Konnte das Modell nicht trainieren');
      return;
    }
    
    // Erstelle eine Prognose
    const forecastSuccess = await createForecast(modelId);
    if (!forecastSuccess) {
      console.error('Test fehlgeschlagen: Konnte keine Prognose erstellen');
      return;
    }
    
    // Führe automatisches Training durch
    const autoTrainSuccess = await runAutoTraining();
    if (!autoTrainSuccess) {
      console.error('Test fehlgeschlagen: Konnte kein automatisches Training durchführen');
      return;
    }
    
    console.log('Alle Tests erfolgreich abgeschlossen!');
  } catch (error) {
    console.error('Fehler bei der Ausführung der Tests:', error);
  }
}

// Starte die Tests
runTests();