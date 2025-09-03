
const { VendonAPI } = require('./server/services/vendonAPI');
const { db, rawDb } = require('./server/db');

async function testPillnitzRefillTemplates() {
  console.log('🔍 Testing Refill Templates for Pillnitz location...\n');
  
  const vendonAPI = new VendonAPI();
  
  try {
    // 1. Erst alle Maschinen aus der lokalen DB abrufen
    console.log('📋 Fetching all machines from database...');
    const machines = await rawDb.query(`
      SELECT id, vendon_id, name, location 
      FROM machines 
      ORDER BY name
    `);
    
    console.log(`Found ${machines.rows.length} machines in database:\n`);
    
    let pillnitzMachine = null;
    
    machines.rows.forEach(machine => {
      console.log(`- ${machine.name} (ID: ${machine.id}, Vendon-ID: ${machine.vendon_id})`);
      if (machine.name?.toLowerCase().includes('pillnitz') || 
          machine.location?.toLowerCase().includes('pillnitz')) {
        pillnitzMachine = machine;
        console.log(`  ✅ PILLNITZ FOUND!`);
      }
    });
    
    if (!pillnitzMachine) {
      console.log('\n❌ No Pillnitz machine found in database');
      return;
    }
    
    console.log(`\n🎯 Testing Pillnitz Machine:`);
    console.log(`   Name: ${pillnitzMachine.name}`);
    console.log(`   Local ID: ${pillnitzMachine.id}`);
    console.log(`   Vendon ID: ${pillnitzMachine.vendon_id}`);
    
    // 2. Lokale Refill-Templates für Pillnitz prüfen
    console.log(`\n📋 Checking local refill templates for Pillnitz...`);
    const localTemplates = await rawDb.query(`
      SELECT rt.*, 
             COUNT(rtp.id) as product_count
      FROM refill_templates rt
      LEFT JOIN refill_template_products rtp ON rt.id = rtp.template_id
      WHERE rt.machine_id = $1
      GROUP BY rt.id
      ORDER BY rt.is_default DESC, rt.updated_at DESC
    `, [pillnitzMachine.id]);
    
    if (localTemplates.rows.length > 0) {
      console.log(`✅ Found ${localTemplates.rows.length} local template(s):`);
      localTemplates.rows.forEach((template, index) => {
        console.log(`  ${index + 1}. "${template.name}" (ID: ${template.id})`);
        console.log(`     - Default: ${template.is_default ? 'Yes' : 'No'}`);
        console.log(`     - Products: ${template.product_count}`);
        console.log(`     - Vendon ID: ${template.vendon_id || 'None'}`);
        console.log(`     - Created: ${template.created_at}`);
      });
    } else {
      console.log('❌ No local templates found for Pillnitz');
    }
    
    // 3. API-Test für lokale Templates
    console.log(`\n🌐 Testing API endpoint for Pillnitz templates...`);
    try {
      const response = await fetch(`http://localhost:5000/api/machines/${pillnitzMachine.id}/refill-templates`);
      
      if (response.ok) {
        const apiTemplates = await response.json();
        console.log(`✅ API returned ${apiTemplates.length} template(s):`);
        apiTemplates.forEach((template, index) => {
          console.log(`  ${index + 1}. "${template.name}"`);
          console.log(`     - Default: ${template.isDefault ? 'Yes' : 'No'}`);
          console.log(`     - Products: ${template.products?.length || 0}`);
        });
      } else {
        console.log(`❌ API Error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log(`❌ API Request failed: ${error.message}`);
    }
    
    // 4. Vendon API Test für Pillnitz
    if (pillnitzMachine.vendon_id) {
      console.log(`\n🔄 Testing Vendon API for Pillnitz (Vendon ID: ${pillnitzMachine.vendon_id})...`);
      
      try {
        const vendonTemplates = await vendonAPI.getMachineRefillTemplates(pillnitzMachine.vendon_id);
        
        if (vendonTemplates && Array.isArray(vendonTemplates) && vendonTemplates.length > 0) {
          console.log(`✅ Vendon API returned ${vendonTemplates.length} template(s):`);
          vendonTemplates.forEach((template, index) => {
            console.log(`  ${index + 1}. "${template.name || 'Unnamed'}" (Vendon ID: ${template.id})`);
            console.log(`     - Default: ${template.is_default ? 'Yes' : 'No'}`);
            console.log(`     - Products: ${template.products ? template.products.length : 0}`);
          });
        } else {
          console.log('❌ No templates found in Vendon API for Pillnitz');
        }
      } catch (error) {
        console.log(`❌ Vendon API Error: ${error.message}`);
      }
    }
    
    // 5. Test auch andere Maschinen um zu vergleichen
    console.log(`\n🔍 Testing a few other machines for comparison...`);
    
    const testMachines = machines.rows.slice(0, 3); // Teste nur die ersten 3
    for (const machine of testMachines) {
      if (machine.id === pillnitzMachine.id) continue; // Pillnitz haben wir schon getestet
      
      console.log(`\n📍 Testing ${machine.name} (Vendon ID: ${machine.vendon_id})...`);
      
      // Lokale Templates
      const localCount = await rawDb.query(
        'SELECT COUNT(*) as count FROM refill_templates WHERE machine_id = $1',
        [machine.id]
      );
      console.log(`   Local templates: ${localCount.rows[0].count}`);
      
      // API Test
      try {
        const response = await fetch(`http://localhost:5000/api/machines/${machine.id}/refill-templates`);
        if (response.ok) {
          const apiTemplates = await response.json();
          console.log(`   API templates: ${apiTemplates.length}`);
        } else {
          console.log(`   API Error: ${response.status}`);
        }
      } catch (error) {
        console.log(`   API Error: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Script Error:', error);
  }
}

// Script ausführen
testPillnitzRefillTemplates()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
