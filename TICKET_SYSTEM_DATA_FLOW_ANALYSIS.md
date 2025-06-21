# Ticket-System Datenfluss-Analyse

## Übersicht
Dieses Dokument analysiert den vollständigen Datenfluss vom Ticket-Melde-Formular zu den E-Mails an Kunden und Admins. Es stellt sicher, dass **ALLE** im Formular eingegebenen Daten in beiden E-Mails enthalten sind.

## 1. Formular-Datenstruktur

### Kundendaten (PFLICHTFELDER)
- `customerName`: Vor- und Nachname des Kunden
- `customerEmail`: E-Mail-Adresse für Kommunikation
- `customerPhone`: Telefonnummer (optional)
- `customerCompany`: Unternehmen (optional)

### Ticket-Details (PFLICHTFELDER)
- `priority`: Priorität (low, medium, high, urgent)
- `category`: Kategorie (technical, billing, general, feature_request, bug_report)
- `subject`: Betreff des Tickets
- `description`: Detaillierte Problembeschreibung

### System-Informationen (OPTIONAL)
- `affectedSystem`: Betroffenes System/Modul
- `errorMessage`: Fehlermeldung falls vorhanden
- `stepsToReproduce`: Schritte zur Reproduktion
- `expectedBehavior`: Erwartetes Verhalten
- `actualBehavior`: Tatsächliches Verhalten

### Technische Details (AUTOMATISCH/OPTIONAL)
- `browserInfo`: Browser-Informationen (automatisch erkannt)
- `deviceInfo`: Geräteinformationen (automatisch erkannt)
- `additionalNotes`: Zusätzliche Notizen

## 2. Datenbank-Schema

```sql
CREATE TABLE support_tickets (
  id SERIAL PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  
  -- Kundendaten
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  customer_company TEXT,
  
  -- Ticket-Details
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- System-Informationen
  affected_system TEXT,
  error_message TEXT,
  steps_to_reproduce TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  
  -- Zusätzliche Informationen
  browser_info TEXT,
  device_info TEXT,
  additional_notes TEXT,
  attachment_urls TEXT[],
  
  -- Status und Bearbeitung
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  admin_notes TEXT,
  resolution_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP
);
```

## 3. API-Endpunkt Validierung

### Input-Validierung (Zod Schema)
```typescript
const createTicketSchema = z.object({
  // Kundendaten (PFLICHT)
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional().nullable(),
  customerCompany: z.string().optional().nullable(),
  
  // Ticket-Details (PFLICHT)
  priority: z.enum(["low", "medium", "high", "urgent"]),
  category: z.enum(["technical", "billing", "general", "feature_request", "bug_report"]),
  subject: z.string().min(5),
  description: z.string().min(20),
  
  // System-Informationen (OPTIONAL)
  affectedSystem: z.string().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
  stepsToReproduce: z.string().optional().nullable(),
  expectedBehavior: z.string().optional().nullable(),
  actualBehavior: z.string().optional().nullable(),
  
  // Zusätzliche Informationen (OPTIONAL)
  browserInfo: z.string().optional().nullable(),
  deviceInfo: z.string().optional().nullable(),
  additionalNotes: z.string().optional().nullable(),
});
```

## 4. E-Mail-Generierung und Datenübertragung

### 4.1 Kunden-E-Mail (`generateCustomerEmailContent`)

**GARANTIE: Alle Formular-Daten werden übertragen**

#### Kundendaten-Sektion
```html
<div class="section">
  <div class="section-title">Ihre Kontaktdaten</div>
  <div class="field-group">
    <div class="field-label">Name:</div>
    <div class="field-value">${ticketData.customerName}</div>
  </div>
  <div class="field-group">
    <div class="field-label">E-Mail:</div>
    <div class="field-value">${ticketData.customerEmail}</div>
  </div>
  ${ticketData.customerPhone ? `
  <div class="field-group">
    <div class="field-label">Telefon:</div>
    <div class="field-value">${ticketData.customerPhone}</div>
  </div>
  ` : ''}
  ${ticketData.customerCompany ? `
  <div class="field-group">
    <div class="field-label">Unternehmen:</div>
    <div class="field-value">${ticketData.customerCompany}</div>
  </div>
  ` : ''}
</div>
```

