import { Config, NotFoundError, ValidationError, ConflictError } from '../models/types.js';
import { readFile, writeFileAtomic, deleteFile, fileExists, listFiles } from '../utils/file-utils.js';
import { getWorkspacePath } from '../utils/config.js';

/**
 * Validate workspace exists and return its path
 */
export function validateWorkspace(config: Config, workspace: string): string {
  const workspacePath = getWorkspacePath(config, workspace);
  if (!workspacePath) {
    const available = Object.keys(config.workspaces);
    throw new ValidationError(
      `Workspace "${workspace}" not found. Available workspaces: ${available.length > 0 ? available.join(', ') : '(none configured)'}`
    );
  }
  return workspacePath;
}

/**
 * Normalize filename to ensure .md extension
 */
export function normalizeFilename(filename: string): string {
  return filename.endsWith('.md') ? filename : `${filename}.md`;
}

/**
 * Get full path to a document in a workspace
 */
export function getDocPath(config: Config, workspace: string, filename: string): string {
  const workspacePath = validateWorkspace(config, workspace);
  return `${workspacePath}/${normalizeFilename(filename)}`;
}

/**
 * List all .md files in a workspace
 */
export async function listWorkspaceFiles(config: Config, workspace: string): Promise<string[]> {
  const workspacePath = validateWorkspace(config, workspace);

  try {
    const files = await listFiles(workspacePath);
    return files.filter(f => f.endsWith('.md'));
  } catch {
    // Folder might not exist yet
    return [];
  }
}

/**
 * Read a document from a workspace
 */
export async function readDocument(
  config: Config,
  workspace: string,
  filename: string,
  startLine?: number,
  endLine?: number
): Promise<string> {
  const docPath = getDocPath(config, workspace, filename);

  if (!(await fileExists(docPath))) {
    throw new NotFoundError(`Document not found: ${filename} in workspace "${workspace}"`);
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
 * Read all documents from a workspace
 */
export async function readAllDocuments(
  config: Config,
  workspace: string
): Promise<Record<string, string>> {
  const files = await listWorkspaceFiles(config, workspace);
  const result: Record<string, string> = {};

  for (const filename of files) {
    const docPath = getDocPath(config, workspace, filename);
    try {
      result[filename] = await readFile(docPath);
    } catch {
      // Skip files that can't be read
    }
  }

  return result;
}

/**
 * Create a new document in a workspace
 */
export async function createDocument(
  config: Config,
  workspace: string,
  filename: string,
  content: string
): Promise<void> {
  const docPath = getDocPath(config, workspace, filename);

  if (await fileExists(docPath)) {
    throw new ConflictError(`Document already exists: ${filename} in workspace "${workspace}". Use 'replace' operation to overwrite.`);
  }

  await writeFileAtomic(docPath, content);
}

/**
 * Replace entire content of a document
 */
export async function replaceDocument(
  config: Config,
  workspace: string,
  filename: string,
  content: string
): Promise<void> {
  const docPath = getDocPath(config, workspace, filename);

  if (!(await fileExists(docPath))) {
    throw new NotFoundError(`Document not found: ${filename} in workspace "${workspace}"`);
  }

  await writeFileAtomic(docPath, content);
}

/**
 * Delete a document from a workspace
 */
export async function deleteDocument(
  config: Config,
  workspace: string,
  filename: string
): Promise<void> {
  const docPath = getDocPath(config, workspace, filename);

  if (!(await fileExists(docPath))) {
    throw new NotFoundError(`Document not found: ${filename} in workspace "${workspace}"`);
  }

  await deleteFile(docPath);
}

/**
 * Insert content at a specific line in a document
 */
export async function insertAtLine(
  config: Config,
  workspace: string,
  filename: string,
  content: string,
  startLine: number
): Promise<void> {
  const docPath = getDocPath(config, workspace, filename);

  if (!(await fileExists(docPath))) {
    throw new NotFoundError(`Document not found: ${filename} in workspace "${workspace}"`);
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
 * Replace content in a specific line range in a document
 */
export async function replaceAtRange(
  config: Config,
  workspace: string,
  filename: string,
  content: string,
  startLine: number,
  endLine: number
): Promise<void> {
  const docPath = getDocPath(config, workspace, filename);

  if (!(await fileExists(docPath))) {
    throw new NotFoundError(`Document not found: ${filename} in workspace "${workspace}"`);
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

