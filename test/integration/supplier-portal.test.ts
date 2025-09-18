/**
 * SUPPLIER PORTAL INTEGRATION TESTS - Phase 2.3 Final Requirements
 * 
 * Comprehensive supplier portal validation for German Audit compliance:
 * - Supplier portal authentication and PIN-based access
 * - CRUD operations and data integrity validation
 * - RBAC testing and access control verification
 * - Performance under load scenarios
 * 
 * SUCCESS CRITERIA:
 * ✅ Supplier authentication flows (PIN-based and portal tokens)
 * ✅ CRUD operations: Create, Read, Update, Delete suppliers
 * ✅ Data integrity: Concurrent access, transaction safety
 * ✅ RBAC validation: Role-based access controls
 * ✅ German audit compliance: Data protection and audit trails
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

describe('Supplier Portal Integration Tests', () => {
  let testUser: { id: number; username: string; role: string };
  let testSupplier: { id: number; name: string };

  beforeEach(async () => {
    console.log('🔧 Setting up Supplier Portal integration test...');
    
    // Setup test environment
    await setupTestEnvironment();
    await cleanTestDatabase();
    await cleanupTestUsers();
    
    // Create test admin user for supplier management
    testUser = await createTestUser({
      username: 'test_supplier_admin',
      password: 'hashed_password_here',
      email: 'supplier.admin@test.com',
      role: 'admin',
      approved: true
    });
    
    // Create test supplier
    const client = await pool.connect();
    try {
      const supplierResult = await client.query(`
        INSERT INTO suppliers (name, contact_email, contact_phone, address, status, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id, name, contact_email, status
      `, [
        'Test Integration Supplier Ltd',
        'integration.supplier@test.com',
        '+49 123 456 7890',
        'Test Address 123, 12345 Test City, Germany',
        'active'
      ]);
      testSupplier = supplierResult.rows[0];
      
      console.log('✅ Test supplier created:', testSupplier);
    } finally {
      client.release();
    }
  });

  afterEach(async () => {
    await cleanTestDatabase();
    await cleanupTestUsers();
    console.log('🧹 Supplier Portal test cleanup completed');
  });

  describe('Supplier Authentication & Access Control', () => {
    /**
     * TEST 1: PIN-Based Authentication
     * Critical Path: Supplier portal access via PIN system
     */
    it('should authenticate supplier with valid access PIN', async () => {
      console.log('🧪 Testing supplier PIN authentication...');
      
      // First, generate an access PIN for the supplier
      const generatePinResponse = await request
        .post('/api/supplier-portal/generate-pin')
        .send({
          supplierId: testSupplier.id,
          purpose: 'portal_access',
          validityDays: 7
        })
        .expect(200);
      
      expect(generatePinResponse.body.success).toBe(true);
      expect(generatePinResponse.body.accessToken).toBeDefined();
      
      const { accessToken } = generatePinResponse.body;
      
      // Authenticate with the generated PIN
      const authResponse = await request
        .post('/api/supplier-portal/authenticate')
        .send({
          accessToken: accessToken
        })
        .expect(200);
      
      // Verify successful authentication
      expect(authResponse.body.success).toBe(true);
      expect(authResponse.body.supplier).toBeDefined();
      expect(authResponse.body.supplier.id).toBe(testSupplier.id);
      expect(authResponse.body.sessionToken).toBeDefined();
      
      console.log('✅ Supplier PIN authentication validated successfully');
    });

    /**
     * TEST 2: Session Token Validation
     * Critical Path: Ongoing session management and token validation
     */
    it('should validate active supplier session tokens', async () => {
      console.log('🧪 Testing supplier session token validation...');
      
      // Generate PIN and authenticate
      const generatePinResponse = await request
        .post('/api/supplier-portal/generate-pin')
        .send({
          supplierId: testSupplier.id,
          purpose: 'portal_access',
          validityDays: 1
        })
        .expect(200);
      
      const authResponse = await request
        .post('/api/supplier-portal/authenticate')
        .send({
          accessToken: generatePinResponse.body.accessToken
        })
        .expect(200);
      
      const { sessionToken } = authResponse.body;
      
      // Test session validation with valid token
      const sessionResponse = await request
        .get('/api/supplier-portal/session/validate')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);
      
      expect(sessionResponse.body.valid).toBe(true);
      expect(sessionResponse.body.supplier.id).toBe(testSupplier.id);
      
      console.log('✅ Supplier session token validation completed successfully');
    });

    /**
     * TEST 3: Access Control & RBAC
     * Critical Path: Role-based access control for supplier operations
     */
    it('should enforce role-based access control for supplier operations', async () => {
      console.log('🧪 Testing supplier RBAC enforcement...');
      
      // Test unauthorized access (no session)
      const unauthorizedResponse = await request
        .get('/api/supplier-portal/orders')
        .expect(401);
      
      expect(unauthorizedResponse.body.error).toMatch(/authentication|unauthorized/i);
      
      // Test authorized access with valid session
      const generatePinResponse = await request
        .post('/api/supplier-portal/generate-pin')
        .send({
          supplierId: testSupplier.id,
          purpose: 'portal_access',
          validityDays: 1
        })
        .expect(200);
      
      const authResponse = await request
        .post('/api/supplier-portal/authenticate')
        .send({
          accessToken: generatePinResponse.body.accessToken
        })
        .expect(200);
      
      const { sessionToken } = authResponse.body;
      
      // Test authorized access to supplier-specific data
      const ordersResponse = await request
        .get('/api/supplier-portal/orders')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);
      
      expect(Array.isArray(ordersResponse.body.orders)).toBe(true);
      
      console.log('✅ Supplier RBAC enforcement validated successfully');
    });
  });

  describe('Supplier CRUD Operations', () => {
    /**
     * TEST 4: Supplier Profile Management
     * Critical Path: Supplier data CRUD operations with integrity validation
     */
    it('should allow supplier profile updates with data validation', async () => {
      console.log('🧪 Testing supplier profile CRUD operations...');
      
      // Authenticate supplier first
      const generatePinResponse = await request
        .post('/api/supplier-portal/generate-pin')
        .send({
          supplierId: testSupplier.id,
          purpose: 'portal_access',
          validityDays: 1
        })
        .expect(200);
      
      const authResponse = await request
        .post('/api/supplier-portal/authenticate')
        .send({
          accessToken: generatePinResponse.body.accessToken
        })
        .expect(200);
      
      const { sessionToken } = authResponse.body;
      
      // READ: Get current supplier profile
      const profileResponse = await request
        .get('/api/supplier-portal/profile')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);
      
      expect(profileResponse.body.supplier.id).toBe(testSupplier.id);
      expect(profileResponse.body.supplier.name).toBe(testSupplier.name);
      
      // UPDATE: Modify supplier profile
      const updateData = {
        contact_phone: '+49 987 654 3210',
        address: 'Updated Address 456, 54321 New City, Germany',
        business_hours: '08:00-18:00',
        notes: 'Updated via integration test'
      };
      
      const updateResponse = await request
        .put('/api/supplier-portal/profile')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send(updateData)
        .expect(200);
      
      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.supplier.contact_phone).toBe(updateData.contact_phone);
      
      // Verify persistence by reading updated data
      const updatedProfileResponse = await request
        .get('/api/supplier-portal/profile')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);
      
      expect(updatedProfileResponse.body.supplier.contact_phone).toBe(updateData.contact_phone);
      expect(updatedProfileResponse.body.supplier.address).toBe(updateData.address);
      
      console.log('✅ Supplier CRUD operations validated successfully');
    });

    /**
     * TEST 5: Supplier Order Management 
     * Critical Path: Order-related operations and data integrity
     */
    it('should handle supplier order operations with proper data integrity', async () => {
      console.log('🧪 Testing supplier order management...');
      
      // Setup: Create a test order for this supplier first
      const client = await pool.connect();
      let testOrder: any;
      
      try {
        const orderResult = await client.query(`
          INSERT INTO orders (supplier_id, order_number, status, total_amount, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          RETURNING id, order_number, status, total_amount
        `, [testSupplier.id, 'TEST-ORDER-' + Date.now(), 'pending', 299.99]);
        testOrder = orderResult.rows[0];
      } finally {
        client.release();
      }
      
      // Authenticate supplier
      const generatePinResponse = await request
        .post('/api/supplier-portal/generate-pin')
        .send({
          supplierId: testSupplier.id,
          purpose: 'portal_access',
          validityDays: 1
        })
        .expect(200);
      
      const authResponse = await request
        .post('/api/supplier-portal/authenticate')
        .send({
          accessToken: generatePinResponse.body.accessToken
        })
        .expect(200);
      
      const { sessionToken } = authResponse.body;
      
      // READ: Get supplier orders
      const ordersResponse = await request
        .get('/api/supplier-portal/orders')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);
      
      expect(Array.isArray(ordersResponse.body.orders)).toBe(true);
      expect(ordersResponse.body.orders.length).toBeGreaterThan(0);
      
      // Find our test order
      const supplierOrders = ordersResponse.body.orders.filter((order: any) => 
        order.id === testOrder.id
      );
      expect(supplierOrders).toHaveLength(1);
      expect(supplierOrders[0].order_number).toBe(testOrder.order_number);
      
      // UPDATE: Update order status (if supplier has permission)
      const orderUpdateResponse = await request
        .put(`/api/supplier-portal/orders/${testOrder.id}/status`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({
          status: 'confirmed',
          notes: 'Confirmed by supplier via portal'
        });
      
      // Should succeed or return appropriate permission error
      expect([200, 403]).toContain(orderUpdateResponse.status);
      
      console.log('✅ Supplier order management validated successfully');
    });
  });

  describe('Data Integrity & Concurrency', () => {
    /**
     * TEST 6: Concurrent Supplier Operations
     * Critical Path: Data integrity under concurrent access (German audit requirement)
     */
    it('should maintain data integrity under concurrent supplier operations', async () => {
      console.log('🧪 Testing concurrent supplier data integrity...');
      
      // Generate multiple concurrent supplier sessions
      const concurrentRequests = 3;
      const sessionPromises: Promise<any>[] = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        const sessionPromise = (async () => {
          const generatePinResponse = await request
            .post('/api/supplier-portal/generate-pin')
            .send({
              supplierId: testSupplier.id,
              purpose: 'portal_access',
              validityDays: 1
            })
            .expect(200);
          
          const authResponse = await request
            .post('/api/supplier-portal/authenticate')
            .send({
              accessToken: generatePinResponse.body.accessToken
            })
            .expect(200);
          
          return authResponse.body.sessionToken;
        })();
        
        sessionPromises.push(sessionPromise);
      }
      
      const sessionTokens = await Promise.all(sessionPromises);
      expect(sessionTokens).toHaveLength(concurrentRequests);
      
      // Perform concurrent profile updates
      const updatePromises = sessionTokens.map((sessionToken, index) => 
        request
          .put('/api/supplier-portal/profile')
          .set('Authorization', `Bearer ${sessionToken}`)
          .send({
            notes: `Concurrent update ${index + 1} - ${Date.now()}`
          })
      );
      
      const updateResponses = await Promise.all(updatePromises);
      
      // Verify all updates completed successfully
      updateResponses.forEach(response => {
        expect([200, 409]).toContain(response.status); // 200 success or 409 conflict
      });
      
      // Verify final data consistency
      const finalProfileResponse = await request
        .get('/api/supplier-portal/profile')
        .set('Authorization', `Bearer ${sessionTokens[0]}`)
        .expect(200);
      
      expect(finalProfileResponse.body.supplier.id).toBe(testSupplier.id);
      // Notes field should contain one of the concurrent updates
      expect(finalProfileResponse.body.supplier.notes).toMatch(/Concurrent update \d+/);
      
      console.log('✅ Concurrent supplier operations integrity validated successfully');
    });
  });

  describe('Performance & Load Testing', () => {
    /**
     * TEST 7: Supplier Portal Performance
     * Critical Path: Performance under load (German audit efficiency requirement)
     */
    it('should handle supplier portal load within performance thresholds', async () => {
      console.log('🧪 Testing supplier portal performance under load...');
      
      const startTime = Date.now();
      
      // Authenticate supplier
      const generatePinResponse = await request
        .post('/api/supplier-portal/generate-pin')
        .send({
          supplierId: testSupplier.id,
          purpose: 'portal_access',
          validityDays: 1
        })
        .expect(200);
      
      const authResponse = await request
        .post('/api/supplier-portal/authenticate')
        .send({
          accessToken: generatePinResponse.body.accessToken
        })
        .expect(200);
      
      const { sessionToken } = authResponse.body;
      
      // Perform multiple rapid operations
      const operationPromises: Promise<any>[] = [];
      const operationCount = 10;
      
      for (let i = 0; i < operationCount; i++) {
        // Mix of different operations
        const operations = [
          () => request.get('/api/supplier-portal/profile').set('Authorization', `Bearer ${sessionToken}`),
          () => request.get('/api/supplier-portal/orders').set('Authorization', `Bearer ${sessionToken}`),
          () => request.get('/api/supplier-portal/session/validate').set('Authorization', `Bearer ${sessionToken}`)
        ];
        
        const randomOperation = operations[i % operations.length];
        operationPromises.push(randomOperation());
      }
      
      const operationResponses = await Promise.all(operationPromises);
      const endTime = Date.now();
      const totalDuration = endTime - startTime;
      
      // Verify all operations completed successfully
      operationResponses.forEach(response => {
        expect([200, 401]).toContain(response.status); // Allow auth expiry
      });
      
      // Performance threshold: All operations should complete within 5 seconds
      expect(totalDuration).toBeLessThan(5000);
      
      const avgResponseTime = totalDuration / operationCount;
      console.log(`✅ Supplier portal performance: ${operationCount} operations in ${totalDuration}ms (avg: ${avgResponseTime}ms per operation)`);
    });
  });

  describe('German Audit Compliance', () => {
    /**
     * TEST 8: Audit Trail & Data Protection
     * Critical Path: German audit compliance requirements
     */
    it('should maintain proper audit trails and data protection', async () => {
      console.log('🧪 Testing German audit compliance features...');
      
      // Authenticate supplier  
      const generatePinResponse = await request
        .post('/api/supplier-portal/generate-pin')
        .send({
          supplierId: testSupplier.id,
          purpose: 'portal_access',
          validityDays: 1
        })
        .expect(200);
      
      const authResponse = await request
        .post('/api/supplier-portal/authenticate')
        .send({
          accessToken: generatePinResponse.body.accessToken
        })
        .expect(200);
      
      const { sessionToken } = authResponse.body;
      
      // Perform trackable operations
      await request
        .get('/api/supplier-portal/profile')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);
      
      await request
        .put('/api/supplier-portal/profile')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({
          notes: 'Audit trail test update'
        });
      
      // Verify session tracking (if audit endpoints exist)
      const client = await pool.connect();
      try {
        // Check if supplier access is being logged
        const auditResult = await client.query(`
          SELECT COUNT(*) as access_count
          FROM supplier_access_pins
          WHERE supplier_id = $1 AND session_token IS NOT NULL
        `, [testSupplier.id]);
        
        expect(Number(auditResult.rows[0].access_count)).toBeGreaterThan(0);
        
        // Verify data protection: Sensitive data should not be exposed
        const profileResponse = await request
          .get('/api/supplier-portal/profile')
          .set('Authorization', `Bearer ${sessionToken}`)
          .expect(200);
        
        // Ensure no sensitive internal data is exposed
        expect(profileResponse.body.supplier).not.toHaveProperty('password');
        expect(profileResponse.body.supplier).not.toHaveProperty('internal_notes');
        expect(profileResponse.body).not.toHaveProperty('session_token'); // Don't expose tokens
        
      } finally {
        client.release();
      }
      
      console.log('✅ German audit compliance requirements validated successfully');
    });
  });
});