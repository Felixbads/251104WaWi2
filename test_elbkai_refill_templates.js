
const { VendonAPI } = require('./server/services/vendonAPI.ts');
const { rawDb } = require('./server/db.ts');

async function testElbkaiRefillTemplates() {
  console.log('🧪 Testing Refill Template APIs for Elbkai (vendon_id: 391262)');
  
  const vendonAPI = new VendonAPI();
  const elbkaiVendonId = '391262';
  
  // Zuerst die Maschine in der DB finden
  try {
    const machineCheck = await rawDb.query(
      'SELECT id, machine_name, vendon_id FROM machines WHERE vendon_id = $1 LIMIT 1',
      [elbkaiVendonId]
    );
    
    if (machineCheck.rows.length > 0) {
      const machine = machineCheck.rows[0];
      console.log(`✅ Found machine: ${machine.machine_name} (ID: ${machine.id}, Vendon-ID: ${machine.vendon_id})`);
    } else {
      console.log(`❌ Machine with Vendon-ID ${elbkaiVendonId} not found in database`);
      return;
    }
  } catch (error) {
    console.error('❌ Database error:', error);
    return;
  }
  
  console.log('\n📋 Testing API 1: GET /machine/{id}/refilltemplate');
  try {
    const singleTemplate = await vendonAPI.request(`/machine/${elbkaiVendonId}/refilltemplate`);
    
    if (singleTemplate && Array.isArray(singleTemplate) && singleTemplate.length > 0) {
      console.log(`✅ Single Refill Template API: ${singleTemplate.length} template(s) found`);
      console.log('📄 Template Details:');
      singleTemplate.forEach((template, index) => {
        console.log(`  ${index + 1}. ${template.name || 'Unnamed'} (ID: ${template.id})`);
        console.log(`     - Default: ${template.is_default ? 'Yes' : 'No'}`);
        console.log(`     - Products: ${template.products ? template.products.length : 0}`);
        
        if (template.products && template.products.length > 0) {
          console.log('     - Product details:');
          template.products.slice(0, 3).forEach(product => {
            console.log(`       * Product ID: ${product.product_id}, Quantity: ${product.quantity}, Type: ${product.type}`);
          });
          if (template.products.length > 3) {
            console.log(`       ... and ${template.products.length - 3} more products`);
          }
        }
      });
    } else if (singleTemplate === null) {
      console.log('⚠️  Single Refill Template API: Empty response (no templates)');
    } else {
      console.log('⚠️  Single Refill Template API: Unexpected response format');
      console.log('    Response:', JSON.stringify(singleTemplate, null, 2));
    }
  } catch (error) {
    console.error(`❌ Single Refill Template API Error: ${error.message}`);
  }
  
  console.log('\n📋 Testing API 2: GET /machine/{id}/refilltemplates');
  try {
    const multipleTemplates = await vendonAPI.request(`/machine/${elbkaiVendonId}/refilltemplates`);
    
    if (multipleTemplates && Array.isArray(multipleTemplates) && multipleTemplates.length > 0) {
      console.log(`✅ Multiple Refill Templates API: ${multipleTemplates.length} template(s) found`);
      console.log('📄 Templates Overview:');
      multipleTemplates.forEach((template, index) => {
        console.log(`  ${index + 1}. ${template.name || 'Unnamed'} (ID: ${template.id})`);
        console.log(`     - Default: ${template.is_default ? 'Yes' : 'No'}`);
        console.log(`     - Products: ${template.products ? template.products.length : 0}`);
      });
    } else if (multipleTemplates === null) {
      console.log('⚠️  Multiple Refill Templates API: Empty response (no templates)');
    } else {
      console.log('⚠️  Multiple Refill Templates API: Unexpected response format');
      console.log('    Response:', JSON.stringify(multipleTemplates, null, 2));
    }
  } catch (error) {
    console.error(`❌ Multiple Refill Templates API Error: ${error.message}`);
  }
  
  console.log('\n🔍 Testing alternative endpoints as fallback:');
  
  // Test alternative endpoints
  const alternativeEndpoints = [
    `/machine/${elbkaiVendonId}/products`,
    `/machine/${elbkaiVendonId}/stock`,
    `/machine/${elbkaiVendonId}`,
    `/machine/${elbkaiVendonId}/settings`
  ];
  
  for (const endpoint of alternativeEndpoints) {
    try {
      console.log(`\n🔄 Testing: ${endpoint}`);
      const response = await vendonAPI.request(endpoint);
      
      if (response) {
        console.log(`✅ ${endpoint}: SUCCESS`);
        if (Array.isArray(response)) {
          console.log(`   - Response is array with ${response.length} items`);
        } else if (typeof response === 'object') {
          console.log(`   - Response is object with keys: ${Object.keys(response).join(', ')}`);
        }
      } else {
        console.log(`⚠️  ${endpoint}: Empty response`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint}: ${error.message}`);
    }
  }
  
  console.log('\n📊 Summary:');
  console.log('='.repeat(50));
  console.log('Test completed. Check above for results.');
  console.log('If both refill template endpoints return errors, the machine might not have any refill templates configured in Vendon.');
}

// Run the test
testElbkaiRefillTemplates().catch(console.error);
