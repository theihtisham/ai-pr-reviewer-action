'use strict';

const core = require('@actions/core');
const { createConfig } = require('./src/config');
const { reviewPR } = require('./src/reviewer');
const logger = require('./src/logger');

/**
 * Main entry point for the AI PR Reviewer GitHub Action.
 * Reads inputs, validates configuration, runs the review, and sets outputs.
 */
async function run() {
  try {
    logger.info('AI PR Reviewer starting');

    // Read all inputs from the GitHub Actions environment
    const inputs = {
      githubToken: core.getInput('github-token', { required: true }),
      apiKey: core.getInput('api-key', { required: true }),
      apiBase: core.getInput('api-base') || undefined,
      model: core.getInput('model') || undefined,
      maxComments: core.getInput('max-comments') || undefined,
      severityThreshold: core.getInput('severity-threshold') || undefined,
      language: core.getInput('language') || undefined,
      reviewTypes: core.getInput('review-types') || undefined,
      ignorePaths: core.getInput('ignore-paths') || undefined,
      autoApprove: core.getInput('auto-approve') || undefined,
      summaryOnly: core.getInput('summary-only') || undefined,
      failOnCritical: core.getInput('fail-on-critical') || undefined,
      temperature: core.getInput('temperature') || undefined,
    };

    // Create and validate configuration
    const config = createConfig(inputs);

    // Run the review
    const result = await reviewPR(config);

    // Set outputs
    core.setOutput('issues-found', String(result.issuesFound));
    core.setOutput('summary', result.summary);
    core.setOutput('approved', String(result.approved));

    // Handle fail-on-critical
    if (result.shouldFail) {
      core.setFailed(result.failMessage);
      return;
    }

    logger.info(`Review complete: ${result.issuesFound} issue(s) found, approved: ${result.approved}`);
  } catch (error) {
    logger.setFailed(`Action failed: ${error.message}`);
    core.setOutput('issues-found', '0');
    core.setOutput('summary', `Review failed: ${error.message}`);
    core.setOutput('approved', 'false');
  }
}

// Only run if called directly (not imported by tests)
if (require.main === module) {
  run();
}

module.exports = { run };
