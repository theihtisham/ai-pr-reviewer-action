'use strict';

const logger = require('./logger');

const MAX_LINE_LENGTH = 1000;

/**
 * Truncate a line if it exceeds the maximum allowed length.
 * @param {string} line - The line to potentially truncate.
 * @returns {string} The original or truncated line.
 */
function truncateLine(line) {
  if (line.length > MAX_LINE_LENGTH) {
    return line.substring(0, MAX_LINE_LENGTH) + ' ... [truncated]';
  }
  return line;
}

/**
 * Parse unified diff text into a structured array of file diffs.
 * Handles: normal diffs, new files, deleted files, renamed files,
 * binary files, empty diffs, and malformed diffs.
 *
 * @param {string} diffText - Raw unified diff text.
 * @returns {Array<object>} Array of parsed file diff objects.
 */
function parseDiff(diffText) {
  if (!diffText || typeof diffText !== 'string') {
    logger.warn('Empty or invalid diff text received');
    return [];
  }

  const files = [];
  const lines = diffText.split('\n');
  let currentFile = null;
  let currentHunk = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match file header: --- a/path or --- /dev/null
    if (line.startsWith('--- ')) {
      const oldPath = line.substring(4).trim();

      // Check for next line (+++ b/path)
      if (i + 1 < lines.length && lines[i + 1].startsWith('+++ ')) {
        const newPath = lines[i + 1].substring(4).trim();
        i++; // Skip the +++ line

        currentFile = {
          filePath: extractFilePath(newPath),
          oldFilePath: extractFilePath(oldPath),
          isNewFile: oldPath === '/dev/null' || oldPath === 'dev/null',
          isDeletedFile: newPath === '/dev/null' || newPath === 'dev/null',
          isRenamed: false,
          isBinary: false,
          hunks: [],
        };

        // Check for rename
        if (
          !currentFile.isNewFile &&
          !currentFile.isDeletedFile &&
          currentFile.oldFilePath !== currentFile.filePath
        ) {
          currentFile.isRenamed = true;
        }

        files.push(currentFile);
        currentHunk = null;
      }
      continue;
    }

    // Binary file indicator
    if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
      if (currentFile) {
        currentFile.isBinary = true;
        logger.debug(`Skipping binary file: ${currentFile.filePath}`);
      }
      continue;
    }

    // Skip diff stats lines
    if (line.startsWith('diff --git')) {
      // Extract paths from git diff header for rename detection
      const gitMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (gitMatch) {
        const oldGitPath = gitMatch[1];
        const newGitPath = gitMatch[2];
        // If we already have a current file from ---/+++ headers, check rename
        if (currentFile && !currentFile.isNewFile && !currentFile.isDeletedFile) {
          if (oldGitPath !== newGitPath) {
            currentFile.isRenamed = true;
            currentFile.oldFilePath = oldGitPath;
          }
        }
      }
      continue;
    }

    // Skip other header lines
    if (
      line.startsWith('index ') ||
      line.startsWith('new file ') ||
      line.startsWith('deleted file ') ||
      line.startsWith('old mode ') ||
      line.startsWith('new mode ') ||
      line.startsWith('similarity index ') ||
      line.startsWith('rename from ') ||
      line.startsWith('rename to ') ||
      line.startsWith('copy from ') ||
      line.startsWith('copy to ')
    ) {
      // Handle rename from/to
      if (line.startsWith('rename from ') && currentFile) {
        currentFile.oldFilePath = line.substring(12).trim();
        currentFile.isRenamed = true;
      }
      if (line.startsWith('rename to ') && currentFile) {
        currentFile.filePath = line.substring(10).trim();
        currentFile.isRenamed = true;
      }
      // Handle new file / deleted file markers
      if (line.startsWith('new file') && currentFile) {
        currentFile.isNewFile = true;
      }
      if (line.startsWith('deleted file') && currentFile) {
        currentFile.isDeletedFile = true;
      }
      continue;
    }

    // Match hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    const hunkMatch = line.match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/,
    );
    if (hunkMatch && currentFile) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newLines: hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1,
        content: '',
        changes: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    // Parse change lines within a hunk
    if (currentHunk && line.length > 0) {
      const truncated = truncateLine(line);
      const changeType = getChangeType(line);

      if (changeType) {
        const changeLineNumber = calculateLineNumber(line, currentHunk);
        currentHunk.changes.push({
          type: changeType,
          lineNumber: changeLineNumber,
          content: truncated,
        });
      }

      currentHunk.content += truncated + '\n';
    }
  }

  // Filter out binary files and files with no hunks
  const result = files.filter((f) => {
    if (f.isBinary) return false;
    if (f.hunks.length === 0) {
      logger.debug(`Skipping file with no hunks: ${f.filePath}`);
      return false;
    }
    return true;
  });

  logger.info(`Parsed ${result.length} files from diff`, {
    totalFiles: files.length,
    binarySkipped: files.filter((f) => f.isBinary).length,
    emptySkipped: files.filter((f) => !f.isBinary && f.hunks.length === 0).length,
  });

  return result;
}

/**
 * Extract a clean file path from a diff header path.
 * Removes the a/ or b/ prefix.
 * @param {string} path - Raw path from diff header.
 * @returns {string} Clean file path.
 */
function extractFilePath(path) {
  if (path === '/dev/null' || path === 'dev/null') return path;
  // Remove quotes if present
  let cleaned = path;
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }
  // Remove a/ or b/ prefix
  if (cleaned.startsWith('a/') || cleaned.startsWith('b/')) {
    cleaned = cleaned.substring(2);
  }
  return cleaned;
}

/**
 * Determine the type of a change line.
 * @param {string} line - A single diff line.
 * @returns {'add'|'remove'|'context'|null} Change type or null.
 */
function getChangeType(line) {
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'remove';
  if (line.startsWith(' ')) return 'context';
  return null;
}

/**
 * Calculate the new-file line number for a change.
 * @param {string} line - The change line.
 * @param {object} hunk - The current hunk.
 * @returns {number} Line number in the new file.
 */
function calculateLineNumber(line, hunk) {
  // Count adds and contexts up to this point to determine line number
  let newLine = hunk.newStart;
  for (const change of hunk.changes) {
    if (change.type === 'add' || change.type === 'context') {
      newLine = change.lineNumber + 1;
    }
  }

  if (line.startsWith('+')) {
    return newLine;
  }
  if (line.startsWith(' ')) {
    return newLine;
  }
  // For removed lines, use the current new line position
  return newLine;
}

module.exports = { parseDiff, extractFilePath, getChangeType, truncateLine };
