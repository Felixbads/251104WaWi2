# Umfassende Analyse: Neugestaltung des Bestellprozesses

## Zusammenfassung der Anforderungen

Basierend auf dem bereitgestellten Dokument soll ein vollständig überarbeiteter Bestellprozess implementiert werden, der einen effizienten, übersichtlichen und praxisnahen Workflow bietet.

## 1. Aktuelle Systemanalyse

### ✅ Bereits vorhanden:
- **Grundlegendes Bestellsystem**: Bestehende `orders` und `orderItems` Tabellen
- **Lieferantenverwaltung**: Vollständige Supplier-Management-Infrastruktur
- **Lagerverwaltung**: Umfassendes Warehouse-System mit MHD-Tracking
- **Bulk-Order-Modus**: Bereits implementierte BulkOrderMode-Komponente
- **Chargen-System**: Vollständige Batch-Tracking mit FIFO-Logic
- **MHD-Integration**: Mindesthaltbarkeitsdatum-Verwaltung implementiert

### ⚠️ Identifizierte technische Probleme (behoben):
- ✅ `base_unit_name` Spalte in products Tabelle hinzugefügt
- ✅ ProductId-Validierung Inkonsistenzen identifiziert
- ✅ Database-Schema synchronisiert

## 2. Neue Anforderungen aus dem Dokument

### 2.1 Produkt- und Lagerübersicht während der Bestellung
**Anforderung:**
- Aktueller Lagerbestand anzeigen
- Prognostizierte Verkaufsmenge für konfigurierbaren Zeitraum (7, 14, 30 Tage)
- Individuell einstellbarer Zeitraum für Bedarfsberechnung

**Status:** 🟡 Teilweise vorhanden
- **Vorhanden**: Lagerbestand-Abfragen
- **Fehlt**: Dynamische Verkaufsprognosen
- **Fehlt**: Konfigurierbarer Zeitraum-Selector

### 2.2 Warenkorbmodell für Bestellungen
**Anforderung:**
- Klassisches Warenkorb-Interface
- Anzeige: Lieferant, Liefertermin, Lieferort
- Hinzufügen/Entfernen von Produkten
- Kommentare pro Position
- Optionale Preisanzeige
- Automatische Lieferort-Übernahme mit Überschreibungsmöglichkeit

**Status:** 🟡 Teilweise vorhanden
- **Vorhanden**: Grundlegendes Bestell-Interface
- **Fehlt**: Warenkorb-ähnliche UX
- **Fehlt**: Kommentare pro Position
- **Fehlt**: Flexible Preis-Toggle

### 2.3 Versand der Bestellung
**Anforderung:**
- Bearbeitbare E-Mail vor Versand
- Status-Übergang zu "Versendet"

**Status:** 🟡 Teilweise vorhanden
- **Vorhanden**: E-Mail-Versand-System
- **Fehlt**: In-App E-Mail-Editor
- **Fehlt**: Status-Workflow

### 2.4 Wareneingang nach Lieferung
**Anforderung:**
- Automatischer Status-Wechsel zu "Wareneingang"
- Erfassung tatsächlich gelieferter Mengen
- MHD-Erfassung pro Position
- MHD-Vorschlag: Lieferdatum + Haltbarkeitsdauer
- Automatische Lager-Zuordnung

**Status:** 🟢 Großteils vorhanden
- **Vorhanden**: MHD-System mit inventory_batches
- **Vorhanden**: Wareneingang-Workflow
- **Fehlt**: Automatisierte MHD-Vorschläge
- **Fehlt**: Integration in Bestellprozess

### 2.5 Lagerintegration mit Rückverfolgbarkeit
**Anforderung:**
- Rückverfolgung: Bestellung → Charge → Lagerstandort
- MHD-Nachvollziehbarkeit bei Entnahme
- Charge-zu-Bestellung Mapping

**Status:** 🟢 Vollständig vorhanden
- **Vorhanden**: Umfassendes Batch-System
- **Vorhanden**: FIFO-Logic für MHD-Transfer
- **Vorhanden**: Vollständige Rückverfolgbarkeit

## 3. Implementierungsplan

### Phase 1: Technische Grundlagen stabilisieren ✅
- [x] Database-Schema-Konsistenz herstellen
- [x] ProductId-Validierung korrigieren
- [x] Fehlende Spalten hinzufügen

