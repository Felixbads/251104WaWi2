# Datenbankschema-Dokumentation
## Vending Machine Management System

---

## 1. Lieferanten (suppliers)

### Grunddaten
- **id** - Eindeutige ID
- **name** - Lieferantenname
- **contactPerson** - Ansprechpartner
- **phone** - Telefonnummer
- **email** - E-Mail-Adresse
- **website** - Webseite
- **address** - Adresse
- **city** - Stadt
- **postalCode** - Postleitzahl
- **country** - Land (Standard: Deutschland)
- **status** - Status (active/inactive)
- **notes** - Notizen

### Zahlungs- und Lieferbedingungen
- **paymentTerms** - Zahlungsbedingungen
- **deliveryTerms** - Lieferbedingungen
- **minimumOrderValue** - Mindestbestellwert
- **deliveryDays** - Liefertage (JSON Array) *(Ausblenden)*
- **taxId** - Steuernummer
- **accountNumber** - Kontonummer
- **bankDetails** - Bankverbindung

### Beschreibung und Medien
- **shortDescription** - Kurzbeschreibung
- **description** - Detaillierte Beschreibung
- **photos** - Foto-URLs (Array)

### Bestellungseinstellungen
- **deliveryMethod** - Liefermethode (delivery/pickup)
- **orderFrequency** - Bestellfrequenz (weekly, biweekly, on_demand)
- **orderWeekday** - Bestellwochentag
- **deliveryFrequency** - Lieferfrequenz
- **deliveryWeekday** - Lieferwochentag
- **preferredDeliveryMethod** - Bevorzugte Liefermethode
- **orderPreferences** - Bestellpräferenzen
- **deliveryPreferences** - Lieferpräferenzen

---

## 2. Produkte (products)

### Grunddaten
- **id** - Eindeutige ID
- **vendonId** - Vendon-ID
- **productName** - Produktname
- **price** - Verkaufspreis
- **category** - Kategorie
- **description** - Beschreibung
- **status** - Status
- **sku** - Artikelnummer *(ausblenden)*

### Lieferanten-Informationen
- **supplierId** - Lieferanten-ID
- **supplierName** - Lieferantenname
- **supplierSku** - Lieferanten-Artikelnummer
- **articleSupplier** - Artikelnummer des Lieferanten

### Gebinde und Verpackung
- **packageSize** - Gebindegröße (Legacy)
- **packageTypeId** - Verweis auf Gebindeart
- **packageQuantity** - Anzahl Einzelprodukte pro Gebinde
- **baseUnitName** - Name der Grundeinheit

### Haltbarkeit und Bestellung
- **shelfLifeDays** - MHD-Haltbarkeit in Tagen
- **minOrderQuantity** - Mindestbestellmenge

### Preise und Steuern
- **vat** - Mehrwertsteuersatz
- **depositPrice** - Pfandpreis
- **depositVat** - Pfand-Mehrwertsteuer
- **costPrice** - Einkaufspreis

### Produktdetails
- **shortDescription** - Kurzbeschreibung
- **ingredients** - Inhaltsstoffe
- **allergens** - Allergene
- **nutritionalInfo** - Nährwertangaben (JSON)
- **photos** - Foto-URLs (Array)
- **photoUrl** - Haupt-Foto URL

---

## 3. Einkaufsbedingungen (purchaseConditions)

### Lieferanten-Rabattbedingungen (supplierDiscountConditions)

#### Rabatttypen
- **discountType** - Art (volume_discount, cash_discount, quantity_scale, order_value)
- **discountPercentage** - Rabatt in Prozent
- **discountAmount** - Fester Rabattbetrag

#### Schwellenwerte
- **thresholdQuantity** - Ab welcher Stückzahl
- **thresholdAmount** - Ab welchem Bestellwert
- **maxQuantity** - Bis zu welcher Menge
- **maxAmount** - Bis zu welchem Bestellwert

#### Skonto
- **paymentTermsDays** - Zahlungsziel für Skonto
- **skontoPercentage** - Skonto-Prozentsatz

---

## 4. Bestellungen (orders)

### Grunddaten
- **id** - Eindeutige ID
- **orderNumber** - Bestellnummer
- **supplierId** - Lieferanten-ID
- **supplierName** - Lieferantenname

### Ziel und Lieferung
- **locationId** - Standort-ID
- **locationName** - Standortname
- **deliveryLocation** - Lieferort
- **deliveryType** - Lieferart (delivery/pickup)
- **deliveryAddress** - Lieferadresse
- **pickupLocation** - Abholort

### Status und Termine
- **status** - Status (open, ordered, delivered, canceled)
- **orderDate** - Bestelldatum
- **expectedDeliveryDate** - Erwartetes Lieferdatum
- **actualDeliveryDate** - Tatsächliches Lieferdatum

### Finanzen
- **totalAmount** - Gesamtbetrag
- **currency** - Währung
- **vatAmount** - MwSt-Betrag
- **discountAmount** - Rabattbetrag
- **shippingCost** - Versandkosten

---

## 5. Bestellpositionen (orderItems)

### Verknüpfungen
- **id** - Eindeutige ID
- **orderId** - Bestellungs-ID
- **productId** - Produkt-ID

### Produktdaten
- **productName** - Produktname
- **sku** - Artikelnummer
- **supplierSku** - Lieferanten-Artikelnummer

### Mengen
- **quantity** - Bestellmenge
- **unit** - Einheit
- **quantityDelivered** - Gelieferte Menge

### Preise
- **unitPrice** - Einzelpreis
- **totalPrice** - Gesamtpreis
- **vatRate** - MwSt-Satz
- **vatAmount** - MwSt-Betrag
- **discount** - Rabatt in Prozent
- **discountAmount** - Rabattbetrag

### Position und Status
- **positionNumber** - Positionsnummer
- **status** - Status

### Notizen
- **notes** - Notizen
- **itemComment** - Positionskommentar
- **deliveryComment** - Lieferkommentar

---

*Dokumentation erstellt für das Vending Machine Management System*
*Stand: Juli 2025*