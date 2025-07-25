# Systemanalyse: Einkaufspreis-Tracking und Automatisierung

## Executive Summary

Basierend auf der Analyse des aktuellen Systems und der bereitgestellten Dokumentation liegt der Implementierungsstand des Einkaufspreis-Trackings bei **ca. 60-70%**. Die Grundstrukturen sind vorhanden, aber kritische Automatisierungslücken verhindern ein vollständiges, verlässliches Einkaufspreis-Management.

## 1. Aktueller Umsetzungsstand

### ✅ Bereits implementiert (Funktionsfähig):

#### A. Datenbank-Schema
- **`purchase_conditions` Tabelle**: Vollständig implementiert mit allen notwendigen Feldern
  - `unitPrice` (Netto-Einkaufspreis)
  - `taxRate` (Steuersatz, Standard 19%)
  - `grossPrice` (Brutto-Preis)
  - `packagingUnit`, `packagingQuantity` (Verpackungseinheiten)
  - `supplierArticleNumber` (Lieferanten-Artikelnummer)
  - `validFrom`/`validTo` (Gültigkeitszeitraum)
  - `isPreferred` (Bevorzugter Lieferant)

#### B. API-Endpunkte
- **CRUD-Operationen** für Purchase Conditions vollständig funktionsfähig
- **GET/POST/PUT/DELETE** Routen implementiert mit Zod-Validierung
- **Supplier-spezifische** und **Product-spezifische** Purchase-Conditions-Abfragen

#### C. Frontend-Komponenten
- **`PurchaseConditionForm.tsx`**: Manuelle Eingabe/Bearbeitung von Einkaufsbedingungen
- **Save-Button funktionsfähig** (Fix aus Juli 2025 bestätigt)
- **Toast-Notifications** für erfolgreiche/fehlgeschlagene Speichervorgänge

### ❌ Kritische Lücken identifiziert:

#### A. Automatischer Preisimport bei Wareneingang
**Problem**: In `GoodsReceiptService.ts` wird `unitPrice: 0` gesetzt mit Kommentar *"will be fetched from order item later"*

```typescript
// AKTUELLER CODE (Line 163):
unitPrice: 0, // Wird später aus Bestellposition geholt

// ERFORDERLICH:
unitPrice: await this.getPurchasePriceFromOrder(item.orderItemId, item.productId)
```

#### B. Fehlende Preis-Historie
**Problem**: `purchase_price_history` Tabelle ist nur konzeptionell entworfen, aber nicht implementiert

#### C. Keine Weclapp-API Integration
**Problem**: Keine automatische Synchronisation von Rechnungspreisen aus Weclapp-System

## 2. Automatischer Preisimport-Status

### ❌ **Nicht funktionsfähig**

**Befund**: Der automatische Preisimport ist **nicht implementiert**. Trotz Hinweisen in der Dokumentation ("*Bestellungen: Einkaufspreise werden automatisch übernommen*") zeigt der Code:

1. **Wareneingang setzt Preise auf 0**: `unitPrice: 0` in `createInventoryBatch()`
2. **Keine Preisextraktion aus Bestelldaten**: Fehlende Logik zur Ermittlung der tatsächlichen Einkaufspreise
3. **Keine Purchase Conditions-Aktualisierung**: Neue Preise aus Rechnungen werden nicht automatisch gespeichert

## 3. Manuelle Preisbearbeitung

### ✅ **Vollständig funktionsfähig**

- **Frontend-Forms** für Purchase Conditions bearbeitung
- **API-Endpunkte** für CRUD-Operationen
- **Validierung** mit Zod-Schemas
- **Toast-Feedback** für Benutzer-Aktionen

## 4. Verfügbare APIs für Einkaufspreis-Automatisierung

### Aktuell im System verfügbare APIs:

#### A. Interne APIs (Funktionsfähig):
```
GET  /api/purchase-conditions
POST /api/purchase-conditions
PUT  /api/purchase-conditions/:id
DELETE /api/purchase-conditions/:id
GET  /api/suppliers/:supplierId/purchase-conditions
GET  /api/products/:productId/purchase-conditions
```

#### B. Externe APIs (Erwähnt, aber nicht implementiert):
- **Weclapp `purchaseInvoice` API**: Für Rechnungsdaten und Stückpreise
- **Weclapp `article` API**: Für Artikel-Stammdaten
- **Weclapp `warehouseStockMovement` API**: Für Warenbewegungen

## 5. Erforderliche Änderungen für den Idealzustand

### Phase 1: Sofortige Fixes (1-2 Tage)

#### A. Wareneingang-Preis-Integration
```typescript
// In GoodsReceiptService.ts
private async getPurchasePriceFromOrderItem(orderItemId: number, productId: number): Promise<number> {
  // 1. Hole Order Item Details
  const orderItem = await this.getOrderItem(orderItemId);
  
  // 2. Suche Purchase Conditions für Produkt + Lieferant
  const purchaseCondition = await this.getPurchaseCondition(productId, orderItem.supplierId);
  
  // 3. Rückgabe des aktuellen Einkaufspreises
  return purchaseCondition?.unitPrice || 0;
}
```

