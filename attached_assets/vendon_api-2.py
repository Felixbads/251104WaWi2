#!/usr/bin/env python
"""
Verbesserte Version der Vendon API-Klasse

Diese Version beseitigt alle Fallback-Mechanismen und
sorgt für eine korrekte Behandlung von Zeitstempeln.
Sie behält nur die tatsächliche stats/vends-API für Transaktionen bei.
"""

import requests
import logging
import json
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# .env-Datei laden
load_dotenv()

# Konfiguriere Logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("vendon_api_improved")

class VendonAPI:
    """
    Klasse für die Kommunikation mit der Vendon API
    """
    BASE_URL = "https://cloud.vendon.net/rest/v1.8.0"
    
    def __init__(self, api_key=None):
        """
        Initialisiert die Vendon API mit einem API-Schlüssel
        
        :param api_key: Der API-Schlüssel für die Authentifizierung (optional)
                        Wenn nicht angegeben, wird der Schlüssel aus anderen Quellen geladen
        """
        # Hierarchie für API-Schlüssel:
        # 1. Explizit übergebener Schlüssel hat die höchste Priorität
        # 2. Umgebungsvariable VENDON_API_KEY
        # 3. Umgebungsvariable API_KEY 
        # 4. Datei .env im aktuellen Verzeichnis
        
        # 1. Der explizit übergebene Schlüssel
        if api_key:
            self.api_key = api_key
            logger.info("API-Schlüssel vom Parameter verwendet.")
        
        # 2. Umgebungsvariable VENDON_API_KEY
        elif os.environ.get('VENDON_API_KEY'):
            self.api_key = os.environ.get('VENDON_API_KEY')
            logger.info("API-Schlüssel aus VENDON_API_KEY Umgebungsvariable verwendet.")
        
        # 3. Umgebungsvariable API_KEY
        elif os.environ.get('API_KEY'):
            self.api_key = os.environ.get('API_KEY')
            logger.info("API-Schlüssel aus API_KEY Umgebungsvariable verwendet.")
        
        # 4. Versuche .env Datei zu laden (bereits oben geladen)
        else:
            if os.environ.get('VENDON_API_KEY'):
                self.api_key = os.environ.get('VENDON_API_KEY')
                logger.info("API-Schlüssel aus .env VENDON_API_KEY geladen.")
            elif os.environ.get('API_KEY'):
                self.api_key = os.environ.get('API_KEY')
                logger.info("API-Schlüssel aus .env API_KEY geladen.")
            else:
                # Standardwert als letzte Option
                self.api_key = "e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB"
                logger.warning("Fallback auf bekannten API-Schlüssel. Dieser könnte abgelaufen sein.")
        
        # Überprüfen, ob wir einen API-Schlüssel haben
        if not self.api_key:
            logger.error("Kein API-Schlüssel gefunden! Die API wird nicht funktionieren.")
        else:
            # Maske für Protokollierung erstellen
            masked_key = "****" + self.api_key[-4:] if len(self.api_key) >= 4 else "****"
            logger.info(f"Vendon API mit Schlüssel {masked_key} initialisiert.")
        
        # WICHTIG: Laut Vendon-Dokumentation muss der Authorization-Header "Token" und nicht "Bearer" verwenden
        self.headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        # Log für Debugging (ohne den tatsächlichen API-Schlüssel zu zeigen)
        if self.api_key:
            # Zeige nur die letzten 4 Zeichen des Schlüssels aus Sicherheitsgründen
            masked_key = "****" + self.api_key[-4:] if len(self.api_key) >= 4 else "****"
            logger.info(f"API-Header eingerichtet: Authorization: Token {masked_key}")
        
        # Session für persistente Verbindungen
        self.session = requests.Session()
        self.session.headers.update(self.headers)
    
    def _make_request(self, endpoint, method="GET", params=None, data=None, retries=3):
        """
        Führt eine Anfrage an die Vendon API aus
        
        :param endpoint: API-Endpunkt
        :param method: HTTP-Methode (GET, POST, etc.)
        :param params: URL-Parameter
        :param data: Daten für POST/PUT
        :param retries: Anzahl der Wiederholungsversuche
        :return: JSON-Antwort oder None bei Fehler
        """
        url = f"{self.BASE_URL}/{endpoint}"
        
        for attempt in range(retries):
            try:
                if method == "GET":
                    response = self.session.get(url, params=params)
                elif method == "POST":
                    response = self.session.post(url, params=params, json=data)
                elif method == "PUT":
                    response = self.session.put(url, params=params, json=data)
                elif method == "DELETE":
                    response = self.session.delete(url, params=params)
                else:
                    logger.error(f"Unbekannte Methode: {method}")
                    return None
                
                # Log API-Anfragen und -Antworten für Debugging
                logger.info(f"API Request: {method} {url}")
                if params:
                    logger.info(f"Params: {params}")
                if data:
                    logger.info(f"Data: {data}")
                
                # Prüfe auf erfolgreiche Antwort
                if response.status_code == 200:
                    try:
                        result = response.json()
                        logger.debug(f"API-Antwort: {result}")
                        return result
                    except json.JSONDecodeError:
                        logger.error(f"Fehler beim Parsen der API-Antwort: {response.text}")
                        return None
                else:
                    logger.warning(f"API-Anfrage fehlgeschlagen: {response.status_code} - {response.text}")
                    
                    # Bei Authentifizierungsfehler nicht wiederholen
                    if response.status_code == 401:
                        logger.error("Authentifizierungsfehler bei der Vendon API. Prüfen Sie den API-Schlüssel.")
                        return None
                    
                    # Bei Rate-Limiting kurz warten und dann erneut versuchen
                    if response.status_code == 429 and attempt < retries - 1:
                        logger.info(f"Rate-Limiting erkannt, warte vor dem nächsten Versuch ({attempt+1}/{retries})...")
                        import time
                        time.sleep(5)  # 5 Sekunden warten
                        continue
            
            except requests.RequestException as e:
                logger.error(f"Verbindungsfehler: {str(e)}")
                if attempt < retries - 1:
                    logger.info(f"Versuche erneut ({attempt+1}/{retries})...")
                    import time
                    time.sleep(2)  # 2 Sekunden warten
                    continue
                return None
            
            # Wenn wir hier ankommen, hat die Anfrage fehlgeschlagen und wir haben alle Wiederholungen ausgeschöpft
            return None
    
    # Machine API Methoden
    def get_machines(self):
        """
        Ruft alle Automaten (Maschinen) von der Vendon API ab
        
        :return: Liste der Automaten oder leere Liste bei Fehler
        """
        response = self._make_request("machine")
        if response and "result" in response:
            return response["result"]
        return []
    
    def get_machine_detail(self, machine_id):
        """
        Ruft Details zu einem bestimmten Automaten ab
        
        :param machine_id: ID des Automaten
        :return: Detaillierte Informationen zum Automaten oder None bei Fehler
        """
        response = self._make_request(f"machine/{machine_id}")
        if response and "result" in response:
            return response["result"]
        return None
    
    def get_machine_issues(self):
        """
        Ruft aktuelle Probleme bei Automaten ab
        
        :return: Liste der Automatenprobleme oder leere Liste bei Fehler
        """
        response = self._make_request("machine/issues")
        if response and "result" in response:
            return response["result"]
        return []
    
    # Product API Methoden
    def get_products(self):
        """
        Ruft alle Produkte von der Vendon API ab
        
        :return: Liste der Produkte oder leere Liste bei Fehler
        """
        # Gemäß Dokumentation gibt es keinen direkten products-Endpunkt,
        # aber wir können Daten aus dem stock Endpunkt verwenden
        response = self._make_request("stock")
        if response and "result" in response:
            return response["result"]
        return []
    
    def get_product_detail(self, product_id):
        """
        Ruft Details zu einem bestimmten Produkt ab
        
        :param product_id: ID des Produkts
        :return: Detaillierte Informationen zum Produkt oder None bei Fehler
        """
        # Da es keinen direkten Endpunkt gibt, versuchen wir es mit einem alternativen Ansatz
        products = self.get_products()
        for product in products:
            if product.get("id") == product_id:
                return product
        return None
    
    def get_events(self, start_date=None, end_date=None, machine_id=None):
        """
        Ruft Ereignisse von der Vendon API ab
        
        :param start_date: Startdatum für die Abfrage (datetime, String im Format YYYY-MM-DD oder UNIX-Zeitstempel)
        :param end_date: Enddatum für die Abfrage (datetime, String im Format YYYY-MM-DD oder UNIX-Zeitstempel)
        :param machine_id: Optional - ID des Automaten für gefilterte Ergebnisse
        :return: Liste der Ereignisse oder leere Liste bei Fehler
        """
        try:
            # Zeitstempel vorbereiten
            start_timestamp, end_timestamp = self._prepare_timestamps(start_date, end_date)
            
            # Parameter vorbereiten
            params = {
                "from_timestamp": start_timestamp,
                "to_timestamp": end_timestamp
            }
            
            if machine_id:
                params["machine_id"] = machine_id
                
            logger.info(f"Rufe Events ab mit Parametern: {params}")
            
            response = self._make_request("events", params=params)
            if response and "result" in response:
                events = response["result"]
                logger.info(f"Erfolgreich {len(events)} Events abgerufen")
                return events
                
            logger.warning("Keine Events gefunden oder API-Anfrage fehlgeschlagen")
            return []
                
        except Exception as e:
            logger.error(f"Fehler beim Abrufen von Ereignissen: {str(e)}")
            return []
    
    def _prepare_timestamps(self, start_date=None, end_date=None):
        """
        Bereitet Zeitstempel für API-Anfragen vor
        
        :param start_date: Startdatum (verschiedene Formate)
        :param end_date: Enddatum (verschiedene Formate) 
        :return: Tuple mit (start_timestamp, end_timestamp)
        """
        start_timestamp = None
        end_timestamp = None
        
        # Startdatum konvertieren
        if start_date is not None:
            if isinstance(start_date, datetime):
                start_timestamp = int(start_date.timestamp())
            elif isinstance(start_date, str):
                try:
                    # Versuche, das Datum im Format YYYY-MM-DD zu interpretieren
                    dt = datetime.strptime(start_date, '%Y-%m-%d')
                    start_timestamp = int(dt.timestamp())
                except ValueError:
                    try:
                        # Vielleicht ist es bereits ein UNIX-Timestamp als String
                        start_timestamp = int(start_date)
                    except (ValueError, TypeError):
                        logger.warning(f"Ungültiges Startdatum-Format: {start_date}, verwende Standard")
            else:
                # Vielleicht ist es bereits ein UNIX-Timestamp als Integer
                try:
                    start_timestamp = int(start_date)
                except (ValueError, TypeError):
                    logger.warning(f"Ungültiges Startdatum: {start_date}, verwende Standard")
        
        # Enddatum konvertieren
        if end_date is not None:
            if isinstance(end_date, datetime):
                end_timestamp = int(end_date.timestamp())
            elif isinstance(end_date, str):
                try:
                    # Bei YYYY-MM-DD Format, setze auf Ende des Tages
                    dt = datetime.strptime(end_date, '%Y-%m-%d')
                    dt = dt.replace(hour=23, minute=59, second=59)
                    end_timestamp = int(dt.timestamp())
                except ValueError:
                    try:
                        # Vielleicht ist es bereits ein UNIX-Timestamp als String
                        end_timestamp = int(end_date)
                    except (ValueError, TypeError):
                        logger.warning(f"Ungültiges Enddatum-Format: {end_date}, verwende Standard")
            else:
                # Vielleicht ist es bereits ein UNIX-Timestamp als Integer
                try:
                    end_timestamp = int(end_date)
                except (ValueError, TypeError):
                    logger.warning(f"Ungültiges Enddatum: {end_date}, verwende Standard")
        
        # Standardwerte, falls keine gültigen Daten angegeben wurden
        if start_timestamp is None:
            # Standardmäßig 7 Tage zurück
            start_timestamp = int((datetime.now() - timedelta(days=7)).timestamp())
        
        if end_timestamp is None:
            # Standardmäßig jetzt
            end_timestamp = int(datetime.now().timestamp())
            
        # Zeitraum in Tagen berechnen (für Protokollzwecke)
        days_range = int((datetime.fromtimestamp(end_timestamp) - datetime.fromtimestamp(start_timestamp)).total_seconds() / 86400) + 1
        logger.info(f"Abfragebereich beträgt {days_range} Tage")
        
        return (start_timestamp, end_timestamp)
    
    def get_transactions(self, start_date=None, end_date=None, machine_id=None, offset=0, limit=100):
        """
        Ruft Transaktionsdaten von der Vendon API über den stats/vends Endpunkt ab
        
        :param start_date: Startdatum für die Abfrage (datetime, String im Format YYYY-MM-DD oder UNIX-Zeitstempel)
        :param end_date: Enddatum für die Abfrage (datetime, String im Format YYYY-MM-DD oder UNIX-Zeitstempel)
        :param machine_id: Optional - ID des Automaten für gefilterte Ergebnisse
        :param offset: Optional - Offset für Pagination
        :param limit: Optional - Anzahl der abzurufenden Einträge
        :return: Liste der Transaktionsdaten oder leere Liste bei Fehler
        """
        # Zeitstempel vorbereiten
        start_timestamp, end_timestamp = self._prepare_timestamps(start_date, end_date)
        
        # Parameters für die API-Anfrage
        params = {
            "from_timestamp": start_timestamp,  # UNIX-Timestamp als Integer
            "to_timestamp": end_timestamp,    # UNIX-Timestamp als Integer
            "offset": offset,
            "limit": limit
        }
        
        # Wenn machine_id angegeben ist, füge sie zu den Parametern hinzu
        if machine_id:
            params["machine_id"] = machine_id
        
        logger.info(f"Rufe Transaktionen ab mit Parametern: {params}")
        
        # Verwende den stats/vends Endpunkt, der nachweislich funktioniert hat
        response = self._make_request("stats/vends", params=params)
        
        if response and "result" in response:
            transactions = response["result"]
            logger.info(f"Erfolgreich {len(transactions)} Transaktionen abgerufen")
            return transactions
        
        # Wenn keine Transaktionen gefunden wurden oder es einen Fehler gab, zeige detaillierte Fehlerinformationen
        if response and "error" in response:
            logger.error(f"API-Fehler beim Abrufen von Transaktionen: {response['error']}")
        else:
            logger.error("Unbekannter Fehler beim Abrufen von Transaktionen")
        
        # Kein Fallback auf alternative Endpunkte, stattdessen klare Fehlermeldung
        logger.error("Keine Transaktionen gefunden. Stellen Sie sicher, dass der API-Zugriff korrekt konfiguriert ist.")
        return []
    
    def get_machine_stock(self, machine_id):
        """
        Ruft den aktuellen Lagerbestand eines Automaten ab
        
        :param machine_id: ID des Automaten
        :return: Liste der Produkte mit Lagerbestand oder leere Liste bei Fehler
        """
        response = self._make_request(f"machine/{machine_id}/stock")
        
        if response and "result" in response:
            return response["result"]
        
        logger.warning(f"Fehler beim Abrufen des Lagerbestands für Maschine {machine_id}")
        return []
    
    def get_refills(self, start_date=None, end_date=None, machine_id=None, offset=0, limit=100):
        """
        Ruft Refill-Daten (Auffüllungen) von der Vendon API ab
        
        :param start_date: Startdatum für die Abfrage (datetime, String im Format YYYY-MM-DD oder UNIX-Zeitstempel)
        :param end_date: Enddatum für die Abfrage (datetime, String im Format YYYY-MM-DD oder UNIX-Zeitstempel)
        :param machine_id: Optional - ID des Automaten für gefilterte Ergebnisse
        :param offset: Optional - Offset für Pagination
        :param limit: Optional - Anzahl der abzurufenden Einträge
        :return: Liste der Refill-Daten oder leere Liste bei Fehler
        """
        # Zeitstempel vorbereiten
        start_timestamp, end_timestamp = self._prepare_timestamps(start_date, end_date, days_default=30)
        
        # Parameters für die API-Anfrage - für Refills werden Millisekunden verwendet!
        params = {
            "from": int(start_timestamp * 1000),  # Millisekunden-Timestamp
            "till": int(end_timestamp * 1000),    # Millisekunden-Timestamp
            "offset": offset,
            "limit": limit
        }
        
        # Wenn machine_id angegeben ist, füge sie zu den Parametern hinzu
        if machine_id:
            params["machine_id"] = machine_id
        
        logger.info(f"Rufe Refills ab mit Parametern: {params}")
        
        # Verwende den refill Endpunkt
        response = self._make_request("refill", params=params)
        
        if response and "result" in response:
            refills = response["result"]
            logger.info(f"Erfolgreich {len(refills)} Refills abgerufen")
            return refills
        
        # Wenn keine Refills gefunden wurden oder es einen Fehler gab
        if response and "error" in response:
            logger.error(f"API-Fehler beim Abrufen von Refills: {response['error']}")
        else:
            logger.error("Unbekannter Fehler beim Abrufen von Refills")
        
        # Kein Fallback auf alternative Endpunkte, stattdessen klare Fehlermeldung
        logger.error("Keine Refills gefunden. Stellen Sie sicher, dass der API-Zugriff korrekt konfiguriert ist.")
        return []
        
    def _prepare_timestamps(self, start_date=None, end_date=None, days_default=7):
        """
        Bereitet Zeitstempel für API-Anfragen vor
        
        :param start_date: Startdatum (verschiedene Formate)
        :param end_date: Enddatum (verschiedene Formate)
        :param days_default: Standard-Anzahl der Tage für den Abfragezeitraum
        :return: Tuple mit (start_timestamp, end_timestamp)
        """
        start_timestamp = None
        end_timestamp = None
        
        # Startdatum konvertieren
        if start_date is not None:
            if isinstance(start_date, datetime):
                start_timestamp = int(start_date.timestamp())
            elif isinstance(start_date, str):
                try:
                    # Versuche, das Datum im Format YYYY-MM-DD zu interpretieren
                    dt = datetime.strptime(start_date, '%Y-%m-%d')
                    start_timestamp = int(dt.timestamp())
                except ValueError:
                    try:
                        # Vielleicht ist es bereits ein UNIX-Timestamp als String
                        start_timestamp = int(start_date)
                    except (ValueError, TypeError):
                        logger.warning(f"Ungültiges Startdatum-Format: {start_date}, verwende Standard")
            else:
                # Vielleicht ist es bereits ein UNIX-Timestamp als Integer
                try:
                    start_timestamp = int(start_date)
                except (ValueError, TypeError):
                    logger.warning(f"Ungültiges Startdatum: {start_date}, verwende Standard")
        
        # Enddatum konvertieren
        if end_date is not None:
            if isinstance(end_date, datetime):
                end_timestamp = int(end_date.timestamp())
            elif isinstance(end_date, str):
                try:
                    # Bei YYYY-MM-DD Format, setze auf Ende des Tages
                    dt = datetime.strptime(end_date, '%Y-%m-%d')
                    dt = dt.replace(hour=23, minute=59, second=59)
                    end_timestamp = int(dt.timestamp())
                except ValueError:
                    try:
                        # Vielleicht ist es bereits ein UNIX-Timestamp als String
                        end_timestamp = int(end_date)
                    except (ValueError, TypeError):
                        logger.warning(f"Ungültiges Enddatum-Format: {end_date}, verwende Standard")
            else:
                # Vielleicht ist es bereits ein UNIX-Timestamp als Integer
                try:
                    end_timestamp = int(end_date)
                except (ValueError, TypeError):
                    logger.warning(f"Ungültiges Enddatum: {end_date}, verwende Standard")
        
        # Standardwerte, falls keine gültigen Daten angegeben wurden
        if start_timestamp is None:
            # Standardmäßig X Tage zurück
            start_timestamp = int((datetime.now() - timedelta(days=days_default)).timestamp())
        
        if end_timestamp is None:
            # Standardmäßig jetzt
            end_timestamp = int(datetime.now().timestamp())
            
        # Zeitraum in Tagen berechnen (für Protokollzwecke)
        days_range = int((datetime.fromtimestamp(end_timestamp) - datetime.fromtimestamp(start_timestamp)).total_seconds() / 86400) + 1
        logger.info(f"Abfragebereich beträgt {days_range} Tage")
        
        return (start_timestamp, end_timestamp)
    
    def get_refill_details(self, refill_id):
        """
        Ruft Details zu einem bestimmten Refill ab
        
        :param refill_id: ID des Refills
        :return: Detaillierte Informationen zum Refill oder None bei Fehler
        """
        response = self._make_request(f"refill/{refill_id}")
        
        if not response or "result" not in response:
            logger.error(f"Fehler beim Abrufen von Refill-Details für ID {refill_id}: {response}")
            return None
        
        return response["result"]

