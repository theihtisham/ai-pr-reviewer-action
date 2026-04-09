'use strict';

const logger = require('./logger');

const CHARS_PER_TOKEN = 4;

/**
 * Estimate the number of tokens in a text string.
 * Uses a simple character-based heuristic (~4 chars per token).
 * @param {string} text - Text to estimate tokens for.
 * @returns {number} Estimated token count.
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Build a context header for a file chunk.
 * Includes file metadata and relevant hunk info.
 * @param {object} file - Parsed file diff object.
 * @returns {string} Context header string.
 */
function buildFileContext(file) {
  const parts = [`File: ${file.filePath}`];
  if (file.isNewFile) parts.push('(new file)');
  if (file.isDeletedFile) parts.push('(deleted file)');
  if (file.isRenamed) parts.push(`(renamed from ${file.oldFilePath})`);
  return parts.join(' ');
}

/**
 * Split a single file's hunks into chunks that fit within the token limit.
 * Each chunk includes surrounding context lines.
 * @param {object} file - Parsed file diff object.
 * @param {number} chunkSize - Maximum tokens per chunk.
 * @returns {Array<object>} Array of chunk objects.
 */
function chunkFile(file, chunkSize) {
  const chunks = [];
  const fileContext = buildFileContext(file);
  const contextTokens = estimateTokens(fileContext + '\n\n');

  // Collect all changes from all hunks
  const allChanges = [];
  for (const hunk of file.hunks) {
    allChanges.push(...hunk.changes);
  }

  if (allChanges.length === 0) {
    return [];
  }

  let currentChunkLines = [];
  let currentTokens = contextTokens;
  let lineStart = allChanges[0].lineNumber;
  let lineEnd = allChanges[0].lineNumber;

  for (let i = 0; i < allChanges.length; i++) {
    const change = allChanges[i];
    const lineTokens = estimateTokens(change.content + '\n');

    if (currentTokens + lineTokens > chunkSize && currentChunkLines.length > 0) {
      // Flush current chunk
      chunks.push(
        createChunk(file, fileContext, currentChunkLines, lineStart, lineEnd),
      );
      currentChunkLines = [];
      currentTokens = contextTokens;
      lineStart = change.lineNumber;
    }

    currentChunkLines.push(change.content);
    currentTokens += lineTokens;
    lineEnd = change.lineNumber;
  }

  // Flush remaining lines
  if (currentChunkLines.length > 0) {
    chunks.push(
      createChunk(file, fileContext, currentChunkLines, lineStart, lineEnd),
    );
  }

  return chunks;
}

/**
 * Create a chunk object from accumulated lines.
 * @param {object} file - Source file.
 * @param {string} fileContext - File context header.
 * @param {string[]} lines - Accumulated diff lines.
 * @param {number} startLine - Starting line number.
 * @param {number} endLine - Ending line number.
 * @returns {object} Chunk object.
 */
function createChunk(file, fileContext, lines, startLine, endLine) {
  return {
    filePath: file.filePath,
    fileContent: lines.join('\n'),
    context: fileContext,
    lineRange: { start: startLine, end: endLine },
    isNewFile: file.isNewFile,
    isDeletedFile: file.isDeletedFile,
    isRenamed: file.isRenamed,
    estimatedTokens: estimateTokens(fileContext + '\n' + lines.join('\n')),
  };
}

/**
 * Chunk parsed diff files into groups that fit within token limits.
 * Tries to keep files together when possible, splits large files by hunks.
 *
 * @param {Array<object>} parsedDiff - Output from parseDiff().
 * @param {object} config - Configuration object with chunkSize.
 * @returns {Array<object>} Array of chunk objects ready for AI analysis.
 */
function chunkCode(parsedDiff, config) {
  if (!parsedDiff || !Array.isArray(parsedDiff) || parsedDiff.length === 0) {
    logger.info('No files to chunk');
    return [];
  }

  const chunkSize = config.chunkSize || 3500;
  const allChunks = [];

  for (const file of parsedDiff) {
    try {
      const fileChunks = chunkFile(file, chunkSize);
      allChunks.push(...fileChunks);

      logger.debug(`Chunked ${file.filePath}: ${fileChunks.length} chunk(s)`, {
        hunks: file.hunks.length,
        totalChanges: file.hunks.reduce((sum, h) => sum + h.changes.length, 0),
      });
    } catch (error) {
      logger.warn(`Failed to chunk file ${file.filePath}: ${error.message}`);
    }
  }

  logger.info(`Created ${allChunks.length} chunks from ${parsedDiff.length} files`, {
    totalEstimatedTokens: allChunks.reduce((sum, c) => sum + c.estimatedTokens, 0),
  });

  return allChunks;
}

module.exports = { chunkCode, chunkFile, estimateTokens, buildFileContext };
