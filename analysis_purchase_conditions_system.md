# Analyse: Einkaufsbedingungen-System - Status und fehlende Implementierungen

## Aktueller Stand: ✅ BEREITS IMPLEMENTIERT

### 1. Datenmodell und Grundstruktur
- ✅ **Vollständige Datenbank-Schema** für Einkaufsbedingungen
- ✅ **Produkt-Lieferant-Zuordnungen** über purchase_conditions Tabelle
- ✅ **Grundlegende Einkaufsbedingungen** pro Produkt-Lieferant-Kombination:
  - Einkaufspreis (Netto) - `unitPrice`
  - Gebindemenge - `packagingQuantity` + `packagingUnit`
  - Mindestabnahmemenge - `minQuantity`
  - Mehrwertsteuer - `taxRate` (aus API übernommen)
  - Lieferzeit - `deliveryTime`
  - Gültigkeitszeitraum - `validFrom`/`validTo`

### 2. Benutzeroberflächen
- ✅ **Lieferantenansicht**: Vollständige Verwaltung der Einkaufsbedingungen
- ✅ **Einkaufsbedingungen-Tab** in SupplierDetail mit CRUD-Funktionen
- ✅ **Bestellungsprozess**: Integration der Einkaufspreise in Produktauswahl
- ✅ **Purchase Conditions Form** für Bearbeitung

### 3. API und Backend
- ✅ **Vollständige API-Endpunkte** für CRUD-Operationen
- ✅ **Supplier-Products API** nutzt Einkaufspreise statt Verkaufspreise
- ✅ **Integration in Bestellprozess** (BestellungV2)

### 4. Workflow-Integration
- ✅ **Bestellungen**: Einkaufspreise werden automatisch übernommen
- ✅ **Wareneingang**: GoodsReceiptForm verarbeitet Lieferungen

---

## 🚨 FEHLENDE IMPLEMENTIERUNGEN (Laut Anforderungen)

### 1. LIEFERANTENSPEZIFISCHE RABATT- UND NACHLASSLOGIK

#### ❌ Nicht implementiert:
- **Mengenrabatte** (z.B. 5% ab 100 Stück)
- **Skonto** (z.B. 2% bei Zahlung innerhalb von 10 Tagen)
- **Staffelpreise** je nach Bestellmenge
- **Lieferantenspezifische Rabattkonditionen** in der Lieferantenverwaltung

#### 💡 Benötigte Erweiterungen:
```sql
-- Neue Tabelle für Lieferanten-Rabattkonditionen
CREATE TABLE supplier_discount_conditions (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id),
  discount_type TEXT, -- 'volume', 'cash_discount', 'quantity_scale'
  threshold_quantity INTEGER, -- Ab welcher Menge
  threshold_amount DECIMAL, -- Ab welchem Bestellwert
  discount_percentage DECIMAL, -- Rabatt in Prozent
  discount_amount DECIMAL, -- Fester Rabattbetrag
  payment_terms_days INTEGER, -- Tage für Skonto
  valid_from TIMESTAMP,
  valid_to TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);
```

### 2. AUTOMATISCHE RABATTANWENDUNG IN BESTELLUNGEN

#### ❌ Nicht implementiert:
- **Dynamische Berechnung** von Rabatten anhand Bestellmenge
- **Skonto-Berücksichtigung** bei Bestellerstellung
- **Staffelpreis-Automatik** je nach bestellter Menge

#### 💡 Benötigte Komponente:
- `DiscountCalculationService` für automatische Rabattberechnung
- Erweiterung der `ProductSelectionTable` um Rabattanzeige
- API-Endpunkt für Rabattberechnung basierend auf Warenkorb

### 3. WIRTSCHAFTLICHKEITS- UND DECKUNGSBEITRAGSRECHNUNG

#### ❌ Teilweise implementiert:
- **Historische Nachvollziehbarkeit** von Preisänderungen fehlt
- **Deckungsbeitragsrechnung** pro Produkt/Warengruppe fehlt
- **Wirtschaftlichkeitsanalyse** nicht implementiert

#### 💡 Benötigte Erweiterungen:
```sql
-- Historische Preisverfolgung
CREATE TABLE purchase_price_history (
  id SERIAL PRIMARY KEY,
  purchase_condition_id INTEGER REFERENCES purchase_conditions(id),
  old_unit_price DECIMAL,
  new_unit_price DECIMAL,
  change_date TIMESTAMP,
  change_reason TEXT,
  order_id INTEGER REFERENCES orders(id), -- Verknüpfung zu Bestellung
  created_by INTEGER REFERENCES users(id)
);

-- Deckungsbeitragsberechnung
CREATE TABLE product_profitability (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  period_start DATE,
  period_end DATE,
  total_sold_quantity INTEGER,
  avg_purchase_price DECIMAL,
  avg_selling_price DECIMAL,
  total_margin DECIMAL,
  margin_percentage DECIMAL
);
```

### 4. PRODUKTANSICHT MIT EINKAUFSBEDINGUNGEN

#### ❌ Nicht implementiert:
- **Produktdetailseite** zeigt keine Einkaufsbedingungen
- **Übersicht aller Lieferanten** pro Produkt fehlt
- **Vergleichsmöglichkeit** zwischen Lieferanten pro Produkt

#### 💡 Benötigte Komponente:
- `ProductPurchaseConditionsTab` in Produktdetails
- `SupplierComparisonTable` für Preisvergleiche

### 5. ERWEITERTE BESTELLLOGIK

#### ❌ Teilweise implementiert:
- **Rabattvorschau** im Bestellprozess fehlt
- **Optimierungsvorschläge** basierend auf Mengenrabatten fehlt
- **Warnung bei Unterschreitung** von Mindestbestellmengen

---

## 🔧 PRIORITÄRE IMPLEMENTIERUNGSSCHRITTE

### Schritt 1: Lieferanten-Rabattsystem
1. **Datenbank-Schema** für supplier_discount_conditions erweitern
2. **Lieferanten-UI** um Rabattkonditionen-Verwaltung erweitern
3. **API-Endpunkte** für Rabattbedingungen implementieren

### Schritt 2: Automatische Rabattberechnung
1. **DiscountCalculationService** implementieren
2. **Bestellprozess** um dynamische Rabattberechnung erweitern
3. **Rabattvorschau** in ProductSelectionTable integrieren

### Schritt 3: Produktansicht für Einkaufsbedingungen
1. **ProductDetail-Seite** um Einkaufsbedingungen-Tab erweitern
2. **Lieferantenvergleich** pro Produkt implementieren
3. **Preishistorie-Anzeige** für Produkte

### Schritt 4: Wirtschaftlichkeitsanalyse
1. **Preisverlauf-Tracking** implementieren
2. **Deckungsbeitragsrechnung** pro Produkt/Kategorie
3. **Reporting-Dashboard** für Wirtschaftlichkeit

---

## 📊 ZUSAMMENFASSUNG

**Implementierungsgrad: ~60%**

✅ **Vollständig implementiert**: Grundlegendes Einkaufsbedingungen-System, CRUD-Operationen, Bestellintegration

🔶 **Teilweise implementiert**: Wareneingang mit Einkaufspreisen, Preisanzeige in Bestellungen

❌ **Nicht implementiert**: Rabattsystem, automatische Preisoptimierung, Wirtschaftlichkeitsanalyse, Produktansicht für Einkaufsbedingungen

**Nächste Schritte**: Das System hat eine solide Grundlage. Die wichtigsten fehlenden Funktionen sind das Rabatt- und Nachlasssystem sowie die erweiterte Wirtschaftlichkeitsanalyse.