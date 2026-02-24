import { Config, ValidationError, NotFoundError } from '../models/types.js';
import { getWorkspacePath, getWorkspaceDescription } from '../utils/config.js';
import { readFile, fileExists, getFileModifiedTime } from '../utils/file-utils.js';

/** Default max lines for pagination (conservative for smaller contexts) */
const DEFAULT_MAX_LINES = 100;
/** Maximum allowed max_lines value */
const MAX_LINES_LIMIT = 1000;

export interface ReadDocsInput {
  workspace: string;
  doc_name: string;
  from_line?: number;
  to_line?: number;
  /** Maximum number of lines to return (default: 100, max: 1000). Alternative to to_line. */
  max_lines?: number;
}

export interface ReadDocsResult {
  workspace: string;
  workspace_description: string;
  doc_name: string;
  content: string;
  line_count: number;
  last_changed: string;
  range?: {
    from_line: number;
    to_line: number;
  };
  /** Pagination info for line-based pagination */
  pagination?: {
    returned_lines: number;
    total_lines: number;
    has_more: boolean;
    /** Next from_line value to continue reading */
    next_from_line?: number;
  };
}

export const readDocsDefinition = {
  name: 'read_docs',
  description: `Read a document from a workspace.

Parameters:
- workspace: Name of the workspace (use list_workspaces to see available workspaces)
- doc_name: Filename of the document (with or without .md extension)
- from_line: Optional start line (0-based, inclusive)
- to_line: Optional end line (0-based, exclusive)
- max_lines: Maximum lines to return (default: 100, max: 1000). Alternative to to_line.

Line numbering is 0-based:
- Line 0 is the first line
- from_line=0, to_line=10 returns lines 0-9
- from_line=0, max_lines=10 also returns lines 0-9

Pagination: Default max_lines is 100 (conservative for smaller contexts). Agents with larger context windows can increase max_lines up to 1000. Use pagination.next_from_line to continue reading.`,
  inputSchema: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Name of the workspace to read from',
      },
      doc_name: {
        type: 'string',
        description: 'Name of the document to read (with or without .md extension)',
      },
      from_line: {
        type: 'integer',
        description: 'Start line (0-based, inclusive)',
        minimum: 0,
      },
      to_line: {
        type: 'integer',
        description: 'End line (0-based, exclusive). Mutually exclusive with max_lines.',
        minimum: 0,
      },
      max_lines: {
        type: 'integer',
        description: 'Maximum number of lines to return (default: 100, max: 1000). Alternative to to_line. Increase for larger context windows.',
        minimum: 1,
        maximum: 1000,
      },
    },
    required: ['workspace', 'doc_name'],
  },
};

/**
 * Read a document from a workspace.
 *
 * Pagination: Default max_lines is 100 (conservative for smaller contexts).
 * Agents with larger context windows can increase max_lines up to 1000.
 */
export async function handleReadDocs(
  config: Config,
  input: ReadDocsInput
): Promise<ReadDocsResult> {
  const { workspace, doc_name, from_line, to_line, max_lines } = input;

  if (!workspace) {
    throw new ValidationError('workspace parameter is required');
  }
  if (!doc_name) {
    throw new ValidationError('doc_name parameter is required');
  }
  if (to_line !== undefined && max_lines !== undefined) {
    throw new ValidationError('Cannot specify both to_line and max_lines. Use one or the other.');
  }

  const workspacePath = getWorkspacePath(config, workspace);
  if (!workspacePath) {
    throw new NotFoundError(`Workspace not found: ${workspace}`);
  }

  const workspaceDescription = getWorkspaceDescription(config, workspace) || '';

  // Ensure .md extension
  const filename = doc_name.endsWith('.md') ? doc_name : `${doc_name}.md`;
  const filePath = `${workspacePath}/${filename}`;

  if (!await fileExists(filePath)) {
    throw new NotFoundError(`Document not found: ${filename} in workspace ${workspace}`);
  }

  let content = await readFile(filePath);
  const lastChanged = await getFileModifiedTime(filePath);
  const allLines = content.split('\n');
  const totalLineCount = allLines.length;

  // Determine effective line range
  const start = from_line ?? 0;
  let end: number;

  if (to_line !== undefined) {
    // Explicit to_line takes precedence
    end = to_line;
  } else if (max_lines !== undefined) {
    // Use max_lines (capped at MAX_LINES_LIMIT)
    const effectiveMaxLines = Math.min(max_lines, MAX_LINES_LIMIT);
    end = start + effectiveMaxLines;
  } else if (from_line !== undefined) {
    // If from_line is specified but no end, apply default max_lines
    end = start + DEFAULT_MAX_LINES;
  } else {
    // No pagination specified - return all lines (for backward compatibility)
    // But still cap at a reasonable limit for very large files
    end = Math.min(totalLineCount, DEFAULT_MAX_LINES);
  }

  // Ensure end doesn't exceed total lines
  end = Math.min(end, totalLineCount);

  const selectedLines = allLines.slice(start, end);
  content = selectedLines.join('\n');
  const returnedLines = selectedLines.length;
  const hasMore = end < totalLineCount;

  const result: ReadDocsResult = {
    workspace,
    workspace_description: workspaceDescription,
    doc_name: filename,
    content,
    line_count: totalLineCount,
    last_changed: lastChanged,
    range: {
      from_line: start,
      to_line: end,
    },
  };

  // Add pagination info if there are more lines or we started from a non-zero line
  if (hasMore || start > 0) {
    result.pagination = {
      returned_lines: returnedLines,
      total_lines: totalLineCount,
      has_more: hasMore,
      ...(hasMore ? { next_from_line: end } : {}),
    };
  }

  return result;
}

