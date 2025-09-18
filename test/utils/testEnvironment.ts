/**
 * TEST ENVIRONMENT UTILITIES - Phase 1: Test Foundation
 * 
 * Manages test database, environment configuration, and cleanup
 * Critical for ephemeral test database setup and migration validation
 */

import { pool } from '../../server/db';
import { db } from '../../server/db';
import { sql } from 'drizzle-orm';

let isTestEnvironmentSetup = false;

/**
 * Setup test environment
 * - Verify test database connection
 * - Ensure schema migrations are applied
 * - Validate order_daily_counter sequence exists
 * - Verify UNIQUE constraints on orders.order_number
 */
export async function setupTestEnvironment(): Promise<void> {
  if (isTestEnvironmentSetup) {
    return;
  }

  try {
    console.log('🔧 Configuring test environment...');
    
    // Verify database connection
    const client = await pool.connect();
    console.log('✅ Test database connection established');
    
    // Verify critical schema components exist
    await verifyTestSchema(client);
    
    client.release();
    isTestEnvironmentSetup = true;
    console.log('✅ Test environment setup completed');
    
  } catch (error) {
    console.error('❌ Test environment setup failed:', error);
    throw error;
  }
}

/**
 * Verify test database schema
 * CRITICAL: Ensures order_daily_counter sequence and UNIQUE constraints exist
 */
async function verifyTestSchema(client: any): Promise<void> {
  try {
    // Check if order_daily_counter sequence exists
    const sequenceCheck = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.sequences 
      WHERE sequence_name = 'order_daily_counter'
    `);
    
    if (sequenceCheck.rows[0].count === '0') {
      console.log('⚠️  order_daily_counter sequence not found, creating...');
      await client.query('CREATE SEQUENCE IF NOT EXISTS order_daily_counter START 1');
      console.log('✅ order_daily_counter sequence created');
    } else {
      console.log('✅ order_daily_counter sequence verified');
    }
    
    // Check if orders table exists and has order_number UNIQUE constraint
    const ordersTableCheck = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_name = 'orders'
    `);
    
    if (ordersTableCheck.rows[0].count === '0') {
      console.log('⚠️  Orders table not found - may need to run migrations');
    } else {
      console.log('✅ Orders table verified');
      
      // Check for order_number unique constraint
      const uniqueConstraintCheck = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'orders' 
        AND kcu.column_name = 'order_number'
        AND tc.constraint_type = 'UNIQUE'
      `);
      
      if (uniqueConstraintCheck.rows[0].count === '0') {
        console.log('⚠️  order_number UNIQUE constraint not found');
      } else {
        console.log('✅ order_number UNIQUE constraint verified');
      }
    }
    
  } catch (error) {
    console.error('❌ Schema verification failed:', error);
    throw error;
  }
}

/**
 * Clean test database between tests
 * Removes test data while preserving schema
 */
export async function cleanTestDatabase(): Promise<void> {
  try {
    const client = await pool.connect();
    
    // Clean order-related tables in correct order (respecting foreign keys)
    await client.query('DELETE FROM order_items WHERE 1=1');
    await client.query('DELETE FROM orders WHERE 1=1');
    
    // Reset sequence to 1
    await client.query('SELECT setval(\'order_daily_counter\', 1, false)');
    
    client.release();
    console.log('🧹 Test database cleaned');
    
  } catch (error) {
    console.error('❌ Test database cleanup failed:', error);
    throw error;
  }
}

/**
 * Create test user for authentication tests
 * CRITICAL FIX: Now properly hashes passwords for E2E test compatibility
 */
export async function createTestUser(userData: {
  username: string;
  password: string;
  email?: string;
  role?: string;
  approved?: boolean;
}): Promise<{ id: number; username: string; role: string }> {
  try {
    // Import bcrypt for password hashing
    const bcrypt = await import('bcryptjs');
    
    const client = await pool.connect();
    
    // CRITICAL FIX: Hash password properly to match authentication system
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    console.log(`🔐 Hashing password for test user: ${userData.username}`);
    
    const result = await client.query(`
      INSERT INTO users (username, password, email, role, approved)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, role
    `, [
      userData.username,
      hashedPassword, // Now properly hashed for bcrypt.compare compatibility
      userData.email || null,
      userData.role || 'user',
      userData.approved || true
    ]);
    
    client.release();
    console.log(`✅ Test user created with hashed password: ${userData.username}`);
    
    return result.rows[0];
    
  } catch (error) {
    console.error('❌ Test user creation failed:', error);
    throw error;
  }
}

/**
 * Remove test users
 */
export async function cleanupTestUsers(): Promise<void> {
  try {
    const client = await pool.connect();
    
    // Remove test users (those with test_ prefix)
    await client.query('DELETE FROM users WHERE username LIKE \'test_%\'');
    
    client.release();
    console.log('🧹 Test users cleaned up');
    
  } catch (error) {
    console.error('❌ Test user cleanup failed:', error);
    // Don't throw here to allow other cleanup to continue
  }
}

/**
 * Cleanup test environment
 */
export async function cleanupTestEnvironment(): Promise<void> {
  try {
    await cleanTestDatabase();
    await cleanupTestUsers();
    
    // Close database connections
    await pool.end();
    console.log('✅ Test environment cleanup completed');
    
  } catch (error) {
    console.error('❌ Test environment cleanup failed:', error);
    throw error;
  }
}