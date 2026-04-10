'use strict';

const { createConfig, parseList, isValidSeverity, isValidTemperature, isValidMaxComments } = require('../src/config');

describe('config', () => {
  const validInputs = {
    githubToken: 'ghp_test123',
    apiKey: 'sk-test456',
    apiBase: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    maxComments: '20',
    severityThreshold: 'info',
    language: 'en',
    reviewTypes: 'bug,security,performance,quality',
    ignorePaths: '',
    autoApprove: 'false',
    summaryOnly: 'false',
    failOnCritical: 'false',
    temperature: '0.2',
  };

  describe('createConfig', () => {
    test('creates valid config with all defaults', () => {
      const config = createConfig(validInputs);
      expect(config.githubToken).toBe('ghp_test123');
      expect(config.apiKey).toBe('sk-test456');
      expect(config.model).toBe('gpt-4o');
      expect(config.maxComments).toBe(20);
      expect(config.severityThreshold).toBe('info');
      expect(config.temperature).toBeCloseTo(0.2);
      expect(config.autoApprove).toBe(false);
      expect(config.summaryOnly).toBe(false);
      expect(config.failOnCritical).toBe(false);
      expect(config.reviewTypes).toEqual(['bug', 'security', 'performance', 'quality']);
      // Should be frozen
      expect(() => { config.model = 'changed'; }).toThrow();
    });

    test('throws when githubToken is missing', () => {
      expect(() => createConfig({ ...validInputs, githubToken: '' })).toThrow('github-token is required');
    });

    test('throws when apiKey is missing', () => {
      expect(() => createConfig({ ...validInputs, apiKey: '' })).toThrow('api-key is required');
    });

    test('throws for invalid severity threshold', () => {
      expect(() =>
        createConfig({ ...validInputs, severityThreshold: 'extreme' }),
      ).toThrow('severity-threshold must be one of');
    });

    test('throws for invalid temperature', () => {
      expect(() =>
        createConfig({ ...validInputs, temperature: '5.0' }),
      ).toThrow('temperature must be a number between 0.0 and 2.0');
    });

    test('throws for invalid max-comments', () => {
      expect(() =>
        createConfig({ ...validInputs, maxComments: '0' }),
      ).toThrow('max-comments must be an integer between 1 and 100');
    });

    test('throws for max-comments over 100', () => {
      expect(() =>
        createConfig({ ...validInputs, maxComments: '101' }),
      ).toThrow('max-comments must be an integer between 1 and 100');
    });

    test('throws for empty review types', () => {
      expect(() =>
        createConfig({ ...validInputs, reviewTypes: '   ' }),
      ).toThrow('review-types must contain at least one category');
    });

    test('throws for invalid review types', () => {
      expect(() =>
        createConfig({ ...validInputs, reviewTypes: 'bug,invalid_cat' }),
      ).toThrow('review-types contains invalid categories');
    });

    test('parses boolean inputs correctly', () => {
      const config = createConfig({
        ...validInputs,
        autoApprove: 'true',
        summaryOnly: 'true',
        failOnCritical: 'true',
      });
      expect(config.autoApprove).toBe(true);
      expect(config.summaryOnly).toBe(true);
      expect(config.failOnCritical).toBe(true);
    });

    test('merges user ignore patterns with defaults', () => {
      const config = createConfig({
        ...validInputs,
        ignorePaths: '*.generated.js, dist/**',
      });
      expect(config.ignorePatterns).toContain('*.generated.js');
      expect(config.ignorePatterns).toContain('dist/**');
      expect(config.ignorePatterns).toContain('*.min.js'); // default
    });

    test('applies defaults when optional inputs are undefined', () => {
      const config = createConfig({
        githubToken: 'ghp_test',
        apiKey: 'sk-test',
        maxComments: '20',
        temperature: '0.2',
      });
      expect(config.model).toBe('gpt-4o');
      expect(config.maxComments).toBe(20);
      expect(config.severityThreshold).toBe('info');
      expect(config.temperature).toBeCloseTo(0.2);
    });

    test('trims whitespace from inputs', () => {
      const config = createConfig({
        ...validInputs,
        githubToken: '  ghp_test123  ',
        apiKey: '  sk-test456  ',
      });
      expect(config.githubToken).toBe('ghp_test123');
      expect(config.apiKey).toBe('sk-test456');
    });

    test('removes trailing slashes from apiBase', () => {
      const config = createConfig({
        ...validInputs,
        apiBase: 'https://api.example.com/v1///',
      });
      expect(config.apiBase).toBe('https://api.example.com/v1');
    });
  });

  describe('parseList', () => {
    test('splits comma-separated values', () => {
      expect(parseList('a, b, c')).toEqual(['a', 'b', 'c']);
    });

    test('filters empty values', () => {
      expect(parseList('a,,b,')).toEqual(['a', 'b']);
    });

    test('returns empty array for empty input', () => {
      expect(parseList('')).toEqual([]);
      expect(parseList(null)).toEqual([]);
    });
  });

  describe('isValidSeverity', () => {
    test('returns true for valid severities', () => {
      expect(isValidSeverity('critical')).toBe(true);
      expect(isValidSeverity('error')).toBe(true);
      expect(isValidSeverity('warning')).toBe(true);
      expect(isValidSeverity('info')).toBe(true);
    });

    test('returns false for invalid severity', () => {
      expect(isValidSeverity('extreme')).toBe(false);
    });
  });

  describe('isValidTemperature', () => {
    test('returns true for valid temperatures', () => {
      expect(isValidTemperature(0)).toBe(true);
      expect(isValidTemperature(1.0)).toBe(true);
      expect(isValidTemperature(2.0)).toBe(true);
    });

    test('returns false for out-of-range', () => {
      expect(isValidTemperature(-0.1)).toBe(false);
      expect(isValidTemperature(2.1)).toBe(false);
    });
  });

  describe('isValidMaxComments', () => {
    test('returns true for valid range', () => {
      expect(isValidMaxComments(1)).toBe(true);
      expect(isValidMaxComments(50)).toBe(true);
      expect(isValidMaxComments(100)).toBe(true);
    });

    test('returns false for out-of-range', () => {
      expect(isValidMaxComments(0)).toBe(false);
      expect(isValidMaxComments(101)).toBe(false);
    });
  });
});
