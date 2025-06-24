/**
 * Comprehensive Mail System Test
 * Tests the enhanced email service configuration and connectivity
 */

import { emailService } from './server/utils/enhancedEmailService.js';

async function testMailConfiguration() {
  console.log('=== Mail System Configuration Test ===\n');
  
  // Test 1: Check configuration detection
  console.log('1. Checking mail configuration...');
  const config = emailService.getConfiguration();
  console.log('Configuration:', {
    usesSendGrid: config.usesSendGrid,
    usesNodemailer: config.usesNodemailer,
    fromAddress: config.fromAddress,
    isConfigured: config.isConfigured
  });
  
  // Test 2: Test connection
  console.log('\n2. Testing mail service connections...');
  try {
    const connectionTest = await emailService.testConnection();
    console.log('Connection test results:', connectionTest);
  } catch (error) {
    console.error('Connection test failed:', error.message);
  }
  
  // Test 3: Create and test email template
  console.log('\n3. Testing email template generation...');
  const testOrder = {
    id: 1,
    order_number: 'TEST-001',
    created_at: new Date(),
    expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    total_amount: 125.50,
    notes: 'Test order for mail system verification'
  };
  
  const testSupplier = {
    name: 'Test Supplier GmbH',
    email: 'test@example.com',
    address: 'Test Street 123, 01234 Test City'
  };
  
  const testItems = [
    {
      product_name: 'Test Product 1',
      quantity: 5,
      unit: 'Stk',
      unit_price: 12.50,
      total_price: 62.50
    },
    {
      product_name: 'Test Product 2', 
      quantity: 3,
      unit: 'Stk',
      unit_price: 21.00,
      total_price: 63.00
    }
  ];
  
  try {
    const emailTemplate = emailService.createOrderEmailTemplate(
      { ...testOrder, items: testItems }, 
      testSupplier, 
      'standard'
    );
    console.log('✅ Email template generated successfully');
    console.log('Template preview (first 200 chars):', emailTemplate.substring(0, 200) + '...');
  } catch (error) {
    console.error('❌ Email template generation failed:', error.message);
  }
  
  // Test 4: Check environment variables
  console.log('\n4. Checking environment variables...');
  const envVars = [
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE',
    'SENDGRID_API_KEY', 'FROM_EMAIL'
  ];
  
  envVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`${varName}: ${value ? '✅ Set' : '❌ Missing'}`);
  });
  
  console.log('\n=== Test Complete ===');
}

// Run the test
testMailConfiguration().catch(console.error);

export { testMailConfiguration };