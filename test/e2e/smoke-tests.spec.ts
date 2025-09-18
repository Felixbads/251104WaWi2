/**
 * SMOKE E2E TESTS - Phase 2.3 Final Requirements
 * 
 * Minimal critical user journey validation for German Audit compliance
 * 
 * SUCCESS CRITERIA:
 * ✅ Login flow validation
 * ✅ Order creation happy path  
 * ✅ Success verification (toast/details)
 * 
 * Performance Target: <2s per test for CI efficiency
 */

import { test, expect } from '@playwright/test';
import { setupTestEnvironment, cleanTestDatabase, createTestUser, cleanupTestUsers } from '../utils/testEnvironment';

test.describe('Smoke Tests - Critical User Journeys', () => {
  
  test.beforeEach(async ({ page }) => {
    console.log('🔧 Setting up test environment for E2E smoke tests...');
    
    // Setup clean test environment
    await setupTestEnvironment();
    await cleanTestDatabase();
    await cleanupTestUsers();
    
    // Create test user for authentication
    // CRITICAL FIX: Use the same password that will be used in login tests
    await createTestUser({
      username: 'e2e_test_user',
      password: 'test_password_123', // Now matches login attempt - will be hashed by createTestUser
      email: 'e2e.test@example.com',
      role: 'admin',
      approved: true
    });

    console.log('✅ E2E test environment setup completed');
    
    // Navigate to login page
    await page.goto('/login');
  });

  test.afterEach(async () => {
    await cleanTestDatabase();
    await cleanupTestUsers();
    console.log('🧹 E2E test cleanup completed');
  });

  /**
   * SMOKE TEST 1: Login Flow Validation
   * Critical Path: User authentication and session establishment
   */
  test('should successfully login with valid credentials', async ({ page }) => {
    console.log('🧪 Testing login flow...');
    
    // Wait for login form to be visible
    await expect(page.locator('form')).toBeVisible();
    
    // CRITICAL FIX: Expand developer mode section to access login form
    await page.click('details summary:has-text("Entwicklermodus")');
    await page.waitForSelector('#username', { state: 'visible' });
    
    // Fill login form
    await page.fill('[data-testid="input-username"], input[name="username"], #username', 'e2e_test_user');
    await page.fill('[data-testid="input-password"], input[name="password"], #password', 'test_password_123');
    
    // Submit login form
    await page.click('[data-testid="button-login"], button[type="submit"], button:has-text("Anmelden")');
    
    // Verify successful login - should redirect to dashboard or main page
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    
    // Verify user is authenticated by checking for user-specific content
    await expect(page.locator('[data-testid="user-menu"], .user-menu, nav')).toBeVisible();
    
    console.log('✅ Login flow validated successfully');
  });

  /**
   * SMOKE TEST 2: Order Creation Happy Path
   * Critical Path: New order creation with success verification
   */
  test('should successfully create a new order', async ({ page }) => {
    console.log('🧪 Testing order creation flow...');
    
    // First login (reuse login logic)
    await page.fill('[data-testid="input-username"], input[name="username"], #username', 'e2e_test_user');
    await page.fill('[data-testid="input-password"], input[name="password"], #password', 'test_password_123');
    await page.click('[data-testid="button-login"], button[type="submit"], button:has-text("Anmelden")');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    
    // Navigate to order creation page
    await page.goto('/orders/new');
    await expect(page.locator('form, [data-testid="order-form"]')).toBeVisible();
    
    // Fill order form with minimum required fields
    // Note: Actual selectors may need adjustment based on real form structure
    await page.selectOption('[data-testid="select-supplier"], select[name="supplier"]', { index: 1 });
    await page.selectOption('[data-testid="select-warehouse"], select[name="warehouse"]', { index: 1 });
    
    // Add expected delivery date (7 days from now)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const dateString = futureDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    await page.fill('[data-testid="input-delivery-date"], input[name="expectedDeliveryDate"]', dateString);
    
    // Add at least one order item
    await page.click('[data-testid="button-add-item"], button:has-text("Artikel hinzufügen")');
    await page.selectOption('[data-testid="select-product"], select[name="product"]', { index: 1 });
    await page.fill('[data-testid="input-quantity"], input[name="quantity"]', '10');
    
    // Submit order
    await page.click('[data-testid="button-submit-order"], button[type="submit"], button:has-text("Bestellung erstellen")');
    
    // Verify success - check for success toast or redirect to order details
    await expect(page.locator('[data-testid="toast-success"], .toast-success, [role="alert"]')).toBeVisible({ timeout: 5000 });
    
    // Alternative: Check for redirect to order details/list page
    await page.waitForURL('**/orders/**', { timeout: 5000 });
    
    console.log('✅ Order creation flow validated successfully');
  });

  /**
   * SMOKE TEST 3: Success Verification & Navigation
   * Critical Path: Success states and order details display
   */
  test('should display order details and success states correctly', async ({ page }) => {
    console.log('🧪 Testing success verification and order details...');
    
    // Login first
    await page.fill('[data-testid="input-username"], input[name="username"], #username', 'e2e_test_user');
    await page.fill('[data-testid="input-password"], input[name="password"], #password', 'test_password_123');
    await page.click('[data-testid="button-login"], button[type="submit"], button:has-text("Anmelden")');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    
    // Navigate to orders overview to see existing orders
    await page.goto('/orders');
    await expect(page.locator('[data-testid="orders-table"], .orders-table, table')).toBeVisible();
    
    // Check that orders are displayed
    const orderRows = page.locator('[data-testid="order-row"], tbody tr, .order-item');
    await expect(orderRows.first()).toBeVisible({ timeout: 5000 });
    
    // Click on first order to view details
    await orderRows.first().click();
    
    // Verify order details page loads with essential information
    await expect(page.locator('[data-testid="order-details"], .order-details')).toBeVisible();
    await expect(page.locator('[data-testid="order-number"], .order-number')).toBeVisible();
    await expect(page.locator('[data-testid="order-status"], .order-status')).toBeVisible();
    
    // Verify navigation breadcrumb or back functionality
    const backButton = page.locator('[data-testid="button-back"], button:has-text("Zurück")');
    if (await backButton.isVisible()) {
      await backButton.click();
      await page.waitForURL('**/orders');
    }
    
    console.log('✅ Success verification and navigation validated successfully');
  });
});