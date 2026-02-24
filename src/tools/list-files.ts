import { Config, ValidationError, NotFoundError } from '../models/types.js';
import { getWorkspacePath, getWorkspaceDescription } from '../utils/config.js';
import { listFilesRecursive, getFileModifiedTime } from '../utils/file-utils.js';
import type { PaginationInput, PaginationOutput } from './tool-types.js';
import { applyPagination } from './pagination-utils.js';

export interface ListFilesInput extends PaginationInput {
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
  /** Pagination info (when paginating through large file lists) */
  pagination?: PaginationOutput;
}

export const listFilesDefinition = {
  name: 'list_files',
  description: 'List all markdown files in a workspace, including files in subfolders. Returns relative paths (e.g., "doc.md" or "subfolder/doc.md"). Use these paths directly with read_docs and update_doc. Pagination: Default max_items is 20 (conservative for smaller contexts). Agents with larger context windows can increase max_items up to 200.',
  inputSchema: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Name of the workspace to list files from',
      },
      max_items: {
        type: 'number',
        description: 'Maximum number of files to return per page (default: 20, max: 200). Increase for larger context windows.',
      },
      max_response_size: {
        type: 'number',
        description: 'Optional hard cap on response size in bytes. If set, response will be truncated to fit.',
      },
      continuation_token: {
        type: 'string',
        description: 'Token from previous response to get next page of results.',
      },
    },
    required: ['workspace'],
  },
};

/**
 * List all markdown files in a workspace.
 *
 * Pagination: Default max_items is 20 (conservative for smaller contexts).
 * Agents with larger context windows can increase max_items up to 200.
 */
export async function handleListFiles(
  config: Config,
  input: ListFilesInput
): Promise<ListFilesResult> {
  const { workspace, max_items, max_response_size, continuation_token } = input;

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

    // Apply pagination
    const { items: paginatedFiles, pagination } = applyPagination({
      items: filesWithStats,
      pagination: { max_items, max_response_size, continuation_token },
      context: `list_files:${workspace}`,
    });

    const result: ListFilesResult = {
      workspace,
      workspace_description: workspaceDescription,
      files: paginatedFiles,
      count: filesWithStats.length, // Total count, not paginated count
    };

    // Only include pagination if there are more items or we're not on page 1
    if (pagination.has_more || pagination.page > 1) {
      result.pagination = pagination;
    }

    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(`Workspace path does not exist: ${workspacePath}`);
    }
    throw error;
  }
}

