'use strict';

const { chunkCode, chunkFile, estimateTokens, buildFileContext } = require('../src/chunker');

describe('chunker', () => {
  const makeFile = (filePath, hunks, options = {}) => ({
    filePath,
    oldFilePath: filePath,
    isNewFile: false,
    isDeletedFile: false,
    isRenamed: false,
    isBinary: false,
    hunks,
    ...options,
  });

  const makeHunk = (oldStart, newStart, changes) => ({
    oldStart,
    oldLines: changes.filter((c) => c.type === 'remove' || c.type === 'context').length,
    newStart,
    newLines: changes.filter((c) => c.type === 'add' || c.type === 'context').length,
    content: changes.map((c) => c.content).join('\n') + '\n',
    changes,
  });

  const makeChange = (type, lineNumber, content) => ({ type, lineNumber, content });

  describe('estimateTokens', () => {
    test('returns 0 for empty/null input', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens(null)).toBe(0);
      expect(estimateTokens(undefined)).toBe(0);
    });

    test('estimates ~4 chars per token', () => {
      expect(estimateTokens('1234')).toBe(1);
      expect(estimateTokens('12345678')).toBe(2);
      expect(estimateTokens('a')).toBe(1); // ceil
    });

    test('handles multi-byte strings', () => {
      const result = estimateTokens('hello world test');
      expect(result).toBe(Math.ceil(16 / 4));
    });
  });

  describe('buildFileContext', () => {
    test('builds context for normal file', () => {
      const file = makeFile('src/app.js', []);
      expect(buildFileContext(file)).toBe('File: src/app.js');
    });

    test('builds context for new file', () => {
      const file = makeFile('src/new.js', [], { isNewFile: true });
      expect(buildFileContext(file)).toContain('(new file)');
    });

    test('builds context for renamed file', () => {
      const file = makeFile('src/new.js', [], {
        isRenamed: true,
        oldFilePath: 'src/old.js',
      });
      expect(buildFileContext(file)).toContain('renamed from src/old.js');
    });
  });

  describe('chunkCode', () => {
    test('returns empty array for empty input', () => {
      expect(chunkCode([], { chunkSize: 3500 })).toEqual([]);
      expect(chunkCode(null, { chunkSize: 3500 })).toEqual([]);
    });

    test('creates single chunk for small file', () => {
      const changes = [
        makeChange('add', 1, '+const x = 1;'),
        makeChange('add', 2, '+const y = 2;'),
      ];
      const file = makeFile('src/small.js', [makeHunk(1, 1, changes)]);
      const chunks = chunkCode([file], { chunkSize: 3500 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].filePath).toBe('src/small.js');
      expect(chunks[0].lineRange).toEqual({ start: 1, end: 2 });
    });

    test('creates multiple chunks for files exceeding chunk size', () => {
      // Create a file with many changes that exceeds the chunk size
      const changes = [];
      for (let i = 1; i <= 50; i++) {
        changes.push(makeChange('add', i, `+const variable${i} = "${'x'.repeat(100)}";`));
      }
      const file = makeFile('src/large.js', [makeHunk(1, 1, changes)]);
      const chunks = chunkCode([file], { chunkSize: 500 });

      expect(chunks.length).toBeGreaterThan(1);
      // All chunks should reference the same file
      chunks.forEach((chunk) => {
        expect(chunk.filePath).toBe('src/large.js');
      });
    });

    test('handles multiple small files', () => {
      const files = [
        makeFile('src/a.js', [makeHunk(1, 1, [makeChange('add', 1, '+const a = 1;')])]),
        makeFile('src/b.js', [makeHunk(1, 1, [makeChange('add', 1, '+const b = 2;')])]),
      ];

      const chunks = chunkCode(files, { chunkSize: 3500 });
      expect(chunks).toHaveLength(2);
      expect(chunks[0].filePath).toBe('src/a.js');
      expect(chunks[1].filePath).toBe('src/b.js');
    });

    test('handles file with no changes', () => {
      const file = makeFile('src/empty.js', [makeHunk(1, 1, [])]);
      const chunks = chunkCode([file], { chunkSize: 3500 });
      expect(chunks).toHaveLength(0);
    });

    test('includes file metadata in each chunk', () => {
      const file = makeFile('src/new.js', [makeHunk(0, 1, [makeChange('add', 1, '+const x = 1;')])], { isNewFile: true });
      const chunks = chunkCode([file], { chunkSize: 3500 });

      expect(chunks[0].isNewFile).toBe(true);
      expect(chunks[0].context).toContain('new file');
      expect(chunks[0].estimatedTokens).toBeGreaterThan(0);
    });
  });

  describe('chunkFile', () => {
    test('handles file with multiple hunks', () => {
      const hunk1 = makeHunk(1, 1, [makeChange('add', 1, '+line 1')]);
      const hunk2 = makeHunk(10, 10, [makeChange('add', 10, '+line 10')]);
      const file = makeFile('src/multi.js', [hunk1, hunk2]);

      const chunks = chunkFile(file, 3500);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
