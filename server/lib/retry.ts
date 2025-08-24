/**
 * Robust retry mechanism with exponential backoff
 * Based on the German implementation plan for improved error handling
 */

export interface RetryOptions {
  maxTries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
}

/**
 * Executes an operation with exponential backoff retry logic
 * @param operation Function to execute that returns a Promise
 * @param options Retry configuration options
 * @returns Promise that resolves with the operation result
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxTries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    jitter = true
  } = options;

  let lastError: any;
  
  for (let attempt = 0; attempt < maxTries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if this is a retryable error
      const status = error?.response?.status;
      const isRetryable = isRetryableError(status, error);
      
      // Don't retry on non-retryable errors (4xx except 408/429)
      if (!isRetryable) {
        console.warn(`Non-retryable error encountered: ${status || 'unknown'}`);
        break;
      }
      
      // Don't wait after the last attempt
      if (attempt === maxTries - 1) {
        break;
      }
      
      // Calculate delay with exponential backoff
      let delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      
      // Add jitter to prevent thundering herd
      if (jitter) {
        delay = delay + (Math.random() * delay * 0.1); // Add up to 10% jitter
      }
      
      console.log(`Retry attempt ${attempt + 1}/${maxTries} in ${Math.round(delay)}ms - Error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Determines if an error is retryable based on status code and error type
 * @param status HTTP status code
 * @param error The error object
 * @returns true if the error should be retried
 */
function isRetryableError(status: number | undefined, error: any): boolean {
  // Network errors (no status) should be retried
  if (!status) {
    return true;
  }
  
  // 5xx server errors should be retried
  if (status >= 500) {
    return true;
  }
  
  // Specific 4xx codes that should be retried
  if (status === 408 || status === 429) {
    return true;
  }
  
  // All other 4xx errors should not be retried
  if (status >= 400 && status < 500) {
    return false;
  }
  
  // Other errors (1xx, 2xx, 3xx) should be retried
  return true;
}

/**
 * Specific retry configuration for Vendon API operations
 */
export const VENDON_RETRY_CONFIG: RetryOptions = {
  maxTries: 4,
  baseDelayMs: 750,
  maxDelayMs: 15000,
  jitter: true
};

/**
 * Retry configuration for critical operations that need more attempts
 */
export const CRITICAL_RETRY_CONFIG: RetryOptions = {
  maxTries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  jitter: true
};

/**
 * Fast retry configuration for lightweight operations
 */
export const FAST_RETRY_CONFIG: RetryOptions = {
  maxTries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  jitter: true
};