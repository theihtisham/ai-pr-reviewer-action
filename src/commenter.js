'use strict';

const logger = require('./logger');
const { SEVERITY_EMOJI, CATEGORY_EMOJI, SEVERITY_ORDER, SEVERITY } = require('./constants');

/**
 * Post review comments (inline + summary) to the pull request.
 *
 * @param {object} octokit - Authenticated Octokit instance.
 * @param {object} context - GitHub Actions context (repo, issue, pull_request).
 * @param {Array<object>} issues - Array of validated issue objects.
 * @param {object} config - Validated configuration object.
 * @returns {Promise<object>} Result with counts and approval status.
 */
async function postReviewComments(octokit, context, issues, config) {
  let inlinePosted = 0;
  let generalPosted = 0;

  try {
    // Post inline comments (unless summary-only mode)
    if (!config.summaryOnly && issues.length > 0) {
      const commentsToPost = issues.slice(0, config.maxComments);

      for (const issue of commentsToPost) {
        try {
          await postInlineComment(octokit, context, issue);
          inlinePosted++;
        } catch (error) {
          logger.warn(
            `Failed to post inline comment for ${issue.file}:${issue.line}: ${error.message}`,
          );
          // Fall back to general comment
          try {
            await postGeneralComment(octokit, context, issue);
            generalPosted++;
          } catch (fallbackError) {
            logger.warn(`Failed to post general comment: ${fallbackError.message}`);
          }
        }
      }

      // Post remaining issues as general comments if over maxComments
      if (issues.length > config.maxComments) {
        const remaining = issues.length - config.maxComments;
        logger.info(
          `${remaining} additional issues not posted (max-comments limit reached)`,
        );
      }
    }

    // Post summary comment
    const summaryResult = await postSummaryComment(octokit, context, issues, config);

    // Auto-approve if configured and no critical/error issues
    let approved = false;
    const hasBlockingIssues = issues.some(
      (i) => i.severity === SEVERITY.CRITICAL || i.severity === SEVERITY.ERROR,
    );

    if (config.autoApprove && !hasBlockingIssues) {
      try {
        await createApprovingReview(octokit, context);
        approved = true;
        logger.info('PR auto-approved (no blocking issues found)');
      } catch (error) {
        logger.warn(`Failed to auto-approve PR: ${error.message}`);
      }
    }

    return {
      inlinePosted,
      generalPosted,
      approved,
      summary: summaryResult,
    };
  } catch (error) {
    logger.error(`Failed to post review comments: ${error.message}`);
    throw error;
  }
}

/**
 * Post a single inline review comment on a specific line.
 * @param {object} octokit - Authenticated Octokit instance.
 * @param {object} context - GitHub Actions context.
 * @param {object} issue - Issue to post.
 * @returns {Promise<object>} API response.
 */
async function postInlineComment(octokit, context, issue) {
  const { owner, repo, number: pullNumber } = context.repo;
  const severityEmoji = SEVERITY_EMOJI[issue.severity] || ':white_circle:';
  const categoryEmoji = CATEGORY_EMOJI[issue.category] || ':wrench:';

  const body = formatCommentBody(issue, severityEmoji, categoryEmoji);

  await octokit.rest.pulls.createReviewComment({
    owner,
    repo,
    pull_number: pullNumber,
    body,
    path: issue.file,
    line: issue.line,
    side: 'RIGHT',
  });

  logger.debug(`Posted inline comment on ${issue.file}:${issue.line}`);
}

/**
 * Post an issue as a general PR comment (fallback for inline failures).
 * @param {object} octokit - Authenticated Octokit instance.
 * @param {object} context - GitHub Actions context.
 * @param {object} issue - Issue to post.
 * @returns {Promise<object>} API response.
 */
async function postGeneralComment(octokit, context, issue) {
  const { owner, repo, number: prNumber } = context.repo;
  const severityEmoji = SEVERITY_EMOJI[issue.severity] || ':white_circle:';

  const body =
    `### ${severityEmoji} [${issue.category.toUpperCase()}] **${issue.title}**\n` +
    `**File:** \`${issue.file}\` (line ${issue.line})\n\n` +
    `${issue.description}\n\n` +
    `**Suggestion:**\n\`\`\`suggestion\n${issue.suggestion}\n\`\`\``;

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });

  logger.debug(`Posted general comment for ${issue.file}:${issue.line}`);
}

