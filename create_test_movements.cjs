const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Verbindung zur Datenbank herstellen
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const warehouseIds = [1, 2, 3, 4]; // IDs der zu verwendenden Lagerhäuser
const productIds = []; // Wird mit echten Produkt-IDs aus der Datenbank gefüllt

async function main() {
  try {
    await client.connect();
    console.log('Mit Datenbank verbunden');

    // Echte Produkt-IDs abrufen
    const productsResult = await client.query(
      'SELECT id FROM products LIMIT 20'
    );
    
    productsResult.rows.forEach(row => {
      productIds.push(row.id);
    });
    
    if (productIds.length === 0) {
      console.error('Keine Produkte in der Datenbank gefunden!');
      return;
    }
    
    console.log(`${productIds.length} Produkte gefunden. Erstelle Testbewegungen...`);
    
    // Vorhandene Automaten abrufen
    const machinesResult = await client.query(
      'SELECT id, machine_name FROM machines LIMIT 5'
    );
    const machines = machinesResult.rows;
    
    if (machines.length === 0) {
      console.error('Keine Automaten in der Datenbank gefunden!');
      return;
    }
    
    // Für jedes Lager ein paar Bewegungen erstellen
    for (const warehouseId of warehouseIds) {
      console.log(`Erstelle Bewegungen für Lager ID ${warehouseId}...`);
      
      // 1. Wareneingang
      const inboundProduct = productIds[Math.floor(Math.random() * productIds.length)];
      await client.query(
        `INSERT INTO inventory_movements 
        (product_id, quantity, source_warehouse_id, destination_warehouse_id, 
        movement_type, reference_type, reference_id, notes, performed_by, performed_at) 
        VALUES ($1, $2, NULL, $3, 'IN', 'ORDER', 'test-order-123', 'Wareneingang Testlieferung', 1, NOW() - INTERVAL '2 days')`,
        [inboundProduct, 100, warehouseId]
      );
      console.log(`Wareneingang erstellt: Produkt ID ${inboundProduct} -> Lager ${warehouseId}, Menge: 100`);
      
      // 2. Refill (Ausgang)
      if (machines.length > 0) {
        const refillProduct = productIds[Math.floor(Math.random() * productIds.length)];
        const machine = machines[Math.floor(Math.random() * machines.length)];
        
        await client.query(
          `INSERT INTO inventory_movements 
          (product_id, quantity, source_warehouse_id, destination_warehouse_id,
          machine_id, machine_name, movement_type, reference_type, reference_id, 
          notes, performed_by, performed_at) 
          VALUES ($1, $2, $3, NULL, $4, $5, 'OUT', 'REFILL', 'test-refill-123', 
          'Auffüllung des Automaten', 1, NOW() - INTERVAL '1 day')`,
          [refillProduct, -15, warehouseId, machine.id, machine.machine_name]
        );
        console.log(`Refill erstellt: Produkt ID ${refillProduct} aus Lager ${warehouseId} für Automat ${machine.machine_name}, Menge: -15`);
      }
      
      // 3. Umlagerung (zwischen Lagern)
      const transferProduct = productIds[Math.floor(Math.random() * productIds.length)];
      const destinationWarehouseId = warehouseIds.find(id => id !== warehouseId) || warehouseIds[0];
      
      await client.query(
        `INSERT INTO inventory_movements 
        (product_id, quantity, source_warehouse_id, destination_warehouse_id,
        movement_type, reference_type, reference_id, notes, performed_by, performed_at) 
        VALUES ($1, $2, $3, $4, 'TRANSFER', 'MANUAL', 'test-transfer-123', 
        'Umlagerung zwischen Lagern', 1, NOW())`,
        [transferProduct, -25, warehouseId, destinationWarehouseId]
      );
      
      // Gegenstück für das Ziellager
      await client.query(
        `INSERT INTO inventory_movements 
        (product_id, quantity, source_warehouse_id, destination_warehouse_id,
        movement_type, reference_type, reference_id, notes, performed_by, performed_at) 
        VALUES ($1, $2, $3, $4, 'TRANSFER', 'MANUAL', 'test-transfer-123', 
        'Umlagerung zwischen Lagern', 1, NOW())`,
        [transferProduct, 25, warehouseId, destinationWarehouseId]
      );
      
      console.log(`Umlagerung erstellt: Produkt ID ${transferProduct}, ${warehouseId} -> ${destinationWarehouseId}, Menge: 25`);
      
      // 4. Bestandskorrektur
      const adjustmentProduct = productIds[Math.floor(Math.random() * productIds.length)];
      const adjustmentQuantity = Math.floor(Math.random() * 10) - 5; // Zufallszahl zwischen -5 und 5
      
      await client.query(
        `INSERT INTO inventory_movements 
        (product_id, quantity, source_warehouse_id, destination_warehouse_id,
        movement_type, reference_type, reference_id, notes, performed_by, performed_at) 
        VALUES ($1, $2, ${adjustmentQuantity > 0 ? 'NULL' : '$3'}, ${adjustmentQuantity > 0 ? '$3' : 'NULL'}, 
        'ADJUSTMENT', 'MANUAL', 'test-adjust-123', 'Manuelle Bestandskorrektur', 1, NOW() - INTERVAL '3 hours')`,
        [adjustmentProduct, adjustmentQuantity, warehouseId]
      );
      
      console.log(`Bestandskorrektur erstellt: Produkt ID ${adjustmentProduct}, Lager ${warehouseId}, Menge: ${adjustmentQuantity}`);
      
      // 5. Manuelle Entnahme für Test
      const manualProduct = productIds[Math.floor(Math.random() * productIds.length)];
      await client.query(
        `INSERT INTO inventory_movements 
        (product_id, quantity, source_warehouse_id, destination_warehouse_id,
        movement_type, reference_type, reference_id, notes, performed_by, performed_at) 
        VALUES ($1, $2, $3, NULL, 'MANUAL', 'MANUAL', 'test-manual-123', 
        'Manuelle Entnahme für Test', 1, NOW() - INTERVAL '4 hours')`,
        [manualProduct, -8, warehouseId]
      );
      
      console.log(`Manuelle Entnahme erstellt: Produkt ID ${manualProduct}, Lager ${warehouseId}, Menge: -8`);
    }
    
    console.log('\nTests abgeschlossen! Die Warenbewegungen wurden erfolgreich erstellt.');
    
  } catch (err) {
    console.error('Fehler bei der Durchführung der Tests:', err);
  } finally {
    await client.end();
  }
}

main();