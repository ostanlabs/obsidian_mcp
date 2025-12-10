import { Config, ValidationError } from '../models/types.js';
import {
  readDocument,
  readAllDocuments,
  listWorkspaceFiles,
  normalizeFilename,
} from '../services/context-doc-service.js';

export interface ReadDocsInput {
  workspace: string;
  doc_name?: string;
  from_line?: number;
  to_line?: number;
}

export interface ReadDocsResult {
  workspace: string;
  // When doc_name is provided
  doc_name?: string;
  content?: string;
  line_count?: number;
  range?: {
    from_line: number;
    to_line: number;
  };

  // When doc_name is not provided
  documents?: Record<string, string>;
  document_count?: number;
  document_names?: string[];
}

export const readDocsDefinition = {
  name: 'read_docs',
  description: `Read documents from a workspace.

When doc_name is provided:
- Returns the content of that specific document
- Optionally use from_line and to_line to get a specific range (0-based, from_line inclusive, to_line exclusive)

When doc_name is NOT provided:
- Returns a dictionary of all documents in the workspace with filenames as keys and contents as values
- from_line and to_line are ignored in this case`,
  inputSchema: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Name of the workspace to read from. Use list_workspaces to see available workspaces.',
      },
      doc_name: {
        type: 'string',
        description: 'Name of the document to read (with or without .md extension). If not provided, returns all documents in the workspace.',
      },
      from_line: {
        type: 'integer',
        description: 'Start line (0-based, inclusive). Only used when doc_name is provided.',
        minimum: 0,
      },
      to_line: {
        type: 'integer',
        description: 'End line (0-based, exclusive). Only used when doc_name is provided.',
        minimum: 0,
      },
    },
    required: ['workspace'],
  },
};

export async function handleReadDocs(
  config: Config,
  input: ReadDocsInput
): Promise<ReadDocsResult> {
  const { workspace, doc_name, from_line, to_line } = input;

  if (!workspace) {
    throw new ValidationError('workspace is required');
  }

  if (doc_name) {
    // Read specific document
    const content = await readDocument(
      config,
      workspace,
      doc_name,
      from_line,
      to_line
    );

    const filename = normalizeFilename(doc_name);
    const lines = content.split('\n');
    const result: ReadDocsResult = {
      workspace,
      doc_name: filename,
      content,
      line_count: lines.length,
    };

    // Include range info if specified
    if (from_line !== undefined || to_line !== undefined) {
      result.range = {
        from_line: from_line ?? 0,
        to_line: to_line ?? lines.length,
      };
    }

    return result;
  } else {
    // Read all documents in workspace
    const documents = await readAllDocuments(config, workspace);
    const documentNames = await listWorkspaceFiles(config, workspace);

    return {
      workspace,
      documents,
      document_count: Object.keys(documents).length,
      document_names: documentNames,
    };
  }
}

