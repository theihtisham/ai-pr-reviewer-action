'use strict';

const {
  analyzeChunk,
  parseAIResponse,
  validateIssue,
  filterBySeverity,
  mapLineNumbers,
  deduplicateIssues,
  sortIssuesBySeverity,
} = require('../src/analyzer');

describe('analyzer', () => {
  const validConfig = {
    apiKey: 'test-key',
    apiBase: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 4000,
    severityThreshold: 'info',
    reviewTypes: ['bug', 'security', 'performance', 'quality'],
    language: 'en',
  };

  describe('parseAIResponse', () => {
    test('parses valid JSON with issues array', () => {
      const content = JSON.stringify({
        issues: [
          {
            file: 'src/app.js',
            line: 10,
            severity: 'error',
            category: 'bug',
            title: 'Null pointer access',
            description: 'Variable could be null',
            suggestion: 'Add null check',
          },
        ],
      });

      const issues = parseAIResponse(content, 'src/app.js');
      expect(issues).toHaveLength(1);
      expect(issues[0].title).toBe('Null pointer access');
    });

    test('parses direct array response', () => {
      const content = JSON.stringify([
        {
          file: 'src/app.js',
          line: 5,
          severity: 'warning',
          category: 'quality',
          title: 'Missing error handling',
          description: 'Should handle errors',
          suggestion: 'Add try/catch',
        },
      ]);

      const issues = parseAIResponse(content, 'src/app.js');
      expect(issues).toHaveLength(1);
    });

    test('returns empty array for no issues', () => {
      const content = JSON.stringify({ issues: [] });
      const issues = parseAIResponse(content, 'src/app.js');
      expect(issues).toEqual([]);
    });

    test('handles invalid JSON', () => {
      const issues = parseAIResponse('not json at all', 'src/app.js');
      expect(issues).toEqual([]);
    });

    test('handles response with unexpected structure', () => {
      const issues = parseAIResponse(JSON.stringify({ data: [] }), 'src/app.js');
      expect(issues).toEqual([]);
    });
  });

  describe('validateIssue', () => {
    test('validates a complete issue', () => {
      const issue = {
        severity: 'error',
        category: 'bug',
        title: 'Test issue',
        description: 'A test description',
        line: 10,
        suggestion: 'Fix it like this',
      };

      const result = validateIssue(issue, 'src/app.js');
      expect(result).not.toBeNull();
      expect(result.severity).toBe('error');
      expect(result.line).toBe(10);
    });

    test('returns null for missing required fields', () => {
      expect(validateIssue({ severity: 'error' }, 'src/app.js')).toBeNull();
      expect(validateIssue(null, 'src/app.js')).toBeNull();
      expect(validateIssue({}, 'src/app.js')).toBeNull();
    });

    test('returns null for invalid severity', () => {
      const issue = {
        severity: 'extreme',
        category: 'bug',
        title: 'Test',
        description: 'Desc',
        line: 1,
        suggestion: 'Fix',
      };
      expect(validateIssue(issue, 'src/app.js')).toBeNull();
    });

    test('returns null for invalid line number', () => {
      const issue = {
        severity: 'error',
        category: 'bug',
        title: 'Test',
        description: 'Desc',
        line: -1,
        suggestion: 'Fix',
      };
      expect(validateIssue(issue, 'src/app.js')).toBeNull();
    });

    test('uses default file path when not provided', () => {
      const issue = {
        severity: 'info',
        category: 'quality',
        title: 'Test',
        description: 'Desc',
        line: 5,
        suggestion: 'Fix',
      };
      const result = validateIssue(issue, 'src/default.js');
      expect(result.file).toBe('src/default.js');
    });

    test('truncates long titles to 80 characters', () => {
      const issue = {
        severity: 'info',
        category: 'quality',
        title: 'A'.repeat(100),
        description: 'Desc',
        line: 1,
        suggestion: 'Fix',
      };
      const result = validateIssue(issue, 'src/app.js');
      expect(result.title.length).toBeLessThanOrEqual(80);
    });
  });

  describe('filterBySeverity', () => {
    const issues = [
      { severity: 'critical', title: 'A' },
      { severity: 'error', title: 'B' },
      { severity: 'warning', title: 'C' },
      { severity: 'info', title: 'D' },
    ];

    test('filters to critical only', () => {
      const result = filterBySeverity(issues, 'critical');
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('critical');
    });

    test('filters to error and above', () => {
      const result = filterBySeverity(issues, 'error');
      expect(result).toHaveLength(2);
    });

    test('includes all at info threshold', () => {
      const result = filterBySeverity(issues, 'info');
      expect(result).toHaveLength(4);
    });

    test('returns all for invalid threshold', () => {
      const result = filterBySeverity(issues, 'unknown');
      expect(result).toHaveLength(4);
    });
  });

  describe('mapLineNumbers', () => {
    test('clamps line numbers to chunk range', () => {
      const chunk = {
        filePath: 'src/app.js',
        lineRange: { start: 10, end: 20 },
      };
      const issues = [
        { line: 5, file: 'src/app.js' },
        { line: 15, file: 'src/app.js' },
        { line: 30, file: 'src/app.js' },
      ];

      const mapped = mapLineNumbers(issues, chunk);
      expect(mapped[0].line).toBe(10); // clamped up
      expect(mapped[1].line).toBe(15); // unchanged
      expect(mapped[2].line).toBe(20); // clamped down
    });
  });

  describe('deduplicateIssues', () => {
    test('removes duplicates with same file, line, and title', () => {
      const issues = [
        { file: 'a.js', line: 1, title: 'Bug' },
        { file: 'a.js', line: 1, title: 'Bug' },
        { file: 'a.js', line: 2, title: 'Bug' },
      ];
      const result = deduplicateIssues(issues);
      expect(result).toHaveLength(2);
    });

    test('keeps issues with different attributes', () => {
      const issues = [
        { file: 'a.js', line: 1, title: 'Bug A' },
        { file: 'a.js', line: 1, title: 'Bug B' },
      ];
      const result = deduplicateIssues(issues);
      expect(result).toHaveLength(2);
    });
  });

  describe('sortIssuesBySeverity', () => {
    test('sorts critical issues first', () => {
      const issues = [
        { severity: 'info', title: 'A' },
        { severity: 'critical', title: 'B' },
        { severity: 'warning', title: 'C' },
        { severity: 'error', title: 'D' },
      ];

      const sorted = sortIssuesBySeverity(issues);
      expect(sorted[0].severity).toBe('critical');
      expect(sorted[1].severity).toBe('error');
      expect(sorted[2].severity).toBe('warning');
      expect(sorted[3].severity).toBe('info');
    });
  });

  describe('analyzeChunk', () => {
    test('returns issues from successful AI call', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                issues: [
                  {
                    file: 'src/app.js',
                    line: 10,
                    severity: 'error',
                    category: 'bug',
                    title: 'Null access',
                    description: 'Variable is null',
                    suggestion: 'Add null check',
                  },
                ],
              }),
            },
          },
        ],
      };

      const mockRateLimiter = {
        retryWithBackoff: jest.fn().mockResolvedValue(mockResponse),
      };

      const chunk = {
        filePath: 'src/app.js',
        fileContent: '+const x = null;\n+console.log(x.y);',
        context: 'File: src/app.js',
        lineRange: { start: 10, end: 11 },
        isNewFile: false,
        isDeletedFile: false,
        isRenamed: false,
        estimatedTokens: 50,
      };

      const issues = await analyzeChunk(chunk, validConfig, mockRateLimiter);
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('error');
    });

    test('returns empty array when AI finds no issues', async () => {
      const mockResponse = {
        choices: [{ message: { content: JSON.stringify({ issues: [] }) } }],
      };

      const mockRateLimiter = {
        retryWithBackoff: jest.fn().mockResolvedValue(mockResponse),
      };

      const chunk = {
        filePath: 'src/clean.js',
        fileContent: '+const x = 1;',
        context: 'File: src/clean.js',
        lineRange: { start: 1, end: 1 },
        estimatedTokens: 10,
      };

      const issues = await analyzeChunk(chunk, validConfig, mockRateLimiter);
      expect(issues).toEqual([]);
    });

    test('returns empty array for empty AI response', async () => {
      const mockResponse = { choices: [{ message: { content: null } }] };
      const mockRateLimiter = {
        retryWithBackoff: jest.fn().mockResolvedValue(mockResponse),
      };

      const chunk = {
        filePath: 'src/test.js',
        fileContent: '+test',
        context: 'File: src/test.js',
        lineRange: { start: 1, end: 1 },
        estimatedTokens: 5,
      };

      const issues = await analyzeChunk(chunk, validConfig, mockRateLimiter);
      expect(issues).toEqual([]);
    });

    test('throws on API error', async () => {
      const mockRateLimiter = {
        retryWithBackoff: jest.fn().mockRejectedValue(new Error('API unavailable')),
      };

      const chunk = {
        filePath: 'src/test.js',
        fileContent: '+test',
        context: 'File: src/test.js',
        lineRange: { start: 1, end: 1 },
        estimatedTokens: 5,
      };

      await expect(analyzeChunk(chunk, validConfig, mockRateLimiter)).rejects.toThrow('API unavailable');
    });
  });
});
