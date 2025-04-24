# Leitfaden für sichere Deployments

Dieser Leitfaden beschreibt die Best Practices für sichere Deployments unserer Anwendung, mit besonderem Fokus auf den Schutz der Datenbankintegrität.

## Grundlegende Prinzipien

1. **Online-Daten als einzige Quelle der Wahrheit**
   - Produktionsdaten werden niemals automatisch überschrieben oder gelöscht
   - Lokale Entwicklung und Staging arbeiten mit Kopien der Produktionsdaten oder isolierten Testdaten

2. **Klare Trennung von Schema und Daten**
   - Schema-Änderungen werden separat von Datenmigrationen durchgeführt
   - Automatische Deployments führen nur Schema-Änderungen durch, niemals Datenmanipulationen

3. **Vollständige Backups vor jedem Deployment**
   - Vor jedem Deployment wird automatisch ein vollständiges Backup erstellt
   - Automatisierte Wiederherstellungsprozeduren für den Notfall

## Vor dem Deployment

### 1. Integrität prüfen
```bash
node server/scripts/database-integrity.js check
```
Dieses Skript führt folgende Prüfungen durch:
- Finden fehlender Fremdschlüssel
- Prüfen auf Integritätsverletzungen
- Finden fehlender Indizes
- Prüfen auf fehlende Spalten

### 2. Backup erstellen
```bash
node server/scripts/database-backup.js full
```
Erstellt ein vollständiges Backup der Datenbank inklusive Schema und Daten.

### 3. Migrations-Plan prüfen
Überprüfe alle Drizzle-Migrationen auf potenzielle Datenverluste:
```bash
npm run db:generate
```
**Wichtig:** Überprüfe die generierten Migrations-Dateien sorgfältig. Achte besonders auf:
- `DROP TABLE`-Anweisungen
- `ALTER TABLE DROP COLUMN`-Anweisungen
- `ALTER TABLE RENAME COLUMN`-Anweisungen

## Deployment-Prozess

### 1. Deployment vorbereiten
- Stelle sicher, dass alle vorherigen Prüfungen erfolgreich waren
- Informiere alle relevanten Stakeholder über das bevorstehende Deployment

### 2. Nur Schema-Änderungen ausführen
```bash
npm run db:push -- --safe
```
Der `--safe`-Parameter verhindert destruktive Änderungen.

### 3. Nach-Deployment-Verifizierung
Nach dem Deployment führe folgende Schritte aus:
```bash
# Datenbankintegrität erneut prüfen
node server/scripts/database-integrity.js check

# Funktionalität überprüfen
# (Manuelles Testen der Hauptfunktionen)
```

## Rollback-Prozess

Im Falle eines fehlgeschlagenen Deployments:

### 1. Schnelle Problembehandlung
Wenn nur kleinere Probleme auftreten, versuche diese direkt zu beheben.

### 2. Vollständiger Rollback
Bei schwerwiegenden Problemen:
```bash
# Datenbank aus Backup wiederherstellen
node server/scripts/database-backup.js restore /pfad/zum/backup/vollbackup_TIMESTAMP.sql.gz

# Vorherige Code-Version erneut deployen
# (Abhängig vom Deployment-System)
```

## Regelmäßige Wartung

### 1. Tägliche Backups
Automatische tägliche Backups sind konfiguriert und werden im `db_backups`-Verzeichnis gespeichert.

### 2. Monatliche Integritätsprüfung
```bash
node server/scripts/database-integrity.js check
```

### 3. Vierteljährliche Optimierung
```bash
# Fehlende Indizes hinzufügen
node server/scripts/database-integrity.js fix-idx

# Fehlende Fremdschlüssel hinzufügen (nach sorgfältiger Prüfung)
node server/scripts/database-integrity.js fix-fk
```

## Wichtige Regeln für Entwickler

1. **Nie direkt Produktionsdaten manipulieren**
   - Verwende immer die API-Endpunkte oder Admin-Tools

2. **Vorsicht bei Schema-Änderungen**
   - Füge neue Spalten oder Tabellen hinzu, statt bestehende zu ändern
   - Verwende bei Bedarf temporäre Spalten und migriere Daten schrittweise

3. **Immer Testing in einer isolierten Umgebung**
   - Verwende eine Kopie der Produktionsdatenbank für Tests
   - Validiere Migrationen in der Testumgebung, bevor sie auf Produktion angewendet werden

4. **Änderungen dokumentieren**
   - Dokumentiere alle Schema-Änderungen in einem zentralen Änderungsprotokoll
   - Füge Kommentare zu allen Migrationen hinzu, die ihre Auswirkungen erklären

## Checkliste für Deployments

- [ ] Datenbankintegrität überprüft
- [ ] Vollständiges Backup erstellt
- [ ] Migrations-Plan validiert
- [ ] Nur Schema-Änderungen werden angewendet
- [ ] Nach-Deployment-Verifizierung durchgeführt
- [ ] Hauptfunktionen manuell getestet
- [ ] Änderungen dokumentiert

Durch Befolgen dieser Richtlinien stellen wir sicher, dass unsere Deployments die Datenintegrität bewahren und die Produktionsdaten geschützt bleiben.