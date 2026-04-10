'use strict';

const {
  postReviewComments,
  formatCommentBody,
  buildSummary,
  createApprovingReview,
} = require('../src/commenter');

describe('commenter', () => {
  let mockOctokit;
  let mockContext;

  const validConfig = {
    maxComments: 20,
    autoApprove: false,
    summaryOnly: false,
    model: 'gpt-4o',
    severityThreshold: 'info',
  };

  const sampleIssues = [
    {
      file: 'src/auth.js',
      line: 10,
      severity: 'critical',
      category: 'security',
      title: 'SQL Injection vulnerability',
      description: 'User input is directly concatenated into SQL query',
      suggestion: 'Use parameterized queries',
    },
    {
      file: 'src/auth.js',
      line: 25,
      severity: 'error',
      category: 'bug',
      title: 'Unhandled null reference',
      description: 'Result could be null',
      suggestion: 'Add null check before access',
    },
    {
      file: 'src/server.js',
      line: 15,
      severity: 'warning',
      category: 'performance',
      title: 'Missing pagination',
      description: 'API returns all records without limit',
      suggestion: 'Add limit and offset parameters',
    },
    {
      file: 'src/utils.js',
      line: 3,
      severity: 'info',
      category: 'quality',
      title: 'Hardcoded value',
      description: 'Value should be configurable',
      suggestion: 'Move to environment variable',
    },
  ];

  beforeEach(() => {
    mockOctokit = {
      rest: {
        pulls: {
          createReviewComment: jest.fn().mockResolvedValue({ data: { id: 1 } }),
          createReview: jest.fn().mockResolvedValue({ data: { id: 2 } }),
        },
        issues: {
          createComment: jest.fn().mockResolvedValue({ data: { id: 3 } }),
        },
      },
    };

    mockContext = {
      repo: { owner: 'test-owner', repo: 'test-repo', number: 42 },
    };
  });

  describe('postReviewComments', () => {
    test('posts inline comments for each issue', async () => {
      const result = await postReviewComments(mockOctokit, mockContext, sampleIssues, validConfig);

      expect(mockOctokit.rest.pulls.createReviewComment).toHaveBeenCalledTimes(4);
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1); // summary
      expect(result.inlinePosted).toBe(4);
    });

    test('posts summary comment with correct format', async () => {
      await postReviewComments(mockOctokit, mockContext, sampleIssues, validConfig);

      const summaryCall = mockOctokit.rest.issues.createComment.mock.calls[0][0];
      const body = summaryCall.body;
      expect(body).toContain('AI Code Review Summary');
      expect(body).toContain('critical');
      expect(body).toContain('error');
      expect(body).toContain('warning');
      expect(body).toContain('info');
    });

    test('respects max-comments limit', async () => {
      const config = { ...validConfig, maxComments: 2 };
      const result = await postReviewComments(mockOctokit, mockContext, sampleIssues, config);

      expect(mockOctokit.rest.pulls.createReviewComment).toHaveBeenCalledTimes(2);
      expect(result.inlinePosted).toBe(2);
    });

    test('falls back to general comment when inline fails', async () => {
      mockOctokit.rest.pulls.createReviewComment
        .mockRejectedValueOnce(new Error('Line outside diff range'))
        .mockResolvedValue({ data: { id: 1 } });

      const singleIssue = [sampleIssues[0]];
      const result = await postReviewComments(mockOctokit, mockContext, singleIssue, validConfig);

      // 1 failed inline attempt + 1 fallback general comment + 1 summary
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(2);
      expect(result.generalPosted).toBe(1);
    });

    test('auto-approves when configured and no blocking issues', async () => {
      const config = { ...validConfig, autoApprove: true };
      const infoIssues = [sampleIssues[3]]; // only info severity
      const result = await postReviewComments(mockOctokit, mockContext, infoIssues, config);

      expect(mockOctokit.rest.pulls.createReview).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'APPROVE' }),
      );
      expect(result.approved).toBe(true);
    });

    test('does not auto-approve when critical issues exist', async () => {
      const config = { ...validConfig, autoApprove: true };
      const result = await postReviewComments(mockOctokit, mockContext, sampleIssues, config);

      expect(mockOctokit.rest.pulls.createReview).not.toHaveBeenCalled();
      expect(result.approved).toBe(false);
    });

    test('does not auto-approve when error issues exist', async () => {
      const config = { ...validConfig, autoApprove: true };
      const errorIssues = [sampleIssues[1]]; // error severity
      const result = await postReviewComments(mockOctokit, mockContext, errorIssues, config);

      expect(mockOctokit.rest.pulls.createReview).not.toHaveBeenCalled();
      expect(result.approved).toBe(false);
    });

    test('summary-only mode skips inline comments', async () => {
      const config = { ...validConfig, summaryOnly: true };
      const result = await postReviewComments(mockOctokit, mockContext, sampleIssues, config);

      expect(mockOctokit.rest.pulls.createReviewComment).not.toHaveBeenCalled();
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1);
      expect(result.inlinePosted).toBe(0);
    });

    test('handles empty issues list', async () => {
      const result = await postReviewComments(mockOctokit, mockContext, [], validConfig);

      expect(mockOctokit.rest.pulls.createReviewComment).not.toHaveBeenCalled();
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(1);
      expect(result.inlinePosted).toBe(0);
    });
  });

  describe('formatCommentBody', () => {
    test('formats a comment with all sections', () => {
      const body = formatCommentBody(
        sampleIssues[0],
        ':red_circle:',
        ':lock:',
      );

      expect(body).toContain(':red_circle:');
      expect(body).toContain(':lock:');
      expect(body).toContain('SECURITY');
      expect(body).toContain('SQL Injection vulnerability');
      expect(body).toContain('User input is directly concatenated');
      expect(body).toContain('Use parameterized queries');
      expect(body).toContain('suggestion');
    });
  });

  describe('buildSummary', () => {
    test('shows DO NOT MERGE for critical issues', () => {
      const summary = buildSummary(sampleIssues, validConfig);
      expect(summary).toContain('DO NOT MERGE');
    });

    test('shows Issues found for error-level issues', () => {
      const summary = buildSummary([sampleIssues[1]], validConfig);
      expect(summary).toContain('Issues found');
    });

    test('shows Looks good for no issues', () => {
      const summary = buildSummary([], validConfig);
      expect(summary).toContain('Looks good');
    });

    test('shows Minor issues for warning/info only', () => {
      const summary = buildSummary([sampleIssues[2], sampleIssues[3]], validConfig);
      expect(summary).toContain('Minor issues found');
    });

    test('includes model name in footer', () => {
      const summary = buildSummary([], validConfig);
      expect(summary).toContain('gpt-4o');
    });

    test('lists affected files', () => {
      const summary = buildSummary(sampleIssues, validConfig);
      expect(summary).toContain('src/auth.js');
      expect(summary).toContain('src/server.js');
    });
  });

  describe('createApprovingReview', () => {
    test('creates an APPROVE review', async () => {
      await createApprovingReview(mockOctokit, mockContext);

      expect(mockOctokit.rest.pulls.createReview).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'APPROVE',
          owner: 'test-owner',
          repo: 'test-repo',
          pull_number: 42,
        }),
      );
    });
  });
});
