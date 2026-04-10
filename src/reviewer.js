'use strict';

const github = require('@actions/github');
const { minimatch } = require('minimatch');
const logger = require('./logger');
const { parseDiff } = require('./parser');
const { chunkCode } = require('./chunker');
const { analyzeChunk, deduplicateIssues, sortIssuesBySeverity } = require('./analyzer');
const { postReviewComments } = require('./commenter');
const { RateLimiter } = require('./rate-limiter');
const { SEVERITY } = require('./constants');

/**
 * Main orchestrator for the AI PR review process.
 * Gets the PR diff, parses it, chunks it, analyzes each chunk with AI,
 * and posts review comments back to the PR.
 *
 * @param {object} config - Validated configuration object.
 * @returns {Promise<object>} Result with issues-found count, summary, and approved status.
 * @throws {Error} If a critical step fails that prevents the review.
 */
async function reviewPR(config) {
  logger.info('Starting AI PR review');

  try {
    // Step 1: Initialize Octokit
    const octokit = github.getOctokit(config.githubToken);
    const context = github.context;

    // Step 2: Validate we're in a PR context
    const prNumber = context.payload.pull_request?.number;
    if (!prNumber) {
      throw new Error(
        'No pull request found in the GitHub Actions context. ' +
          'Ensure this action is triggered by a pull_request event.',
      );
    }

    logger.info(`Reviewing PR #${prNumber}`, {
      repo: context.repo.repo,
      owner: context.repo.owner,
    });

    // Step 3: Get PR diff (file list with patches)
    logger.info('Fetching PR files...');
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
    });

    // Step 4: Filter out ignored files
    const filteredFiles = files.filter((file) => !shouldIgnoreFile(file.filename, config));

    logger.info(`Found ${files.length} files, ${filteredFiles.length} after filtering`, {
      ignored: files.length - filteredFiles.length,
    });

    // Step 5: Build combined diff text
    const diffText = filteredFiles
      .filter((f) => f.patch) // Skip files without patches (binary, etc.)
      .map((f) => {
        const header = buildDiffHeader(f);
        return header + '\n' + f.patch;
      })
      .join('\n');

    if (!diffText || diffText.trim().length === 0) {
      logger.info('No reviewable diff content found');
      await postEmptySummary(octokit, context, config);
      return {
        issuesFound: 0,
        summary: 'No reviewable changes found in this PR.',
        approved: config.autoApprove,
      };
    }

    // Step 6: Parse diff into structured data
    const parsedDiff = parseDiff(diffText);

    if (parsedDiff.length === 0) {
      logger.info('No parseable diff hunks found');
      await postEmptySummary(octokit, context, config);
      return {
        issuesFound: 0,
        summary: 'No reviewable code changes found in this PR.',
        approved: config.autoApprove,
      };
    }

    // Step 7: Chunk code for AI analysis
    const chunks = chunkCode(parsedDiff, config);
    logger.info(`Prepared ${chunks.length} chunks for analysis`);

    // Step 8: Analyze each chunk with AI
    const rateLimiter = new RateLimiter({
      minDelay: config.rateLimitDelay,
      maxRetries: config.maxRetries,
      baseDelay: config.retryDelay,
    });

    let allIssues = [];
    for (let i = 0; i < chunks.length; i++) {
      logger.info(`Analyzing chunk ${i + 1}/${chunks.length}: ${chunks[i].filePath}`);
      try {
        const chunkIssues = await analyzeChunk(chunks[i], config, rateLimiter);
        allIssues.push(...chunkIssues);
      } catch (error) {
        logger.warn(`Failed to analyze chunk ${i + 1}: ${error.message}. Continuing...`);
        // Continue with other chunks rather than failing the entire review
      }
    }

    // Step 9: Deduplicate and sort issues
    allIssues = deduplicateIssues(allIssues);
    allIssues = sortIssuesBySeverity(allIssues);

    logger.info(`Total issues found: ${allIssues.length}`);

    // Step 10: Post review comments
    const commentResult = await postReviewComments(octokit, context, allIssues, config);

    // Step 11: Build result
    const result = {
      issuesFound: allIssues.length,
      summary: commentResult.summary || `Found ${allIssues.length} issue(s)`,
      approved: commentResult.approved,
    };

    // Step 12: Check fail-on-critical
    const hasCritical = allIssues.some((i) => i.severity === SEVERITY.CRITICAL);
    if (config.failOnCritical && hasCritical) {
      const criticalCount = allIssues.filter((i) => i.severity === SEVERITY.CRITICAL).length;
      const message = `Found ${criticalCount} critical issue(s). Failing as fail-on-critical is enabled.`;
      logger.error(message);
      result.shouldFail = true;
      result.failMessage = message;
    }

    logger.info('AI PR review completed', {
      issuesFound: result.issuesFound,
      approved: result.approved,
    });

    return result;
  } catch (error) {
    logger.error(`Review failed: ${error.message}`);
    // Try to post a failure comment on the PR
    try {
      const octokit = github.getOctokit(config.githubToken);
      const context = github.context;
      const prNumber = context.payload.pull_request?.number;
      if (prNumber) {
        await octokit.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: prNumber,
          body:
            ':x: **AI PR Review failed**\n\n' +
            `The review could not be completed due to an error:\n\`\`\`\n${error.message}\n\`\`\`\n\n` +
            'Please check the action logs for details.',
        });
      }
    } catch (commentError) {
      logger.warn(`Also failed to post error comment: ${commentError.message}`);
    }
    throw error;
  }
}

/**
 * Check if a file should be ignored based on configured patterns.
 * @param {string} filePath - File path to check.
 * @param {object} config - Configuration with ignorePatterns.
 * @returns {boolean} True if the file should be ignored.
 */
function shouldIgnoreFile(filePath, config) {
  if (!filePath) return true;

  for (const pattern of config.ignorePatterns) {
    if (minimatch(filePath, pattern, { dot: true })) {
      logger.debug(`Ignoring file: ${filePath} (matched pattern: ${pattern})`);
      return true;
    }
  }
  return false;
}

/**
 * Build a diff header for a file from the GitHub API response.
 * @param {object} file - File object from pulls.listFiles.
 * @returns {string} Diff header.
 */
function buildDiffHeader(file) {
  const oldPath = file.status === 'added' ? '/dev/null' : `a/${file.filename}`;
  const newPath = file.status === 'removed' ? '/dev/null' : `b/${file.filename}`;
  return `--- ${oldPath}\n+++ ${newPath}`;
}

/**
 * Post a summary when no reviewable changes are found.
 * @param {object} octokit - Authenticated Octokit.
 * @param {object} context - GitHub context.
 * @param {object} config - Configuration.
 */
async function postEmptySummary(octokit, context, config) {
  try {
    const { owner, repo, number: issueNumber } = context.repo;
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body:
        '## :mag: AI Code Review Summary\n\n' +
        ':white_check_mark: **No reviewable changes found.** ' +
        'This PR may contain only binary files, generated files, or files matching your ignore patterns.\n\n' +
        `---\n*Review powered by [AI PR Reviewer](https://github.com/marketplace/ai-pr-reviewer) | Model: ${config.model}*`,
    });
  } catch (error) {
    logger.warn(`Failed to post empty summary: ${error.message}`);
  }
}

module.exports = { reviewPR, shouldIgnoreFile, buildDiffHeader };
