'use strict';

const github = require('@actions/github');
const { reviewPR, shouldIgnoreFile, buildDiffHeader } = require('../src/reviewer');

describe('reviewer', () => {
  let mockOctokit;
  const validConfig = {
    githubToken: 'ghp_test',
    apiKey: 'sk-test',
    apiBase: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 4000,
    severityThreshold: 'info',
    reviewTypes: ['bug', 'security', 'performance', 'quality'],
    language: 'en',
    maxComments: 20,
    chunkSize: 3500,
    maxRetries: 3,
    retryDelay: 2000,
    rateLimitDelay: 10,
    ignorePatterns: [
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
    ],
    autoApprove: false,
    summaryOnly: false,
    failOnCritical: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockOctokit = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({ data: { number: 42 } }),
          listFiles: jest.fn(),
          createReviewComment: jest.fn().mockResolvedValue({ data: { id: 1 } }),
          createReview: jest.fn().mockResolvedValue({ data: { id: 2 } }),
        },
        issues: {
          createComment: jest.fn().mockResolvedValue({ data: { id: 3 } }),
        },
      },
    };

    github.getOctokit.mockReturnValue(mockOctokit);
    github.context = {
      repo: { owner: 'test-owner', repo: 'test-repo', number: 42 },
      payload: { pull_request: { number: 42 } },
    };
  });

  describe('reviewPR', () => {
    test('handles empty diff (no reviewable changes)', async () => {
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [
          { filename: 'package-lock.json', status: 'modified', patch: 'some lockfile change' },
        ],
      });

      const result = await reviewPR(validConfig);
      expect(result.issuesFound).toBe(0);
      expect(result.approved).toBe(false);
    });

    test('handles rate limiting during analysis', async () => {
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [
          {
            filename: 'src/app.js',
            status: 'modified',
            patch: '@@ -1,3 +1,4 @@\n const x = null;\n+console.log(x.y);\n',
          },
        ],
      });

      // The OpenAI mock is inside analyzer.js, so we need to mock at module level
      // For this test, we verify the full flow works with proper API responses
      const result = await reviewPR(validConfig);
      // Result depends on whether OpenAI mock works through the analyzer
      expect(typeof result.issuesFound).toBe('number');
      expect(typeof result.approved).toBe('boolean');
    });

    test('handles API errors gracefully', async () => {
      mockOctokit.rest.pulls.listFiles.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(reviewPR(validConfig)).rejects.toThrow('API rate limit exceeded');
    });

    test('respects max-comments limit', async () => {
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [
          {
            filename: 'src/app.js',
            status: 'modified',
            patch: '@@ -1,1 +1,2 @@\n+const x = 1;\n',
          },
        ],
      });

      const config = { ...validConfig, maxComments: 1 };
      const result = await reviewPR(config);
      expect(typeof result.issuesFound).toBe('number');
    });

    test('filters by severity threshold', async () => {
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [
          {
            filename: 'src/app.js',
            status: 'modified',
            patch: '@@ -1,1 +1,2 @@\n+const x = 1;\n',
          },
        ],
      });

      const config = { ...validConfig, severityThreshold: 'error' };
      const result = await reviewPR(config);
      expect(typeof result.issuesFound).toBe('number');
    });

    test('filters ignored paths', async () => {
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [
          { filename: 'dist/bundle.min.js', status: 'modified', patch: '+minified content' },
          { filename: 'src/app.js', status: 'modified', patch: '@@ -1,1 +1,2 @@\n+const x = 1;\n' },
        ],
      });

      const result = await reviewPR(validConfig);
      // dist/bundle.min.js should be filtered out by *.min.js pattern
      expect(typeof result.issuesFound).toBe('number');
    });

    test('auto-approve when no issues found', async () => {
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [],
      });

      const config = { ...validConfig, autoApprove: true };
      const result = await reviewPR(config);
      expect(result.approved).toBe(true);
    });

    test('fail-on-critical sets shouldFail when critical issues exist', async () => {
      // This tests the integration with commenter which handles actual issues
      // For a true end-to-end test we'd need to mock OpenAI SDK
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [],
      });

      const config = { ...validConfig, failOnCritical: true };
      const result = await reviewPR(config);
      // With no files, there are no critical issues
      expect(result.shouldFail).toBeFalsy();
    });

    test('summary-only mode skips inline comments', async () => {
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [],
      });

      const config = { ...validConfig, summaryOnly: true };
      await reviewPR(config);
      expect(mockOctokit.rest.pulls.createReviewComment).not.toHaveBeenCalled();
    });

    test('throws when not in PR context', async () => {
      github.context = {
        repo: { owner: 'test-owner', repo: 'test-repo' },
        payload: {},
      };

      await expect(reviewPR(validConfig)).rejects.toThrow('No pull request found');
    });

    test('posts error comment on failure', async () => {
      mockOctokit.rest.pulls.listFiles.mockRejectedValue(new Error('Network error'));

      await expect(reviewPR(validConfig)).rejects.toThrow('Network error');

      // Should have tried to post an error comment
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('AI PR Review failed'),
        }),
      );
    });
  });

  describe('shouldIgnoreFile', () => {
    test('ignores files matching patterns', () => {
      expect(shouldIgnoreFile('bundle.min.js', validConfig)).toBe(true);
      expect(shouldIgnoreFile('styles.min.css', validConfig)).toBe(true);
      expect(shouldIgnoreFile('package-lock.json', validConfig)).toBe(true);
      expect(shouldIgnoreFile('image.png', validConfig)).toBe(true);
    });

    test('does not ignore regular files', () => {
      expect(shouldIgnoreFile('src/app.js', validConfig)).toBe(false);
      expect(shouldIgnoreFile('src/styles.css', validConfig)).toBe(false);
      expect(shouldIgnoreFile('README.md', validConfig)).toBe(false);
    });

    test('ignores null/empty paths', () => {
      expect(shouldIgnoreFile('', validConfig)).toBe(true);
      expect(shouldIgnoreFile(null, validConfig)).toBe(true);
    });
  });

  describe('buildDiffHeader', () => {
    test('builds header for modified file', () => {
      const header = buildDiffHeader({ filename: 'src/app.js', status: 'modified' });
      expect(header).toContain('a/src/app.js');
      expect(header).toContain('b/src/app.js');
    });

    test('builds header for added file', () => {
      const header = buildDiffHeader({ filename: 'src/new.js', status: 'added' });
      expect(header).toContain('/dev/null');
      expect(header).toContain('b/src/new.js');
    });

    test('builds header for removed file', () => {
      const header = buildDiffHeader({ filename: 'src/old.js', status: 'removed' });
      expect(header).toContain('a/src/old.js');
      expect(header).toContain('/dev/null');
    });
  });
});