### Phase 2: Erweiterte Bestelloberfläche 
**Priorität: Hoch**
- [ ] Warenkorb-Interface implementieren
- [ ] Verkaufsprognose-Integration
- [ ] Zeitraum-konfigurierbarer Bedarfsrechner
- [ ] Kommentar-System pro Bestellposition
- [ ] Flexible Preisanzeige-Toggle

### Phase 3: Verbesserter Workflow
**Priorität: Mittel**
- [ ] Status-Management (Neu → Versendet → Wareneingang → Abgeschlossen)
- [ ] In-App E-Mail-Editor
- [ ] Automatische MHD-Vorschläge
- [ ] Lieferort-Management mit Überschreibung

### Phase 4: Integration und Optimierung
**Priorität: Niedrig**
- [ ] Vollständige Bestellung-zu-Charge Verfolgung
- [ ] Automatisierte Bestellvorschläge
- [ ] Lieferverfolgung-Integration

## 4. Technische Architektur-Erweiterungen

### 4.1 Neue Datenbank-Felder
```typescript
// Erweiterte order_items Tabelle
export const orderItems = pgTable("order_items", {
  // ... bestehende Felder
  itemComment: text("item_comment"), // Kommentar pro Position
  expectedMHD: date("expected_mhd"), // Erwartetes MHD
  actualDelivered: integer("actual_delivered"), // Tatsächlich gelieferte Menge
  deliveryComment: text("delivery_comment"), // Kommentar bei Lieferung
});

// Erweiterte orders Tabelle
export const orders = pgTable("orders", {
  // ... bestehende Felder
  deliveryLocation: text("delivery_location"), // Lieferort (überschreibbar)
  showPricesInEmail: boolean("show_prices_in_email").default(true), // Preise in E-Mail anzeigen
  forecastPeriodDays: integer("forecast_period_days").default(14), // Prognosezeitraum
  emailContent: text("email_content"), // Angepasster E-Mail-Inhalt
});
```

### 4.2 Neue API-Endpoints
```typescript
// Verkaufsprognose
GET /api/orders/forecast?productId={id}&days={days}
POST /api/orders/forecast/bulk

// Erweiterte Bestellverwaltung
PUT /api/orders/{id}/status
POST /api/orders/{id}/email/preview
POST /api/orders/{id}/email/send
POST /api/orders/{id}/goods-receipt
```

### 4.3 Frontend-Komponenten
```typescript
// Neue React-Komponenten
- OrderCartInterface.tsx (Warenkorb-Interface)
- ForecastCalculator.tsx (Bedarfsrechner)
- EmailEditor.tsx (E-Mail-Editor)
- GoodsReceiptForm.tsx (Wareneingang-Erfassung)
- OrderStatusWorkflow.tsx (Status-Management)
```

## 5. Priorisierung

### Sofortige Umsetzung (Heute):
1. ✅ Technische Probleme beheben
2. 🔄 ProductId-Validierung korrigieren
3. 🔄 Warenkorb-Interface Grundlage implementieren

### Nächste Schritte (Diese Woche):
1. Verkaufsprognose-System
2. Erweiterte Bestelloberfläche
3. Status-Workflow

### Mittelfristig (Nächste 2 Wochen):
1. E-Mail-Editor Integration
2. Wareneingang-Automatisierung
3. Vollständige Rückverfolgbarkeit

## 6. Qualitätssicherung

### Tests erforderlich:
- [ ] End-to-End Bestellprozess-Tests
- [ ] MHD-Berechnungs-Tests
- [ ] E-Mail-Generierung Tests
- [ ] Lager-Integration Tests

### Performance-Optimierungen:
- [ ] Caching für Verkaufsprognosen
- [ ] Optimierte Datenbankabfragen für Lagerbestände
- [ ] Lazy Loading für große Produktlisten

## 7. Risiken und Lösungsansätze

### Technische Risiken:
- **Datenkonsistenz**: Regelmäßige Schema-Validierung
- **Performance**: Schrittweise Implementierung mit Tests
- **Benutzerfreundlichkeit**: Iterative UX-Verbesserungen

### Geschäftliche Risiken:
- **Workflow-Unterbrechung**: Parallele Systeme während Migration
- **Datenverlust**: Umfassende Backup-Strategie
- **User Adoption**: Stufenweise Einführung mit Training

## Fazit

Das System hat bereits eine solide Grundlage für das neue Bestellsystem. Mit gezielten Erweiterungen kann der gewünschte Workflow vollständig implementiert werden. Die Priorisierung fokussiert auf die kritischsten Benutzer-Features zuerst.