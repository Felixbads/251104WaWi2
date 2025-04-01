#!/usr/bin/env python3
"""
Automatisches Modelltraining für Verkaufsprognosen

Dieses Skript wird als Cronjob oder geplante Aufgabe ausgeführt, um Prognosemodelle
regelmäßig neu zu trainieren und Prognosen für kommende Tage zu erstellen.

Funktionen:
1. Automatisches Training aller aktiven Modelle
2. Erstellung von Prognosen für die nächsten 14 Tage
3. Aktualisierung von Modellstatistiken
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import argparse

# Importiere den ProphetForecaster
from prophet_forecast import ProphetForecaster

# Konfiguration des Loggings
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("auto_trainer")

# Lade Umgebungsvariablen
load_dotenv()

# Datenbank-Verbindungsinformationen
DB_URL = os.getenv('DATABASE_URL')

class AutoTrainer:
    """Automatisches Modelltraining und Prognose"""
    
    def __init__(self):
        """Initialisiert den AutoTrainer"""
        self.db_conn = None
        self.forecaster = ProphetForecaster()
        
    def get_db_connection(self):
        """Stellt eine Verbindung zur Datenbank her oder verwendet eine bestehende"""
        if self.db_conn is None or self.db_conn.closed:
            try:
                self.db_conn = psycopg2.connect(DB_URL)
                logger.info("Datenbankverbindung hergestellt")
            except Exception as e:
                logger.error(f"Fehler bei der Verbindung zur Datenbank: {e}")
                self.db_conn = None
        return self.db_conn
    
    def close_db_connection(self):
        """Schließt die Datenbankverbindung"""
        if self.db_conn is not None and not self.db_conn.closed:
            self.db_conn.close()
            logger.info("Datenbankverbindung geschlossen")
            self.db_conn = None
            
        # Schließe auch die Forecaster-Verbindung
        self.forecaster.close_db_connection()

    def get_active_models(self):
        """
        Ruft alle aktiven Modelle ab, die trainiert werden sollten
        
        Returns:
            Liste mit Modell-Informationen
        """
        conn = self.get_db_connection()
        if conn is None:
            logger.error("Keine Datenbankverbindung verfügbar")
            return []
            
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Rufe alle Modelle ab, die nicht im Status "deprecated" sind
            cursor.execute("""
                SELECT * FROM forecast_models 
                WHERE status != 'deprecated'
                ORDER BY id
            """)
            
            models = cursor.fetchall()
            logger.info(f"{len(models)} aktive Modelle gefunden")
            return [dict(model) for model in models]

    def get_training_period(self, model_info):
        """
        Bestimmt einen geeigneten Trainingszeitraum für ein Modell
        Verwendet das früheste verfügbare Transaktionsdatum als Startdatum
        
        Args:
            model_info: Dict mit Modellinformationen
            
        Returns:
            Tuple aus (start_date, end_date) im Format YYYY-MM-DD
        """
        # Ende des Trainingszeitraums ist gestern
        end_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Hole das früheste verfügbare Transaktionsdatum aus der Datenbank
        conn = self.get_db_connection()
        if conn is None:
            logger.error("Keine Datenbankverbindung verfügbar")
            # Standardwert: 180 Tage zurück
            start_date = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')
        else:
            try:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT MIN(DATE(datetime)) as earliest_date 
                        FROM transactions
                    """)
                    result = cursor.fetchone()
                    if result and result[0]:
                        earliest_date = result[0]
                        start_date = earliest_date.strftime('%Y-%m-%d') if hasattr(earliest_date, 'strftime') else str(earliest_date)
                        logger.info(f"Frühestes Transaktionsdatum gefunden: {start_date}")
                    else:
                        # Kein Datum gefunden, verwende 180 Tage als Standard
                        logger.warning("Kein frühestes Transaktionsdatum gefunden, verwende Standard")
                        start_date = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')
            except Exception as e:
                logger.error(f"Fehler beim Abrufen des frühesten Transaktionsdatums: {e}")
                start_date = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')
        
        logger.info(f"Trainingszeitraum für Modell {model_info['id']}: {start_date} bis {end_date}")
        return start_date, end_date

    def get_forecast_period(self):
        """
        Bestimmt den Prognosezeitraum für die nächsten 14 Tage
        
        Returns:
            Tuple aus (start_date, end_date) im Format YYYY-MM-DD
        """
        # Start des Prognosezeitraums ist heute
        start_date = datetime.now().strftime('%Y-%m-%d')
        
        # Ende des Prognosezeitraums ist in 14 Tagen
        end_date = (datetime.now() + timedelta(days=14)).strftime('%Y-%m-%d')
        
        logger.info(f"Prognosezeitraum: {start_date} bis {end_date}")
        return start_date, end_date

    def train_and_forecast_all_models(self):
        """
        Trainiert alle aktiven Modelle und erstellt Prognosen
        
        Returns:
            Dict mit Ergebnisstatistiken
        """
        models = self.get_active_models()
        if not models:
            logger.warning("Keine aktiven Modelle gefunden")
            return {"success": False, "message": "Keine aktiven Modelle gefunden"}
        
        results = {
            "models_trained": 0,
            "models_failed": 0,
            "forecasts_created": 0,
            "forecasts_failed": 0,
            "details": []
        }
        
        for model in models:
            model_id = model['id']
            model_result = {"model_id": model_id, "name": model['name']}
            
            try:
                # Bestimme Trainingszeitraum
                start_date, end_date = self.get_training_period(model)
                
                # Trainiere das Modell
                logger.info(f"Trainiere Modell {model_id}: {model['name']}")
                train_result = self.forecaster.train_model(model_id, start_date, end_date)
                
                if train_result['success']:
                    results["models_trained"] += 1
                    model_result["training"] = "success"
                    
                    # Erstelle Prognose für die nächsten 14 Tage
                    forecast_start, forecast_end = self.get_forecast_period()
                    logger.info(f"Erstelle Prognose für Modell {model_id}")
                    forecast_result = self.forecaster.create_forecast(model_id, forecast_start, forecast_end)
                    
                    if forecast_result['success']:
                        results["forecasts_created"] += 1
                        model_result["forecast"] = "success"
                        model_result["forecast_count"] = forecast_result.get('forecast_count', 0)
                    else:
                        results["forecasts_failed"] += 1
                        model_result["forecast"] = "failed"
                        model_result["forecast_message"] = forecast_result.get('message', 'Unbekannter Fehler')
                else:
                    results["models_failed"] += 1
                    model_result["training"] = "failed"
                    model_result["training_message"] = train_result.get('message', 'Unbekannter Fehler')
            
            except Exception as e:
                logger.error(f"Fehler bei Modell {model_id}: {e}", exc_info=True)
                results["models_failed"] += 1
                model_result["training"] = "error"
                model_result["error_message"] = str(e)
            
            results["details"].append(model_result)
        
        # Zusammenfassung loggen
        logger.info(f"Training abgeschlossen: {results['models_trained']} Modelle trainiert, "
                    f"{results['models_failed']} fehlgeschlagen, "
                    f"{results['forecasts_created']} Prognosen erstellt")
        
        return {
            "success": True,
            "timestamp": datetime.now().isoformat(),
            "results": results
        }

    def log_training_run(self, results):
        """
        Protokolliert einen Trainingslauf in der Datenbank
        
        Args:
            results: Dict mit Trainingsergebnissen
            
        Returns:
            ID des Protokolleintrags oder None bei Fehler
        """
        conn = self.get_db_connection()
        if conn is None:
            logger.error("Keine Datenbankverbindung verfügbar")
            return None
            
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO auto_training_logs (
                        timestamp, models_trained, models_failed, 
                        forecasts_created, forecasts_failed, details
                    ) VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    datetime.now(),
                    results["results"]["models_trained"],
                    results["results"]["models_failed"],
                    results["results"]["forecasts_created"],
                    results["results"]["forecasts_failed"],
                    json.dumps(results["results"]["details"])
                ))
                
                log_id = cursor.fetchone()[0]
                conn.commit()
                logger.info(f"Trainingslauf protokolliert mit ID {log_id}")
                return log_id
                
        except Exception as e:
            logger.error(f"Fehler beim Protokollieren des Trainingslaufs: {e}", exc_info=True)
            return None

    def run(self):
        """
        Führt den kompletten Trainingsprozess aus
        
        Returns:
            Dict mit Ergebnissen
        """
        try:
            logger.info("Starte automatischen Trainingslauf")
            
            # Trainiere alle Modelle und erstelle Prognosen
            results = self.train_and_forecast_all_models()
            
            # Protokolliere den Trainingslauf
            if results["success"]:
                log_id = self.log_training_run(results)
                if log_id:
                    results["log_id"] = log_id
            
            return results
            
        except Exception as e:
            logger.error(f"Fehler beim automatischen Training: {e}", exc_info=True)
            return {"success": False, "message": str(e)}
            
        finally:
            # Schließe die Datenbankverbindung
            self.close_db_connection()

# CLI-Interface für direkten Aufruf
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Automatisches Modelltraining und Prognose')
    parser.add_argument('--log-file', help='Pfad zur Log-Datei (optional)')
    
    args = parser.parse_args()
    
    # Füge bei Bedarf einen Datei-Handler zum Logger hinzu
    if args.log_file:
        file_handler = logging.FileHandler(args.log_file)
        file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
        logger.addHandler(file_handler)
    
    auto_trainer = AutoTrainer()
    results = auto_trainer.run()
    
    # Gib die Ergebnisse als JSON aus
    print(json.dumps(results, indent=2))
    
    # Exit-Code basierend auf Erfolg/Misserfolg
    sys.exit(0 if results["success"] else 1)