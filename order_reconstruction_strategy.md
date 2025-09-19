# Rekonstruktionsstrategie für verlorene Bestellungen

## Situation
- **Datenverlust**: 269 Bestellungen (IDs 1-269) durch Reset-Script verloren
- **Verbliebene Daten**: 6 Bestellungen (270-275) noch vorhanden
- **Zeitraum**: Verlust zwischen 10.-19. September 2025

## Verfügbare Datenquellen

### 1. Wiederkehrende Bestellungen (7 Templates)
**Identifizierte Lieferanten und Muster:**
- **Milchhof Fiedler GbR (ID: 24)**: Käse, Milchprodukte, wöchentlich Dienstag
- **Agrarprodukte Struppen GmbH (ID: 35)**: Fleisch, Eier, wöchentlich Montag  
- **Test Supplier (ID: 1)**: Test-Bestellungen
- **00 Testlieferant (ID: 36)**: E-Mail-Tests

**Typische Produktkategorien:**
- Käseprodukte (Wehl'ner Serie)
- Milchprodukte (Joghurt, Pudding)
- Fleischprodukte (Wurst, Salami)
- Eier

### 2. Portal-Aktivitäten (supplier_access_pins)
**Verdächtige Aktivitäten:**
- Nur 1 Portal-Zugriff von Lieferant 35 zwischen 10.-19. September
- Normalerweise deutlich mehr Aktivität erwartet
- Hinweis auf verlorene Portal-Interaktionen

### 3. Transaktionsdaten
**Bestätigte Produktverkäufe (19.09.2025):**
- "Wehlener Pudding vers. Sorten" (Milchhof Fiedler) - Match mit Bestellung 275
- Oppacher AQUABio Apfel Birne
- Braumeister Fassbrause Zitrone
- Vita Cola PUR

### 4. E-Mail-Logs (248 E-Mails)
**Systemwarnungen identifiziert:**
- "kritische Lücken gefunden" (mehrfach täglich)
- "Transaktionslücke erkannt" für verschiedene Standorte
- **Hinweis**: Diese könnten auf verlorene Bestellungen hindeuten

## Rekonstruktionsansätze

### Phase 1: Sofortige Datensammlung
1. **E-Mail-Payload-Analyse**: Detailanalyse der "kritischen Lücken"-Meldungen
2. **Portal-Log-Extraktion**: Alle Lieferanten-Aktivitäten rekonstruieren
3. **Transaktions-Korrelation**: Verkaufsdaten mit möglichen Bestellungen abgleichen

### Phase 2: Template-basierte Rekonstruktion
1. **Mustererkennung**: Aus Recurring Orders typische Bestellmengen ableiten
2. **Lieferantenprofile**: Basierend auf Templates wahrscheinliche Bestellungen erstellen
3. **Zeitliche Extrapolation**: Wöchentliche Muster auf verlorenen Zeitraum anwenden

### Phase 3: Externe Datenabfrage
1. **Lieferanten-Kontakt**: E-Mail-Anfragen an alle aktiven Lieferanten
2. **Portal-Link-Rekonstruktion**: Bestehende Portal-Zugänge für Datenabfrage nutzen
3. **Delivery-Confirmation-Matching**: Gelieferte Waren als Bestellungsnachweis

### Phase 4: Systematische Wiederherstellung
1. **Prioritätsbasiert**: Große Lieferanten zuerst (Milchhof Fiedler, Agrarprodukte Struppen)
2. **Validierung**: Rekonstruierte Daten gegen Transaktionen prüfen
3. **Schrittweise Eingabe**: Validierte Bestellungen in System einpflegen

## Priorisierung

### Hohe Priorität
1. **Milchhof Fiedler (24)**: Aktuelle Bestellung 275 zeigt komplettes Sortiment
2. **Agrarprodukte Struppen (35)**: Portal-Zugriff am 11.09., wahrscheinlich verlorene Bestellung

### Mittlere Priorität
3. Weitere Lieferanten aus Recurring Orders
4. Lieferanten mit Portal-Aktivitäten

### Niedrige Priorität
5. Test-Bestellungen
6. Unbekannte Lieferanten

## Erwartete Wiederherstellungsrate
- **Recurring-Pattern**: 60-80% der wöchentlichen Bestellungen
- **Portal-Aktivitäten**: 40-60% der Interaktionen
- **Externe Anfragen**: 30-50% Rücklaufquote
- **Gesamtschätzung**: 120-180 von 269 Bestellungen rekonstruierbar

## Präventionsmaßnahmen
1. **Backup-Strategie**: Automatische tägliche Backups vor Reset-Scripts
2. **Transaktions-Logging**: Erweiterte Protokollierung aller Änderungen
3. **Recovery-Tests**: Regelmäßige Tests der Wiederherstellungsverfahren
4. **Portal-Archivierung**: Separate Sicherung der Portal-Kommunikation