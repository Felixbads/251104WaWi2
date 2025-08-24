/**
 * Jest Smoke Tests for Vendon Mapping Functions
 * Based on the German implementation plan
 */

import { mapVendonTransaction, mapVendonTransactionsBatch, analyzeMappingCoverage } from '../server/services/enhancedVendonMapping';
import type { VendonTransaction } from '../server/services/enhancedVendonMapping';

describe('Vendon Mapping Functions', () => {
  // Sample Vendon API transaction data for testing
  const sampleVendonTransaction: VendonTransaction = {
    id: 'tx_123456789',
    datetime: '2024-01-15 14:30:25',
    machine_id: 'machine_001',
    machine_name: 'Automat Eingang Nord',
    location_id: 'loc_001',
    location_name: 'Bürogebäude A',
    product_id: 'prod_coca_cola_0_5l',
    product_name: 'Coca Cola 0,5L',
    product_price: 150, // 1.50 EUR in cents
    product_cost: 80,   // 0.80 EUR in cents
    quantity: 1,
    total_amount: 150,
    payment_method: 'CASHLESS',
    transaction_type: 'sale',
    currency: 'EUR',
    status: 'completed',
    
    // NEW FIELDS - Main focus of the enhancement
    temperature: 22.5,
    humidity: 45,
    machine_status: 'operational',
    error_code: null,
    maintenance_flag: true,
    
    // Additional fields
    selection: 3,
    vat: 19,
    customer_id: null,
    session_id: 'session_789',
    is_test: false
  };

  describe('mapVendonTransaction', () => {
    it('should map all new fields correctly', () => {
      const result = mapVendonTransaction(sampleVendonTransaction);

      // Test core identification
      expect(result.vendonId).toBe('tx_123456789');
      expect(result.datetime).toBe('2024-01-15 14:30:25+01:00');

      // Test price conversions (cents to euros)
      expect(result.price).toBe(1.5);
      expect(result.totalCost).toBe(0.8);

      // Test NEW FIELDS - main focus of this implementation
      expect(result.temperature).toBe(22.5);
      expect(result.humidity).toBe(45);
      expect(result.machineStatus).toBe('operational');
      expect(result.errorCode).toBeNull();
      expect(result.maintenanceFlag).toBe(true);

      // Test payment method normalization
      expect(result.paymentMethod).toBe('card'); // CASHLESS -> card

      // Test default values
      expect(result.quantity).toBe(1);
      expect(result.currency).toBe('EUR');
      expect(result.status).toBe('completed');
      expect(result.source).toBe('vendon');
      expect(result.isTest).toBe(false);
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalTransaction: VendonTransaction = {
        id: 'tx_minimal',
        datetime: '2024-01-15 10:00:00'
      };

      const result = mapVendonTransaction(minimalTransaction);

      expect(result.vendonId).toBe('tx_minimal');
      expect(result.temperature).toBeNull();
      expect(result.humidity).toBeNull();
      expect(result.machineStatus).toBeNull();
      expect(result.errorCode).toBeNull();
      expect(result.maintenanceFlag).toBe(false);
      expect(result.price).toBe(0);
      expect(result.quantity).toBe(1);
    });

    it('should normalize machine status values correctly', () => {
      const testCases = [
        { input: 'OK', expected: 'operational' },
        { input: 'online', expected: 'operational' },
        { input: 'MAINTENANCE', expected: 'maintenance' },
        { input: 'error', expected: 'error' },
        { input: 'offline', expected: 'offline' },
        { input: 'custom_status', expected: 'custom_status' },
        { input: null, expected: null }
      ];

      testCases.forEach(({ input, expected }) => {
        const tx = { ...sampleVendonTransaction, machine_status: input };
        const result = mapVendonTransaction(tx);
        expect(result.machineStatus).toBe(expected);
      });
    });

    it('should normalize payment methods correctly', () => {
      const testCases = [
        { input: 'CASH', expected: 'cash' },
        { input: 'cashless', expected: 'card' },
        { input: 'CARD', expected: 'card' },
        { input: 'mobile', expected: 'mobile' },
        { input: 'voucher', expected: 'voucher' },
        { input: 'unknown_method', expected: 'unknown_method' }
      ];

      testCases.forEach(({ input, expected }) => {
        const tx = { ...sampleVendonTransaction, payment_method: input };
        const result = mapVendonTransaction(tx);
        expect(result.paymentMethod).toBe(expected);
      });
    });

    it('should handle temperature and humidity as numbers only', () => {
      const testCases = [
        { temp: 25.5, humidity: 60, expectedTemp: 25.5, expectedHumidity: 60 },
        { temp: 0, humidity: 0, expectedTemp: 0, expectedHumidity: 0 },
        { temp: null, humidity: null, expectedTemp: null, expectedHumidity: null },
        { temp: undefined, humidity: undefined, expectedTemp: null, expectedHumidity: null },
        { temp: 'invalid', humidity: 'invalid', expectedTemp: null, expectedHumidity: null }
      ];

      testCases.forEach(({ temp, humidity, expectedTemp, expectedHumidity }) => {
        const tx = { 
          ...sampleVendonTransaction, 
          temperature: temp as any, 
          humidity: humidity as any 
        };
        const result = mapVendonTransaction(tx);
        expect(result.temperature).toBe(expectedTemp);
        expect(result.humidity).toBe(expectedHumidity);
      });
    });

    it('should require id and datetime fields', () => {
      expect(() => {
        mapVendonTransaction({ id: '', datetime: '2024-01-15 10:00:00' });
      }).toThrow('Transaction ID is required');

      expect(() => {
        mapVendonTransaction({ id: 'tx_123', datetime: '' });
      }).toThrow('Transaction datetime is required');
    });

    it('should convert cents to euros correctly', () => {
      const tx = {
        ...sampleVendonTransaction,
        product_price: 250,      // 2.50 EUR
        product_cost: 125,       // 1.25 EUR
        total_amount: 500,       // 5.00 EUR
        discount_amount: 50      // 0.50 EUR
      };

      const result = mapVendonTransaction(tx);

      expect(result.price).toBe(2.5);
      expect(result.totalCost).toBe(1.25);
      expect(result.amount).toBe(5.0);
      expect(result.discountAmount).toBe(0.5);
    });
  });

  describe('mapVendonTransactionsBatch', () => {
    it('should map multiple transactions successfully', () => {
      const transactions = [
        { ...sampleVendonTransaction, id: 'tx_1' },
        { ...sampleVendonTransaction, id: 'tx_2', temperature: 18.5 },
        { ...sampleVendonTransaction, id: 'tx_3', machine_status: 'error' }
      ];

      const results = mapVendonTransactionsBatch(transactions);

      expect(results).toHaveLength(3);
      expect(results[0].vendonId).toBe('tx_1');
      expect(results[1].vendonId).toBe('tx_2');
      expect(results[1].temperature).toBe(18.5);
      expect(results[2].machineStatus).toBe('error');
    });

    it('should handle mapping errors gracefully', () => {
      const transactions = [
        { ...sampleVendonTransaction, id: 'tx_valid' },
        { ...sampleVendonTransaction, id: '', datetime: '2024-01-15 10:00:00' }, // Invalid: empty ID
        { ...sampleVendonTransaction, id: 'tx_valid_2' }
      ];

      const results = mapVendonTransactionsBatch(transactions);

      // Should get 2 valid results, 1 error should be logged but not included
      expect(results).toHaveLength(2);
      expect(results[0].vendonId).toBe('tx_valid');
      expect(results[1].vendonId).toBe('tx_valid_2');
    });
  });

  describe('analyzeMappingCoverage', () => {
    it('should analyze field coverage correctly', () => {
      const analysis = analyzeMappingCoverage(sampleVendonTransaction);

      expect(analysis.mappedFields).toContain('id');
      expect(analysis.mappedFields).toContain('datetime');
      expect(analysis.mappedFields).toContain('temperature');
      expect(analysis.mappedFields).toContain('humidity');
      expect(analysis.mappedFields).toContain('machine_status');
      expect(analysis.mappedFields).toContain('error_code');
      expect(analysis.mappedFields).toContain('maintenance_flag');

      expect(analysis.coveragePercentage).toBeGreaterThan(80);
      expect(typeof analysis.coveragePercentage).toBe('number');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle timezone conversion correctly', () => {
      const result = mapVendonTransaction({
        ...sampleVendonTransaction,
        datetime: '2024-12-25 23:59:59'
      });

      expect(result.datetime).toBe('2024-12-25 23:59:59+01:00');
    });

    it('should handle boolean maintenance_flag correctly', () => {
      const testCases = [
        { input: true, expected: true },
        { input: false, expected: false },
        { input: null, expected: false },
        { input: undefined, expected: false }
      ];

      testCases.forEach(({ input, expected }) => {
        const tx = { ...sampleVendonTransaction, maintenance_flag: input };
        const result = mapVendonTransaction(tx);
        expect(result.maintenanceFlag).toBe(expected);
      });
    });

    it('should handle various error_code formats', () => {
      const testCases = [
        { input: 'ERR_001', expected: 'ERR_001' },
        { input: '404', expected: '404' },
        { input: '', expected: null },
        { input: null, expected: null },
        { input: undefined, expected: null }
      ];

      testCases.forEach(({ input, expected }) => {
        const tx = { ...sampleVendonTransaction, error_code: input };
        const result = mapVendonTransaction(tx);
        expect(result.errorCode).toBe(expected);
      });
    });
  });
});