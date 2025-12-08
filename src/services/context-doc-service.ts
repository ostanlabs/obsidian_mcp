import { Config, NotFoundError, ValidationError, ConflictError } from '../models/types.js';
import { loadCanvas } from './canvas-service.js';
import { readFile, writeFileAtomic, deleteFile, fileExists, listFiles } from '../utils/file-utils.js';
import { getCanvasPath, getContextDocsFolderPath } from '../utils/config.js';
import { dirname } from 'path';

// Prefix used to identify docs from the context docs folder
const CONTEXT_FOLDER_PREFIX = 'context:';

/**
 * Get the folder path where the canvas file is located
 */
export function getCanvasFolderPath(config: Config, canvasSource?: string): string {
  const canvasPath = getCanvasPath(config, canvasSource);
  return dirname(canvasPath);
}

/**
 * Get all MD files in the canvas folder
 */
export async function getAllMdFilesInCanvasFolder(
  config: Config,
  canvasSource?: string
): Promise<string[]> {
  const folderPath = getCanvasFolderPath(config, canvasSource);
  const files = await listFiles(folderPath);
  return files.filter(f => f.endsWith('.md'));
}

/**
 * Get all MD files in the context docs folder (if configured)
 */
export async function getAllMdFilesInContextDocsFolder(
  config: Config
): Promise<string[]> {
  const folderPath = getContextDocsFolderPath(config);
  if (!folderPath) return [];

  const files = await listFiles(folderPath);
  return files.filter(f => f.endsWith('.md'));
}

/**
 * Get all files referenced by the canvas
 */
export async function getCanvasReferencedFiles(
  config: Config,
  canvasSource?: string
): Promise<Set<string>> {
  const canvas = await loadCanvas(config, canvasSource);
  const referencedFiles = new Set<string>();

  for (const node of canvas.nodes) {
    if (node.type === 'file' && node.file) {
      // Extract just the filename from the path
      const parts = node.file.split('/');
      const filename = parts[parts.length - 1];
      referencedFiles.add(filename);
    }
  }

  return referencedFiles;
}

/**
 * Get context documents from both sources:
 * 1. MD files in canvas folder NOT referenced by canvas
 * 2. All MD files in CONTEXT_DOCS_FOLDER (if configured)
 *
 * Files from context docs folder are prefixed with "context:" to distinguish them
 */
export async function getContextDocuments(
  config: Config,
  canvasSource?: string
): Promise<string[]> {
  const result: string[] = [];

  // 1. Get canvas folder context docs (not referenced by canvas)
  const allMdFiles = await getAllMdFilesInCanvasFolder(config, canvasSource);
  const referencedFiles = await getCanvasReferencedFiles(config, canvasSource);
  const canvasFolderDocs = allMdFiles.filter(f => !referencedFiles.has(f));
  result.push(...canvasFolderDocs);

  // 2. Get context docs folder files (if configured)
  const contextFolderDocs = await getAllMdFilesInContextDocsFolder(config);
  // Prefix with "context:" to distinguish from canvas folder docs
  result.push(...contextFolderDocs.map(f => `${CONTEXT_FOLDER_PREFIX}${f}`));

  return result;
}

/**
 * Parse doc name to determine source folder and actual filename
 */
export function parseDocName(docName: string): { isContextFolder: boolean; filename: string } {
  if (docName.startsWith(CONTEXT_FOLDER_PREFIX)) {
    const filename = docName.slice(CONTEXT_FOLDER_PREFIX.length);
    return {
      isContextFolder: true,
      filename: filename.endsWith('.md') ? filename : `${filename}.md`,
    };
  }
  return {
    isContextFolder: false,
    filename: docName.endsWith('.md') ? docName : `${docName}.md`,
  };
}

/**
 * Get full path to a context document
 * Handles both canvas folder docs and context folder docs (prefixed with "context:")
 */
export function getContextDocPath(
  config: Config,
  docName: string,
  canvasSource?: string
): string {
  const { isContextFolder, filename } = parseDocName(docName);

  if (isContextFolder) {
    const contextFolderPath = getContextDocsFolderPath(config);
    if (!contextFolderPath) {
      throw new ValidationError('CONTEXT_DOCS_FOLDER is not configured');
    }
    return `${contextFolderPath}/${filename}`;
  }

  const folderPath = getCanvasFolderPath(config, canvasSource);
  return `${folderPath}/${filename}`;
}

/**
 * Check if a document is a valid context document (exists and not referenced by canvas)
 */
export async function isContextDocument(
  config: Config,
  docName: string,
  canvasSource?: string
): Promise<boolean> {
  const contextDocs = await getContextDocuments(config, canvasSource);
  const { isContextFolder, filename } = parseDocName(docName);

  if (isContextFolder) {
    return contextDocs.includes(`${CONTEXT_FOLDER_PREFIX}${filename}`);
  }
  return contextDocs.includes(filename);
}

/**
 * Read a single context document
 */
