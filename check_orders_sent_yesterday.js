
const { Pool } = require('pg');

// Datenbankverbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/warenwirtschaft'
});

async function checkOrdersSentYesterday() {
  try {
    // Gestern berechnen
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = new Date(yesterday);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    console.log(`🔍 Überprüfe gesendete Bestellungen vom ${yesterday.toLocaleDateString('de-DE')}...`);

    // Bestellungen mit Status "sent" von gestern abrufen
    const sentOrdersQuery = `
      SELECT 
        o.id,
        o.order_number,
        o.supplier_name,
        o.status,
        o.order_date,
        o.sent_at,
        o.total_amount,
        o.created_by_name,
        COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.status = 'sent' 
        AND (
          (o.sent_at >= $1 AND o.sent_at <= $2) OR
          (o.updated_at >= $1 AND o.updated_at <= $2 AND o.status = 'sent')
        )
      GROUP BY o.id, o.order_number, o.supplier_name, o.status, o.order_date, o.sent_at, o.total_amount, o.created_by_name
      ORDER BY COALESCE(o.sent_at, o.updated_at) DESC
    `;

    const result = await pool.query(sentOrdersQuery, [yesterdayStart, yesterdayEnd]);

    if (result.rows.length === 0) {
      console.log(`❌ Keine Bestellungen wurden gestern (${yesterday.toLocaleDateString('de-DE')}) verschickt.`);
    } else {
      console.log(`✅ ${result.rows.length} Bestellung(en) wurden gestern verschickt:\n`);
      
      let totalValue = 0;
      result.rows.forEach((order, index) => {
        const sentTime = order.sent_at ? new Date(order.sent_at).toLocaleString('de-DE') : 'Unbekannt';
        const amount = order.total_amount || 0;
        totalValue += amount;
        
        console.log(`${index + 1}. ${order.order_number}`);
        console.log(`   📦 Lieferant: ${order.supplier_name || 'Unbekannt'}`);
        console.log(`   📅 Versendet: ${sentTime}`);
        console.log(`   💰 Wert: €${amount.toFixed(2)}`);
        console.log(`   📋 Positionen: ${order.item_count}`);
        console.log(`   👤 Erstellt von: ${order.created_by_name || 'Unbekannt'}`);
        console.log('');
      });

      console.log(`💰 Gesamtwert aller gestern versendeten Bestellungen: €${totalValue.toFixed(2)}`);
    }

    // Zusätzlich: Bestellungen die gestern erstellt wurden (unabhängig vom Status)
    const createdYesterdayQuery = `
      SELECT 
        o.id,
        o.order_number,
        o.supplier_name,
        o.status,
        o.order_date,
        o.created_at,
        o.total_amount
      FROM orders o
      WHERE o.created_at >= $1 AND o.created_at <= $2
      ORDER BY o.created_at DESC
    `;

    const createdResult = await pool.query(createdYesterdayQuery, [yesterdayStart, yesterdayEnd]);
    
    if (createdResult.rows.length > 0) {
      console.log(`\n📋 ${createdResult.rows.length} Bestellung(en) wurden gestern erstellt:`);
      createdResult.rows.forEach((order, index) => {
        console.log(`${index + 1}. ${order.order_number} - Status: ${order.status} - ${order.supplier_name}`);
      });
    }

  } catch (error) {
    console.error('❌ Fehler beim Überprüfen der Bestellungen:', error);
  } finally {
    await pool.end();
  }
}

// Script ausführen
checkOrdersSentYesterday();
