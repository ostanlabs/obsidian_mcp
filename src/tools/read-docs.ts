import { Config, ValidationError, NotFoundError } from '../models/types.js';
import { getWorkspacePath, getWorkspaceDescription } from '../utils/config.js';
import { readFile, fileExists } from '../utils/file-utils.js';

export interface ReadDocsInput {
  workspace: string;
  doc_name: string;
  from_line?: number;
  to_line?: number;
}

export interface ReadDocsResult {
  workspace: string;
  workspace_description: string;
  doc_name: string;
  content: string;
  line_count: number;
  range?: {
    from_line: number;
    to_line: number;
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

Line numbering is 0-based:
- Line 0 is the first line
- from_line=0, to_line=10 returns lines 0-9`,
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
        description: 'End line (0-based, exclusive)',
        minimum: 0,
      },
    },
    required: ['workspace', 'doc_name'],
  },
};

export async function handleReadDocs(
  config: Config,
  input: ReadDocsInput
): Promise<ReadDocsResult> {
  const { workspace, doc_name, from_line, to_line } = input;

  if (!workspace) {
    throw new ValidationError('workspace parameter is required');
  }
  if (!doc_name) {
    throw new ValidationError('doc_name parameter is required');
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
  const allLines = content.split('\n');
  let totalLineCount = allLines.length;

  // Apply line range if specified
  if (from_line !== undefined || to_line !== undefined) {
    const start = from_line ?? 0;
    const end = to_line ?? allLines.length;
    const selectedLines = allLines.slice(start, end);
    content = selectedLines.join('\n');

    return {
      workspace,
      workspace_description: workspaceDescription,
      doc_name: filename,
      content,
      line_count: totalLineCount,
      range: {
        from_line: start,
        to_line: end,
      },
    };
  }

  return {
    workspace,
    workspace_description: workspaceDescription,
    doc_name: filename,
    content,
    line_count: totalLineCount,
  };
}

