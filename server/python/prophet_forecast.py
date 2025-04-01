#!/usr/bin/env python3
"""
Prophet-basiertes Prognosemodell für Verkaufsautomaten

Dieses Skript bietet eine Prophet-basierte Implementierung für Verkaufsprognosen.
Es verbindet sich mit der Postgres-Datenbank, nutzt historische Transaktionsdaten,
und berücksichtigt Feiertage, Wetter und andere saisonale Faktoren.

Funktionen:
1. Trainingsfunktionen für Zeitreihenmodelle
2. Prognoseberechnung für verschiedene Zeiträume
3. Automatisches Modell-Training
4. Integration mit der Hauptanwendung
"""

import os
import sys
import json
import logging
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
from prophet import Prophet
import pickle
import pathlib

# Konfiguration des Loggings
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("prophet_forecast")

# Lade Umgebungsvariablen
load_dotenv()

# Datenbank-Verbindungsinformationen
DB_URL = os.getenv('DATABASE_URL')

# Verzeichnis für die Modellspeicherung
MODEL_DIR = pathlib.Path(__file__).parent.parent.parent / "data" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

class ProphetForecaster:
    """Prophet-basierter Verkaufsprognose-Klasse"""
    
    def __init__(self):
        """Initialisiert den Forecaster"""
        self.db_conn = None
        self.model = None
        self.model_info = {}
        self.regressor_names = []  # Liste der Regressornamen
        
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

    def get_historical_data(self, model_id, start_date, end_date, location_ids=None, machine_ids=None):
        """
        Ruft historische Transaktionsdaten für das Modelltraining ab
        
        Args:
            model_id: ID des zu trainierenden Modells
            start_date: Startdatum im Format 'YYYY-MM-DD'
            end_date: Enddatum im Format 'YYYY-MM-DD'
            location_ids: Optionale Liste von Standort-IDs
            machine_ids: Optionale Liste von Maschinen-IDs
            
        Returns:
            DataFrame mit historischen Daten
        """
        conn = self.get_db_connection()
        if conn is None:
            logger.error("Keine Datenbankverbindung verfügbar")
            return None
            
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Rufe Modellinformationen ab, um zu wissen, welche Daten einbezogen werden sollen
            cursor.execute("""
                SELECT * FROM forecast_models WHERE id = %s
            """, (model_id,))
            model_info = cursor.fetchone()
            
            if not model_info:
                logger.error(f"Modell mit ID {model_id} nicht gefunden")
                return None
                
            self.model_info = dict(model_info)
            
            # Basis-SQL für Transaktionsdaten
            sql = """
                SELECT 
                    DATE(t.datetime) as ds,
                    COUNT(*) as transactions,
                    SUM(t.quantity) as y,
                    SUM(t.price) as revenue,
                    EXTRACT(DOW FROM DATE(t.datetime)) as day_of_week
                FROM 
                    transactions t
                WHERE 
                    DATE(t.datetime) BETWEEN %s AND %s
            """
            
            params = [start_date, end_date]
            
            # Filter hinzufügen
            if location_ids and len(location_ids) > 0:
                location_ids_str = ','.join(['%s' for _ in location_ids])
                sql += f" AND t.location_id IN ({location_ids_str})"
                params.extend(location_ids)
                
            if machine_ids and len(machine_ids) > 0:
                machine_ids_str = ','.join(['%s' for _ in machine_ids])
                sql += f" AND t.machine_id IN ({machine_ids_str})"
                params.extend(machine_ids)
                
            # Gruppieren nach Datum
            sql += " GROUP BY ds ORDER BY ds"
            
            # Führe die Abfrage aus
            cursor.execute(sql, params)
            transaction_data = cursor.fetchall()
            
            if not transaction_data:
                logger.error("Keine Transaktionsdaten für den angegebenen Zeitraum gefunden")
                return None
                
            # Konvertiere in DataFrame
            df = pd.DataFrame(transaction_data)
            
            # Wetterdaten hinzufügen, wenn aktiviert
            if model_info['uses_weather_data']:
                cursor.execute("""
                    SELECT 
                        date as ds,
                        temp,
                        humidity,
                        precipitation
                    FROM 
                        weather_data
                    WHERE 
                        date BETWEEN %s AND %s
                """, (start_date, end_date))
                
                weather_data = cursor.fetchall()
                if weather_data:
                    weather_df = pd.DataFrame(weather_data)
                    df = pd.merge(df, weather_df, on='ds', how='left')
                    
                    # Fehlende Wetterdaten mit dem Durchschnitt ersetzen
                    for col in ['temp', 'humidity', 'precipitation']:
                        if col in df.columns:
                            df[col].fillna(df[col].mean(), inplace=True)
            
            # Feiertagsdaten hinzufügen, wenn aktiviert
            if model_info['uses_holiday_data']:
                cursor.execute("""
                    SELECT 
                        date as ds,
                        name as holiday,
                        type as holiday_type,
                        is_official
                    FROM 
                        holidays
                    WHERE 
                        date BETWEEN %s AND %s
                """, (start_date, end_date))
                
                holiday_data = cursor.fetchall()
                if holiday_data:
                    holiday_df = pd.DataFrame(holiday_data)
                    # Binäre Feiertagsspalte hinzufügen
                    holiday_df['is_holiday'] = 1
                    df = pd.merge(df, holiday_df, on='ds', how='left')
                    df['is_holiday'].fillna(0, inplace=True)
            
            # Wochentag als kategorischer Faktor
            df['day_of_week'] = df['day_of_week'].astype('category')
            
            # Füge Date-Index hinzu für einfachere Zeitreihenanalyse
            df['ds'] = pd.to_datetime(df['ds'])
            
            # Fülle Lücken in den Transaktionsdaten
            return df

    def prepare_prophet_data(self, df):
        """
        Bereitet die Daten für Prophet vor
        
        Args:
            df: DataFrame mit historischen Daten
            
        Returns:
            DataFrame im Prophet-Format
        """
        # Prophet benötigt Spalten 'ds' (Datum) und 'y' (Zielvariable)
        prophet_df = df[['ds', 'y']].copy()
        
        # Regressor-Spalten hinzufügen, wenn vorhanden
        regressors = []
        
        if 'temp' in df.columns:
            prophet_df['temp'] = df['temp']
            regressors.append('temp')
            
        if 'precipitation' in df.columns:
            prophet_df['precipitation'] = df['precipitation']
            regressors.append('precipitation')
            
        if 'is_holiday' in df.columns:
            prophet_df['is_holiday'] = df['is_holiday']
            regressors.append('is_holiday')
        
        # Speichere die Liste der Regressornamen für spätere Verwendung
        # Wichtig: Wir verwenden eine separate Eigenschaft, da ProphetForecaster keine 'regressors' Eigenschaft hat
        # Prophet verwendet stattdessen 'extra_regressors' als OrderedDict
        self.regressor_names = regressors
        
        return prophet_df

    def prepare_holidays_df(self, df):
        """
        Bereitet Feiertagsdaten für Prophet vor
        
        Args:
            df: DataFrame mit historischen Daten inklusive Feiertagen
            
        Returns:
            DataFrame im Prophet-Holidays-Format oder None
        """
        if 'holiday' not in df.columns or df['holiday'].isna().all():
            return None
            
        # Extrahiere Feiertage
        holidays_df = df[df['holiday'].notna()][['ds', 'holiday']].copy()
        
        if holidays_df.empty:
            return None
            
        # Prophet-spezifisches Format für Feiertage
        holidays_df.rename(columns={'holiday': 'holiday'}, inplace=True)
        
        # Füge untere und obere Grenzen hinzu (Standard ±1 Tag)
        holidays_df['lower_window'] = -1
        holidays_df['upper_window'] = 1
        
        return holidays_df

    def train_model(self, model_id, start_date, end_date, location_ids=None, machine_ids=None):
        """
        Trainiert ein Prophet-Modell mit historischen Daten
        
        Args:
            model_id: ID des zu trainierenden Modells
            start_date: Startdatum im Format 'YYYY-MM-DD'
            end_date: Enddatum im Format 'YYYY-MM-DD'
            location_ids: Optionale Liste von Standort-IDs
            machine_ids: Optionale Liste von Maschinen-IDs
            
        Returns:
            Dict mit Trainingsergebnissen
        """
        try:
            logger.info(f"Starte Training für Modell {model_id} von {start_date} bis {end_date}")
            
            # Hole historische Daten
            df = self.get_historical_data(model_id, start_date, end_date, location_ids, machine_ids)
            
            if df is None or df.empty:
                return {'success': False, 'message': 'Keine Trainingsdaten verfügbar'}
                
            logger.info(f"Historische Daten geladen: {len(df)} Datenpunkte")
            
            # Bereite Daten für Prophet vor
            prophet_df = self.prepare_prophet_data(df)
            holidays_df = self.prepare_holidays_df(df)
            
            # Modellkonfiguration aus der Datenbank laden
            configuration = json.loads(self.model_info.get('configuration', '{}'))
            
            # Prophet-Modell initialisieren
            model = Prophet(
                daily_seasonality=True,
                weekly_seasonality=True,
                yearly_seasonality=True,
                seasonality_mode='multiplicative',
                # Wichtig: Für Verkaufszahlen müssen wir eine untere Grenze setzen
                # Verkaufszahlen können niemals negativ sein
                growth='logistic',
                # Bei Bedarf kann man weitere Parameter aus configuration übernehmen
            )
            
            # Setze die untere Grenze auf 0 (keine negativen Verkäufe möglich)
            training_df['floor'] = 0
            # Setze eine realistische Obergrenze basierend auf historischen Daten
            # oder einem sinnvollen Default-Wert
            training_df['cap'] = training_df['y'].max() * 2  # 2x des maximalen historischen Werts
            
            # Feiertage hinzufügen, wenn vorhanden
            if holidays_df is not None and not holidays_df.empty:
                model.add_country_holidays(country_name='DE')
                logger.info(f"Feiertage hinzugefügt: {len(holidays_df)} Feiertage")
            
            # Regressor-Spalten hinzufügen
            for regressor in self.regressor_names:
                model.add_regressor(regressor)
                logger.info(f"Regressor hinzugefügt: {regressor}")
            
            # Modell trainieren
            model.fit(prophet_df)
            logger.info("Modell erfolgreich trainiert")
            
            # Modell-Pfad erstellen
            model_filename = f"prophet_model_{model_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pkl"
            model_path = MODEL_DIR / model_filename
            
            # Modell speichern
            with open(model_path, 'wb') as f:
                pickle.dump(model, f)
            
            # Modell für spätere Verwendung speichern
            self.model = model
            
            # Berechne Genauigkeit auf Trainingsdaten
            train_forecast = model.predict(prophet_df)
            mae = np.mean(np.abs(train_forecast['yhat'] - prophet_df['y']))
            rmse = np.sqrt(np.mean((train_forecast['yhat'] - prophet_df['y'])**2))
            
            # Aktualisiere Modellinformationen in der Datenbank
            conn = self.get_db_connection()
            with conn.cursor() as cursor:
                cursor.execute("""
                    UPDATE forecast_models
                    SET 
                        status = 'ready',
                        model_path = %s,
                        accuracy = %s,
                        training_period_start = %s,
                        training_period_end = %s,
                        updated_at = NOW()
                    WHERE id = %s
                """, (
                    str(model_path),
                    float(min(max(1 - (mae / prophet_df['y'].mean()), 0), 1)),  # Normalisierte Genauigkeit (0-1) als float
                    start_date,
                    end_date,
                    model_id
                ))
                conn.commit()
            
            logger.info(f"Modell gespeichert unter: {model_path}")
            
            return {
                'success': True,
                'message': 'Modell erfolgreich trainiert',
                'model_path': str(model_path),
                'metrics': {
                    'mae': float(mae),
                    'rmse': float(rmse),
                    'accuracy': float(1 - (mae / prophet_df['y'].mean()))
                },
                'data_points': len(prophet_df)
            }
            
        except Exception as e:
            logger.error(f"Fehler beim Training des Modells: {e}", exc_info=True)
            
            # Aktualisiere Modellstatus auf "error"
            conn = self.get_db_connection()
            with conn.cursor() as cursor:
                cursor.execute("""
                    UPDATE forecast_models
                    SET 
                        status = 'error',
                        updated_at = NOW()
                    WHERE id = %s
                """, (model_id,))
                conn.commit()
            
            return {'success': False, 'message': str(e)}

    def load_model(self, model_id):
        """
        Lädt ein gespeichertes Modell
        
        Args:
            model_id: ID des zu ladenden Modells
            
        Returns:
            True bei Erfolg, False bei Fehler
        """
        try:
            conn = self.get_db_connection()
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT * FROM forecast_models WHERE id = %s
                """, (model_id,))
                model_info = cursor.fetchone()
                
                if not model_info:
                    logger.error(f"Modell mit ID {model_id} nicht gefunden")
                    return False
                
                self.model_info = dict(model_info)
                model_path = model_info['model_path']
                
                if not model_path or not os.path.exists(model_path):
                    logger.error(f"Modellpfad nicht gefunden: {model_path}")
                    return False
                
                # Lade gespeichertes Modell
                with open(model_path, 'rb') as f:
                    self.model = pickle.load(f)
                
                logger.info(f"Modell geladen von: {model_path}")
                return True
                
        except Exception as e:
            logger.error(f"Fehler beim Laden des Modells: {e}", exc_info=True)
            return False

    def create_forecast(self, model_id, start_date, end_date, location_ids=None, machine_ids=None):
        """
        Erstellt eine Prognose für einen bestimmten Zeitraum
        
        Args:
            model_id: ID des zu verwendenden Modells
            start_date: Startdatum im Format 'YYYY-MM-DD'
            end_date: Enddatum im Format 'YYYY-MM-DD'
            location_ids: Optionale Liste von Standort-IDs
            machine_ids: Optionale Liste von Maschinen-IDs
            
        Returns:
            Dict mit Prognoseergebnissen
        """
        try:
            logger.info(f"Erstelle Prognose für Modell {model_id} von {start_date} bis {end_date}")
            
            # Prüfe, ob das Modell bereits geladen ist oder geladen werden muss
            if self.model is None:
                if not self.load_model(model_id):
                    return {'success': False, 'message': 'Modell konnte nicht geladen werden'}
            
            # Erstelle Dataframe für den Vorhersagezeitraum
            # Ensure start_date and end_date are parsed as datetime
            start_dt = pd.to_datetime(start_date)
            end_dt = pd.to_datetime(end_date)
            date_range = pd.date_range(start=start_dt, end=end_dt, freq='D')
            future_df = pd.DataFrame({'ds': date_range})
            
            # Füge externe Regressoren hinzu, wenn das Modell sie verwendet
            conn = self.get_db_connection()
            # Prüfe, ob wir Regressor-Informationen aus dem Modell extrahieren können
            regressor_names = []
            if hasattr(self.model, 'extra_regressors') and self.model.extra_regressors:
                regressor_names = list(self.model.extra_regressors.keys())
                logger.info(f"Regressoren aus geladenen Modell extrahiert: {regressor_names}")
            # Fallback: Verwende die gespeicherten Regressornamen
            elif hasattr(self, 'regressor_names') and self.regressor_names:
                regressor_names = self.regressor_names
                logger.info(f"Verwende gespeicherte Regressoren: {regressor_names}")
                
            if regressor_names:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    # Wetterdaten hinzufügen, wenn vorhanden
                    if 'temp' in regressor_names or 'precipitation' in regressor_names:
                        cursor.execute("""
                            SELECT 
                                date as ds,
                                temp,
                                humidity,
                                precipitation
                            FROM 
                                weather_data
                            WHERE 
                                date BETWEEN %s AND %s
                        """, (start_date, end_date))
                        
                        weather_data = cursor.fetchall()
                        if weather_data:
                            weather_df = pd.DataFrame(weather_data)
                            # Ensure both dataframes have 'ds' as datetime type before merging
                            weather_df['ds'] = pd.to_datetime(weather_df['ds'])
                            future_df['ds'] = pd.to_datetime(future_df['ds'])
                            future_df = pd.merge(future_df, weather_df, on='ds', how='left')
                            
                            # Fehlende Wetterdaten mit dem Durchschnitt ersetzen
                            for col in ['temp', 'humidity', 'precipitation']:
                                if col in future_df.columns and col in regressor_names:
                                    future_df[col].fillna(future_df[col].mean(), inplace=True)
                    
                    # Feiertagsdaten hinzufügen, wenn vorhanden
                    if 'is_holiday' in regressor_names:
                        cursor.execute("""
                            SELECT 
                                date as ds,
                                name as holiday,
                                type as holiday_type,
                                is_official
                            FROM 
                                holidays
                            WHERE 
                                date BETWEEN %s AND %s
                        """, (start_date, end_date))
                        
                        holiday_data = cursor.fetchall()
                        if holiday_data:
                            holiday_df = pd.DataFrame(holiday_data)
                            # Binäre Feiertagsspalte hinzufügen
                            holiday_df['is_holiday'] = 1
                            # Ensure both dataframes have 'ds' as datetime type before merging
                            holiday_df['ds'] = pd.to_datetime(holiday_df['ds'])
                            future_df['ds'] = pd.to_datetime(future_df['ds'])
                            future_df = pd.merge(future_df, holiday_df, on='ds', how='left')
                            future_df['is_holiday'].fillna(0, inplace=True)
            
            # Führe Prognose durch
            forecast = self.model.predict(future_df)
            
            # Speichere die Prognose in der Datenbank
            forecasts_saved = 0
            with conn.cursor() as cursor:
                # Aktualisiere den letzten Verwendungszeitpunkt des Modells
                cursor.execute("""
                    UPDATE forecast_models
                    SET last_used_at = NOW()
                    WHERE id = %s
                """, (model_id,))
                
                # Für jeden Tag im Prognosezeitraum
                for _, row in forecast.iterrows():
                    date_str = row['ds'].strftime('%Y-%m-%d')
                    
                    # Extrahiere Prognose und Konfidenzintervalle und stelle sicher, dass sie positiv sind
                    # Negative Prognosewerte ergeben für Transaktionszahlen keinen Sinn
                    predicted_quantity = max(0, round(float(row['yhat']), 2))
                    lower_bound = max(0, round(float(row['yhat_lower']), 2))
                    upper_bound = max(0, round(float(row['yhat_upper']), 2))
                    
                    # Berechne Konfidenzwert (0-1)
                    confidence = 1 - ((upper_bound - lower_bound) / (2 * predicted_quantity)) if predicted_quantity > 0 else 0.5
                    confidence = max(min(confidence, 1), 0)  # Begrenze auf [0, 1]
                    
                    # Hole Feiertagsinformationen
                    is_holiday = False
                    holiday_name = None
                    holiday_type = None
                    
                    if 'is_holiday' in future_df.columns:
                        # Ensure that we're comparing datetime objects of the same type
                        row_ds = pd.to_datetime(row['ds'])
                        holiday_row = future_df[future_df['ds'] == row_ds]
                        if not holiday_row.empty:
                            is_holiday = bool(holiday_row['is_holiday'].iloc[0])
                            if is_holiday and 'holiday' in holiday_row.columns:
                                holiday_name = holiday_row['holiday'].iloc[0]
                            if is_holiday and 'holiday_type' in holiday_row.columns:
                                holiday_type = holiday_row['holiday_type'].iloc[0]
                    
                    # Wetterzusammenfassung
                    weather_summary = None
                    if 'temp' in future_df.columns and 'precipitation' in future_df.columns:
                        # Ensure that we're comparing datetime objects of the same type
                        row_ds = pd.to_datetime(row['ds'])
                        weather_row = future_df[future_df['ds'] == row_ds]
                        if not weather_row.empty:
                            temp = weather_row['temp'].iloc[0]
                            precip = weather_row['precipitation'].iloc[0]
                            if temp is not None and precip is not None:
                                weather_summary = f"Temp: {temp}°C, Niederschlag: {precip}mm"
                    
                    # Wenn bestimmte Standorte oder Maschinen angegeben sind
                    target_locations = location_ids if location_ids and len(location_ids) > 0 else [None]
                    target_machines = machine_ids if machine_ids and len(machine_ids) > 0 else [None]
                    
                    for location_id in target_locations:
                        for machine_id in target_machines:
                            # Speichere die Prognose
                            cursor.execute("""
                                INSERT INTO forecasts (
                                    model_id, forecast_date, location_id, machine_id,
                                    predicted_quantity, confidence, lower_bound, upper_bound,
                                    is_holiday, holiday_name, holiday_type, weather_summary,
                                    created_at, updated_at
                                ) VALUES (
                                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW()
                                )
                                RETURNING id
                            """, (
                                model_id, date_str, location_id, machine_id,
                                predicted_quantity, confidence, lower_bound, upper_bound,
                                is_holiday, holiday_name, holiday_type, weather_summary
                            ))
                            
                            forecasts_saved += 1
                
                conn.commit()
            
            logger.info(f"Prognose abgeschlossen: {forecasts_saved} Einträge gespeichert")
            
            return {
                'success': True,
                'message': f'{forecasts_saved} Prognosedaten erstellt',
                'forecast_count': forecasts_saved
            }
            
        except Exception as e:
            logger.error(f"Fehler bei der Prognoseerstellung: {e}", exc_info=True)
            return {'success': False, 'message': str(e)}

# CLI-Interface für direkten Aufruf
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Prophet-basiertes Prognosemodell für Verkaufsautomaten')
    parser.add_argument('--action', choices=['train', 'forecast'], required=True, help='Aktion (train oder forecast)')
    parser.add_argument('--model-id', type=int, required=True, help='ID des Prognosemodells')
    parser.add_argument('--start-date', required=True, help='Startdatum (YYYY-MM-DD)')
    parser.add_argument('--end-date', required=True, help='Enddatum (YYYY-MM-DD)')
    parser.add_argument('--location-ids', help='Kommagetrennte Liste von Standort-IDs')
    parser.add_argument('--machine-ids', help='Kommagetrennte Liste von Maschinen-IDs')
    
    args = parser.parse_args()
    
    # Konvertiere kommagetrennte Listen in Python-Listen
    location_ids = [int(x) for x in args.location_ids.split(',')] if args.location_ids else None
    machine_ids = [int(x) for x in args.machine_ids.split(',')] if args.machine_ids else None
    
    forecaster = ProphetForecaster()
    
    try:
        if args.action == 'train':
            result = forecaster.train_model(args.model_id, args.start_date, args.end_date, location_ids, machine_ids)
        else:  # forecast
            result = forecaster.create_forecast(args.model_id, args.start_date, args.end_date, location_ids, machine_ids)
            
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        logger.error(f"Fehler: {e}", exc_info=True)
        print(json.dumps({'success': False, 'message': str(e)}))
    
    finally:
        forecaster.close_db_connection()