#!/usr/bin/env python
"""
Verbesserte Vendon Synchronisation

Dieses Skript bietet eine robustere, zuverlässigere Synchronisation von Vendon-Daten
mit Fokus auf:
1. Verbesserte Fehlerbehandlung
2. Detailliertes Logging
3. Korrekte Datumsformat-Konvertierung
4. Direkten Ereignisabruf für aktuelle Transaktionen

Es kann als Standalone-Skript oder als importiertes Modul verwendet werden.
"""

import logging
import sys
import json
import time
import os
import sqlite3
from datetime import datetime, timedelta
import traceback

# Konfiguriere Logger mit Dateiziel und Konsole
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("enhanced_vendon_sync.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('enhanced_vendon_sync')

class EnhancedVendonSync:
    """Verbesserte Vendon-Synchronisationsklasse"""
    
    def __init__(self, db_path=None):
        """
        Initialisiert die Synchronisationsklasse
        
        :param db_path: Pfad zur Datenbank (optional, Standard ist inventory.db)
        """
        self.db_path = db_path or os.path.abspath("inventory.db")
        logger.info(f"Initialisiere verbesserte Vendon-Synchronisation mit Datenbank: {self.db_path}")
        
        # API-Instanz
        try:
            from vendon_api import VendonAPI
            self.api = VendonAPI()
            
            # Prüfe API-Verbindung
            api_test = self.test_api_connection()
            if not api_test["success"]:
                logger.error(f"API-Verbindung fehlgeschlagen: {api_test['message']}")
        except Exception as e:
            logger.error(f"Konnte Vendon API nicht initialisieren: {str(e)}")
            self.api = None
    
    def get_db_connection(self):
        """
        Stellt eine Verbindung zur Datenbank her und setzt optimale Parameter
        
        :return: SQLite-Verbindung oder None bei Fehler
        """
        try:
            conn = sqlite3.connect(self.db_path, timeout=60.0)
            conn.row_factory = sqlite3.Row
            
            # SQLite-Optimierungen für bessere Performance
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
            conn.execute("PRAGMA temp_store = MEMORY")
            conn.execute("PRAGMA cache_size = 10000")
            conn.execute("PRAGMA foreign_keys = ON")
            
            return conn
        except sqlite3.Error as e:
            logger.error(f"Datenbankfehler: {str(e)}")
            return None
    
    def test_api_connection(self):
        """
        Testet die Verbindung zur Vendon API
        
        :return: Dictionary mit Testergebnis
        """
        result = {"success": False, "message": ""}
        
        try:
            if not self.api:
                result["message"] = "Keine API-Instanz verfügbar"
                return result
            
            # Teste Maschinen-Endpunkt als einfachen Test
            machines = self.api.get_machines()
            
            if not machines:
                result["message"] = "Keine Maschinen abgerufen"
                return result
            
            result["success"] = True
            result["message"] = f"API-Verbindung erfolgreich, {len(machines)} Maschinen abgerufen"
            result["machines_count"] = len(machines)
            
            return result
        except Exception as e:
            result["message"] = f"API-Fehler: {str(e)}"
            return result
    
    def ensure_tables(self):
        """
        Stellt sicher, dass alle benötigten Tabellen existieren
        
        :return: True bei Erfolg, False bei Fehler
        """
        logger.info("Stelle sicher, dass alle Tabellen existieren...")
        
        try:
            conn = self.get_db_connection()
            if not conn:
                return False
            
            cursor = conn.cursor()
            
            # 1. Vendon Machines Tabelle
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS vendon_machines (
                    id INTEGER PRIMARY KEY,
                    vendon_id TEXT,
                    machine_name TEXT,
                    machine_type TEXT,
                    status TEXT,
                    model TEXT,
                    serial_number TEXT,
                    last_sync TIMESTAMP,
                    additional_data TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    location_id INTEGER,
                    FOREIGN KEY (location_id) REFERENCES locations(id)
                )
            """)
            
            # 2. Vendon Transactions Tabelle
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS vendon_transactions (
                    id INTEGER PRIMARY KEY,
                    machine_id INTEGER,
                    product_id INTEGER,
                    price REAL,
                    datetime TEXT,
                    product_name TEXT,
                    machine_name TEXT,
                    transaction_type TEXT,
                    payment_type TEXT,
                    payment_method TEXT,
                    status TEXT,
                    currency TEXT,
                    source TEXT DEFAULT 'vendon',
                    vendon_id TEXT,
                    extra_data TEXT,
                    location_id INTEGER,
                    FOREIGN KEY (location_id) REFERENCES locations(id),
                    UNIQUE(vendon_id, machine_id, product_id, datetime)
                )
            """)
            
            # Index für schnellere Abfragen
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_vendon_transactions_datetime 
                ON vendon_transactions(datetime)
            """)
            
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_vendon_transactions_machine_id 
                ON vendon_transactions(machine_id)
            """)
            
            # 3. Vendon Refills Tabelle
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS vendon_refills (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vendon_id TEXT,
                    machine_id INTEGER,
                    machine_name TEXT,
                    datetime TEXT,
                    operator TEXT,
                    status TEXT,
                    extra_data TEXT,
                    source TEXT DEFAULT 'vendon',
                    location_id INTEGER,
                    total_amount REAL DEFAULT 0,
                    FOREIGN KEY (location_id) REFERENCES locations(id),
                    UNIQUE(vendon_id, machine_id, datetime)
                )
            """)
            
            # 4. Vendon Refill Details Tabelle
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS vendon_refill_details (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    refill_id INTEGER,
                    product_id INTEGER,
                    product_name TEXT,
                    quantity INTEGER,
                    price REAL,
                    datetime TEXT,
                    extra_data TEXT,
                    FOREIGN KEY (refill_id) REFERENCES vendon_refills(id)
                )
            """)
            
            # 5. Vendon Sync Log Tabelle
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS vendon_sync_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sync_type TEXT,
                    start_date TEXT,
                    end_date TEXT,
                    items_found INTEGER DEFAULT 0,
                    items_saved INTEGER DEFAULT 0,
                    items_updated INTEGER DEFAULT 0,
                    duplicates INTEGER DEFAULT 0,
                    errors INTEGER DEFAULT 0,
                    duration_seconds REAL DEFAULT 0,
                    sync_status TEXT,
                    error_message TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # 6. Vendon Events Tabelle
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS vendon_events (
                    id INTEGER PRIMARY KEY,
                    vendon_id TEXT,
                    event_type TEXT,
                    event_name TEXT,
                    description TEXT,
                    machine_id INTEGER,
                    machine_name TEXT,
                    datetime TEXT,
                    status TEXT,
                    resolved_at TEXT,
                    severity TEXT,
                    extra_data TEXT,
                    UNIQUE(vendon_id, machine_id, datetime)
                )
            """)
            
            conn.commit()
            conn.close()
            
            logger.info("Tabellen erfolgreich überprüft/erstellt")
            return True
            
        except Exception as e:
            logger.error(f"Fehler beim Erstellen der Tabellen: {str(e)}")
            logger.error(traceback.format_exc())
            return False
    
    def log_sync_start(self, sync_type, start_date=None, end_date=None):
        """
        Protokolliert den Start einer Synchronisation
        
        :param sync_type: Typ der Synchronisation (transactions, refills, machines, events)
        :param start_date: Startdatum (optional)
        :param end_date: Enddatum (optional)
        :return: ID des Log-Eintrags oder None bei Fehler
        """
        try:
            conn = self.get_db_connection()
            if not conn:
                return None
            
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO vendon_sync_log 
                (sync_type, start_date, end_date, sync_status, created_at) 
                VALUES (?, ?, ?, ?, ?)
            """, (
                sync_type, 
                start_date, 
                end_date, 
                "running",
                datetime.now().isoformat()
            ))
            
            log_id = cursor.lastrowid
            conn.commit()
            conn.close()
            
            logger.info(f"Synchronisation {sync_type} gestartet (Log-ID: {log_id})")
            return log_id
            
        except Exception as e:
            logger.error(f"Fehler beim Protokollieren des Synchronisationsstarts: {str(e)}")
            return None
    
    def log_sync_complete(self, log_id, items_found=0, items_saved=0, items_updated=0, 
                        duplicates=0, errors=0, duration_seconds=0, 
                        sync_status="completed", error_message=None):
        """
        Aktualisiert einen Synchronisations-Log-Eintrag mit den Ergebnissen
        
        :param log_id: ID des Log-Eintrags
        :param items_found: Anzahl der gefundenen Elemente
        :param items_saved: Anzahl der gespeicherten Elemente
        :param items_updated: Anzahl der aktualisierten Elemente
        :param duplicates: Anzahl der Duplikate
        :param errors: Anzahl der Fehler
        :param duration_seconds: Dauer in Sekunden
        :param sync_status: Status (completed, error)
        :param error_message: Fehlermeldung (bei sync_status=error)
        :return: True bei Erfolg, False bei Fehler
        """
        if not log_id:
            return False
            
        try:
            conn = self.get_db_connection()
            if not conn:
                return False
            
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE vendon_sync_log 
                SET items_found = ?,
                    items_saved = ?,
                    items_updated = ?,
                    duplicates = ?,
                    errors = ?,
                    duration_seconds = ?,
                    sync_status = ?,
                    error_message = ?
                WHERE id = ?
            """, (
                items_found,
                items_saved,
                items_updated,
                duplicates,
                errors,
                duration_seconds,
                sync_status,
                error_message,
                log_id
            ))
            
            conn.commit()
            conn.close()
            
            logger.info(f"Synchronisation abgeschlossen (Log-ID: {log_id}): {sync_status}")
            return True
            
        except Exception as e:
            logger.error(f"Fehler beim Aktualisieren des Synchronisations-Logs: {str(e)}")
            return False
    
    def sync_machines(self, force_update=False):
        """
        Synchronisiert Automaten/Maschinen von der Vendon API
        
        :param force_update: Wenn True, werden alle Maschinen aktualisiert
        :return: Dictionary mit Synchronisationsstatistiken
        """
        result = {
            "status": "pending",
            "machines_found": 0,
            "machines_saved": 0,
            "machines_updated": 0,
            "errors": 0,
            "timestamp": datetime.now().isoformat()
        }
        
        # Starte Zeitmessung
        start_time = time.time()
        
        # Log-Eintrag erstellen
        log_id = self.log_sync_start("machines")
        
        try:
            # Prüfe API-Verbindung
            if not self.api:
                error_msg = "Keine API-Instanz verfügbar"
                logger.error(error_msg)
                self.log_sync_complete(log_id, sync_status="error", error_message=error_msg)
                result["status"] = "error"
                result["message"] = error_msg
                return result
            
            # Automaten abrufen
            logger.info("Rufe Automaten von Vendon API ab...")
            machines = self.api.get_machines()
            
            if not machines:
                error_msg = "Keine Automaten abgerufen"
                logger.warning(error_msg)
                self.log_sync_complete(log_id, sync_status="completed", 
                                     error_message=error_msg, duration_seconds=time.time()-start_time)
                result["status"] = "warning"
                result["message"] = error_msg
                return result
            
            result["machines_found"] = len(machines)
            logger.info(f"{len(machines)} Automaten abgerufen")
            
            # Verbindung zur Datenbank herstellen
            conn = self.get_db_connection()
            if not conn:
                error_msg = "Keine Datenbankverbindung möglich"
                logger.error(error_msg)
                self.log_sync_complete(log_id, items_found=len(machines), 
                                     sync_status="error", error_message=error_msg,
                                     duration_seconds=time.time()-start_time)
                result["status"] = "error"
                result["message"] = error_msg
                return result
            
            cursor = conn.cursor()
            
            # Aktuelle Maschinen abrufen, um Update/Insert zu bestimmen
            cursor.execute("SELECT id FROM vendon_machines")
            existing_machines = {row['id'] for row in cursor.fetchall()}
            
            for machine in machines:
                try:
                    # Extrahiere Daten aus dem Maschinen-Objekt
                    machine_id = machine.get('id')
                    
                    if not machine_id:
                        logger.warning(f"Maschine ohne ID übersprungen: {machine}")
                        result["errors"] += 1
                        continue
                    
                    # Prüfe, ob die Maschine bereits existiert
                    if machine_id in existing_machines and not force_update:
                        # Wenn nicht force_update, dann nur neue Maschinen speichern
                        continue
                    
                    # Extra-Daten als JSON speichern
                    extra_data = {k: v for k, v in machine.items() 
                                 if k not in ['id', 'vendon_id', 'machine_name', 'machine_type', 'status', 
                                              'model', 'serial_number', 'last_sync']}
                    
                    # Bereite Daten vor
                    machine_data = (
                        machine_id,
                        machine.get('vendon_id', str(machine_id)),
                        machine.get('machine_name', ''),
                        machine.get('machine_type', ''),
                        machine.get('status', 'active'),
                        machine.get('model', ''),
                        machine.get('serial_number', ''),
                        datetime.now().isoformat(),  # last_sync
                        json.dumps(extra_data),
                        datetime.now().isoformat(),  # created_at
                        datetime.now().isoformat(),  # updated_at
                        None  # location_id - wird später aktualisiert
                    )
                    
                    # Einfügen oder Aktualisieren
                    if machine_id in existing_machines:
                        # UPDATE
                        cursor.execute("""
                            UPDATE vendon_machines 
                            SET vendon_id = ?,
                                machine_name = ?,
                                machine_type = ?,
                                status = ?,
                                model = ?,
                                serial_number = ?,
                                last_sync = ?,
                                additional_data = ?,
                                updated_at = ?
                            WHERE id = ?
                        """, (
                            machine_data[1], machine_data[2], machine_data[3],
                            machine_data[4], machine_data[5], machine_data[6],
                            machine_data[7], machine_data[8], machine_data[10],
                            machine_id
                        ))
                        
                        result["machines_updated"] += 1
                    else:
                        # INSERT
                        cursor.execute("""
                            INSERT INTO vendon_machines 
                            (id, vendon_id, machine_name, machine_type, status, model, serial_number, 
                             last_sync, additional_data, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, machine_data[:-1])  # Ohne location_id
                        
                        result["machines_saved"] += 1
                    
                except Exception as e:
                    logger.error(f"Fehler beim Speichern der Maschine {machine.get('id')}: {str(e)}")
                    result["errors"] += 1
            
            # Aktualisiere Standort-Mapping
            try:
                self.update_location_machine_mapping(cursor)
            except Exception as e:
                logger.error(f"Fehler beim Aktualisieren des Standort-Mappings: {str(e)}")
            
            # Commit und Verbindung schließen
            conn.commit()
            conn.close()
            
            # Log-Eintrag aktualisieren
            duration = time.time() - start_time
            self.log_sync_complete(
                log_id, 
                items_found=result["machines_found"],
                items_saved=result["machines_saved"],
                items_updated=result["machines_updated"],
                errors=result["errors"],
                duration_seconds=duration,
                sync_status="completed"
            )
            
            result["status"] = "success"
            result["duration_seconds"] = duration
            
            return result
            
        except Exception as e:
            logger.error(f"Fehler bei der Maschinen-Synchronisation: {str(e)}")
            logger.error(traceback.format_exc())
            
            # Log-Eintrag aktualisieren
            duration = time.time() - start_time
            self.log_sync_complete(
                log_id, 
                items_found=result.get("machines_found", 0),
                items_saved=result.get("machines_saved", 0),
                items_updated=result.get("machines_updated", 0),
                errors=result.get("errors", 0) + 1,
                duration_seconds=duration,
                sync_status="error",
                error_message=str(e)
            )
            
            result["status"] = "error"
            result["message"] = str(e)
            result["duration_seconds"] = duration
            
            return result
    
    def update_location_machine_mapping(self, cursor):
        """
        Aktualisiert das Mapping zwischen Vendon-Maschinen und Lagerstandorten
        
        :param cursor: Datenbank-Cursor
        :return: Anzahl der aktualisierten Mappings
        """
        try:
            # Prüfe, ob die Mapping-Tabelle existiert
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS machine_warehouse_mappings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    machine_id INTEGER,
                    warehouse_id INTEGER,
                    FOREIGN KEY (machine_id) REFERENCES vendon_machines(id),
                    FOREIGN KEY (warehouse_id) REFERENCES locations(id),
                    UNIQUE(machine_id, warehouse_id)
                )
            """)
            
            # Lese bestehende Mappings
            cursor.execute("SELECT machine_id, warehouse_id FROM machine_warehouse_mappings")
            mappings = {row['machine_id']: row['warehouse_id'] for row in cursor.fetchall()}
            
            # Aktualisiere location_id in vendon_machines basierend auf Mappings
            updated = 0
            for machine_id, warehouse_id in mappings.items():
                cursor.execute("""
                    UPDATE vendon_machines 
                    SET location_id = ? 
                    WHERE id = ?
                """, (warehouse_id, machine_id))
                updated += 1
            
            # Aktualisiere auch die location_id in vendon_transactions basierend auf der machine_id
            self.update_transaction_locations(cursor)
            
            return updated
        except Exception as e:
            logger.error(f"Fehler beim Aktualisieren des Standort-Mappings: {str(e)}")
            return 0
    
    def update_transaction_locations(self, cursor):
        """
        Aktualisiert die location_id in vendon_transactions basierend auf der machine_id.
        Dies stellt die Verknüpfung zwischen Transaktionen und Standorten her.
        
        :param cursor: Datenbank-Cursor
        :return: Anzahl der aktualisierten Transaktionen
        """
        try:
            logger.info("Aktualisiere location_id in vendon_transactions basierend auf machine_id...")
            
            # SQL-Abfrage, um location_id aus vendon_machines in vendon_transactions zu übertragen
            cursor.execute("""
                UPDATE vendon_transactions
                SET location_id = (
                    SELECT vm.location_id
                    FROM vendon_machines vm
                    WHERE vm.id = vendon_transactions.machine_id
                )
                WHERE machine_id IS NOT NULL
                  AND (location_id IS NULL OR location_id != (
                      SELECT vm.location_id
                      FROM vendon_machines vm
                      WHERE vm.id = vendon_transactions.machine_id
                  ))
            """)
            
            updated = cursor.rowcount
            logger.info(f"{updated} Transaktionen mit location_id aktualisiert")
            
            # Das gleiche für vendon_refills
            cursor.execute("""
                UPDATE vendon_refills
                SET location_id = (
                    SELECT vm.location_id
                    FROM vendon_machines vm
                    WHERE vm.id = vendon_refills.machine_id
                )
                WHERE machine_id IS NOT NULL
                  AND (location_id IS NULL OR location_id != (
                      SELECT vm.location_id
                      FROM vendon_machines vm
                      WHERE vm.id = vendon_refills.machine_id
                  ))
            """)
            
            refills_updated = cursor.rowcount
            logger.info(f"{refills_updated} Nachfüllungen mit location_id aktualisiert")
            
            return updated + refills_updated
            
        except Exception as e:
            logger.error(f"Fehler beim Aktualisieren der Transaktions-Standorte: {str(e)}")
            logger.error(traceback.format_exc())
            return 0

    def sync_transactions(self, days=1, start_date=None, end_date=None, batch_size=100, max_transactions=1000):
        """
        Synchronisiert Transaktionen von der Vendon API
        
        :param days: Anzahl der Tage in die Vergangenheit (wird ignoriert wenn start_date gesetzt ist)
        :param start_date: Startdatum im Format 'YYYY-MM-DD' (optional)
        :param end_date: Enddatum im Format 'YYYY-MM-DD' (optional, Standard ist heute)
        :param batch_size: Anzahl der Datensätze pro API-Anfrage
        :param max_transactions: Maximale Anzahl zu synchronisierender Transaktionen
        :return: Dictionary mit Synchronisationsstatistiken
        """
        result = {
            "status": "pending",
            "transactions_found": 0,
            "transactions_saved": 0,
            "transactions_updated": 0,
            "duplicates": 0,
            "errors": 0,
            "start_date": None,
            "end_date": None,
            "timestamp": datetime.now().isoformat()
        }
        
        # Starte Zeitmessung
        start_time = time.time()
        
        # Bestimme Datumsbereich
        if start_date:
            try:
                start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            except ValueError:
                start_dt = datetime.now() - timedelta(days=days)
        else:
            start_dt = datetime.now() - timedelta(days=days)
        
        if end_date:
            try:
                end_dt = datetime.strptime(end_date, '%Y-%m-%d')
                # Ende des Tages
                end_dt = end_dt.replace(hour=23, minute=59, second=59)
            except ValueError:
                end_dt = datetime.now()
        else:
            end_dt = datetime.now()
        
        # Formatierte Datumsbereiche für Log und Ergebnis
        start_str = start_dt.strftime('%Y-%m-%d')
        end_str = end_dt.strftime('%Y-%m-%d')
        result["start_date"] = start_str
        result["end_date"] = end_str
        
        # Log-Eintrag erstellen
        log_id = self.log_sync_start("transactions", start_str, end_str)
        
        logger.info(f"Starte Transaktions-Synchronisation von {start_str} bis {end_str}")
        
        try:
            # Prüfe API-Verbindung
            if not self.api:
                error_msg = "Keine API-Instanz verfügbar"
                logger.error(error_msg)
                self.log_sync_complete(log_id, sync_status="error", error_message=error_msg)
                result["status"] = "error"
                result["message"] = error_msg
                return result
            
            # Tabellen sicherstellen
            if not self.ensure_tables():
                error_msg = "Tabellen konnten nicht erstellt werden"
                logger.error(error_msg)
                self.log_sync_complete(log_id, sync_status="error", error_message=error_msg)
                result["status"] = "error"
                result["message"] = error_msg
                return result
            
            # Verbindung zur Datenbank herstellen
            conn = self.get_db_connection()
            if not conn:
                error_msg = "Keine Datenbankverbindung möglich"
                logger.error(error_msg)
                self.log_sync_complete(log_id, sync_status="error", error_message=error_msg)
                result["status"] = "error"
                result["message"] = error_msg
                return result
            
            cursor = conn.cursor()
            
            # Automatische Methode für Transaktionsabruf basierend auf API-Möglichkeiten wählen
            total_transactions = []
            offset = 0
            
            while len(total_transactions) < max_transactions:
                # Transaktionen abrufen mit Pagination
                logger.info(f"Rufe Transaktionen ab (Offset: {offset}, Limit: {batch_size})...")
                
                try:
                    # Verwende die API-Methode
                    transactions = self.api.get_transactions(
                        start_date=start_str,
                        end_date=end_str,
                        offset=offset,
                        limit=batch_size
                    )
                    
                    if not transactions:
                        logger.info("Keine weiteren Transaktionen gefunden")
                        break
                    
                    batch_size = len(transactions)
                    logger.info(f"{batch_size} Transaktionen in diesem Batch gefunden")
                    
                    total_transactions.extend(transactions)
                    offset += batch_size
                    
                    # Bei weniger als batch_size Ergebnissen sind wir am Ende
                    if batch_size < batch_size:
                        logger.info("Ende der Transaktionen erreicht")
                        break
                    
                    # Kurze Pause, um die API nicht zu überlasten
                    time.sleep(0.5)
                    
                except Exception as e:
                    logger.error(f"Fehler beim Abrufen der Transaktionen: {str(e)}")
                    result["errors"] += 1
                    break
            
            # Statistiken aktualisieren
            result["transactions_found"] = len(total_transactions)
            logger.info(f"Insgesamt {len(total_transactions)} Transaktionen abgerufen")
            
            # Wenn keine Transaktionen gefunden wurden, alternativ Events versuchen
            if not total_transactions:
                logger.info("Keine Transaktionen gefunden, versuche Events als Alternative...")
                
                try:
                    # Verwende die Events-API, um Verkaufsereignisse zu finden
                    events = self.api.get_events(
                        start_date=start_str,
                        end_date=end_str
                    )
                    
                    if events:
                        # Filtere Verkaufsereignisse
                        sales_events = [e for e in events if 
                                       e.get('name', '').lower() in ['sale', 'verkauf'] or
                                       e.get('type', '').lower() == 'sale']
                        
                        if sales_events:
                            logger.info(f"{len(sales_events)} Verkaufsereignisse gefunden, konvertiere zu Transaktionen")
                            
                            # Konvertiere Events zu Transaktionen
                            for event in sales_events:
                                transaction = {
                                    'id': event.get('id'),
                                    'machine_id': event.get('machine_id'),
                                    'machine_name': event.get('machine_name'),
                                    'datetime': event.get('datetime') or event.get('event_datetime'),
                                    'product_name': event.get('product_name'),
                                    'price': event.get('price'),
                                    'transaction_type': 'sale',
                                    'payment_type': event.get('payment_type', 'unknown'),
                                    'status': event.get('status', 'completed'),
                                    'source': 'vendon_events',
                                    'vendon_id': str(event.get('id')),
                                    'extra_data': json.dumps(event)
                                }
                                
                                total_transactions.append(transaction)
                            
                            result["transactions_found"] = len(total_transactions)
                            logger.info(f"Nach Event-Konvertierung: {len(total_transactions)} Transaktionen")
                except Exception as e:
                    logger.error(f"Fehler beim Abrufen von Events: {str(e)}")
            
            # Jetzt Transaktionen speichern
            for transaction in total_transactions:
                try:
                    # Extrahiere Daten aus dem Transaktions-Objekt
                    # Mindestdaten
                    vendon_id = transaction.get('id') or transaction.get('vendon_id')
                    if not vendon_id:
                        logger.warning(f"Transaktion ohne ID übersprungen: {transaction}")
                        result["errors"] += 1
                        continue
                    
                    machine_id = transaction.get('machine_id')
                    product_id = transaction.get('product_id')
                    datetime_str = transaction.get('datetime') or transaction.get('date')
                    
                    if not (machine_id and datetime_str):
                        logger.warning(f"Transaktion ohne essentielle Daten übersprungen: {transaction}")
                        result["errors"] += 1
                        continue
                    
                    # Prüfe, ob die Transaktion bereits existiert
                    cursor.execute("""
                        SELECT id FROM vendon_transactions 
                        WHERE vendon_id = ? AND machine_id = ? AND datetime = ?
                    """, (str(vendon_id), machine_id, datetime_str))
                    
                    existing = cursor.fetchone()
                    
                    # Optionale Daten
                    price = transaction.get('price', 0)
                    product_name = transaction.get('product_name', '')
                    machine_name = transaction.get('machine_name', '')
                    transaction_type = transaction.get('transaction_type', 'sale')
                    payment_type = transaction.get('payment_type', '')
                    payment_method = transaction.get('payment_method', '')
                    status = transaction.get('status', 'completed')
                    currency = transaction.get('currency', 'EUR')
                    
                    # Extrahiere die speziellen Felder
                    price_vat = transaction.get('price_vat', None)
                    price_wo_vat = transaction.get('price_wo_vat', None)
                    vat = transaction.get('vat', None)
                    
                    # Extra-Daten als JSON speichern
                    extra_data = {k: v for k, v in transaction.items() 
                                 if k not in ['id', 'vendon_id', 'machine_id', 'product_id', 
                                              'price', 'datetime', 'product_name', 
                                              'machine_name', 'transaction_type', 
                                              'payment_type', 'payment_method', 
                                              'status', 'currency', 'source',
                                              'price_vat', 'price_wo_vat', 'vat']}
                    
                    # Bereite Daten vor
                    transaction_data = (
                        machine_id,
                        product_id,
                        price,
                        datetime_str,
                        product_name,
                        machine_name,
                        transaction_type,
                        payment_type,
                        payment_method,
                        status,
                        currency,
                        transaction.get('source', 'vendon'),
                        str(vendon_id),
                        json.dumps(extra_data),
                        None,  # location_id - wird später aktualisiert
                        price_vat,
                        price_wo_vat,
                        vat
                    )
                    
                    if existing:
                        # UPDATE - nur bei Bedarf
                        result["duplicates"] += 1
                    else:
                        # INSERT
                        cursor.execute("""
                            INSERT INTO vendon_transactions 
                            (machine_id, product_id, price, datetime, product_name, 
                             machine_name, transaction_type, payment_type, payment_method, 
                             status, currency, source, vendon_id, extra_data, location_id,
                             price_vat, price_wo_vat, vat)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, transaction_data)
                        
                        result["transactions_saved"] += 1
                    
                except sqlite3.IntegrityError:
                    # Duplikat-Fehler (UNIQUE constraint)
                    result["duplicates"] += 1
                except Exception as e:
                    logger.error(f"Fehler beim Speichern der Transaktion {transaction.get('id')}: {str(e)}")
                    result["errors"] += 1
            
            # Aktualisiere location_id basierend auf machine_warehouse_mappings
            try:
                cursor.execute("""
                    UPDATE vendon_transactions 
                    SET location_id = (
                        SELECT warehouse_id 
                        FROM machine_warehouse_mappings 
                        WHERE machine_warehouse_mappings.machine_id = vendon_transactions.machine_id
                    )
                    WHERE location_id IS NULL 
                    AND EXISTS (
                        SELECT 1 
                        FROM machine_warehouse_mappings 
                        WHERE machine_warehouse_mappings.machine_id = vendon_transactions.machine_id
                    )
                """)
                
                updated = cursor.rowcount
                logger.info(f"{updated} Transaktionen mit location_id aktualisiert")
            except Exception as e:
                logger.error(f"Fehler beim Aktualisieren der location_id: {str(e)}")
            
            # Commit und Verbindung schließen
            conn.commit()
            conn.close()
            
            # Log-Eintrag aktualisieren
            duration = time.time() - start_time
            self.log_sync_complete(
                log_id, 
                items_found=result["transactions_found"],
                items_saved=result["transactions_saved"],
                items_updated=result["transactions_updated"],
                duplicates=result["duplicates"],
                errors=result["errors"],
                duration_seconds=duration,
                sync_status="completed"
            )
            
            result["status"] = "success"
            result["duration_seconds"] = duration
            
            return result
            
        except Exception as e:
            logger.error(f"Fehler bei der Transaktions-Synchronisation: {str(e)}")
            logger.error(traceback.format_exc())
            
            # Log-Eintrag aktualisieren
            duration = time.time() - start_time
            self.log_sync_complete(
                log_id, 
                items_found=result.get("transactions_found", 0),
                items_saved=result.get("transactions_saved", 0),
                items_updated=result.get("transactions_updated", 0),
                duplicates=result.get("duplicates", 0),
                errors=result.get("errors", 0) + 1,
                duration_seconds=duration,
                sync_status="error",
                error_message=str(e)
            )
            
            result["status"] = "error"
            result["message"] = str(e)
            result["duration_seconds"] = duration
            
            return result

    def sync_refills(self, days=7, start_date=None, end_date=None, batch_size=50):
        """
        Synchronisiert Refills (Nachfüllungen) von der Vendon API
        
        :param days: Anzahl der Tage in die Vergangenheit (wird ignoriert wenn start_date gesetzt ist)
        :param start_date: Startdatum im Format 'YYYY-MM-DD' (optional)
        :param end_date: Enddatum im Format 'YYYY-MM-DD' (optional, Standard ist heute)
        :param batch_size: Anzahl der Datensätze pro API-Anfrage
        :return: Dictionary mit Synchronisationsstatistiken
        """
        result = {
            "status": "pending",
            "refills_found": 0,
            "refills_saved": 0,
            "refills_updated": 0,
            "duplicates": 0,
            "errors": 0,
            "start_date": None,
            "end_date": None,
            "timestamp": datetime.now().isoformat()
        }
        
        # Starte Zeitmessung
        start_time = time.time()
        
        # Bestimme Datumsbereich
        if start_date:
            try:
                start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            except ValueError:
                start_dt = datetime.now() - timedelta(days=days)
        else:
            start_dt = datetime.now() - timedelta(days=days)
        
        if end_date:
            try:
                end_dt = datetime.strptime(end_date, '%Y-%m-%d')
                # Ende des Tages
                end_dt = end_dt.replace(hour=23, minute=59, second=59)
            except ValueError:
                end_dt = datetime.now()
        else:
            end_dt = datetime.now()
        
        # Formatierte Datumsbereiche für Log und Ergebnis
        start_str = start_dt.strftime('%Y-%m-%d')
        end_str = end_dt.strftime('%Y-%m-%d')
        result["start_date"] = start_str
        result["end_date"] = end_str
        
        # Log-Eintrag erstellen
        log_id = self.log_sync_start("refills", start_str, end_str)
        
        logger.info(f"Starte Refill-Synchronisation von {start_str} bis {end_str}")
        
        try:
            # Prüfe API-Verbindung
            if not self.api:
                error_msg = "Keine API-Instanz verfügbar"
                logger.error(error_msg)
                self.log_sync_complete(log_id, sync_status="error", error_message=error_msg)
                result["status"] = "error"
                result["message"] = error_msg
                return result
            
            # Tabellen sicherstellen
            if not self.ensure_tables():
                error_msg = "Tabellen konnten nicht erstellt werden"
                logger.error(error_msg)
                self.log_sync_complete(log_id, sync_status="error", error_message=error_msg)
                result["status"] = "error"
                result["message"] = error_msg
                return result
            
            # Verbindung zur Datenbank herstellen
            conn = self.get_db_connection()
            if not conn:
                error_msg = "Keine Datenbankverbindung möglich"
                logger.error(error_msg)
                self.log_sync_complete(log_id, sync_status="error", error_message=error_msg)
                result["status"] = "error"
                result["message"] = error_msg
                return result
            
            cursor = conn.cursor()
            
            # Refills abrufen
            total_refills = []
            offset = 0
            
            # Prüfe, ob die get_refills-Methode existiert
            if hasattr(self.api, 'get_refills'):
                logger.info("Verwende direkte Refill-API...")
                
                while True:
                    # Refills abrufen mit Pagination
                    logger.info(f"Rufe Refills ab (Offset: {offset}, Limit: {batch_size})...")
                    
                    try:
                        # Verwende die API-Methode
                        refills = self.api.get_refills(
                            start_date=start_str,
                            end_date=end_str,
                            offset=offset,
                            limit=batch_size
                        )
                        
                        if not refills:
                            logger.info("Keine weiteren Refills gefunden")
                            break
                        
                        batch_count = len(refills)
                        logger.info(f"{batch_count} Refills in diesem Batch gefunden")
                        
                        total_refills.extend(refills)
                        offset += batch_count
                        
                        # Bei weniger als batch_size Ergebnissen sind wir am Ende
                        if batch_count < batch_size:
                            logger.info("Ende der Refills erreicht")
                            break
                        
                        # Kurze Pause, um die API nicht zu überlasten
                        time.sleep(0.5)
                        
                    except Exception as e:
                        logger.error(f"Fehler beim Abrufen der Refills: {str(e)}")
                        result["errors"] += 1
                        break
            else:
                logger.warning("Keine direkte Refill-API verfügbar, versuche alternative Methode")
                
                # Verwende Events, um Refill-Ereignisse zu finden
                try:
                    events = self.api.get_events(
                        start_date=start_str,
                        end_date=end_str
                    )
                    
                    if events:
                        # Filtere Refill-Ereignisse
                        refill_events = [e for e in events if 
                                        e.get('name', '').lower() in ['refill', 'nachfüllung'] or
                                        e.get('type', '').lower() == 'refill']
                        
                        if refill_events:
                            logger.info(f"{len(refill_events)} Refill-Ereignisse gefunden, konvertiere zu Refills")
                            
                            # Konvertiere Events zu Refills
                            for event in refill_events:
                                refill = {
                                    'id': event.get('id'),
                                    'machine_id': event.get('machine_id'),
                                    'machine_name': event.get('machine_name'),
                                    'datetime': event.get('datetime') or event.get('event_datetime'),
                                    'operator': event.get('operator', 'unknown'),
                                    'status': event.get('status', 'completed'),
                                    'source': 'vendon_events',
                                    'vendon_id': str(event.get('id')),
                                    'extra_data': json.dumps(event)
                                }
                                
                                total_refills.append(refill)
                            
                            logger.info(f"Nach Event-Konvertierung: {len(total_refills)} Refills")
                except Exception as e:
                    logger.error(f"Fehler beim Abrufen von Events: {str(e)}")
            
            # Statistiken aktualisieren
            result["refills_found"] = len(total_refills)
            logger.info(f"Insgesamt {len(total_refills)} Refills abgerufen")
            
            # Jetzt Refills speichern
            for refill in total_refills:
                try:
                    # Extrahiere Daten aus dem Refill-Objekt
                    # Mindestdaten
                    vendon_id = refill.get('id') or refill.get('vendon_id')
                    if not vendon_id:
                        logger.warning(f"Refill ohne ID übersprungen: {refill}")
                        result["errors"] += 1
                        continue
                    
                    machine_id = refill.get('machine_id')
                    datetime_str = refill.get('datetime') or refill.get('date')
                    
                    if not (machine_id and datetime_str):
                        logger.warning(f"Refill ohne essentielle Daten übersprungen: {refill}")
                        result["errors"] += 1
                        continue
                    
                    # Prüfe, ob das Refill bereits existiert
                    cursor.execute("""
                        SELECT id FROM vendon_refills 
                        WHERE vendon_id = ? AND machine_id = ? AND datetime = ?
                    """, (str(vendon_id), machine_id, datetime_str))
                    
                    existing = cursor.fetchone()
                    
                    # Optionale Daten
                    machine_name = refill.get('machine_name', '')
                    operator = refill.get('operator', '')
                    status = refill.get('status', 'completed')
                    total_amount = refill.get('total_amount', 0)
                    
                    # Extra-Daten als JSON speichern
                    extra_data = {k: v for k, v in refill.items() 
                                 if k not in ['id', 'vendon_id', 'machine_id', 
                                              'datetime', 'machine_name', 
                                              'operator', 'status', 'source',
                                              'total_amount']}
                    
                    # Bereite Daten vor
                    refill_data = (
                        str(vendon_id),
                        machine_id,
                        machine_name,
                        datetime_str,
                        operator,
                        status,
                        json.dumps(extra_data),
                        refill.get('source', 'vendon'),
                        None,  # location_id - wird später aktualisiert
                        total_amount
                    )
                    
                    if existing:
                        # UPDATE - nur bei Bedarf
                        result["duplicates"] += 1
                    else:
                        # INSERT
                        cursor.execute("""
                            INSERT INTO vendon_refills 
                            (vendon_id, machine_id, machine_name, datetime, operator, 
                             status, extra_data, source, location_id, total_amount)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, refill_data)
                        
                        result["refills_saved"] += 1
                    
                except sqlite3.IntegrityError:
                    # Duplikat-Fehler (UNIQUE constraint)
                    result["duplicates"] += 1
                except Exception as e:
                    logger.error(f"Fehler beim Speichern des Refills {refill.get('id')}: {str(e)}")
                    result["errors"] += 1
            
            # Aktualisiere location_id basierend auf machine_warehouse_mappings
            try:
                cursor.execute("""
                    UPDATE vendon_refills 
                    SET location_id = (
                        SELECT warehouse_id 
                        FROM machine_warehouse_mappings 
                        WHERE machine_warehouse_mappings.machine_id = vendon_refills.machine_id
                    )
                    WHERE location_id IS NULL 
                    AND EXISTS (
                        SELECT 1 
                        FROM machine_warehouse_mappings 
                        WHERE machine_warehouse_mappings.machine_id = vendon_refills.machine_id
                    )
                """)
                
                updated = cursor.rowcount
                logger.info(f"{updated} Refills mit location_id aktualisiert")
            except Exception as e:
                logger.error(f"Fehler beim Aktualisieren der location_id: {str(e)}")
            
            # Commit und Verbindung schließen
            conn.commit()
            conn.close()
            
            # Log-Eintrag aktualisieren
            duration = time.time() - start_time
            self.log_sync_complete(
                log_id, 
                items_found=result["refills_found"],
                items_saved=result["refills_saved"],
                items_updated=result["refills_updated"],
                duplicates=result["duplicates"],
                errors=result["errors"],
                duration_seconds=duration,
                sync_status="completed"
            )
            
            result["status"] = "success"
            result["duration_seconds"] = duration
            
            return result
            
        except Exception as e:
            logger.error(f"Fehler bei der Refill-Synchronisation: {str(e)}")
            logger.error(traceback.format_exc())
            
            # Log-Eintrag aktualisieren
            duration = time.time() - start_time
            self.log_sync_complete(
                log_id, 
                items_found=result.get("refills_found", 0),
                items_saved=result.get("refills_saved", 0),
                items_updated=result.get("refills_updated", 0),
                duplicates=result.get("duplicates", 0),
                errors=result.get("errors", 0) + 1,
                duration_seconds=duration,
                sync_status="error",
                error_message=str(e)
            )
            
            result["status"] = "error"
            result["message"] = str(e)
            result["duration_seconds"] = duration
            
            return result

def sync_all():
    """
    Führt eine vollständige Synchronisation aller Vendon-Daten durch
    
    :return: Dictionary mit Synchronisationsstatistiken
    """
    start_time = time.time()
    
    logger.info("Starte vollständige Vendon-Synchronisation")
    
    result = {
        "status": "pending",
        "steps": {},
        "timestamp": datetime.now().isoformat()
    }
    
    # Synchronisations-Instanz erstellen
    sync = EnhancedVendonSync()
    
    # 1. Maschinen synchronisieren
    logger.info("Schritt 1: Maschinen synchronisieren")
    machines_result = sync.sync_machines()
    result["steps"]["machines"] = machines_result
    
    # 2. Transaktionen der letzten 3 Tage synchronisieren
    logger.info("Schritt 2: Transaktionen synchronisieren")
    transactions_result = sync.sync_transactions(days=3, batch_size=100)
    result["steps"]["transactions"] = transactions_result
    
    # 3. Refills der letzten 14 Tage synchronisieren
    logger.info("Schritt 3: Refills synchronisieren")
    refills_result = sync.sync_refills(days=14)
    result["steps"]["refills"] = refills_result
    
    # Gesamtstatus berechnen
    success_count = sum(1 for step, data in result["steps"].items() 
                      if data.get("status") == "success")
    total_steps = len(result["steps"])
    
    if success_count == total_steps:
        result["status"] = "success"
    elif success_count == 0:
        result["status"] = "error"
    else:
        result["status"] = "partial"
    
    # Gesamtdauer
    duration = time.time() - start_time
    result["duration_seconds"] = duration
    
    logger.info(f"Vollständige Synchronisation abgeschlossen in {duration:.2f} Sekunden")
    logger.info(f"Status: {result['status']} ({success_count}/{total_steps} Schritte erfolgreich)")
    
    return result

def main():
    """Hauptfunktion"""
    try:
        args = sys.argv[1:]
        
        if not args or args[0] in ['-h', '--help']:
            print("""
            Verwendung: python enhanced_vendon_sync.py [BEFEHL] [OPTIONEN]
            
            Befehle:
              all                  Synchronisiert alle Daten (Maschinen, Transaktionen, Refills)
              machines             Synchronisiert nur Maschinen/Automaten
              transactions [TAGE]  Synchronisiert Transaktionen der letzten TAGE (Standard: 1)
              refills [TAGE]       Synchronisiert Refills der letzten TAGE (Standard: 7)
              
            Optionen:
              --start-date DATUM   Startdatum im Format YYYY-MM-DD
              --end-date DATUM     Enddatum im Format YYYY-MM-DD
              --batch-size ZAHL    Anzahl der Datensätze pro API-Anfrage (Standard: 100)
              --max-items ZAHL     Maximale Anzahl zu synchronisierender Einträge
            """)
            return 0
        
        command = args[0]
        days = 1
        start_date = None
        end_date = None
        batch_size = 100
        max_items = 1000
        
        # Parameter parsen
        i = 1
        while i < len(args):
            if args[i] == '--start-date' and i+1 < len(args):
                start_date = args[i+1]
                i += 2
            elif args[i] == '--end-date' and i+1 < len(args):
                end_date = args[i+1]
                i += 2
            elif args[i] == '--batch-size' and i+1 < len(args):
                try:
                    batch_size = int(args[i+1])
                except ValueError:
                    print(f"Ungültiger Wert für batch-size: {args[i+1]}")
                    return 1
                i += 2
            elif args[i] == '--max-items' and i+1 < len(args):
                try:
                    max_items = int(args[i+1])
                except ValueError:
                    print(f"Ungültiger Wert für max-items: {args[i+1]}")
                    return 1
                i += 2
            elif args[i].isdigit() and command in ['transactions', 'refills']:
                # Anzahl der Tage als direkter Parameter für transactions/refills
                days = int(args[i])
                i += 1
            else:
                i += 1
        
        # Synchronisations-Instanz erstellen
        sync = EnhancedVendonSync()
        
        # Befehl ausführen
        if command == 'all':
            result = sync_all()
        elif command == 'machines':
            result = sync.sync_machines()
        elif command == 'transactions':
            result = sync.sync_transactions(
                days=days, 
                start_date=start_date, 
                end_date=end_date, 
                batch_size=batch_size,
                max_transactions=max_items
            )
        elif command == 'refills':
            result = sync.sync_refills(
                days=days, 
                start_date=start_date, 
                end_date=end_date, 
                batch_size=batch_size
            )
        else:
            print(f"Unbekannter Befehl: {command}")
            return 1
        
        # Ergebnis ausgeben
        print(json.dumps(result, indent=2))
        
        # Erfolgreich beendet
        return 0 if result.get("status") in ["success", "partial"] else 1
        
    except Exception as e:
        logger.error(f"Kritischer Fehler: {str(e)}")
        logger.error(traceback.format_exc())
        return 1

if __name__ == "__main__":
    sys.exit(main())