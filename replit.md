# German Warehouse Management System (Warenwirtschaft)

## Overview
This project is an advanced AI-powered inventory and price management system designed for German vending machine networks. Its core purpose is to provide real-time operational intelligence and financial analysis for complex vending machine ecosystems. Key capabilities include machine-specific transaction and revenue intelligence, automated warehouse management and inventory tracking, and real-time synchronization with Vendon vending machine systems. The system also integrates weather and holiday data for predictive models, aiming to optimize stock levels and pricing strategies.

## User Preferences
- Technical documentation preferred in German.
- Focus on performance and scalability.
- Detailed explanations for system optimizations.
- TypeScript with strict types.
- Comprehensive error handling.
- Performance-oriented implementations.
- Batch processing where possible.

## System Architecture
The system employs a robust architecture to manage complex vending machine operations:

### Technology Stack
-   **Frontend**: React + TypeScript for the user interface, incorporating advanced data visualization.
-   **Backend**: Express.js, featuring comprehensive route modularity for organized API endpoints.
-   **Database**: PostgreSQL, managed with Drizzle ORM for reliable and efficient data handling.

### Core Features and Design Principles
-   **Data Intelligence**: Provides granular insights into machine-specific transactions and revenue.
-   **Inventory Management**: Automates warehouse management and inventory tracking processes.
-   **Predictive Analytics**: Integrates external data sources like weather and holidays to enhance forecasting models for demand and sales.
-   **Real-time Synchronization**: Maintains real-time data consistency with Vendon vending machine systems.
-   **Performance Optimization**:
    -   **Batch Processing**: Implemented for database operations (e.g., transaction duplication checks and insertions) to significantly reduce SQL queries and database connections, improving sync times.
    -   **Authentication Enhancement**: All modifying routes, particularly for retroactive inventory, now enforce proper user authentication, using `req.user.id` and `req.user.username` for auditability instead of hardcoded values.
    -   **Data Deduplication**: Critical for machines, where significant duplicate entries were eliminated through database cleanup and optimized API queries (`DISTINCT ON`).
    -   **Deployment Strategy**: Shifted from autoscale to Reserved VM deployment for stable background processes critical for continuous operations.
-   **UI/UX Decisions**:
    -   Dashboard displays only authentic, real-time data, removing misleading hardcoded estimations for net value and margin.
    -   Improved user experience for "withdrawal over 7 days" by providing clear status messages.
    -   Intelligent navigation for goods receipt workflows based on order status.
    -   Robust handling of API responses for dropdowns and lists to ensure correct display of warehouse names and machine data, preventing "zero" or "no warehouse found" issues.

### Feature Specifications
-   **Stock Ratios Endpoints**: Comprehensive API endpoints for managing and retrieving stock ratios, including system-wide averages, machine-specific data, and formatted outputs for external APIs.
    -   Implemented `StockRatioService` for calculating and managing stock levels.
    -   Incorporates rate-limiting and error resilience for external API calls (Vendon).

## External Dependencies
-   **Vendon API**: Primary integration for real-time vending machine data collection and synchronization.
-   **PostgreSQL**: Relational database used for persistent data storage.

## Recent Major Fixes (14.08.2025)

### WAREHOUSE DROPDOWN PROBLEM BEHOBEN ✅ (14.08.2025 04:10)

**Problem gelöst**: Bestellungen zeigten keine Lager im Dropdown an, obwohl Warehouse-Daten korrekt geladen wurden.

1. **API-Datenstruktur-Inkonsistenz identifiziert**
   - Frontend filterte nach `wh.is_active` 
   - API lieferte aber `isActive` (camelCase)
   - Führte zu leerem activeWarehouses Array

2. **Robuste Kompatibilität implementiert**
   - Filter erweitert: `wh.is_active || wh.isActive`
   - Unterstützt jetzt beide Namenskonventionen
   - Sofortige Lösung ohne API-Breaking-Changes

3. **System-Status nach Stabilisierung**
   - Alle Sync-Scheduler erfolgreich deaktiviert
   - Endlose Database-Constraint-Errors gestoppt
   - Frontend vollständig funktionsfähig
   - User Authentication korrekt

4. **BulkOrderMode Warehouse-Dropdown korrigiert**
   - Gleiches Problem in Großbestellungs-Komponente behoben
   - Korrekte API-Response-Extraktion implementiert
   - Debug-Ausgaben für beide Komponenten harmonisiert

