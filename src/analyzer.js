'use strict';

const OpenAI = require('openai');
const logger = require('./logger');
const { SEVERITY_ORDER } = require('./constants');
const { getSystemPrompt, getUserPrompt } = require('./prompts');

/**
 * Analyze a code chunk using the AI model.
 * Sends the chunk to OpenAI-compatible API and returns structured issues.
 *
 * @param {object} chunk - Chunk object from the chunker.
 * @param {object} config - Validated configuration object.
 * @param {object} rateLimiter - RateLimiter instance.
 * @returns {Promise<Array<object>>} Array of validated issue objects.
 */
async function analyzeChunk(chunk, config, rateLimiter) {
  try {
    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiBase,
    });

    const systemPrompt = getSystemPrompt(config);
    const userPrompt = getUserPrompt(chunk);

    logger.debug(`Analyzing chunk: ${chunk.filePath} lines ${chunk.lineRange.start}-${chunk.lineRange.end}`);

    const response = await rateLimiter.retryWithBackoff(async () => {
      return openai.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: { type: 'json_object' },
      });
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      logger.warn('Empty response from AI model', { file: chunk.filePath });
      return [];
    }

    const issues = parseAIResponse(content, chunk.filePath);
    const filteredIssues = filterBySeverity(issues, config.severityThreshold);
    const mappedIssues = mapLineNumbers(filteredIssues, chunk);

    logger.info(`Found ${mappedIssues.length} issues in ${chunk.filePath}`, {
      raw: issues.length,
      afterFilter: filteredIssues.length,
    });

    return mappedIssues;
  } catch (error) {
    logger.error(`Failed to analyze ${chunk.filePath}: ${error.message}`);
    throw error;
  }
}

/**
 * Parse the AI model's JSON response into an array of issue objects.
 * Validates structure and logs warnings for malformed data.
 *
 * @param {string} content - Raw JSON string from the AI response.
 * @param {string} defaultFile - Default file path to use if missing.
 * @returns {Array<object>} Array of validated issue objects.
 */
function parseAIResponse(content, defaultFile) {
  try {
    const parsed = JSON.parse(content);

    // Handle both {"issues": [...]} and direct array formats
    let issueArray;
    if (Array.isArray(parsed)) {
      issueArray = parsed;
    } else if (parsed.issues && Array.isArray(parsed.issues)) {
      issueArray = parsed.issues;
    } else {
      logger.warn('AI response is not an array or {issues: [...] }', {
        keys: Object.keys(parsed),
      });
      return [];
    }

    return issueArray
      .map((issue) => validateIssue(issue, defaultFile))
      .filter((issue) => issue !== null);
  } catch (error) {
    logger.warn(`Failed to parse AI response as JSON: ${error.message}`, {
      contentPreview: content.substring(0, 200),
    });
    return [];
  }
}

/**
 * Validate a single issue object from the AI response.
 * Returns null if the issue is missing required fields.
 *
 * @param {object} issue - Raw issue from AI.
 * @param {string} defaultFile - Default file path.
 * @returns {object|null} Validated issue or null.
 */
function validateIssue(issue, defaultFile) {
  if (!issue || typeof issue !== 'object') return null;

  const requiredFields = ['severity', 'category', 'title', 'description', 'line', 'suggestion'];
  for (const field of requiredFields) {
    if (issue[field] === undefined || issue[field] === null || issue[field] === '') {
      logger.debug(`Issue missing required field: ${field}`, { issue });
      return null;
    }
  }

  // Validate severity
  if (!SEVERITY_ORDER.includes(issue.severity)) {
    logger.debug(`Issue has invalid severity: ${issue.severity}`);
    return null;
  }

  // Validate line number
  const line = parseInt(issue.line, 10);
  if (isNaN(line) || line < 1) {
    logger.debug(`Issue has invalid line number: ${issue.line}`);
    return null;
  }

  return {
    file: issue.file || defaultFile,
    line,
    severity: issue.severity,
    category: issue.category,
    title: String(issue.title).substring(0, 80),
    description: String(issue.description),
    suggestion: String(issue.suggestion),
  };
}

/**
 * Filter issues by the configured severity threshold.
 * Only issues at or above the threshold are kept.
 *
 * @param {Array<object>} issues - Array of issue objects.
 * @param {string} threshold - Minimum severity level.
 * @returns {Array<object>} Filtered issues.
 */
function filterBySeverity(issues, threshold) {
  const thresholdIndex = SEVERITY_ORDER.indexOf(threshold);
  if (thresholdIndex === -1) return issues;

  return issues.filter((issue) => {
    const issueIndex = SEVERITY_ORDER.indexOf(issue.severity);
    return issueIndex <= thresholdIndex;
  });
}

/**
 * Map line numbers from chunk-relative to file-absolute positions.
 * Clamps line numbers to the chunk's range.
 *
 * @param {Array<object>} issues - Issues with potentially relative line numbers.
 * @param {object} chunk - Source chunk with lineRange.
 * @returns {Array<object>} Issues with corrected line numbers.
 */
function mapLineNumbers(issues, chunk) {
  return issues.map((issue) => {
    let line = issue.line;

    // Clamp to chunk range
    if (line < chunk.lineRange.start) {
      line = chunk.lineRange.start;
    }
    if (line > chunk.lineRange.end) {
      line = chunk.lineRange.end;
    }

    return { ...issue, line, file: chunk.filePath };
  });
}

/**
 * Deduplicate issues with the same file, line, and title.
 * Keeps the first occurrence of each duplicate.
 *
 * @param {Array<object>} issues - Array of issue objects.
 * @returns {Array<object>} Deduplicated issues.
 */
function deduplicateIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.file}:${issue.line}:${issue.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Sort issues by severity (critical first, then error, warning, info).
 *
 * @param {Array<object>} issues - Array of issue objects.
 * @returns {Array<object>} Sorted issues.
 */
function sortIssuesBySeverity(issues) {
  return [...issues].sort((a, b) => {
    const aIndex = SEVERITY_ORDER.indexOf(a.severity);
    const bIndex = SEVERITY_ORDER.indexOf(b.severity);
    return aIndex - bIndex;
  });
}

module.exports = {
  analyzeChunk,
  parseAIResponse,
  validateIssue,
  filterBySeverity,
  mapLineNumbers,
  deduplicateIssues,
  sortIssuesBySeverity,
};
