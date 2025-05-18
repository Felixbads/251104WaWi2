import express from 'express';
import { pool } from '../db';

const router = express.Router();

// Hilfsfunktion zum Formatieren der Antwort für bestimmte Endpunkte
const formatDirectResponse = (rows: any[], message: string) => {
  console.log(`${message}: ${rows.length} Einträge gefunden`);
  return {
    success: true,
    data: rows,
    message: `${rows.length} Einträge erfolgreich geladen`
  };
};

// Direkter SQL-Zugriff für Bestellungen
router.post('/execute-sql', async (req, res) => {
  try {
    const { query, params } = req.body;
    
    console.log('Direkte SQL-Abfrage:', query);
    
    if (!query) {
      return res.status(400).json({ 
        error: 'Fehlende SQL-Abfrage', 
        message: 'Keine SQL-Abfrage angegeben' 
      });
    }
    
    // SQL-Abfrage ausführen
    const result = await pool.query(query, params || []);
    
    return res.json({
      rows: result.rows,
      rowCount: result.rowCount,
      success: true
    });
  } catch (error) {
    console.error('Fehler bei SQL-Abfrage:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Direkter Endpunkt für Bestellungen
router.get('/orders-direct', async (req, res) => {
  try {
    console.log('Lade Bestellungen direkt aus der Datenbank...');
    
    const result = await pool.query(`
      SELECT * FROM orders 
      ORDER BY created_at DESC
    `);
    
    console.log(`${result.rows.length} Bestellungen aus der Datenbank geladen`);
    
    return res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Laden der Bestellungen:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

// Direkter Endpunkt für Lieferanten
router.get('/suppliers-direct', async (req, res) => {
  try {
    console.log('Lade Lieferanten direkt aus der Datenbank...');
    
    const result = await pool.query(`
      SELECT * FROM suppliers 
      ORDER BY name ASC
    `);
    
    return res.json(formatDirectResponse(result.rows, 'Lieferanten'));
  } catch (error) {
    console.error('Fehler beim Laden der Lieferanten:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

// Direkter Endpunkt für E-Mail-Vorlagen
router.get('/email-templates-direct', async (req, res) => {
  try {
    console.log('Lade E-Mail-Vorlagen direkt aus der Datenbank...');
    
    // Prüfe, ob die Tabelle existiert
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'email_templates'
      )
    `);
    
    if (!checkTable.rows[0].exists) {
      // Erstelle eine Standardvorlage, wenn die Tabelle nicht existiert
      return res.json({
        success: true,
        data: [{
          id: 1,
          name: 'Standard-Bestellvorlage',
          subject: 'Neue Bestellung: {{orderNumber}}',
          body: `<h2>Sehr geehrte Damen und Herren,</h2>
                 <p>hiermit senden wir Ihnen folgende Bestellung:</p>
                 <p><strong>Bestellnummer:</strong> {{orderNumber}}</p>
                 <p><strong>Lieferdatum:</strong> {{deliveryDate}}</p>
                 <p><strong>Lieferadresse:</strong> {{warehouse}}</p>
                 <h3>Bestellpositionen:</h3>
                 <table border="1" cellpadding="5" cellspacing="0">
                   <tr>
                     <th>Produkt</th>
                     <th>Menge</th>
                     <th>Einheit</th>
                     <th>Einzelpreis</th>
                     <th>Gesamtpreis</th>
                   </tr>
                   {{#each orderItems}}
                   <tr>
                     <td>{{this.productName}}</td>
                     <td>{{this.quantity}}</td>
                     <td>{{this.unit}}</td>
                     <td>{{this.price}} €</td>
                     <td>{{this.totalPrice}} €</td>
                   </tr>
                   {{/each}}
                 </table>
                 <p><strong>Gesamtbetrag:</strong> {{totalAmount}} €</p>
                 <p><strong>Notizen:</strong> {{notes}}</p>
                 <p>Mit freundlichen Grüßen<br/>Ihr Smart Vending Team</p>`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_default: true
        }],
        message: '1 Standard-Vorlage erstellt, da keine E-Mail-Vorlagen in der Datenbank gefunden wurden'
      });
    }
    
    const result = await pool.query(`
      SELECT * FROM email_templates 
      ORDER BY created_at DESC
    `);
    
    return res.json(formatDirectResponse(result.rows, 'E-Mail-Vorlagen'));
  } catch (error) {
    console.error('Fehler beim Laden der E-Mail-Vorlagen:', error);
    // Bei Fehler eine Standard-Vorlage zurückgeben
    return res.json({
      success: true,
      data: [{
        id: 1,
        name: 'Notfall-Bestellvorlage',
        subject: 'Neue Bestellung: {{orderNumber}}',
        body: `<h2>Sehr geehrte Damen und Herren,</h2>
               <p>hiermit bestellen wir folgende Waren:</p>
               <p><strong>Bestellnummer:</strong> {{orderNumber}}</p>
               <p><strong>Produkte:</strong></p>
               <ul>
                 {{#each orderItems}}
                 <li>{{this.productName}} - {{this.quantity}} {{this.unit}}</li>
                 {{/each}}
               </ul>
               <p>Mit freundlichen Grüßen<br/>Ihr Smart Vending Team</p>`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_default: true
      }],
      message: '1 Notfall-Vorlage erstellt, da beim Laden der E-Mail-Vorlagen ein Fehler aufgetreten ist'
    });
  }
});

// Direkter Endpunkt für Lager
router.get('/warehouses-direct', async (req, res) => {
  try {
    console.log('Lade Lager direkt aus der Datenbank...');
    
    const result = await pool.query(`
      SELECT * FROM warehouses 
      ORDER BY name ASC
    `);
    
    return res.json(formatDirectResponse(result.rows, 'Lager'));
  } catch (error) {
    console.error('Fehler beim Laden der Lager:', error);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

export default router;