export async function readContextDocument(
  config: Config,
  docName: string,
  canvasSource?: string,
  startLine?: number,
  endLine?: number
): Promise<string> {
  const docPath = getContextDocPath(config, docName, canvasSource);
  
  if (!(await fileExists(docPath))) {
    throw new NotFoundError(`Context document not found: ${docName}`);
  }
  
  const content = await readFile(docPath);
  
  // If no line range specified, return full content
  if (startLine === undefined && endLine === undefined) {
    return content;
  }
  
  // Split into lines and apply range (0-based, start inclusive, end exclusive)
  const lines = content.split('\n');
  const start = startLine ?? 0;
  const end = endLine ?? lines.length;
  
  // Validate range
  if (start < 0 || start > lines.length) {
    throw new ValidationError(`Invalid start_line: ${start}. File has ${lines.length} lines (0-${lines.length - 1})`);
  }
  if (end < start) {
    throw new ValidationError(`end_line (${end}) must be >= start_line (${start})`);
  }
  
  return lines.slice(start, end).join('\n');
}

/**
 * Read all context documents
 */
export async function readAllContextDocuments(
  config: Config,
  canvasSource?: string
): Promise<Record<string, string>> {
  const contextDocs = await getContextDocuments(config, canvasSource);
  const result: Record<string, string> = {};
  
  for (const docName of contextDocs) {
    const docPath = getContextDocPath(config, docName, canvasSource);
    try {
      result[docName] = await readFile(docPath);
    } catch {
      // Skip files that can't be read
    }
  }
  
  return result;
}

/**
 * Create a new context document
 */
export async function createContextDocument(
  config: Config,
  docName: string,
  content: string,
  canvasSource?: string
): Promise<void> {
  const docPath = getContextDocPath(config, docName, canvasSource);
  
  if (await fileExists(docPath)) {
    throw new ConflictError(`Document already exists: ${docName}. Use 'replace' operation to overwrite.`);
  }
  
  await writeFileAtomic(docPath, content);
}

/**
 * Replace entire content of a context document
 */
export async function replaceContextDocument(
  config: Config,
  docName: string,
  content: string,
  canvasSource?: string
): Promise<void> {
  const docPath = getContextDocPath(config, docName, canvasSource);
  
  if (!(await fileExists(docPath))) {
    throw new NotFoundError(`Context document not found: ${docName}`);
  }
  
  await writeFileAtomic(docPath, content);
}

/**
 * Delete a context document
 */
export async function deleteContextDocument(
  config: Config,
  docName: string,
  canvasSource?: string
): Promise<void> {
  const docPath = getContextDocPath(config, docName, canvasSource);
  
  if (!(await fileExists(docPath))) {
    throw new NotFoundError(`Context document not found: ${docName}`);
  }
  
  await deleteFile(docPath);
}

/**
 * Insert content at a specific line in a context document
 */
export async function insertAtLine(
  config: Config,
  docName: string,
  content: string,
  startLine: number,
  canvasSource?: string
): Promise<void> {
  const docPath = getContextDocPath(config, docName, canvasSource);
  
  if (!(await fileExists(docPath))) {
    throw new NotFoundError(`Context document not found: ${docName}`);
  }
  
  const existingContent = await readFile(docPath);
  const lines = existingContent.split('\n');
  
  // Validate line number (0-based)
  if (startLine < 0 || startLine > lines.length) {
    throw new ValidationError(`Invalid start_line: ${startLine}. File has ${lines.length} lines (valid range: 0-${lines.length})`);
  }
  
  // Insert content at the specified line
  const newLines = content.split('\n');
  lines.splice(startLine, 0, ...newLines);
  
  await writeFileAtomic(docPath, lines.join('\n'));
}

/**
 * Replace content in a specific line range in a context document
 */
export async function replaceAtRange(
  config: Config,
  docName: string,
  content: string,
  startLine: number,
  endLine: number,
  canvasSource?: string
): Promise<void> {
  const docPath = getContextDocPath(config, docName, canvasSource);
  
  if (!(await fileExists(docPath))) {
    throw new NotFoundError(`Context document not found: ${docName}`);
  }
  
  const existingContent = await readFile(docPath);
  const lines = existingContent.split('\n');
  
  // Validate range (0-based, start inclusive, end exclusive)
  if (startLine < 0 || startLine > lines.length) {
    throw new ValidationError(`Invalid start_line: ${startLine}. File has ${lines.length} lines (valid range: 0-${lines.length - 1})`);
  }
  if (endLine < startLine) {
    throw new ValidationError(`end_line (${endLine}) must be >= start_line (${startLine})`);
  }
  if (endLine > lines.length) {
    throw new ValidationError(`Invalid end_line: ${endLine}. File has ${lines.length} lines (valid range: 0-${lines.length})`);
  }
  
  // Replace lines in range with new content
  const newLines = content.split('\n');
  lines.splice(startLine, endLine - startLine, ...newLines);
  
  await writeFileAtomic(docPath, lines.join('\n'));
}

