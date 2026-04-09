'use strict';

const logger = require('./logger');

/**
 * Rate limiter with token bucket and exponential backoff for API calls.
 * Handles retry logic for transient errors (429, 500, 502, 503).
 */
class RateLimiter {
  /**
   * Create a new RateLimiter instance.
   * @param {object} options - Configuration options.
   * @param {number} [options.minDelay=1000] - Minimum delay between API calls in ms.
   * @param {number} [options.maxRetries=3] - Maximum number of retry attempts.
   * @param {number} [options.baseDelay=2000] - Base delay for exponential backoff in ms.
   */
  constructor(options = {}) {
    this.minDelay = options.minDelay || 1000;
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 2000;
    this.lastCallTime = 0;
  }

  /**
   * Enforce minimum delay between API calls.
   * Waits if the last call was too recent.
   * @returns {Promise<void>}
   */
  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    const remaining = this.minDelay - elapsed;

    if (remaining > 0) {
      logger.debug(`Rate limiting: waiting ${remaining}ms`);
      await sleep(remaining);
    }

    this.lastCallTime = Date.now();
  }

  /**
   * Execute a function with exponential backoff retry logic.
   * Retries on rate limit (429) and server errors (500, 502, 503).
   * Does NOT retry on auth errors (401, 403) or bad requests (400).
   *
   * @param {Function} fn - Async function to execute.
   * @param {number} [maxRetries] - Override max retries for this call.
   * @returns {Promise<*>} Result of fn().
   * @throws {Error} If all retries are exhausted or a non-retryable error occurs.
   */
  async retryWithBackoff(fn, maxRetries) {
    const retries = maxRetries !== undefined ? maxRetries : this.maxRetries;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.wait();
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error;

        // Check if this error should be retried
        if (!isRetryableError(error)) {
          logger.error(`Non-retryable error: ${error.message}`, {
            status: error.status || error.statusCode,
          });
          throw error;
        }

        // Don't retry if we've exhausted attempts
        if (attempt >= retries) {
          logger.error(`All ${retries} retries exhausted`, {
            error: error.message,
          });
          throw error;
        }

        // Calculate backoff with jitter
        const delay = calculateBackoff(this.baseDelay, attempt);
        logger.warn(
          `Retryable error on attempt ${attempt + 1}/${retries}, waiting ${delay}ms: ${error.message}`,
          { status: error.status || error.statusCode },
        );

        await sleep(delay);
      }
    }

    throw lastError;
  }
}

/**
 * Check if an error is retryable based on HTTP status code.
 * Retryable: 429 (rate limit), 500, 502, 503 (server errors).
 * Not retryable: 401, 403 (auth), 400 (bad request), and others.
 * @param {Error} error - The error to check.
 * @returns {boolean} True if the error should be retried.
 */
function isRetryableError(error) {
  const status = error.status || error.statusCode;
  if (!status) {
    // Network errors, timeouts, etc. are retryable
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    // If no status and it's not a network error, don't retry
    return false;
  }
  const retryableStatuses = [429, 500, 502, 503];
  return retryableStatuses.includes(status);
}

/**
 * Calculate exponential backoff delay with jitter.
 * Formula: baseDelay * 2^attempt + random(0, 1000)
 * @param {number} baseDelay - Base delay in ms.
 * @param {number} attempt - Current attempt number (0-based).
 * @returns {number} Delay in ms.
 */
function calculateBackoff(baseDelay, attempt) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 1000);
  return exponentialDelay + jitter;
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { RateLimiter, isRetryableError, calculateBackoff, sleep };
