'use strict';

// Jest setup file - runs before each test suite

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  notice: jest.fn(),
  setFailed: jest.fn(),
  getInput: jest.fn(),
  setOutput: jest.fn(),
}));

// Mock @actions/github
jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo',
    },
    payload: {
      pull_request: {
        number: 42,
      },
    },
  },
  getOctokit: jest.fn(),
}));

// Suppress console output during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
