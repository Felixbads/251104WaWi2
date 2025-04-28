/**
 * PDF Template für Bestellungen
 * Basierend auf dem Handlebars-Template und JSON-Schema
 */

// HTML-Template für die PDF-Generierung (mit Handlebars-Syntax für die dynamischen Daten)
export const orderPDFTemplate = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 16px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .logo { margin-right: 20px; }
    .company-name { font-size: 20px; font-weight: bold; margin-bottom: 10px; color: #9c3028; }
    .addresses { display: flex; justify-content: space-between; flex: 1; }
    .address-block { margin-bottom: 8px; width: 48%; }
    .meta, .items { width: 100%; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
    th { background: #f3f3f3; }
    .footer { text-align: center; font-size: 10px; color: #666; margin-top: 32px; }
    .company-header { display: flex; align-items: center; margin-bottom: 15px; }
    .subtitle { font-size: 14px; color: #666; margin-top: -5px; margin-bottom: 15px; }
  </style>
</head>
<body>
  <div class="company-header">
    <div class="logo">
      <img src="/images/Proviantomat_Logo_rot.png" alt="Proviantomat Logo" style="max-height:80px;" />
    </div>
    <div>
      <div class="company-name">Elbsandstein Proviant & Quartier GmbH</div>
      <div class="subtitle">Bestellung / Auftragsbestätigung</div>
    </div>
  </div>

  <div class="header">
    <div class="addresses">
      <div class="address-block">
        <strong>Absender:</strong><br/>
        Elbsandstein Proviant & Quartier GmbH<br/>
        Dresdner Str. 2b<br/>
        01814 Bad Schandau<br/>
        Telefon: 035022 / 500911<br/>
        E-Mail: info@elbsandstein-proviant.de
      </div>
      <div class="address-block">
        <strong>Lieferant:</strong><br/>
        {{supplierName}}<br/>
        {{supplierAddress}}<br/>
        {{#if supplierEmail}}{{supplierEmail}}{{/if}}
      </div>
    </div>
  </div>

  <div class="meta">
    <table>
      <tr>
        <th>Bestell-Nr.</th><td>{{orderNumber}}</td>
        <th>Datum</th><td>{{orderDate}}</td>
      </tr>
      <tr>
        <th>Lieferdatum</th><td>{{expectedDeliveryDate}}</td>
        <th>Priorität</th><td>{{priority}}</td>
      </tr>
      <tr>
        <th>Lieferort</th><td colspan="3">{{warehouseName}}</td>
      </tr>
      {{#if notes}}
      <tr>
        <th>Notizen</th><td colspan="3">{{notes}}</td>
      </tr>
      {{/if}}
    </table>
  </div>

  <div class="items">
    <table>
      <thead>
        <tr>
          <th>Pos.</th>
          <th>Art.-Nr.</th>
          <th>Bezeichnung</th>
          <th>Menge</th>
          <th>Einheit</th>
          <th>Einz.Preis</th>
          <th>Gesamtpreis</th>
        </tr>
      </thead>
      <tbody>
        {{#each items}}
        <tr>
          <td>{{positionNumber}}</td>
          <td>{{productId}}</td>
          <td>{{productName}}</td>
          <td style="text-align:right">{{quantity}}</td>
          <td>{{unit}}</td>
          <td style="text-align:right">{{price}} €</td>
          <td style="text-align:right">{{totalPrice}} €</td>
        </tr>
        {{/each}}
        <tr>
          <td colspan="5"></td>
          <th style="text-align:right">Netto:</th>
          <td style="text-align:right">{{totalAmount}} €</td>
        </tr>
        <tr>
          <td colspan="5"></td>
          <th style="text-align:right">MwSt 19%:</th>
          <td style="text-align:right">{{vatAmount}} €</td>
        </tr>
        <tr style="font-weight:bold">
          <td colspan="5"></td>
          <th style="text-align:right">Gesamt:</th>
          <td style="text-align:right">{{totalWithTax}} €</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    Wir bitten um schnellstmögliche Lieferung. Bei Rückfragen stehen wir gerne zur Verfügung.<br>
    Elbsandstein Proviant & Quartier GmbH | Dresdner Str. 2b, 01814 Bad Schandau | Steuernummer: 210/108/11389
  </div>

</body>
</html>
`;

// Hilfsfunktion zum Formatieren eines Datums im deutschen Format
export function formatDate(dateString: string | Date | null): string {
  if (!dateString) return '';
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// Hilfsfunktion zur Berechnung des Gesamtpreises
export function calculateTotalPrice(price: number, quantity: number): number {
  return parseFloat((price * quantity).toFixed(2));
}

// Hilfsfunktion zum Formatieren eines Preises als Währung
export function formatPrice(price: number): string {
  return price.toFixed(2);
}