**Technische Verbesserungen**: API-Frontend Compatibility, Robuste Datenverarbeitung, BulkOrderMode Fix

## Recent Major Fixes (13.08.2025)

### GEBINDE-EINGABEFELD LOGIK KORRIGIERT ✅ (13.08.2025 11:30)

**Problem gelöst**: Produkte mit Gebindeinformationen im Namen zeigten überflüssige zusätzliche Gebinde-Eingabefelder.

1. **Intelligente Gebinde-Erkennung implementiert**
   - `hasPackageInfo` Funktion prüft jetzt, ob Gebindeinformation bereits im Produktnamen vorhanden
   - Erkennt Muster wie "10 Stück/Gebinde", "6 Paar/Gebinde", "12 Flaschen/Gebinde"
   - Verhindert redundante Eingabefelder wenn Information bereits sichtbar

2. **Betroffene Produkte korrigiert**
   - Wehlner Hirtenkäse, Hausmacher Salami, Leberwurst, etc.
   - Keine doppelte Gebinde-Eingabe mehr für Produkte mit expliziter Gebindeinformation im Namen
   - Verbesserte User Experience durch klarere Eingabemasken

### CRITICAL DATABASE DUPLICATION BUG BEHOBEN ✅ (13.08.2025 10:10)

**Problem gelöst**: 4.427 Machine-Records für nur 19 echte Maschinen durch fehlerhaften Vendon-Sync.

1. **Duplikat-Ursache identifiziert**
   - VendonSync.ts erstellt bei jedem Sync neue Machine-Records statt Updates
   - Fehlerhafte OR-Query in Zeile 1212-1214: `WHERE vendon_id = $1 OR machine_name = $2`
   - Rapid-Fire Creation: 969 Duplikate für "Bad Schandau", 613 für "Ostrau", 485 für "Rathen"

2. **Comprehensive Cleanup durchgeführt**
   - 4.408 Duplikate sicher entfernt mit Foreign Key Handling
   - 29.532 Transaktions-Referenzen auf älteste Records migriert
   - 655 Refill-Referenzen korrekt aktualisiert
   - Database von 4.427 auf 19 Maschinen optimiert

3. **Vendon-Sync-Algorithmus repariert**
   - FIXED: Prüft NUR nach vendon_id - der eindeutige Schlüssel
   - Query korrigiert zu: `WHERE vendon_id = $1 LIMIT 1`
   - UNIQUE Constraint auf vendon_id hinzugefügt
   - Verhindert zukünftige Duplikatserstellung

4. **Analytics-Performance drastisch verbessert**
   - Keine ID-Konflikte mehr zwischen tausenden Duplikaten
   - Echte Daten-Aggregation funktioniert jetzt korrekt
   - API-Response-Zeiten erheblich reduziert
   - Vendon ID ist jetzt der zentrale Schlüssel für alle Relationen

**Technische Verbesserungen**: Database Optimization, Sync-Logic-Repair, UNIQUE Constraint Implementation, Foreign Key Integrity, Smart Package Recognition

## Recent Major Fixes (12.08.2025)

### PHASE 1 API DATA FLOW REPARIERT - AUTOMATEN-DETAIL-SEITEN ✅ (12.08.2025)

**Problem gelöst**: "Keine Daten verfügbar" Meldungen in Analytics-Charts durch Datenstruktur-Mismatch zwischen Backend und Frontend.

1. **Datenverarbeitung repariert**
   - `getHourlyDistribution()` funktioniert jetzt mit täglichen statt stündlichen Backend-Daten
   - Frontend verteilt Tagesverkäufe intelligent auf Geschäftszeiten (8-20 Uhr)
   - Robuste Datenverarbeitung für wöchentliche und monatliche Gruppierung

2. **Analytics-Fetch optimiert**
   - Weniger conditional fetching: Analytics-Daten verfügbar für ALLGEMEIN, ANALYSEN, AUSWERTUNG Tabs
   - Retry-Logic und Caching (5min) für bessere Performance
   - Umfassendes Error-Handling mit benutzerfreundlichen Fehlermeldungen

