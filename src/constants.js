'use strict';

/**
 * Severity levels ordered by importance (highest first).
 * @readonly
 */
const SEVERITY = {
  CRITICAL: 'critical',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

/**
 * Ordered list of severity levels used for filtering and sorting.
 * Items earlier in the array are more severe.
 * @readonly
 */
const SEVERITY_ORDER = ['critical', 'error', 'warning', 'info'];

/**
 * Default configuration values for the action.
 * @readonly
 */
const DEFAULTS = {
  MAX_COMMENTS: 20,
  MAX_DIFF_SIZE: 50000,
  CHUNK_SIZE: 3500,
  MAX_TOKENS: 4000,
  TEMPERATURE: 0.2,
  MODEL: 'gpt-4o',
  API_BASE: 'https://api.openai.com/v1',
  SEVERITY_THRESHOLD: 'info',
  REVIEW_TYPES: ['bug', 'security', 'performance', 'quality'],
  RATE_LIMIT_DELAY: 1000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
};

/**
 * File patterns that are always ignored during review.
 * These are typically generated or binary files.
 * @readonly
 */
const DEFAULT_IGNORE_PATTERNS = [
  '*.min.js',
  '*.min.css',
  '*.map',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.svg',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.ico',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
];

/**
 * Review categories with detailed descriptions for the AI prompt.
 * @readonly
 */
const REVIEW_CATEGORIES = {
  bug: 'Logic errors, race conditions, null/undefined access, off-by-one errors, incorrect control flow, unhandled edge cases',
  security:
    'SQL injection, XSS, CSRF, command injection, path traversal, secrets in code, insecure crypto, missing auth checks, SSRF, open redirects',
  performance:
    'N+1 queries, memory leaks, unnecessary re-renders, missing indexes, unbounded loops, excessive API calls, missing pagination, large bundle size',
  quality:
    'Missing error handling, unclear naming, dead code, duplicate code, missing types, hardcoded values, missing tests for critical paths',
};

/**
 * Maps severity levels to emoji for visual formatting in comments.
 * @readonly
 */
const SEVERITY_EMOJI = {
  critical: ':red_circle:',
  error: ':orange_circle:',
  warning: ':yellow_circle:',
  info: ':blue_circle:',
};

/**
 * Maps review categories to emoji for visual formatting in comments.
 * @readonly
 */
const CATEGORY_EMOJI = {
  bug: ':bug:',
  security: ':lock:',
  performance: ':zap:',
  quality: ':memo:',
};

module.exports = {
  SEVERITY,
  SEVERITY_ORDER,
  DEFAULTS,
  DEFAULT_IGNORE_PATTERNS,
  REVIEW_CATEGORIES,
  SEVERITY_EMOJI,
  CATEGORY_EMOJI,
};
