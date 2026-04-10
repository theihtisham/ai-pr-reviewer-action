'use strict';

const fs = require('fs');
const path = require('path');
const { parseDiff, extractFilePath, getChangeType, truncateLine } = require('../src/parser');

describe('parser', () => {
  describe('parseDiff', () => {
    test('parses a simple single-file diff', () => {
      const diff =
        '--- a/src/hello.js\n' +
        '+++ b/src/hello.js\n' +
        '@@ -1,5 +1,6 @@\n' +
        ' const greeting = "hello";\n' +
        '+const name = "world";\n' +
        ' function sayHello() {\n' +
        '-  return greeting;\n' +
        '+  return greeting + " " + name;\n' +
        ' }\n';

      const files = parseDiff(diff);
      expect(files).toHaveLength(1);
      expect(files[0].filePath).toBe('src/hello.js');
      expect(files[0].isNewFile).toBe(false);
      expect(files[0].isDeletedFile).toBe(false);
      expect(files[0].hunks).toHaveLength(1);
      expect(files[0].hunks[0].changes.length).toBeGreaterThanOrEqual(2);
    });

    test('parses a multi-file diff', () => {
      const diffPath = path.join(__dirname, 'fixtures', 'sample.diff');
      const diffText = fs.readFileSync(diffPath, 'utf-8');
      const files = parseDiff(diffText);

      // sample.diff has 5 files, but package-lock.json has no hunk header (just @@ replacement)
      // so it may not have hunks. Let's check for at least the files with hunks.
      expect(files.length).toBeGreaterThanOrEqual(3);
      const filePaths = files.map((f) => f.filePath);
      expect(filePaths).toContain('src/auth.js');
      expect(filePaths).toContain('src/server.js');
    });

    test('parses a new file (no old content)', () => {
      const diff =
        '--- /dev/null\n' +
        '+++ b/src/new-file.js\n' +
        '@@ -0,0 +1,5 @@\n' +
        '+const x = 1;\n' +
        '+const y = 2;\n' +
        '+\n' +
        '+console.log(x + y);\n' +
        '+module.exports = { x, y };\n';

      const files = parseDiff(diff);
      expect(files).toHaveLength(1);
      expect(files[0].filePath).toBe('src/new-file.js');
      expect(files[0].isNewFile).toBe(true);
    });

    test('parses a deleted file', () => {
      const diff =
        '--- a/src/old-file.js\n' +
        '+++ /dev/null\n' +
        '@@ -1,3 +0,0 @@\n' +
        '-const old = true;\n' +
        '-console.log(old);\n' +
        '-module.exports = old;\n';

      const files = parseDiff(diff);
      expect(files).toHaveLength(1);
      expect(files[0].filePath).toBe('/dev/null'); // deleted file target is /dev/null
      // The old file path is stored
      expect(files[0].oldFilePath).toBe('src/old-file.js');
      expect(files[0].isDeletedFile).toBe(true);
    });

    test('detects renamed files', () => {
      const diff =
        '--- a/src/old-name.js\n' +
        '+++ b/src/new-name.js\n' +
        '@@ -1,3 +1,3 @@\n' +
        ' const x = 1;\n' +
        '-const y = 2;\n' +
        '+const y = 3;\n' +
        ' module.exports = { x, y };\n';

      const files = parseDiff(diff);
      expect(files).toHaveLength(1);
      expect(files[0].isRenamed).toBe(true);
      expect(files[0].oldFilePath).toBe('src/old-name.js');
      expect(files[0].filePath).toBe('src/new-name.js');
    });

    test('skips binary files', () => {
      const diff =
        '--- a/image.png\n' +
        '+++ b/image.png\n' +
        'Binary files a/image.png and b/image.png differ\n' +
        '--- a/src/code.js\n' +
        '+++ b/src/code.js\n' +
        '@@ -1,2 +1,2 @@\n' +
        ' const a = 1;\n' +
        '+const b = 2;\n';

      const files = parseDiff(diff);
      // Binary file should be skipped
      expect(files.some((f) => f.filePath === 'image.png')).toBe(false);
      expect(files.some((f) => f.filePath === 'src/code.js')).toBe(true);
    });

    test('handles empty diff', () => {
      expect(parseDiff('')).toEqual([]);
      expect(parseDiff(null)).toEqual([]);
      expect(parseDiff(undefined)).toEqual([]);
    });

    test('handles malformed diff gracefully', () => {
      const diff = 'this is not a valid diff\nno headers here\n';
      const files = parseDiff(diff);
      expect(files).toEqual([]);
    });

    test('truncates very long lines', () => {
      const longLine = '+'.padEnd(2000, 'x');
      const diff =
        '--- a/src/code.js\n' +
        '+++ b/src/code.js\n' +
        '@@ -1,1 +1,1 @@\n' +
        `${longLine}\n`;

      const files = parseDiff(diff);
      expect(files).toHaveLength(1);
      // The content should be truncated
      const addChanges = files[0].hunks[0].changes.filter((c) => c.type === 'add');
      expect(addChanges.length).toBeGreaterThan(0);
      expect(addChanges[0].content.length).toBeLessThanOrEqual(1016); // 1000 + ' ... [truncated]'
    });
  });

  describe('extractFilePath', () => {
    test('removes a/ prefix', () => {
      expect(extractFilePath('a/src/file.js')).toBe('src/file.js');
    });

    test('removes b/ prefix', () => {
      expect(extractFilePath('b/src/file.js')).toBe('src/file.js');
    });

    test('handles /dev/null', () => {
      expect(extractFilePath('/dev/null')).toBe('/dev/null');
    });

    test('removes surrounding quotes', () => {
      expect(extractFilePath('"src/file with spaces.js"')).toBe('src/file with spaces.js');
    });
  });

  describe('getChangeType', () => {
    test('identifies add lines', () => {
      expect(getChangeType('+const x = 1;')).toBe('add');
    });

    test('identifies remove lines', () => {
      expect(getChangeType('-const x = 1;')).toBe('remove');
    });

    test('identifies context lines', () => {
      expect(getChangeType(' const x = 1;')).toBe('context');
    });

    test('returns null for non-change lines', () => {
      expect(getChangeType('@@ -1,1 +1,1 @@')).toBeNull();
      expect(getChangeType('')).toBeNull();
    });
  });

  describe('truncateLine', () => {
    test('does not truncate short lines', () => {
      expect(truncateLine('short line')).toBe('short line');
    });

    test('truncates lines over 1000 chars', () => {
      const long = 'x'.repeat(1001);
      const result = truncateLine(long);
      expect(result).toContain('[truncated]');
      expect(result.length).toBeLessThanOrEqual(1016); // 1000 + suffix
    });
  });
});
