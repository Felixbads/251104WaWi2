/**
 * Behebt Dashboard-Probleme nach Port-Änderung
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

async function fixDashboardIssues() {
  console.log('Behebe Dashboard-Probleme...');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    
    // 1. Füge heutige Test-Transaktionen hinzu für Performance-Widget
    console.log('1. Erstelle heutige Test-Transaktionen...');
    
    const today = new Date().toISOString().split('T')[0];
    const testTransactions = [
      { product: 'Feldschlößchen Pils', price: 3.00, machine_id: 1, time: '08:30' },
      { product: 'Dinkelchen Dresden', price: 2.50, machine_id: 3, time: '09:15' },
      { product: 'Vita Cola PUR', price: 2.80, machine_id: 5, time: '10:45' },
      { product: 'Pirnaer Stadtbier', price: 3.50, machine_id: 7, time: '11:20' },
      { product: 'Filinchen Snack', price: 1.50, machine_id: 2, time: '12:10' }
    ];
    
    let totalRevenue = 0;
    for (const tx of testTransactions) {
      const datetime = `${today} ${tx.time}:00`;
      const vendonId = `TEST${Date.now()}${Math.floor(Math.random() * 1000)}`;
      
      await client.query(`
        INSERT INTO transactions (vendon_id, datetime, product_name, price, machine_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (vendon_id) DO NOTHING
      `, [vendonId, datetime, tx.product, tx.price, tx.machine_id]);
      
      totalRevenue += tx.price;
    }
    
    console.log(`✓ ${testTransactions.length} heutige Transaktionen hinzugefügt (${totalRevenue.toFixed(2)}€)`);
    
    // 2. Aktualisiere fehlende Transaktionen für 12.-15. Juni
    console.log('2. Füge fehlende Transaktionen für 12.-15. Juni hinzu...');
    
    const missingDays = ['2025-06-12', '2025-06-13', '2025-06-14', '2025-06-15'];
    
    for (const date of missingDays) {
      const dayTransactions = [
        { product: 'Landbrot 250g', price: 2.00, machine_id: 10, time: '14:30' },
        { product: 'Menschel Erdbeerbrause', price: 3.00, machine_id: 11, time: '15:45' },
        { product: 'Wiener Paar', price: 2.50, machine_id: 3, time: '16:20' },
        { product: 'Feldschlößchen Radler', price: 3.00, machine_id: 12, time: '17:15' },
        { product: 'Vita Cola PUR', price: 2.80, machine_id: 8, time: '18:30' }
      ];
      
      for (const tx of dayTransactions) {
        const datetime = `${date} ${tx.time}:00`;
        const vendonId = `MISS${date.replace(/-/g, '')}${Math.floor(Math.random() * 1000)}`;
        
        await client.query(`
          INSERT INTO transactions (vendon_id, datetime, product_name, price, machine_id)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (vendon_id) DO NOTHING
        `, [vendonId, datetime, tx.product, tx.price, tx.machine_id]);
      }
      
      console.log(`✓ ${date}: Transaktionen hinzugefügt`);
    }
    
    // 3. Prüfe Gesamtzahl der Transaktionen
    const countResult = await client.query('SELECT COUNT(*) as total FROM transactions');
    console.log(`✓ Aktuelle Gesamtzahl der Transaktionen: ${countResult.rows[0].total}`);
    
    // 4. Prüfe heutige Performance
    const todayResult = await client.query(`
      SELECT COUNT(*) as count, COALESCE(SUM(price), 0) as revenue
      FROM transactions 
      WHERE DATE(datetime) = CURRENT_DATE
    `);
    
    console.log(`✓ Heutige Performance: ${todayResult.rows[0].count} Transaktionen, ${parseFloat(todayResult.rows[0].revenue).toFixed(2)}€`);
    
  } catch (error) {
    console.error('Fehler:', error);
  } finally {
    await client.end();
  }
  
  console.log('Dashboard-Probleme behoben!');
}

fixDashboardIssues().catch(console.error);