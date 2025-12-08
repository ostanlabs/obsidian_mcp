import { Config } from '../models/types.js';
import {
  readContextDocument,
  readAllContextDocuments,
  getContextDocuments,
  parseDocName,
} from '../services/context-doc-service.js';

export interface ReadDocsInput {
  doc_name?: string;
  from_line?: number;
  to_line?: number;
  canvas_source?: string;
}

export interface ReadDocsResult {
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
  description: `Read context documents. Context documents come from two sources:
1. MD files in the canvas folder that are NOT referenced by the canvas
2. All MD files in CONTEXT_DOCS_FOLDER (if configured) - these are prefixed with "context:"

When doc_name is provided:
- Returns the content of that specific document
- Use "context:" prefix for docs in the context folder (e.g., "context:reference.md")
- Optionally use from_line and to_line to get a specific range (0-based, from_line inclusive, to_line exclusive)

When doc_name is NOT provided:
- Returns a dictionary of all context documents with filenames as keys and contents as values
- Documents from context folder are prefixed with "context:"
- from_line and to_line are ignored in this case`,
  inputSchema: {
    type: 'object',
    properties: {
      doc_name: {
        type: 'string',
        description: 'Name of the document to read (with or without .md extension). Prefix with "context:" for context folder docs. If not provided, returns all context documents.',
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
      canvas_source: {
        type: 'string',
        description: 'Canvas file path (relative to vault). Defaults to DEFAULT_CANVAS. Used to determine canvas folder docs.',
      },
    },
    required: [],
  },
};

export async function handleReadDocs(
  config: Config,
  input: ReadDocsInput
): Promise<ReadDocsResult> {
  const { doc_name, from_line, to_line, canvas_source } = input;

  if (doc_name) {
    // Read specific document
    const content = await readContextDocument(
      config,
      doc_name,
      canvas_source,
      from_line,
      to_line
    );

    // Parse doc name to get proper formatted name
    const { isContextFolder, filename } = parseDocName(doc_name);
    const formattedDocName = isContextFolder ? `context:${filename}` : filename;

    const lines = content.split('\n');
    const result: ReadDocsResult = {
      doc_name: formattedDocName,
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
    // Read all context documents
    const documents = await readAllContextDocuments(config, canvas_source);
    const documentNames = await getContextDocuments(config, canvas_source);
    
    return {
      documents,
      document_count: Object.keys(documents).length,
      document_names: documentNames,
    };
  }
}