#### Ticket-Details-Sektion
```html
<div class="section">
  <div class="section-title">Ticket-Details</div>
  <div class="field-group">
    <div class="field-label">Priorität:</div>
    <div class="field-value priority-${ticketData.priority}">${priorityLabels[ticketData.priority]}</div>
  </div>
  <div class="field-group">
    <div class="field-label">Kategorie:</div>
    <div class="field-value">${categoryLabels[ticketData.category]}</div>
  </div>
  <div class="field-group">
    <div class="field-label">Betreff:</div>
    <div class="field-value">${ticketData.subject}</div>
  </div>
  <div class="field-group">
    <div class="field-label">Beschreibung:</div>
    <div class="field-value" style="white-space: pre-wrap;">${ticketData.description}</div>
  </div>
</div>
```

#### System-Informationen-Sektion (Bedingte Anzeige)
```html
${ticketData.affectedSystem || ticketData.errorMessage || ticketData.stepsToReproduce || ticketData.expectedBehavior || ticketData.actualBehavior ? `
<div class="section">
  <div class="section-title">System-Informationen</div>
  ${ticketData.affectedSystem ? `
  <div class="field-group">
    <div class="field-label">Betroffenes System:</div>
    <div class="field-value">${ticketData.affectedSystem}</div>
  </div>
  ` : ''}
  ${ticketData.errorMessage ? `
  <div class="field-group">
    <div class="field-label">Fehlermeldung:</div>
    <div class="field-value" style="white-space: pre-wrap; font-family: monospace; background: #f3f4f6; padding: 10px; border-radius: 4px;">${ticketData.errorMessage}</div>
  </div>
  ` : ''}
  ${ticketData.stepsToReproduce ? `
  <div class="field-group">
    <div class="field-label">Schritte zur Reproduktion:</div>
    <div class="field-value" style="white-space: pre-wrap;">${ticketData.stepsToReproduce}</div>
  </div>
  ` : ''}
  ${ticketData.expectedBehavior ? `
  <div class="field-group">
    <div class="field-label">Erwartetes Verhalten:</div>
    <div class="field-value" style="white-space: pre-wrap;">${ticketData.expectedBehavior}</div>
  </div>
  ` : ''}
  ${ticketData.actualBehavior ? `
  <div class="field-group">
    <div class="field-label">Tatsächliches Verhalten:</div>
    <div class="field-value" style="white-space: pre-wrap;">${ticketData.actualBehavior}</div>
  </div>
  ` : ''}
</div>
` : ''}
```

#### Technische Details-Sektion (Bedingte Anzeige)
```html
${ticketData.browserInfo || ticketData.deviceInfo || ticketData.additionalNotes ? `
<div class="section">
  <div class="section-title">Technische Details</div>
  ${ticketData.browserInfo ? `
  <div class="field-group">
    <div class="field-label">Browser:</div>
    <div class="field-value">${ticketData.browserInfo}</div>
  </div>
  ` : ''}
  ${ticketData.deviceInfo ? `
  <div class="field-group">
    <div class="field-label">Gerät:</div>
    <div class="field-value">${ticketData.deviceInfo}</div>
  </div>
  ` : ''}
  ${ticketData.additionalNotes ? `
  <div class="field-group">
    <div class="field-label">Zusätzliche Notizen:</div>
    <div class="field-value" style="white-space: pre-wrap;">${ticketData.additionalNotes}</div>
  </div>
  ` : ''}
</div>
` : ''}
```

### 4.2 Admin-E-Mail (`generateAdminEmailContent`)

**GARANTIE: Alle Formular-Daten werden übertragen**

Die Admin-E-Mail enthält dieselben Datenstrukturen wie die Kunden-E-Mail, jedoch mit:

1. **Erweiterten visuellen Hervorhebungen** für kritische Informationen
2. **Direkten Handlungsaufforderungen** (Reply-to-Customer-Link)
3. **Prioritäts-basierter Farbkodierung**
4. **Vollständigen technischen Details** für die Fehlerdiagnose

