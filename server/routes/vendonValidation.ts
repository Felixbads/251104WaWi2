/**
 * Input validation using Zod for Vendon sync operations
 * Based on the German implementation plan
 */

import { z } from 'zod';

// Manual sync request validation
export const ManualSyncRequestSchema = z.object({
  startDate: z.string().datetime().optional().describe('Start date in ISO format'),
  endDate: z.string().datetime().optional().describe('End date in ISO format'),
  machineIds: z.array(z.string()).optional().describe('Specific machine IDs to sync'),
  syncType: z.enum(['transactions', 'events', 'refills', 'machines', 'products']).default('transactions'),
  batchSize: z.number().min(1).max(1000).default(100).describe('Number of items per batch'),
  forceUpdate: z.boolean().default(false).describe('Force update existing records'),
  dryRun: z.boolean().default(false).describe('Run validation only, do not save data')
});

export type ManualSyncRequest = z.infer<typeof ManualSyncRequestSchema>;

// Time window validation for historical syncs
export const TimeWindowSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
}).refine(data => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return start < end;
}, {
  message: "Start date must be before end date"
}).refine(data => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 365; // Maximum 1 year range
}, {
  message: "Date range cannot exceed 365 days"
});

// Coverage check request validation
export const CoverageCheckRequestSchema = z.object({
  sampleSize: z.number().min(10).max(1000).default(50).describe('Number of transactions to sample'),
  includeMapping: z.boolean().default(true).describe('Include mapping function analysis'),
  outputFormat: z.enum(['json', 'console', 'both']).default('both')
});

export type CoverageCheckRequest = z.infer<typeof CoverageCheckRequestSchema>;

// Sync configuration validation
export const SyncConfigSchema = z.object({
  enableRetries: z.boolean().default(true),
  maxRetries: z.number().min(1).max(10).default(3),
  retryDelayMs: z.number().min(100).max(30000).default(1000),
  rateLimitPerMinute: z.number().min(1).max(1000).default(100),
  enableJitter: z.boolean().default(true),
  timeoutMs: z.number().min(5000).max(300000).default(30000)
});

export type SyncConfig = z.infer<typeof SyncConfigSchema>;

// Validation middleware function
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.body);
      req.validatedBody = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      return res.status(500).json({ error: 'Internal validation error' });
    }
  };
}

// Helper function to validate time ranges
export function validateTimeRange(startDate: string, endDate: string): { valid: boolean; error?: string } {
  try {
    TimeWindowSchema.parse({ startDate, endDate });
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        valid: false, 
        error: error.errors.map(err => err.message).join(', ')
      };
    }
    return { valid: false, error: 'Invalid time range' };
  }
}

// Export validation schemas for reuse
export {
  TimeWindowSchema,
  ManualSyncRequestSchema,
  CoverageCheckRequestSchema,
  SyncConfigSchema
};