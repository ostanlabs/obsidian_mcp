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
  /** If true, returns only the document outline (headings) without content. */
  outline_only?: boolean;
  /** Search query to filter content. Returns only sections matching the query. */
  search?: string;
}

/** Heading in document outline */
export interface OutlineHeading {
  level: number;
  text: string;
  line: number;
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
  /** Document outline (headings) - included when outline_only=true or always for context */
  outline?: OutlineHeading[];
  /** Search matches info - included when search parameter is used */
  search_info?: {
    query: string;
    matches: number;
    sections_returned: number;
  };
}

export const readDocsDefinition = {
  name: 'read_docs',
  description: `Read a document from a workspace with optional outline and search modes.

MODES:
- Default: Returns full content (with pagination)
- outline_only=true: Returns only document structure (headings) - minimal context usage
- search="query": Returns only sections matching the query - targeted retrieval

Parameters:
- workspace: Name of the workspace (use list_workspaces to see available workspaces)
- doc_name: Filename of the document (with or without .md extension)
- outline_only: If true, returns only headings (no content)
- search: Query to filter content - returns only matching sections
- from_line: Optional start line (0-based, inclusive)
- to_line: Optional end line (0-based, exclusive)
- max_lines: Maximum lines to return (default: 100, max: 1000). Alternative to to_line.

EXAMPLES:
- Get outline: { workspace: "docs", doc_name: "api-spec", outline_only: true }
- Search: { workspace: "docs", doc_name: "api-spec", search: "authentication" }
- Full read: { workspace: "docs", doc_name: "api-spec" }

Pagination: Default max_lines is 100. Use pagination.next_from_line to continue reading.`,
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
      outline_only: {
        type: 'boolean',
        description: 'If true, returns only document outline (headings) without content. Minimal context usage.',
      },
      search: {
        type: 'string',
        description: 'Search query to filter content. Returns only sections matching the query.',
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
        description: 'Maximum number of lines to return (default: 100, max: 1000). Alternative to to_line.',
        minimum: 1,
        maximum: 1000,
      },
    },
    required: ['workspace', 'doc_name'],
  },
};

/**
 * Extract document outline (headings) from content.
 */
function extractOutline(lines: string[]): OutlineHeading[] {
  const outline: OutlineHeading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      outline.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i,
      });
    }
  }
  return outline;
}

/**
 * Extract sections matching a search query.
 * Returns content from matching headings to the next heading of same or higher level.
 */
function extractMatchingSections(lines: string[], query: string): { content: string; matches: number; sections: number } {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  if (queryTerms.length === 0) {
    return { content: lines.join('\n'), matches: 0, sections: 0 };
  }

  // Find all headings and their positions
  const headings: { level: number; line: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({ level: match[1].length, line: i, text: match[2] });
    }
  }

  // Score each section
  const sections: { start: number; end: number; score: number }[] = [];
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].line;
    const end = i + 1 < headings.length ? headings[i + 1].line : lines.length;
    const sectionContent = lines.slice(start, end).join('\n').toLowerCase();

    let score = 0;
    for (const term of queryTerms) {
      const regex = new RegExp(term, 'gi');
      const matches = sectionContent.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    if (score > 0) {
      sections.push({ start, end, score });
    }
  }

  // Also check content before first heading
  if (headings.length > 0 && headings[0].line > 0) {
    const preContent = lines.slice(0, headings[0].line).join('\n').toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      const regex = new RegExp(term, 'gi');
      const matches = preContent.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    if (score > 0) {
      sections.unshift({ start: 0, end: headings[0].line, score });
    }
  }

  // If no headings, check entire content
  if (headings.length === 0) {
    const fullContent = lines.join('\n').toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      const regex = new RegExp(term, 'gi');
      const matches = fullContent.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    if (score > 0) {
      return { content: lines.join('\n'), matches: score, sections: 1 };
    }
    return { content: '', matches: 0, sections: 0 };
  }

  if (sections.length === 0) {
    return { content: '', matches: 0, sections: 0 };
  }

  // Sort by score descending and take top sections
  sections.sort((a, b) => b.score - a.score);

  // Collect matching sections (sorted by original order)
  const selectedSections = sections.slice(0, 5); // Limit to top 5 sections
  selectedSections.sort((a, b) => a.start - b.start);

  const resultLines: string[] = [];
  let totalMatches = 0;
  for (const section of selectedSections) {
    if (resultLines.length > 0) {
      resultLines.push(''); // Add separator
      resultLines.push('---');
      resultLines.push('');
    }
    resultLines.push(...lines.slice(section.start, section.end));
    totalMatches += section.score;
  }

  return {
    content: resultLines.join('\n'),
    matches: totalMatches,
    sections: selectedSections.length,
  };
}

/**
 * Read a document from a workspace.
 *
 * Modes:
 * - Default: Returns full content (with pagination)
 * - outline_only=true: Returns only document structure (headings)
 * - search="query": Returns only sections matching the query
 */
export async function handleReadDocs(
  config: Config,
  input: ReadDocsInput
): Promise<ReadDocsResult> {
  const { workspace, doc_name, from_line, to_line, max_lines, outline_only, search } = input;

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

  const rawContent = await readFile(filePath);
  const lastChanged = await getFileModifiedTime(filePath);
  const allLines = rawContent.split('\n');
  const totalLineCount = allLines.length;

  // Extract outline (always useful for context)
  const outline = extractOutline(allLines);

  // Handle outline_only mode
  if (outline_only) {
    return {
      workspace,
      workspace_description: workspaceDescription,
      doc_name: filename,
      content: '', // No content in outline mode
      line_count: totalLineCount,
      last_changed: lastChanged,
      outline,
    };
  }

  // Handle search mode
  if (search) {
    const { content: searchContent, matches, sections } = extractMatchingSections(allLines, search);
    return {
      workspace,
      workspace_description: workspaceDescription,
      doc_name: filename,
      content: searchContent,
      line_count: totalLineCount,
      last_changed: lastChanged,
      outline, // Include outline for context
      search_info: {
        query: search,
        matches,
        sections_returned: sections,
      },
    };
  }

  // Default mode: paginated content
  const start = from_line ?? 0;
  let end: number;

  if (to_line !== undefined) {
    end = to_line;
  } else if (max_lines !== undefined) {
    const effectiveMaxLines = Math.min(max_lines, MAX_LINES_LIMIT);
    end = start + effectiveMaxLines;
  } else if (from_line !== undefined) {
    end = start + DEFAULT_MAX_LINES;
  } else {
    end = Math.min(totalLineCount, DEFAULT_MAX_LINES);
  }

  end = Math.min(end, totalLineCount);

  const selectedLines = allLines.slice(start, end);
  const content = selectedLines.join('\n');
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