# Testet die API-Verbindung, wenn direkt ausgeführt
if __name__ == "__main__":
    api = VendonAPI()
    
    # Teste Machine API
    print("Teste Maschinenabruf...")
    machines = api.get_machines()
    print(f"Anzahl der Maschinen: {len(machines)}")
    if machines:
        machine_id = machines[0].get("id")
        print(f"Erste Maschine ID: {machine_id}, Name: {machines[0].get('name')}")
        
        # Teste Machine Detail
        print("\nTeste Maschinendaten...")
        machine_detail = api.get_machine_detail(machine_id)
        if machine_detail:
            print(f"Detaillierte Informationen für Maschine {machine_id} abgerufen")
        
        # Teste Machine Stock
        print("\nTeste Maschinenbestand...")
        machine_stock = api.get_machine_stock(machine_id)
        print(f"Anzahl der Produkte im Bestand: {len(machine_stock)}")
    
    # Teste Product API
    print("\nTeste Produktabruf...")
    products = api.get_products()
    print(f"Anzahl der Produkte: {len(products)}")
    
    # Teste Transaktionen
    print("\nTeste Transaktionsabruf...")
    yesterday = datetime.now() - timedelta(days=1)
    transactions = api.get_transactions(yesterday, datetime.now())
    print(f"Anzahl der Transaktionen: {len(transactions)}")
    if transactions:
        print("Erste Transaktion:")
        print(json.dumps(transactions[0], indent=2))
    
    # Teste Refills
    print("\nTeste Refill-Abruf...")
    last_week = datetime.now() - timedelta(days=7)
    refills = api.get_refills(last_week, datetime.now())
    print(f"Anzahl der Refills: {len(refills)}")
    if refills:
        print("Erster Refill:")
        print(json.dumps(refills[0], indent=2))