'use strict';

const { REVIEW_CATEGORIES, SEVERITY_ORDER } = require('./constants');

/**
 * Build the system prompt for the AI code reviewer.
 * Includes role definition, categories, severity levels, output format, and rules.
 * @param {object} config - Validated configuration object.
 * @returns {string} Complete system prompt.
 */
function getSystemPrompt(config) {
  const categoryDescriptions = config.reviewTypes
    .map((type) => `- **${type}**: ${REVIEW_CATEGORIES[type]}`)
    .join('\n');

  const severityDescriptions = SEVERITY_ORDER.map(
    (level) =>
      `- **${level}**: ${getSeverityDescription(level)}`,
  ).join('\n');

  return `You are an expert code reviewer with 20 years of experience across many programming languages and frameworks. Your task is to review code diffs and identify real issues.

## Review Categories
You are reviewing for these specific categories:
${categoryDescriptions}

## Severity Levels
${severityDescriptions}

## Output Format
You MUST respond with a valid JSON object containing a single key "issues" which is an array. Each issue must have:
- "file": the file path (string)
- "line": the line number in the new file (integer)
- "severity": one of [${SEVERITY_ORDER.map((s) => `"${s}"`).join(', ')}]
- "category": one of [${config.reviewTypes.map((t) => `"${t}"`).join(', ')}]
- "title": short summary of the issue (string, max 80 chars)
- "description": detailed explanation of why this is an issue (string)
- "suggestion": concrete fix with code example (string)

## Rules
1. Only report REAL, actionable issues. Do NOT report style preferences or nitpicks.
2. Only report issues in lines that were ADDED or MODIFIED (lines starting with +). Do NOT report issues in context or removed lines.
3. If no issues are found, return: {"issues": []}
4. Be specific - reference exact variable names, function names, and line numbers.
5. Every suggestion must include a concrete code fix, not just a description.
6. Do not report the same issue multiple times for the same location.
7. Consider the language and framework context when evaluating code.
8. ${config.language !== 'en' ? `Write all descriptions and titles in ${config.language}.` : 'Write all descriptions and titles in English.'}`;
}

/**
 * Get a human-readable severity level description.
 * @param {string} level - Severity level.
 * @returns {string} Description.
 */
function getSeverityDescription(level) {
  const descriptions = {
    critical:
      'Will cause data loss, security breach, or production outage. Must fix before merge.',
    error:
      'Likely causes incorrect behavior, crashes, or significant bugs. Should fix before merge.',
    warning:
      'Could cause problems in certain scenarios or indicates poor practice. Worth addressing.',
    info:
      'Minor improvement or best practice suggestion. Optional but recommended.',
  };
  return descriptions[level] || 'Unknown severity level.';
}

/**
 * Build the user prompt for a specific code chunk.
 * Includes file path, line numbers, and the actual diff content.
 * @param {object} chunk - A chunk object from the chunker.
 * @returns {string} Complete user prompt.
 */
function getUserPrompt(chunk) {
  const fileInfo = [];
  if (chunk.isNewFile) fileInfo.push('(NEW FILE)');
  if (chunk.isDeletedFile) fileInfo.push('(DELETED FILE)');
  if (chunk.isRenamed) fileInfo.push('(RENAMED FILE)');

  const header = fileInfo.length > 0 ? ` ${fileInfo.join(' ')}` : '';

  return `Review this code diff and report any issues.

## File: ${chunk.filePath}${header}
Lines: ${chunk.lineRange.start}-${chunk.lineRange.end}

\`\`\`diff
${chunk.fileContent}
\`\`\`

Analyze the above diff for bugs, security issues, performance problems, and code quality concerns. Return a JSON object with an "issues" array.`;
}

module.exports = { getSystemPrompt, getUserPrompt, getSeverityDescription };