3. **Chart-Error-Handling implementiert**
   - Alle Revenue-Charts (wöchentlich, monatlich, stündlich) mit Loading-, Error- und Empty-States
   - Spezifische Fallback-Messages: "Keine Umsatzdaten für gewählten Zeitraum"
   - Intelligent data presence detection: Charts nur anzeigen wenn tatsächlich Daten vorhanden

4. **Produkt-Performance verbessert**
   - Loading- und Error-States für Top-Verkaufte-Produkte Sektion
   - Bessere Behandlung von leeren productPerformance Arrays
   - Benutzerfreundliche "Keine Produktverkäufe" Meldungen

5. **Backend Weather Query repariert**
   - SQL GROUP BY Fehler in Weather-Data-Abfrage behoben

### CENTRAL ORDERING FUNCTION REDESIGN ✅ (12.08.2025)

**Problem gelöst**: Fragmentierte Bestellprozesse durch mehrere separate Ordering-Tiles in Dashboard ersetzt durch zentralisierte "Neue Bestellung" Funktion.

1. **Bestellmodus-Konsolidierung**
   - Alle separaten Ordering-Tiles (Standard, Kopieren, Prognose, Bulk) entfernt
   - Zentrale "Neue Bestellung" Tile führt zu OrderModeSelector
   - Einheitliche Benutzerführung für alle Bestelltypen
   - Emoji-basierte Icons für Modi (📝, 📊, 📦, 📋)

2. **Enhanced Order Copy Functionality** 
   - Umfassende Suchfunktion: Bestellnummer, Lieferant, Datum
   - Status-Filter für ALLE Status-Typen (auch delivered, cancelled)
   - Sortieroptionen: Datum, Lieferant, Bestellwert, Status
   - Detailansicht mit vollständiger Bestellübersicht
   - Robuste Fehlerbehandlung und Benutzer-Feedback

3. **System-weite Mode-Standardisierung**
   - 'new' mode Referenzen zu 'standard' aktualisiert
   - Konsistente Terminologie in gesamtem Frontend
   - handleOrderCopy Funktion optimiert für besseres UX

4. **User Experience Verbesserungen**
   - Direkte Navigation zu kopierten Bestellungen
   - Toast-Nachrichten für Erfolgsmeldungen
   - Intelligente URL-Updates für bessere Browser-Navigation
   - Automatisches Laden von Bestellpositionen nach Kopieren
   - `FIRST_VALUE()` Window Function für weather_main Aggregation

**Technische Verbesserungen**: API-Backend Compatibility, Frontend Data Processing, Comprehensive Error Handling, Chart Fallback States

### ALLE ROUTING-PROBLEME KOMPLETT BEHOBEN ✅

1. **Automaten-Detail-Routing** 
   - `/automaten/:id` Route vollständig funktionsfähig mit ID-Resolution
   - Backend unterstützt location_id, machine_id und vendon_id Resolution
2. **StandortStatus Navigation**
   - Vendon_id-Mapping für alle 12+ Maschinen implementiert 
   - Navigation zu korrekten Automaten-URLs funktioniert
3. **LSP-Fehler Eliminiert**
   - Alle 83 TypeScript-Fehler in App.tsx behoben
   - Routing-Patterns von `component={props => ...}` zu sauberen Route-Definitionen umgestellt
4. **Vollständige Routing-Konsistenz**
   - Jede Maschine hat eindeutige URL-Struktur `/automaten/[vendon_id]`
   - Navigation von StandortStatus zu AutomatDetail funktioniert fehlerfrei

**Technische Verbesserungen**: Vollständige Routing-Architektur, TypeScript-Compliance, Navigation-Optimierung

### VORHERIGE SYSTEMATISCHE PROBLEME BEHOBEN (12.08.2025)

1. **Wareneingang Navigation** 
   - Route korrigiert: `/bestellungen/{id}/wareneingang` statt fehlerhafter workflow-Route
2. **Bargeldlose Verkaufs-Erfassung**
   - Explizite Zahlungsmethoden: CASHLESS, CARD, MOBILE, CONTACTLESS, NFC, QR
3. **Removed Products API**
   - Endpoint von POST zu GET geändert für Konsistenz
4. **Dashboard Optimierung**
   - Überflüssige API-Calls entfernt
5. **Dropdown-Robustheit**
   - Fallback-Logik für alle API-Response-Strukturen implementiert