'use strict';

const core = require('@actions/core');

const PREFIX = '[AI PR Reviewer]';

/**
 * Check if debug mode is enabled via environment variable.
 * @returns {boolean} True if debug logging is enabled.
 */
function isDebugEnabled() {
  return process.env.INPUT_DEBUG === 'true' || process.env.RUNNER_DEBUG === '1';
}

/**
 * Format a log message with optional metadata.
 * @param {string} level - Log level.
 * @param {string} message - Log message.
 * @param {object} [meta] - Optional metadata to append.
 * @returns {string} Formatted message.
 */
function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  let formatted = `${PREFIX} [${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) {
    formatted += ` ${JSON.stringify(meta)}`;
  }
  return formatted;
}

/**
 * Structured logger for the AI PR Reviewer action.
 * Uses @actions/core for GitHub Actions integration.
 * @type {object}
 */
const logger = {
  /**
   * Log a debug message (only shown when debug mode is enabled).
   * @param {string} message - Debug message.
   * @param {object} [meta] - Optional metadata.
   */
  debug(message, meta) {
    if (isDebugEnabled()) {
      core.debug(formatMessage('debug', message, meta));
    }
  },

  /**
   * Log an informational message.
   * @param {string} message - Info message.
   * @param {object} [meta] - Optional metadata.
   */
  info(message, meta) {
    core.info(formatMessage('info', message, meta));
  },

  /**
   * Log a warning message.
   * @param {string} message - Warning message.
   * @param {object} [meta] - Optional metadata.
   */
  warn(message, meta) {
    core.warning(formatMessage('warn', message, meta));
  },

  /**
   * Log an error message.
   * @param {string} message - Error message.
   * @param {object} [meta] - Optional metadata.
   */
  error(message, meta) {
    core.error(formatMessage('error', message, meta));
  },

  /**
   * Log a notice message (visible in GitHub Actions UI).
   * @param {string} message - Notice message.
   * @param {object} [meta] - Optional metadata.
   */
  notice(message, meta) {
    core.notice(formatMessage('notice', message, meta));
  },

  /**
   * Set the action as failed with an error message.
   * @param {string} message - Failure message.
   */
  setFailed(message) {
    core.setFailed(`${PREFIX} ${message}`);
  },
};

module.exports = logger;
