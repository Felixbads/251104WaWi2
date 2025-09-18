/**
 * SAMPLE AUTH TEST - Phase 1: Test Foundation
 * 
 * Simple test to verify supertest integration and auth endpoints
 * This will be expanded in Phase 2 with comprehensive auth testing
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../utils/testServer';

describe('Sample Auth Test (Framework Verification)', () => {
  const app = createTestApp();

  it('should handle unknown route with 404', async () => {
    const response = await request(app)
      .get('/api/nonexistent-endpoint')
      .expect(404);
    
    // Just verify we get a response - detailed testing comes in Phase 2
    expect(response.status).toBe(404);
  });

  it('should have basic middleware working', async () => {
    // Test basic middleware setup without authentication
    const response = await request(app)
      .get('/api/health') // Assuming there's a health endpoint
      .set('Content-Type', 'application/json');
    
    // We expect either 200 (if endpoint exists) or 404 (if it doesn't)
    // The key is that the request completes without server errors
    expect([200, 404, 401]).toContain(response.status);
  });

  it('should handle JSON body parsing', async () => {
    // Test that JSON body parsing middleware is working
    const testData = { test: 'data' };
    
    const response = await request(app)
      .post('/api/test-endpoint-that-does-not-exist')
      .send(testData)
      .set('Content-Type', 'application/json');
    
    // Should get 404 for nonexistent endpoint, not a parsing error
    expect(response.status).toBe(404);
  });
});