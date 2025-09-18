/**
 * ORDERS V4 INTEGRATION TESTS - Phase 2.3 Hybrid Implementation
 * 
 * CRITICAL German Audit Priority: Data Corruption Validation
 * Tests Phase 2.2 concurrency/idempotency fixes under concurrent load
 * 
 * SUCCESS CRITERIA:
 * ✅ Zero duplicate order_numbers under parallel load
 * ✅ Order_items isolation - no cross-contamination  
 * ✅ Idempotency compliance - duplicate keys handled correctly
 * ✅ DB sequence atomic generation proven under concurrent load
 * ✅ Performance targets met (<2s test execution)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { createTestApp } from '../utils/testServer';
import { 
  setupTestEnvironment, 
  cleanTestDatabase, 
  createTestUser,
  cleanupTestUsers 
} from '../utils/testEnvironment';
import { pool } from '../../server/db';
import crypto from 'crypto';

const app = createTestApp();
const request = supertest(app);

describe('Orders v4 Concurrency & Idempotency Integration Tests', () => {
  let testUser: { id: number; username: string; role: string };
  let testSupplier: { id: number; name: string };
  let testWarehouse: { id: number; name: string };
  let testProducts: Array<{ id: number; name: string; unit_price: number }>;

  beforeEach(async () => {
    console.log('🔧 Setting up Orders v4 integration test...');
    
    // Setup test environment and clean database
    await setupTestEnvironment();
    await cleanTestDatabase();
    await cleanupTestUsers();
    
    // Create test user
    testUser = await createTestUser({
      username: 'test_orders_user',
      password: 'hashed_password_here',
      email: 'test@example.com',
      role: 'admin',
      approved: true
    });
    
    // Create test supplier
    const client = await pool.connect();
    try {
      const supplierResult = await client.query(`
        INSERT INTO suppliers (name, contact_email, status)
        VALUES ($1, $2, $3)
        RETURNING id, name
      `, ['Test Supplier Ltd', 'supplier@test.com', 'active']);
      testSupplier = supplierResult.rows[0];
      
      // Create test warehouse
      const warehouseResult = await client.query(`
        INSERT INTO warehouses (name, location, status)
        VALUES ($1, $2, $3)
        RETURNING id, name
      `, ['Test Warehouse', 'Test Location', 'active']);
      testWarehouse = warehouseResult.rows[0];
      
      // Create test products
      const productPromises = [
        ['Test Product A', 10.50, 'kg'],
        ['Test Product B', 25.99, 'stk'],
        ['Test Product C', 15.75, 'l']
      ].map(async ([name, price, unit]) => {
        const result = await client.query(`
          INSERT INTO products (name, unit_price, unit, status)
          VALUES ($1, $2, $3, $4)
          RETURNING id, name, unit_price
        `, [name, price, unit, 'active']);
        return result.rows[0];
      });
      
      testProducts = await Promise.all(productPromises);
      
      console.log('✅ Test data setup completed', {
        supplier: testSupplier.name,
        warehouse: testWarehouse.name,
        products: testProducts.length
      });
      
    } finally {
      client.release();
    }
  });

  afterEach(async () => {
    await cleanTestDatabase();
    await cleanupTestUsers();
    console.log('🧹 Orders v4 test cleanup completed');
  });

  /**
   * CRITICAL TEST 1: Concurrency Safety - Parallel Order Creation
   * Validates atomic order_number generation under concurrent load
   */
  it('should create unique sequential order_numbers under parallel load', async () => {
    console.log('🧪 Testing concurrent order creation for unique order_numbers...');
    
    const concurrentRequests = 5;
    const orderPromises: Promise<any>[] = [];
    
    // Create order data template
    const baseOrderData = {
      supplierId: testSupplier.id,
      warehouseId: testWarehouse.id,
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      notes: 'Concurrent test order',
      orderItems: [
        {
          productId: testProducts[0].id,
          productName: testProducts[0].name,
          quantity: 10,
          unitPrice: testProducts[0].unit_price,
          unit: 'kg'
        }
      ]
    };

    // Launch concurrent requests with unique idempotency keys
    for (let i = 0; i < concurrentRequests; i++) {
      const orderData = {
        ...baseOrderData,
        idempotencyKey: `concurrent-test-${i}-${crypto.randomBytes(8).toString('hex')}`,
        notes: `Concurrent test order #${i}`
      };
      
      const orderPromise = request
        .post('/api/orders-v4/create')
        .send(orderData)
        .expect(201);
        
      orderPromises.push(orderPromise);
    }

    // Wait for all requests to complete
    const startTime = Date.now();
    const responses = await Promise.all(orderPromises);
    const duration = Date.now() - startTime;

    console.log(`✅ All ${concurrentRequests} concurrent orders completed in ${duration}ms`);

    // Extract order numbers and validate uniqueness
    const orderNumbers = responses.map(res => res.body.order.order_number);
    const uniqueOrderNumbers = new Set(orderNumbers);

    // CRITICAL ASSERTION: Zero duplicate order_numbers
    expect(uniqueOrderNumbers.size).toBe(concurrentRequests);
    console.log('✅ CRITICAL VALIDATION: All order numbers are unique', { orderNumbers });

    // Validate sequential order_number generation
    const numberParts = orderNumbers.map(num => {
      const parts = num.split('-');
      return parseInt(parts[parts.length - 1]); // Extract sequence number
    });
    
    numberParts.sort((a, b) => a - b);
    for (let i = 1; i < numberParts.length; i++) {
      expect(numberParts[i]).toBe(numberParts[i-1] + 1);
    }
    console.log('✅ CRITICAL VALIDATION: Order numbers are sequential', { sequence: numberParts });
    
    // Performance validation: <2 second target
    expect(duration).toBeLessThan(2000);
    console.log('✅ Performance target met: concurrent orders created in <2s');
  }, 10000);

  /**
   * CRITICAL TEST 2: Order Items Isolation
   * Validates zero cross-contamination between concurrent orders
   */
  it('should maintain order items isolation with zero cross-contamination', async () => {
    console.log('🧪 Testing order items isolation under concurrent load...');
    
    const concurrentRequests = 3;
    const orderPromises: Promise<any>[] = [];

    // Create distinct order data for each request
    const orderDataSets = [
      {
        supplierId: testSupplier.id,
        warehouseId: testWarehouse.id,
        expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: `isolation-test-a-${crypto.randomBytes(8).toString('hex')}`,
        notes: 'Order A - Product A only',
        orderItems: [
          {
            productId: testProducts[0].id,
            productName: testProducts[0].name,
            quantity: 5,
            unitPrice: testProducts[0].unit_price,
            unit: 'kg'
          }
        ]
      },
      {
        supplierId: testSupplier.id,
        warehouseId: testWarehouse.id,
        expectedDeliveryDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: `isolation-test-b-${crypto.randomBytes(8).toString('hex')}`,
        notes: 'Order B - Product B only',
        orderItems: [
          {
            productId: testProducts[1].id,
            productName: testProducts[1].name,
            quantity: 15,
            unitPrice: testProducts[1].unit_price,
            unit: 'stk'
          }
        ]
      },
      {
        supplierId: testSupplier.id,
        warehouseId: testWarehouse.id,
        expectedDeliveryDate: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: `isolation-test-c-${crypto.randomBytes(8).toString('hex')}`,
        notes: 'Order C - Product C only',
        orderItems: [
          {
            productId: testProducts[2].id,
            productName: testProducts[2].name,
            quantity: 8,
            unitPrice: testProducts[2].unit_price,
            unit: 'l'
          }
        ]
      }
    ];

    // Launch concurrent requests
    for (let i = 0; i < concurrentRequests; i++) {
      const orderPromise = request
        .post('/api/orders-v4/create')
        .send(orderDataSets[i])
        .expect(201);
        
      orderPromises.push(orderPromise);
    }

    const responses = await Promise.all(orderPromises);
    console.log('✅ All isolation test orders created successfully');

    // Validate order items in database for each order
    const client = await pool.connect();
    try {
      for (let i = 0; i < responses.length; i++) {
        const order = responses[i].body.order;
        const expectedProduct = testProducts[i];
        const expectedQuantity = orderDataSets[i].orderItems[0].quantity;
        
        // Fetch order items from database
        const itemsResult = await client.query(`
          SELECT product_id, product_name, quantity, unit_price
          FROM order_items
          WHERE order_id = $1
          ORDER BY id
        `, [order.id]);
        
        const orderItems = itemsResult.rows;
        
        // CRITICAL ASSERTION: Each order contains ONLY its own items
        expect(orderItems).toHaveLength(1);
        expect(orderItems[0].product_id).toBe(expectedProduct.id);
        expect(orderItems[0].product_name).toBe(expectedProduct.name);
        expect(orderItems[0].quantity).toBe(expectedQuantity);
        
        console.log(`✅ Order ${order.order_number} contains ONLY its expected product: ${expectedProduct.name}`);
      }
      
      console.log('✅ CRITICAL VALIDATION: Zero cross-contamination detected');
      
    } finally {
      client.release();
    }
  }, 15000);

  /**
   * CRITICAL TEST 3: Idempotency Compliance
   * Validates duplicate idempotency_key handling (200 for duplicates, 201 for new)
   */
  it('should handle idempotency correctly - 200 for duplicates, 201 for new', async () => {
    console.log('🧪 Testing idempotency key behavior...');
    
    const idempotencyKey = `idempotency-test-${crypto.randomBytes(12).toString('hex')}`;
    
    const orderData = {
      supplierId: testSupplier.id,
      warehouseId: testWarehouse.id,
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      idempotencyKey,
      notes: 'Idempotency test order',
      orderItems: [
        {
          productId: testProducts[0].id,
          productName: testProducts[0].name,
          quantity: 12,
          unitPrice: testProducts[0].unit_price,
          unit: 'kg'
        }
      ]
    };

    // First request: Should create new order (201)
    console.log('📝 Creating initial order...');
    const firstResponse = await request
      .post('/api/orders-v4/create')
      .send(orderData)
      .expect(201);

    expect(firstResponse.body.success).toBe(true);
    expect(firstResponse.body.order.order_number).toBeDefined();
    expect(firstResponse.body.idempotent).toBeFalsy();
    
    const originalOrder = firstResponse.body.order;
    console.log(`✅ Initial order created: ${originalOrder.order_number}`);

    // Second request: Same idempotency key should return existing order (200)
    console.log('🔄 Sending duplicate request with same idempotency key...');
    const secondResponse = await request
      .post('/api/orders-v4/create')
      .send(orderData)
      .expect(200);

    expect(secondResponse.body.success).toBe(true);
    expect(secondResponse.body.order.id).toBe(originalOrder.id);
    expect(secondResponse.body.order.order_number).toBe(originalOrder.order_number);
    expect(secondResponse.body.idempotent).toBe(true);
    expect(secondResponse.body.message).toContain('bereits vorhanden');
    
    console.log('✅ CRITICAL VALIDATION: Idempotent response correctly returned existing order');

    // Third request: Different idempotency key should create new order (201)
    const newOrderData = {
      ...orderData,
      idempotencyKey: `idempotency-test-new-${crypto.randomBytes(12).toString('hex')}`,
      notes: 'New idempotency test order'
    };

    console.log('📝 Creating new order with different idempotency key...');
    const thirdResponse = await request
      .post('/api/orders-v4/create')
      .send(newOrderData)
      .expect(201);

    expect(thirdResponse.body.success).toBe(true);
    expect(thirdResponse.body.order.id).not.toBe(originalOrder.id);
    expect(thirdResponse.body.order.order_number).not.toBe(originalOrder.order_number);
    expect(thirdResponse.body.idempotent).toBeFalsy();
    
    console.log('✅ CRITICAL VALIDATION: New idempotency key created different order');
    console.log('✅ Idempotency compliance verified: 200 for duplicates, 201 for new');
  }, 10000);

  /**
   * CRITICAL TEST 4: Race Condition Prevention
   * Validates DB sequence prevents collision scenarios under rapid concurrent access
   */
  it('should prevent race conditions in order number generation under rapid load', async () => {
    console.log('🧪 Testing race condition prevention with rapid concurrent requests...');
    
    const rapidRequests = 10;
    const orderPromises: Promise<any>[] = [];
    
    // Create minimal order data for rapid execution
    const baseOrderData = {
      supplierId: testSupplier.id,
      warehouseId: testWarehouse.id,
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      notes: 'Race condition test',
      orderItems: [
        {
          productId: testProducts[0].id,
          productName: testProducts[0].name,
          quantity: 1,
          unitPrice: testProducts[0].unit_price,
          unit: 'kg'
        }
      ]
    };

    // Launch rapid concurrent requests (minimize delay)
    const startTime = Date.now();
    for (let i = 0; i < rapidRequests; i++) {
      const orderData = {
        ...baseOrderData,
        idempotencyKey: `race-test-${i}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        notes: `Race test order #${i}`
      };
      
      // Launch without awaiting to maximize concurrency
      const orderPromise = request
        .post('/api/orders-v4/create')
        .send(orderData);
        
      orderPromises.push(orderPromise);
    }

    // Wait for all rapid requests
    const responses = await Promise.all(orderPromises);
    const duration = Date.now() - startTime;

    console.log(`✅ All ${rapidRequests} rapid requests completed in ${duration}ms`);

    // Validate all requests succeeded
    responses.forEach((response, index) => {
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.order.order_number).toBeDefined();
    });

    // Extract and validate order numbers are unique
    const orderNumbers = responses.map(res => res.body.order.order_number);
    const uniqueOrderNumbers = new Set(orderNumbers);

    // CRITICAL ASSERTION: Zero race condition collisions
    expect(uniqueOrderNumbers.size).toBe(rapidRequests);
    console.log('✅ CRITICAL VALIDATION: DB sequence prevented all race conditions', {
      totalRequests: rapidRequests,
      uniqueOrders: uniqueOrderNumbers.size,
      duration: `${duration}ms`
    });

    // Validate sequential order number generation under rapid load
    const numberParts = orderNumbers.map(num => {
      const parts = num.split('-');
      return parseInt(parts[parts.length - 1]);
    });
    
    numberParts.sort((a, b) => a - b);
    
    // Verify continuous sequence (no gaps or duplicates)
    for (let i = 1; i < numberParts.length; i++) {
      expect(numberParts[i]).toBe(numberParts[i-1] + 1);
    }
    
    console.log('✅ CRITICAL VALIDATION: Atomic sequence generation maintained under rapid load');
  }, 15000);

  /**
   * CRITICAL TEST 5: Data Integrity Under Stress
   * Validates zero order mixing and data corruption under maximum concurrent load
   */
  it('should maintain data integrity with zero corruption under stress conditions', async () => {
    console.log('🧪 Testing data integrity under stress conditions...');
    
    const stressRequests = 8;
    const orderPromises: Promise<any>[] = [];
    
    // Create complex orders with multiple items for stress testing
    const generateStressOrderData = (index: number) => ({
      supplierId: testSupplier.id,
      warehouseId: testWarehouse.id,
      expectedDeliveryDate: new Date(Date.now() + (7 + index) * 24 * 60 * 60 * 1000).toISOString(),
      idempotencyKey: `stress-test-${index}-${crypto.randomBytes(8).toString('hex')}`,
      notes: `Stress test order #${index} with multiple items`,
      orderItems: [
        {
          productId: testProducts[index % testProducts.length].id,
          productName: testProducts[index % testProducts.length].name,
          quantity: 5 + index,
          unitPrice: testProducts[index % testProducts.length].unit_price,
          unit: testProducts[index % testProducts.length].unit || 'stk'
        },
        {
          productId: testProducts[(index + 1) % testProducts.length].id,
          productName: testProducts[(index + 1) % testProducts.length].name,
          quantity: 3 + index,
          unitPrice: testProducts[(index + 1) % testProducts.length].unit_price,
          unit: testProducts[(index + 1) % testProducts.length].unit || 'stk'
        }
      ]
    });

    // Launch stress test requests
    const startTime = Date.now();
    for (let i = 0; i < stressRequests; i++) {
      const orderData = generateStressOrderData(i);
      
      const orderPromise = request
        .post('/api/orders-v4/create')
        .send(orderData)
        .expect(201);
        
      orderPromises.push(orderPromise);
    }

    const responses = await Promise.all(orderPromises);
    const duration = Date.now() - startTime;

    console.log(`✅ All ${stressRequests} stress test orders completed in ${duration}ms`);

    // Comprehensive data integrity validation
    const client = await pool.connect();
    try {
      const orderIds = responses.map(res => res.body.order.id);
      
      // Validate each order's data integrity
      for (let i = 0; i < orderIds.length; i++) {
        const orderId = orderIds[i];
        const response = responses[i];
        const expectedData = generateStressOrderData(i);
        
        // Fetch order details from database
        const orderResult = await client.query(`
          SELECT o.*, COUNT(oi.id) as item_count, SUM(oi.total_price) as calculated_total
          FROM orders o
          LEFT JOIN order_items oi ON o.id = oi.order_id
          WHERE o.id = $1
          GROUP BY o.id
        `, [orderId]);
        
        const orderRecord = orderResult.rows[0];
        
        // Fetch order items
        const itemsResult = await client.query(`
          SELECT product_id, product_name, quantity, unit_price, total_price
          FROM order_items
          WHERE order_id = $1
          ORDER BY id
        `, [orderId]);
        
        const orderItems = itemsResult.rows;
        
        // CRITICAL VALIDATIONS
        expect(parseInt(orderRecord.item_count)).toBe(expectedData.orderItems.length);
        expect(orderItems).toHaveLength(expectedData.orderItems.length);
        
        // Validate each item matches expected data
        expectedData.orderItems.forEach((expectedItem, itemIndex) => {
          const actualItem = orderItems[itemIndex];
          expect(actualItem.product_id).toBe(expectedItem.productId);
          expect(actualItem.product_name).toBe(expectedItem.productName);
          expect(actualItem.quantity).toBe(expectedItem.quantity);
          expect(parseFloat(actualItem.unit_price)).toBeCloseTo(expectedItem.unitPrice, 2);
        });
        
        console.log(`✅ Order ${orderRecord.order_number} data integrity verified`);
      }
      
      console.log('✅ CRITICAL VALIDATION: Zero data corruption detected under stress');
      
    } finally {
      client.release();
    }

    // Performance validation under stress
    expect(duration).toBeLessThan(3000); // Allow slightly more time for stress test
    console.log('✅ Performance acceptable under stress conditions');
  }, 20000);
});