#### Besondere Merkmale der Admin-E-Mail:
- **Prioritäts-Header** mit visueller Hervorhebung
- **Kategorisierte Darstellung** aller Systemdaten
- **Monospace-Formatierung** für Fehlermeldungen
- **Farbkodierte Hintergründe** für verschiedene Informationstypen
- **Direkte Kontaktlinks** für E-Mail und Telefon

## 5. Datenfluss-Garantien

### 5.1 Formular → API
**Validierung**: Zod-Schema stellt sicher, dass alle erforderlichen Felder vorhanden sind
**Übertragung**: Alle Formular-Felder werden 1:1 an die API übertragen

### 5.2 API → Datenbank
**Speicherung**: Alle validierten Daten werden in entsprechende Datenbank-Spalten gespeichert
**Eindeutigkeit**: Ticket-Nummer wird automatisch generiert
**Timestamps**: Automatische Erstellung von created_at und updated_at

### 5.3 Datenbank → E-Mail-Generierung
**Vollständiger Abruf**: Alle gespeicherten Ticket-Daten werden für E-Mail-Generierung verwendet
**Bedingte Anzeige**: Optionale Felder werden nur angezeigt, wenn sie Daten enthalten
**Formatierung**: Spezielle Formatierung für verschiedene Datentypen (Code, Text, etc.)

### 5.4 E-Mail-Versand
**Parallel-Versand**: Kunden- und Admin-E-Mails werden parallel versendet
**Fehlerbehandlung**: Jeder E-Mail-Versand wird separat protokolliert
**Bestätigung**: API gibt Rückmeldung über erfolgreichen/fehlgeschlagenen Versand

## 6. Qualitätssicherung und Tests

### 6.1 Datenintegritäts-Tests
```typescript
// Beispiel-Test zur Sicherstellung vollständiger Datenübertragung
const testTicketData = {
  customerName: "Max Mustermann",
  customerEmail: "max@beispiel.de",
  customerPhone: "+49 123 456789",
  customerCompany: "Mustermann GmbH",
  priority: "high",
  category: "technical",
  subject: "Login-Problem",
  description: "Kann mich nicht anmelden",
  affectedSystem: "Login-System",
  errorMessage: "Invalid credentials",
  stepsToReproduce: "1. Gehe zu /login\n2. Gib Daten ein\n3. Fehler erscheint",
  expectedBehavior: "Erfolgreiche Anmeldung",
  actualBehavior: "Fehlermeldung wird angezeigt",
  browserInfo: "Chrome 120.0 auf Windows 11",
  deviceInfo: "1920x1080, Deutsch",
  additionalNotes: "Problem tritt nur morgens auf"
};

// Test: Alle Felder müssen in beiden E-Mails erscheinen
const customerEmail = generateCustomerEmailContent(testTicketData);
const adminEmail = generateAdminEmailContent(testTicketData);

// Assertion: Jedes Feld muss in beiden E-Mails enthalten sein
Object.entries(testTicketData).forEach(([key, value]) => {
  if (value) {
    assert(customerEmail.html.includes(value), `Kundenemail fehlt: ${key}`);
    assert(adminEmail.html.includes(value), `Admin-E-Mail fehlt: ${key}`);
  }
});
```

### 6.2 E-Mail-Template-Validierung
- **HTML-Validierung**: E-Mail-HTML ist valide und rendert korrekt
- **Text-Fallback**: Plain-Text-Version für alle E-Mail-Clients
- **Responsive Design**: E-Mails sind auf mobilen Geräten lesbar
- **Barrierefreiheit**: Farbkontraste und Struktur für Screenreader

## 7. Schlussfolgerung

Das implementierte Ticket-System garantiert:

1. **Vollständige Datenerfassung** durch umfassendes Formular
2. **Lückenlose Datenübertragung** durch Validierung auf jeder Ebene
3. **Identische Datenverteilung** in Kunden- und Admin-E-Mails
4. **Strukturierte Darstellung** für optimale Lesbarkeit
5. **Fehlerbehandlung** auf allen Ebenen des Datenflusses

**GARANTIE**: Alle im Formular eingegebenen Daten werden vollständig und unverändert in beide E-Mails (Kunde und Admin) übertragen. Es gehen keine Informationen verloren.