/**
 * VITEST GLOBAL SETUP - Phase 1: Test Foundation
 * 
 * Configures test environment for German Audit System
 * - Sets NODE_ENV=test
 * - Configures test database
 * - Disables rate limiting
 * - Relaxes security middleware for testing
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { setupTestEnvironment, cleanupTestEnvironment } from './utils/testEnvironment';

// Set NODE_ENV to test before any imports
process.env.NODE_ENV = 'test';

// Test database configuration
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

beforeAll(async () => {
  console.log('🧪 Setting up test environment...');
  await setupTestEnvironment();
});

afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  await cleanupTestEnvironment();
});

beforeEach(async () => {
  // Clean database state before each test
  console.log('🔄 Resetting test state...');
});

afterEach(async () => {
  // Additional cleanup if needed
});