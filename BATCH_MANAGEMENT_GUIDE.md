# Anleitung zur Chargenverwaltung und Duplikate-Bereinigung

## Problem: "6 frische Eier, Struppen" erscheint 7 mal

### Ursache
Das Problem entsteht, weil:
- Die Inventuransicht entfernt Dubletten nur anhand der Produkt-ID
- Frühere Vendon-Synchronisationen haben zahlreiche Produktduplikate erzeugt (ca. 6.100 statt ~120 eindeutiger Produkte)
- Für "6 frische Eier, Struppen" existieren 7 unterschiedliche Produktdatensätze mit identischem Namen aber verschiedenen IDs

## Lösung 1: Neue Chargenverwaltung verwenden

### Zugang zur Chargenverwaltung
- Navigieren Sie zu: `/chargenverwaltung`
- Oder über das Hauptmenü: "Chargenverwaltung"

### Funktionen der neuen Chargenverwaltung:

#### 1. Gruppierte Ansicht (empfohlen)
- **Was sie macht**: Gruppiert Produkte nach Namen statt nach ID
- **Wie aktivieren**: 
  1. Wählen Sie ein Lager aus der Dropdown-Liste
  2. Klicken Sie auf "Nach Produktname gruppieren"
- **Vorteil**: Zeigt "6 frische Eier, Struppen" als eine Gruppe an, auch wenn 7 verschiedene Produkt-IDs existieren
- **Anzeige**: Zeigt Gesamtmenge, Anzahl Chargen und warnt bei Duplikaten

#### 2. Chargen bearbeiten
Für jede Charge können Sie folgende Felder bearbeiten:
- **Menge**: Aktuelle Anzahl der Artikel
- **Ablaufdatum**: MHD der Charge
- **Lagerort**: Position im Lager (z.B. "Regal A-3")
- **Status**: Aktiv, Abgelaufen, Niedrig
- **Notizen**: Zusätzliche Informationen

**So bearbeiten Sie eine Charge:**
1. Klicken Sie auf das Bearbeiten-Symbol (Stift) neben der Charge
2. Ändern Sie die gewünschten Felder
3. Klicken Sie auf "Speichern"

#### 3. Chargen löschen
**Vorsicht**: Das Löschen einer Charge kann nicht rückgängig gemacht werden!

**So löschen Sie eine Charge:**
1. Klicken Sie auf das Löschen-Symbol (Mülleimer) neben der Charge
2. Bestätigen Sie die Löschung im Dialog
3. Die Charge wird unwiderruflich gelöscht

#### 4. Filter und Suchoptionen
- **Suchfeld**: Suche nach Produktname, Chargennummer oder Lager
- **Status-Filter**: Nur aktive, abgelaufene oder niedrige Bestände
- **Bald ablaufende Chargen**: Zeigt Chargen an, die in den nächsten 14 Tagen ablaufen

## Lösung 2: API-Endpoints für alte Chargen

### Bestehende Chargen auflisten
```
GET /api/product-batches/warehouse/{warehouseId}?groupByName=true
```
Zeigt gruppierte Chargen nach Produktname (empfohlen für Duplikate)

### Charge bearbeiten
```
PUT /api/product-batches/{batchId}
Content-Type: application/json

{
  "currentQuantity": 12,
  "expiryDate": "2025-12-31",
  "notes": "Neue Notiz",
  "locationInWarehouse": "Regal B-2",
  "status": "active"
}
```

### Charge löschen
```
DELETE /api/product-batches/{batchId}
```

## Lösung 3: Duplikate bereinigen (für Administratoren)

### Duplikate analysieren
```
GET /api/duplicate-cleanup/analyze
```
Zeigt eine Analyse aller Produktduplikate, einschließlich der "6 frische Eier, Struppen" Situation.

### Einzelne Produktduplikate konsolidieren
```
POST /api/duplicate-cleanup/consolidate
Content-Type: application/json

{
  "productName": "6 frische Eier, Struppen",
  "keepProductId": 123,
  "dryRun": true
}
```

**Parameter:**
- `productName`: Exakter Name des Produkts
- `keepProductId`: ID des Produktdatensatzes, der behalten werden soll
- `dryRun`: `true` für Testlauf, `false` für echte Ausführung

### Alle Duplikate automatisch bereinigen
```
POST /api/duplicate-cleanup/auto-consolidate
Content-Type: application/json

{
  "dryRun": true,
  "strategy": "oldest"
}
```

**Strategien:**
- `"oldest"`: Behält das älteste Produkt (empfohlen)
- `"newest"`: Behält das neueste Produkt

**Wichtig**: Führen Sie **immer** zuerst einen Testlauf mit `"dryRun": true` durch!

## Schritt-für-Schritt Anleitung für "6 frische Eier, Struppen"

### Schnelle Lösung (Empfohlen):
1. Gehen Sie zu `/chargenverwaltung`
2. Wählen Sie das entsprechende Lager aus
3. Aktivieren Sie "Nach Produktname gruppieren"
4. Nun sehen Sie "6 frische Eier, Struppen" als eine Gruppe mit allen Chargen

### Langfristige Lösung (Duplikate bereinigen):
1. **Analyse durchführen:**
   ```bash
   curl -X GET "http://localhost:3000/api/duplicate-cleanup/analyze"
   ```

2. **Testlauf für "6 frische Eier, Struppen":**
   ```bash
   curl -X POST "http://localhost:3000/api/duplicate-cleanup/consolidate" \
     -H "Content-Type: application/json" \
     -d '{
       "productName": "6 frische Eier, Struppen",
       "keepProductId": [ÄLTESTE_PRODUKT_ID],
       "dryRun": true
     }'
   ```

3. **Echte Konsolidierung (nur wenn Testlauf OK):**
   ```bash
   curl -X POST "http://localhost:3000/api/duplicate-cleanup/consolidate" \
     -H "Content-Type: application/json" \
     -d '{
       "productName": "6 frische Eier, Struppen",
       "keepProductId": [ÄLTESTE_PRODUKT_ID],
       "dryRun": false
     }'
   ```

## Sicherheitshinweise

1. **Backup erstellen**: Vor der Duplikate-Bereinigung sollte ein Datenbank-Backup erstellt werden
2. **Testlauf durchführen**: Immer zuerst mit `"dryRun": true` testen
3. **Schrittweise vorgehen**: Bereinigen Sie zunächst nur ein Produkt, dann weitere
4. **Chargen prüfen**: Nach der Bereinigung überprüfen Sie, ob alle Chargen korrekt zugeordnet sind

## Häufige Fragen

**Q: Warum sollte ich die gruppierte Ansicht verwenden?**
A: Sie löst das Anzeigeproblem sofort, ohne Daten zu ändern. Perfekt für den täglichen Gebrauch.

**Q: Ist die Duplikate-Bereinigung sicher?**
A: Ja, wenn Sie die Testläufe verwenden und Backups haben. Der Code aktualisiert automatisch alle Referenzen (Chargen, Transaktionen).

**Q: Was passiert mit den Chargen nach der Bereinigung?**
A: Alle Chargen werden automatisch dem verbleibenden Produktdatensatz zugeordnet.

**Q: Kann ich die Bereinigung rückgängig machen?**
A: Nein, daher sind Testläufe und Backups wichtig.

## Support

Bei Problemen:
1. Überprüfen Sie die Browser-Konsole auf Fehlermeldungen
2. Schauen Sie in die Server-Logs für Backend-Fehler
3. Verwenden Sie zunächst die gruppierte Ansicht als sichere Alternative