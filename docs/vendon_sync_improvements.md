# Vendon Sync Verbesserungen

## Problem

Das System hatte ca. 6.500 Produkteinträge in der Datenbank, obwohl tatsächlich nur rund 120 einzigartige Produkte vorhanden sein sollten. Die Ursache war eine unzureichende Duplikaterkennung in der Produktsynchronisierung mit dem Vendon API:

1. Jedes Mal, wenn die Synchronisierungsfunktion ausgeführt wurde, wurden neue Produkteinträge erstellt
2. Bestehende Produkte wurden nicht korrekt identifiziert und aktualisiert
3. Datenbankreferenzen für Lagerbestand, Inventarzählungen usw. zeigten auf mehrere duplizierte Produkteinträge

## Lösung

### 1. Verbesserte Produktsynchronisierung

Die `syncProducts`-Funktion in `server/services/vendonSync.ts` wurde erweitert mit:

- Verwendung von direkten SQL-Abfragen für bessere Kontrolle
- Diagnoseabfragen zur Identifikation von Duplikaten
- Verbesserte Deduplizierung während der Datenbankabfrage
- Doppelte Sicherheitsmaßnahmen gegen Duplikate während der Verarbeitung:
  - Prüfung nach Vendon-ID (primär)
  - Prüfung nach normalisiertem Produktnamen (sekundär)
  - Tracking von bereits verarbeiteten Produkten in einem Durchlauf

### 2. Neue storage.ts Funktionen

- `executeRawQuery` Funktion zum direkten Ausführen von SQL-Abfragen mit erweiterten Rückgabetypen
- Verbesserte Datenmodell-Handling für normalisierte Produktnamen

### 3. Bereinigungsskript für bestehende Duplikate

Wir haben das Skript `fix_vendon_duplicate_products.js` erstellt, das:

1. Identifiziert Gruppen duplizierter Produkte basierend auf Vendon-ID
2. Identifiziert Gruppen duplizierter Produkte basierend auf normalisiertem Namen
3. Konsolidiert Inventardaten auf ein Primärprodukt
4. Aktualisiert alle Referenzen (machine_stocks, inventory_count_items, inventory_items)
5. Entfernt die duplizierten Produkteinträge
6. Bereinigt auch duplizierte Lagerbestände

## Verwendung

### Verhindere zukünftige Duplikate

Die verbesserte Synchronisierungsfunktion verhindert automatisch neue Duplikate. Es sind keine weiteren Maßnahmen notwendig.

### Bereinige bestehende Duplikate

Um die bestehenden duplizierten Produkte zu bereinigen:

```bash
node fix_vendon_duplicate_products.js
```

**Wichtig**: Vor der Ausführung eine Datenbanksicherung erstellen, da dieses Skript destruktive Operationen durchführt.

## Ergebnisse

Nach der Implementierung dieser Änderungen:

1. Die Anzahl der Produkteinträge in der Datenbank sollte von ca. 6.500 auf ca. 120 reduziert werden
2. Die Berichte und Inventaransichten zeigen korrekte Daten
3. Die Performance der Datenbank ist verbessert durch weniger redundante Daten
4. Zukünftige Synchronisierungen führen nicht mehr zu neuen Duplikaten

## Technische Details

### Normalisierung von Produktnamen

Produktnamen werden normalisiert, indem sie in Kleinbuchstaben konvertiert und Leerzeichen entfernt werden:

```typescript
const normalizeProductName = (name: string): string => {
  if (!name) return '';
  return name.toLowerCase().trim();
};
```

### Identifikation von Duplikaten

Duplikate werden mit SQL-Abfragen identifiziert:

```sql
SELECT vendon_id, COUNT(*) as count
FROM products
GROUP BY vendon_id
HAVING COUNT(*) > 1
ORDER BY count DESC
```

### Konsolidierung von Daten

Bei der Konsolidierung werden alle Referenzen auf duplizierte Produkte aktualisiert und auf ein einzelnes Primärprodukt gerichtet, wobei folgende Priorität gilt:

1. Produkte mit Vendon-ID werden bevorzugt
2. Bei gleichem Kriterium wird das Produkt mit der niedrigsten ID (also das älteste) bevorzugt