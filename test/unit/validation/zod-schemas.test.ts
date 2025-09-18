/**
 * ZOD VALIDATION SCHEMAS UNIT TESTS - Phase 2: Auth/Security/Zod Testing
 * 
 * Comprehensive testing for Zod validation schemas:
 * - orderValidationSchema: type coercion, orderNumber exclusion, unitPrice string→number
 * - Field validation, edge cases, error handling
 * - Data transformation and sanitization
 * 
 * Target: >80% coverage on validation schemas
 */

import { describe, it, expect } from 'vitest';
import { orderValidationSchema } from '../../../shared/schema';
import { ZodError } from 'zod';

describe('Zod Validation Schemas', () => {
  describe('orderValidationSchema', () => {
    describe('Valid Order Data', () => {
      it('should validate complete valid order', () => {
        const validOrder = {
          idempotencyKey: 'test-key-123',
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 5,
              unitPrice: '10.50' // String that should convert to number
            }
          ],
          expectedDeliveryDate: '2025-12-31',
          notes: 'Test order notes'
        };

        const result = orderValidationSchema.parse(validOrder);

        // Verify core required fields and type coercion
        expect(result.idempotencyKey).toBe('test-key-123');
        expect(result.supplierId).toBe(1);
        expect(result.warehouseId).toBe(2);
        expect(result.orderItems).toHaveLength(1);
        expect(result.orderItems[0].productId).toBe(100);
        expect(result.orderItems[0].unitPrice).toBe(10.50); // String converted to number
        expect(result.expectedDeliveryDate).toBe('2025-12-31');
        expect(result.notes).toBe('Test order notes');
        
        // Allow additional fields that the schema may add (status, unit, etc.)
        expect(typeof result).toBe('object');
      });

      it('should validate minimal valid order without optional fields', () => {
        const minimalOrder = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '5.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        const result = orderValidationSchema.parse(minimalOrder);

        expect(result.supplierId).toBe(1);
        expect(result.warehouseId).toBe(2);
        expect(result.orderItems[0].unitPrice).toBe(5.00);
        expect(result.notes).toBeUndefined();
        expect(result.idempotencyKey).toBeUndefined();
      });

      it('should handle multiple order items with different data types', () => {
        const orderWithMultipleItems = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Product A',
              quantity: 1,
              unitPrice: '10.99' // String
            },
            {
              productId: 200,
              productName: 'Product B',
              quantity: 3,
              unitPrice: 15.50 // Number
            },
            {
              productId: 300,
              productName: 'Product C',
              quantity: 2,
              unitPrice: '0' // Zero string
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        const result = orderValidationSchema.parse(orderWithMultipleItems);

        expect(result.orderItems).toHaveLength(3);
        expect(result.orderItems[0].unitPrice).toBe(10.99);
        expect(result.orderItems[1].unitPrice).toBe(15.50);
        expect(result.orderItems[2].unitPrice).toBe(0);
      });
    });

    describe('Type Coercion - Critical Feature', () => {
      it('should convert string unitPrice to number', () => {
        const order = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '25.99' // String input
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        const result = orderValidationSchema.parse(order);

        expect(typeof result.orderItems[0].unitPrice).toBe('number');
        expect(result.orderItems[0].unitPrice).toBe(25.99);
      });

      it('should handle integer strings correctly', () => {
        const order = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '42' // Integer string
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        const result = orderValidationSchema.parse(order);

        expect(result.orderItems[0].unitPrice).toBe(42);
      });

      it('should handle zero values correctly', () => {
        const order = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Free Product',
              quantity: 1,
              unitPrice: '0.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        const result = orderValidationSchema.parse(order);

        expect(result.orderItems[0].unitPrice).toBe(0);
      });

      it('should convert string supplierId and warehouseId to numbers', () => {
        const order = {
          supplierId: '123', // String input
          warehouseId: '456', // String input
          orderItems: [
            {
              productId: '789', // String input
              productName: 'Test Product',
              quantity: '2', // String input
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        const result = orderValidationSchema.parse(order);

        expect(typeof result.supplierId).toBe('number');
        expect(typeof result.warehouseId).toBe('number');
        expect(typeof result.orderItems[0].productId).toBe('number');
        expect(typeof result.orderItems[0].quantity).toBe('number');
        expect(result.supplierId).toBe(123);
        expect(result.warehouseId).toBe(456);
        expect(result.orderItems[0].productId).toBe(789);
        expect(result.orderItems[0].quantity).toBe(2);
      });
    });

    describe('Field Exclusions - Security Feature', () => {
      it('should NOT include orderNumber field in schema (excluded by design)', () => {
        // orderNumber should be generated by the API, not provided by client
        const orderWithForbiddenField = {
          supplierId: 1,
          warehouseId: 2,
          orderNumber: 'ORD-20251231-001', // This should be ignored/stripped
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        const result = orderValidationSchema.parse(orderWithForbiddenField);

        // orderNumber should not exist in parsed result
        expect(result).not.toHaveProperty('orderNumber');
        expect((result as any).orderNumber).toBeUndefined();
      });

      it('should NOT include id field (generated by database)', () => {
        const orderWithId = {
          id: 999, // Should be ignored
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        const result = orderValidationSchema.parse(orderWithId);

        expect(result).not.toHaveProperty('id');
        expect((result as any).id).toBeUndefined();
      });

      it('should NOT include timestamps (auto-generated)', () => {
        const orderWithTimestamps = {
          supplierId: 1,
          warehouseId: 2,
          createdAt: '2025-01-01T00:00:00Z', // Should be ignored
          updatedAt: '2025-01-01T00:00:00Z', // Should be ignored
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        const result = orderValidationSchema.parse(orderWithTimestamps);

        expect(result).not.toHaveProperty('createdAt');
        expect(result).not.toHaveProperty('updatedAt');
      });
    });

    describe('Validation Errors - Edge Cases', () => {
      it('should reject order without required supplierId', () => {
        const invalidOrder = {
          // supplierId missing
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        expect(() => orderValidationSchema.parse(invalidOrder)).toThrow(ZodError);

        try {
          orderValidationSchema.parse(invalidOrder);
        } catch (error) {
          expect(error).toBeInstanceOf(ZodError);
          const zodError = error as ZodError;
          expect(zodError.errors.some(e => e.path.includes('supplierId'))).toBe(true);
        }
      });

      it('should reject order without required warehouseId', () => {
        const invalidOrder = {
          supplierId: 1,
          // warehouseId missing
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        expect(() => orderValidationSchema.parse(invalidOrder)).toThrow(ZodError);
      });

      it('should reject order without orderItems', () => {
        const invalidOrder = {
          supplierId: 1,
          warehouseId: 2,
          // orderItems missing
          expectedDeliveryDate: '2025-12-31'
        };

        expect(() => orderValidationSchema.parse(invalidOrder)).toThrow(ZodError);
      });

      it('should reject order with empty orderItems array', () => {
        const invalidOrder = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [], // Empty array
          expectedDeliveryDate: '2025-12-31'
        };

        expect(() => orderValidationSchema.parse(invalidOrder)).toThrow(ZodError);
      });

      it('should reject order items with missing required fields', () => {
        const invalidOrder = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              // productId missing
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        expect(() => orderValidationSchema.parse(invalidOrder)).toThrow(ZodError);
      });

      it('should reject invalid unitPrice values', () => {
        const invalidOrder = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: 'invalid-price' // Invalid price string
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        expect(() => orderValidationSchema.parse(invalidOrder)).toThrow(ZodError);
      });

      it('should reject negative quantities', () => {
        const invalidOrder = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: -1, // Negative quantity
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        expect(() => orderValidationSchema.parse(invalidOrder)).toThrow(ZodError);
      });

      it('should reject zero quantities', () => {
        const invalidOrder = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 0, // Zero quantity
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        expect(() => orderValidationSchema.parse(invalidOrder)).toThrow(ZodError);
      });

      it('should provide detailed error information', () => {
        const invalidOrder = {
          supplierId: 'invalid', // Invalid type
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: '', // Empty name
              quantity: -1, // Invalid quantity
              unitPrice: 'abc' // Invalid price
            }
          ]
          // expectedDeliveryDate missing
        };

        try {
          orderValidationSchema.parse(invalidOrder);
          expect.fail('Should have thrown ZodError');
        } catch (error) {
          expect(error).toBeInstanceOf(ZodError);
          const zodError = error as ZodError;
          
          // Should have multiple validation errors
          expect(zodError.errors.length).toBeGreaterThan(1);
          
          // Should include path information for debugging
          expect(zodError.errors.some(e => e.path.length > 0)).toBe(true);
        }
      });
    });

    describe('Optional Fields Handling', () => {
      it('should handle optional idempotencyKey', () => {
        const orderWithoutKey = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        const result = orderValidationSchema.parse(orderWithoutKey);
        expect(result.idempotencyKey).toBeUndefined();

        const orderWithKey = {
          ...orderWithoutKey,
          idempotencyKey: 'test-key-456'
        };

        const resultWithKey = orderValidationSchema.parse(orderWithKey);
        expect(resultWithKey.idempotencyKey).toBe('test-key-456');
      });

      it('should handle optional notes', () => {
        const orderWithoutNotes = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31'
        };

        const result = orderValidationSchema.parse(orderWithoutNotes);
        expect(result.notes).toBeUndefined();

        const orderWithNotes = {
          ...orderWithoutNotes,
          notes: 'Special handling required'
        };

        const resultWithNotes = orderValidationSchema.parse(orderWithNotes);
        expect(resultWithNotes.notes).toBe('Special handling required');
      });

      it('should handle empty string notes', () => {
        const order = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: [
            {
              productId: 100,
              productName: 'Test Product',
              quantity: 1,
              unitPrice: '10.00'
            }
          ],
          expectedDeliveryDate: '2025-12-31',
          notes: '' // Empty string
        };

        const result = orderValidationSchema.parse(order);
        expect(result.notes).toBe('');
      });
    });

    describe('Real-World Data Scenarios', () => {
      it('should handle data from frontend forms', () => {
        // Simulate data that might come from a web form
        const formData = {
          supplierId: '1', // Form inputs are strings
          warehouseId: '2',
          orderItems: [
            {
              productId: '100',
              productName: 'Premium Widget',
              quantity: '5',
              unitPrice: '99.99'
            }
          ],
          expectedDeliveryDate: '2025-12-31',
          notes: '  Urgent delivery required  ', // With whitespace
          idempotencyKey: 'form-submission-789'
        };

        const result = orderValidationSchema.parse(formData);

        // All numeric fields should be converted
        expect(typeof result.supplierId).toBe('number');
        expect(typeof result.warehouseId).toBe('number');
        expect(typeof result.orderItems[0].productId).toBe('number');
        expect(typeof result.orderItems[0].quantity).toBe('number');
        expect(typeof result.orderItems[0].unitPrice).toBe('number');

        // Values should be correct
        expect(result.supplierId).toBe(1);
        expect(result.warehouseId).toBe(2);
        expect(result.orderItems[0].unitPrice).toBe(99.99);
      });

      it('should handle bulk order with many items', () => {
        const bulkOrder = {
          supplierId: 1,
          warehouseId: 2,
          orderItems: Array.from({ length: 50 }, (_, i) => ({
            productId: 1000 + i,
            productName: `Product ${i + 1}`,
            quantity: Math.floor(Math.random() * 10) + 1,
            unitPrice: (Math.random() * 100).toFixed(2)
          })),
          expectedDeliveryDate: '2025-12-31',
          notes: 'Bulk order for Q4 inventory'
        };

        const result = orderValidationSchema.parse(bulkOrder);

        expect(result.orderItems).toHaveLength(50);
        
        // Verify all items have correct types
        result.orderItems.forEach((item, index) => {
          expect(typeof item.productId).toBe('number');
          expect(typeof item.quantity).toBe('number');
          expect(typeof item.unitPrice).toBe('number');
          expect(item.productName).toBe(`Product ${index + 1}`);
        });
      });
    });
  });
});