/**
 * Format the body of an inline review comment.
 * @param {object} issue - Issue object.
 * @param {string} severityEmoji - Emoji for severity.
 * @param {string} categoryEmoji - Emoji for category.
 * @returns {string} Formatted comment body.
 */
function formatCommentBody(issue, severityEmoji, categoryEmoji) {
  return (
    `${severityEmoji} ${categoryEmoji} [${issue.category.toUpperCase()}] **${issue.title}**\n\n` +
    `${issue.description}\n\n` +
    `:bulb: **Suggestion:**\n\`\`\`suggestion\n${issue.suggestion}\n\`\`\``
  );
}

/**
 * Post the main summary comment with issue statistics and assessment.
 * @param {object} octokit - Authenticated Octokit instance.
 * @param {object} context - GitHub Actions context.
 * @param {Array<object>} issues - All found issues.
 * @param {object} config - Configuration.
 * @returns {Promise<string>} The summary text.
 */
async function postSummaryComment(octokit, context, issues, config) {
  const { owner, repo, number: prNumber } = context.repo;
  const summary = buildSummary(issues, config);

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: summary,
  });

  logger.info('Posted review summary comment');
  return summary;
}

/**
 * Build the summary comment body.
 * @param {Array<object>} issues - All found issues.
 * @param {object} config - Configuration.
 * @returns {string} Formatted summary.
 */
function buildSummary(issues, config) {
  const lines = [];

  lines.push('## :mag: AI Code Review Summary');
  lines.push('');

  // Severity breakdown table
  lines.push('### Issues by Severity');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');

  for (const level of SEVERITY_ORDER) {
    const count = issues.filter((i) => i.severity === level).length;
    const emoji = SEVERITY_EMOJI[level] || '';
    lines.push(`| ${emoji} ${level} | ${count} |`);
  }

  lines.push(`| **Total** | **${issues.length}** |`);
  lines.push('');

  // Category breakdown table
  lines.push('### Issues by Category');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|----------|-------|');

  const categories = [...new Set(issues.map((i) => i.category))];
  for (const cat of categories) {
    const count = issues.filter((i) => i.category === cat).length;
    const emoji = CATEGORY_EMOJI[cat] || '';
    lines.push(`| ${emoji} ${cat} | ${count} |`);
  }
  lines.push('');

  // Files reviewed
  const files = [...new Set(issues.map((i) => i.file))];
  if (files.length > 0) {
    lines.push('### Affected Files');
    lines.push('');
    for (const file of files) {
      const fileIssues = issues.filter((i) => i.file === file);
      lines.push(`- \`${file}\` (${fileIssues.length} issue${fileIssues.length !== 1 ? 's' : ''})`);
    }
    lines.push('');
  }

  // Overall assessment
  lines.push('### Assessment');
  lines.push('');

  const hasCritical = issues.some((i) => i.severity === SEVERITY.CRITICAL);
  const hasErrors = issues.some((i) => i.severity === SEVERITY.ERROR);

  if (hasCritical) {
    lines.push(':no_entry: **DO NOT MERGE** - Critical issues found that must be addressed.');
  } else if (hasErrors) {
    lines.push(':warning: **Issues found** - Error-level issues should be reviewed before merging.');
  } else if (issues.length > 0) {
    lines.push(':white_check_mark: **Minor issues found** - No blocking issues, but review suggested improvements.');
  } else {
    lines.push(':white_check_mark: **Looks good!** - No issues found. Code appears clean.');
  }

  lines.push('');
  lines.push('---');
  lines.push(`*Review powered by [AI PR Reviewer](https://github.com/marketplace/ai-pr-reviewer) | Model: ${config.model}*`);

  return lines.join('\n');
}

/**
 * Create an approving review on the pull request.
 * @param {object} octokit - Authenticated Octokit instance.
 * @param {object} context - GitHub Actions context.
 * @returns {Promise<object>} API response.
 */
async function createApprovingReview(octokit, context) {
  const { owner, repo, number: pullNumber } = context.repo;

  return octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: pullNumber,
    event: 'APPROVE',
    body: ':white_check_mark: AI Code Review passed - no blocking issues found.',
  });
}

module.exports = {
  postReviewComments,
  postInlineComment,
  postGeneralComment,
  formatCommentBody,
  buildSummary,
  createApprovingReview,
};
