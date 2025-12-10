import { Config, ValidationError } from '../models/types.js';
import { listWorkspaceFiles } from '../services/context-doc-service.js';

export interface ListFilesInput {
  workspace: string;
}

export interface ListFilesResult {
  workspace: string;
  files: string[];
  count: number;
}

export const listFilesDefinition = {
  name: 'list_files',
  description: `List all markdown files in a workspace.

Returns the filenames (with .md extension) of all markdown files in the specified workspace.
Use list_workspaces first to see available workspaces.`,
  inputSchema: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Name of the workspace to list files from.',
      },
    },
    required: ['workspace'],
  },
};

export async function handleListFiles(
  config: Config,
  input: ListFilesInput
): Promise<ListFilesResult> {
  const { workspace } = input;

  if (!workspace) {
    throw new ValidationError('workspace is required');
  }

  const files = await listWorkspaceFiles(config, workspace);
  
  return {
    workspace,
    files,
    count: files.length,
  };
}

