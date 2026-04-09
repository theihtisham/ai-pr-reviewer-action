'use strict';

const {
  DEFAULTS,
  SEVERITY_ORDER,
  DEFAULT_IGNORE_PATTERNS,
  REVIEW_CATEGORIES,
} = require('./constants');
const logger = require('./logger');

/**
 * Parse a comma-separated string into an array of trimmed, non-empty strings.
 * @param {string} input - Comma-separated input.
 * @returns {string[]} Array of trimmed values.
 */
function parseList(input) {
  if (!input || typeof input !== 'string') return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Validate that a value is one of the allowed severity levels.
 * @param {string} value - Severity value to validate.
 * @returns {boolean} True if valid.
 */
function isValidSeverity(value) {
  return SEVERITY_ORDER.includes(value);
}

/**
 * Validate that temperature is within the allowed range.
 * @param {number} value - Temperature value.
 * @returns {boolean} True if valid.
 */
function isValidTemperature(value) {
  return typeof value === 'number' && value >= 0 && value <= 2.0;
}

/**
 * Validate that max-comments is within the allowed range.
 * @param {number} value - Max comments value.
 * @returns {boolean} True if valid.
 */
function isValidMaxComments(value) {
  return Number.isInteger(value) && value >= 1 && value <= 100;
}

/**
 * Validate that all review types are recognized categories.
 * @param {string[]} types - Array of review type strings.
 * @returns {boolean} True if all types are valid.
 */
function isValidReviewTypes(types) {
  const validKeys = Object.keys(REVIEW_CATEGORIES);
  return types.every((t) => validKeys.includes(t));
}

/**
 * Create and validate the configuration object from action inputs.
 * @param {object} inputs - Raw action inputs.
 * @param {string} inputs.githubToken - GitHub token.
 * @param {string} inputs.apiKey - API key for the AI provider.
 * @param {string} [inputs.apiBase] - API base URL.
 * @param {string} [inputs.model] - AI model name.
 * @param {string|number} [inputs.maxComments] - Max comments per review.
 * @param {string} [inputs.severityThreshold] - Min severity to report.
 * @param {string} [inputs.language] - Response language.
 * @param {string} [inputs.reviewTypes] - Comma-separated review categories.
 * @param {string} [inputs.ignorePaths] - Comma-separated glob patterns to ignore.
 * @param {string|boolean} [inputs.autoApprove] - Auto-approve clean PRs.
 * @param {string|boolean} [inputs.summaryOnly] - Only post summary.
 * @param {string|boolean} [inputs.failOnCritical] - Fail on critical issues.
 * @param {string|number} [inputs.temperature] - AI temperature.
 * @returns {Readonly<object>} Frozen configuration object.
 * @throws {Error} If any required input is missing or any input is invalid.
 */
function createConfig(inputs) {
  if (!inputs || typeof inputs !== 'object') {
    throw new Error('Configuration inputs must be an object');
  }

  // Validate required fields
  if (!inputs.githubToken || typeof inputs.githubToken !== 'string' || inputs.githubToken.trim() === '') {
    throw new Error(
      'github-token is required and must be a non-empty string. ' +
        'Pass your GitHub token via the github-token input or use ${{ secrets.GITHUB_TOKEN }}.',
    );
  }

  if (!inputs.apiKey || typeof inputs.apiKey !== 'string' || inputs.apiKey.trim() === '') {
    throw new Error(
      'api-key is required and must be a non-empty string. ' +
        'Pass your OpenAI-compatible API key via the api-key input.',
    );
  }

  // Parse and validate max-comments
  const maxComments = parseInt(inputs.maxComments, 10);
  if (!isValidMaxComments(maxComments)) {
    throw new Error(
      `max-comments must be an integer between 1 and 100, got: ${inputs.maxComments}. ` +
        'Adjust the max-comments input to a valid value.',
    );
  }

  // Parse and validate severity threshold
  const severityThreshold = (inputs.severityThreshold || DEFAULTS.SEVERITY_THRESHOLD).toLowerCase().trim();
  if (!isValidSeverity(severityThreshold)) {
    throw new Error(
      `severity-threshold must be one of: ${SEVERITY_ORDER.join(', ')}, got: "${inputs.severityThreshold}". ` +
        'Check the severity-threshold input for typos.',
    );
  }

  // Parse and validate temperature
  const temperature = parseFloat(inputs.temperature);
  if (isNaN(temperature) || !isValidTemperature(temperature)) {
    throw new Error(
      `temperature must be a number between 0.0 and 2.0, got: ${inputs.temperature}. ` +
        'Lower values produce more consistent reviews.',
    );
  }

  // Validate model
  const model = inputs.model || DEFAULTS.MODEL;
  if (typeof model !== 'string' || model.trim() === '') {
    throw new Error('model must be a non-empty string. Specify a valid model name.');
  }

  // Parse and validate review types
  const reviewTypes = inputs.reviewTypes
    ? parseList(inputs.reviewTypes)
    : [...DEFAULTS.REVIEW_TYPES];
  if (reviewTypes.length === 0) {
    throw new Error(
      'review-types must contain at least one category. ' +
        `Valid options: ${Object.keys(REVIEW_CATEGORIES).join(', ')}`,
    );
  }
  if (!isValidReviewTypes(reviewTypes)) {
    throw new Error(
      `review-types contains invalid categories. Valid options: ${Object.keys(REVIEW_CATEGORIES).join(', ')}, got: ${reviewTypes.join(', ')}`,
    );
  }

  // Parse ignore paths and merge with defaults
  const userIgnorePatterns = parseList(inputs.ignorePaths);
  const ignorePatterns = [...new Set([...DEFAULT_IGNORE_PATTERNS, ...userIgnorePatterns])];

  // Parse boolean inputs
  const autoApprove = inputs.autoApprove === true || inputs.autoApprove === 'true';
  const summaryOnly = inputs.summaryOnly === true || inputs.summaryOnly === 'true';
  const failOnCritical = inputs.failOnCritical === true || inputs.failOnCritical === 'true';

  const config = {
    githubToken: inputs.githubToken.trim(),
    apiKey: inputs.apiKey.trim(),
    apiBase: (inputs.apiBase || DEFAULTS.API_BASE).trim().replace(/\/+$/, ''),
    model: model.trim(),
    maxComments,
    severityThreshold,
    language: (inputs.language || 'en').trim(),
    reviewTypes,
    ignorePatterns,
    autoApprove,
    summaryOnly,
    failOnCritical,
    temperature,
    maxTokens: DEFAULTS.MAX_TOKENS,
    chunkSize: DEFAULTS.CHUNK_SIZE,
    maxDiffSize: DEFAULTS.MAX_DIFF_SIZE,
    maxRetries: DEFAULTS.MAX_RETRIES,
    retryDelay: DEFAULTS.RETRY_DELAY,
    rateLimitDelay: DEFAULTS.RATE_LIMIT_DELAY,
  };

  logger.info('Configuration validated successfully', {
    model: config.model,
    maxComments: config.maxComments,
    severityThreshold: config.severityThreshold,
    reviewTypes: config.reviewTypes.join(','),
  });

  return Object.freeze(config);
}

module.exports = { createConfig, parseList, isValidSeverity, isValidTemperature, isValidMaxComments };