#### B. Purchase Price History Tabelle
```sql
CREATE TABLE purchase_price_history (
  id SERIAL PRIMARY KEY,
  purchase_condition_id INTEGER REFERENCES purchase_conditions(id),
  old_unit_price DECIMAL(10,4),
  new_unit_price DECIMAL(10,4),
  change_date TIMESTAMP DEFAULT NOW(),
  change_reason TEXT,
  order_id INTEGER REFERENCES orders(id),
  invoice_reference TEXT, -- Weclapp Rechnungsnummer
  created_by INTEGER REFERENCES users(id),
  automatic_update BOOLEAN DEFAULT FALSE -- Unterscheidung zwischen manuell/automatisch
);
```

### Phase 2: Weclapp-Integration (1-2 Wochen)

#### A. ETL-Prozess für Rechnungen
```typescript
// Neuer Service: WeclappPurchaseInvoiceSync.ts
class WeclappPurchaseInvoiceSync {
  async syncPurchaseInvoices(dateFrom: Date, dateTo: Date): Promise<void> {
    // 1. Hole neue Rechnungen von Weclapp
    const invoices = await this.weclappApi.getPurchaseInvoices(dateFrom, dateTo);
    
    // 2. Für jede Rechnung: Extrahiere Artikel und Preise
    for (const invoice of invoices) {
      for (const lineItem of invoice.lineItems) {
        const unitPrice = lineItem.totalAmount / lineItem.quantity;
        
        // 3. Update Purchase Conditions mit neuem Preis
        await this.updatePurchaseCondition(lineItem.articleId, invoice.supplierId, unitPrice, invoice.id);
      }
    }
  }
}
```

#### B. Webhook-Integration (Optional)
```typescript
// Webhook Endpoint für Echtzeit-Updates
app.post('/api/webhooks/weclapp/purchase-invoice', async (req, res) => {
  const invoice = req.body;
  await weclappSync.processSingleInvoice(invoice);
  res.status(200).json({ success: true });
});
```

### Phase 3: Erweiterte Funktionen (2-3 Wochen)

#### A. Intelligente Preisanalyse
- **Preisabweichungs-Alerts**: Warnung bei Preisänderungen > 10%
- **Lieferanten-Preisvergleich**: Automatische Ermittlung günstigster Lieferant
- **Trend-Analyse**: Preisentwicklung über Zeit

#### B. Dashboard-Integration
- **Einkaufspreis-Trends** pro Produkt
- **Margenberechnung** mit aktuellen Einkaufspreisen
- **Lieferanten-Performance** basierend auf Preislevel

## 6. Ungenutztes Potenzial in bestehenden Feldern

### A. Products-Tabelle
```sql
-- Bereits vorhanden, aber ungenutzt:
costPrice REAL -- Könnte als Standard-Einkaufspreis verwendet werden
```

### B. Inventory Batches
```sql
-- Bereits vorhanden:
unitPrice REAL -- Wird aktuell auf 0 gesetzt, sollte echten Einkaufspreis enthalten
totalValue REAL -- Berechnet sich aus unitPrice * quantity
```

### C. Order Items
```sql
-- Potenzielle Erweiterung:
purchase_price REAL -- Einkaufspreis zum Zeitpunkt der Bestellung
margin REAL -- Berechnete Marge pro Artikel
```

## 7. Implementierungs-Roadmap

### Woche 1: Sofort-Fixes
- [ ] `GoodsReceiptService.ts` - Echte Preise statt 0
- [ ] `purchase_price_history` Tabelle erstellen
- [ ] Automatische Preis-Historisierung bei Updates

### Woche 2-3: Weclapp-Integration
- [ ] Weclapp API-Client entwickeln
- [ ] ETL-Service für Rechnungsimport
- [ ] Batch-Synchronisation für historische Daten

### Woche 4-5: UI/UX Verbesserungen
- [ ] Preis-Historie-Ansicht in Purchase Conditions
- [ ] Preisabweichungs-Warnings
- [ ] Bulk-Update-Funktionen

### Woche 6: Testing & Optimierung
- [ ] End-to-End-Tests für Preisautomatisierung
- [ ] Performance-Optimierung für große Datenmengen
- [ ] Rollback-Mechanismen für fehlerhafte Importe

## 8. Kosten-Nutzen-Bewertung

### Nutzen:
- **100% verlässliche Margenberechnung** in Dashboards
- **Automatisierte Preispflege** reduziert manuellen Aufwand um 80%
- **Historische Preisanalyse** für bessere Einkaufsstrategien
- **Echtzeit-Kostenkalkulationen** für Lagerwerte

### Aufwand:
- **Entwicklungszeit**: 4-6 Wochen
- **Weclapp-API-Integration**: Zusätzliche API-Kosten
- **Testing und Rollout**: 1-2 Wochen

## 9. Fazit und Empfehlungen

Das bestehende System bietet eine **solide Grundlage** für professionelles Einkaufspreis-Management. Die kritischen Lücken liegen in der **Automatisierung**, nicht in der Datenstruktur.

### Sofortige Prioritäten:
1. **Fix des Wareneingang-Preissystems** (kritisch)
2. **Implementierung der Preis-Historie** (wichtig)
3. **Weclapp-Integration** für automatischen Import (strategisch)

Mit diesen Implementierungen erreichen Sie ein **vollständiges, auditfähiges Einkaufspreis-Tracking-System**, das als verlässliche Basis für alle Margen- und Wirtschaftlichkeitsberechnungen dient.