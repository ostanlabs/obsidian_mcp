import { Config, ValidationError, NotFoundError } from '../models/types.js';
import { getWorkspacePath, getWorkspaceDescription } from '../utils/config.js';
import { listFilesRecursive, getFileModifiedTime } from '../utils/file-utils.js';

export interface ListFilesInput {
  workspace: string;
}

export interface FileInfo {
  name: string;
  last_changed: string;
}

export interface ListFilesResult {
  workspace: string;
  workspace_description: string;
  files: FileInfo[];
  count: number;
}

export const listFilesDefinition = {
  name: 'list_files',
  description: 'List all markdown files in a workspace, including files in subfolders. Returns relative paths (e.g., "doc.md" or "subfolder/doc.md"). Use these paths directly with read_docs and update_doc.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Name of the workspace to list files from',
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
    throw new ValidationError('workspace parameter is required');
  }

  const workspacePath = getWorkspacePath(config, workspace);
  if (!workspacePath) {
    throw new NotFoundError(`Workspace not found: ${workspace}`);
  }

  const workspaceDescription = getWorkspaceDescription(config, workspace) || '';

  try {
    const allFiles = await listFilesRecursive(workspacePath);
    // Filter to only .md files
    const mdFiles = allFiles.filter(f => f.endsWith('.md'));

    // Get last_changed for each file in parallel
    const filesWithStats: FileInfo[] = await Promise.all(
      mdFiles.map(async (file) => ({
        name: file,
        last_changed: await getFileModifiedTime(`${workspacePath}/${file}`),
      }))
    );

    return {
      workspace,
      workspace_description: workspaceDescription,
      files: filesWithStats,
      count: filesWithStats.length,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`Workspace path does not exist: ${workspacePath}`);
    }
    throw error;
  }
}

