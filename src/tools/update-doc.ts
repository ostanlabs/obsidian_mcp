import { Config, ValidationError } from '../models/types.js';
import {
  createContextDocument,
  replaceContextDocument,
  deleteContextDocument,
  insertAtLine,
  replaceAtRange,
  parseDocName,
} from '../services/context-doc-service.js';

export type UpdateDocOperation = 'create' | 'replace' | 'delete' | 'insert_at' | 'replace_at';

export interface UpdateDocInput {
  name: string;
  operation: UpdateDocOperation;
  content?: string;
  start_line?: number;
  end_line?: number;
  canvas_source?: string;
}

export interface UpdateDocResult {
  success: boolean;
  operation: UpdateDocOperation;
  doc_name: string;
  message: string;
  line_count?: number;
  affected_range?: {
    start_line: number;
    end_line: number;
  };
}

export const updateDocDefinition = {
  name: 'update_doc',
  description: `Create, update, or delete context documents.

Document locations:
- Canvas folder: Use plain filename (e.g., "notes.md")
- Context docs folder: Prefix with "context:" (e.g., "context:reference.md")

Operations:
- create: Create a new document (error if exists)
- replace: Replace entire content of existing document (error if not exists)
- delete: Delete the document (error if not exists)
- insert_at: Insert content starting at start_line (0-based). Existing content shifts down.
- replace_at: Replace content from start_line to end_line (0-based, start inclusive, end exclusive) with new content.

Line numbering is 0-based:
- Line 0 is the first line
- insert_at with start_line=0 inserts at the beginning
- replace_at with start_line=0, end_line=5 replaces lines 0-4`,
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Document filename (with or without .md extension). Prefix with "context:" for context docs folder.',
      },
      operation: {
        type: 'string',
        enum: ['create', 'replace', 'delete', 'insert_at', 'replace_at'],
        description: 'Operation to perform',
      },
      content: {
        type: 'string',
        description: 'Content for create, replace, insert_at, or replace_at operations. Not needed for delete.',
      },
      start_line: {
        type: 'integer',
        description: 'Start line (0-based) for insert_at or replace_at operations',
        minimum: 0,
      },
      end_line: {
        type: 'integer',
        description: 'End line (0-based, exclusive) for replace_at operation',
        minimum: 0,
      },
      canvas_source: {
        type: 'string',
        description: 'Canvas file path (relative to vault). Defaults to DEFAULT_CANVAS. Only used for canvas folder docs.',
      },
    },
    required: ['name', 'operation'],
  },
};

export async function handleUpdateDoc(
  config: Config,
  input: UpdateDocInput
): Promise<UpdateDocResult> {
  const { name, operation, content, start_line, end_line, canvas_source } = input;

  // Parse the doc name to handle context: prefix properly
  const { isContextFolder, filename } = parseDocName(name);
  const docName = isContextFolder ? `context:${filename}` : filename;
  
  switch (operation) {
    case 'create': {
      if (content === undefined) {
        throw new ValidationError('content is required for create operation');
      }
      await createContextDocument(config, name, content, canvas_source);
      const lines = content.split('\n');
      return {
        success: true,
        operation,
        doc_name: docName,
        message: `Created document: ${docName}`,
        line_count: lines.length,
      };
    }
    
    case 'replace': {
      if (content === undefined) {
        throw new ValidationError('content is required for replace operation');
      }
      await replaceContextDocument(config, name, content, canvas_source);
      const lines = content.split('\n');
      return {
        success: true,
        operation,
        doc_name: docName,
        message: `Replaced content of document: ${docName}`,
        line_count: lines.length,
      };
    }
    
    case 'delete': {
      await deleteContextDocument(config, name, canvas_source);
      return {
        success: true,
        operation,
        doc_name: docName,
        message: `Deleted document: ${docName}`,
      };
    }
    
    case 'insert_at': {
      if (content === undefined) {
        throw new ValidationError('content is required for insert_at operation');
      }
      if (start_line === undefined) {
        throw new ValidationError('start_line is required for insert_at operation');
      }
      await insertAtLine(config, name, content, start_line, canvas_source);
      const insertedLines = content.split('\n');
      return {
        success: true,
        operation,
        doc_name: docName,
        message: `Inserted ${insertedLines.length} line(s) at line ${start_line} in document: ${docName}`,
        line_count: insertedLines.length,
        affected_range: {
          start_line,
          end_line: start_line + insertedLines.length,
        },
      };
    }
    
    case 'replace_at': {
      if (content === undefined) {
        throw new ValidationError('content is required for replace_at operation');
      }
      if (start_line === undefined) {
        throw new ValidationError('start_line is required for replace_at operation');
      }
      if (end_line === undefined) {
        throw new ValidationError('end_line is required for replace_at operation');
      }
      await replaceAtRange(config, name, content, start_line, end_line, canvas_source);
      const newLines = content.split('\n');
      const replacedLineCount = end_line - start_line;
      return {
        success: true,
        operation,
        doc_name: docName,
        message: `Replaced ${replacedLineCount} line(s) with ${newLines.length} line(s) at lines ${start_line}-${end_line} in document: ${docName}`,
        line_count: newLines.length,
        affected_range: {
          start_line,
          end_line: start_line + newLines.length,
        },
      };
    }
    
    default:
      throw new ValidationError(`Unknown operation: ${operation}`);
  }
}

