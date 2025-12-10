import { Config } from '../models/types.js';
import { getWorkspaceNames } from '../utils/config.js';

export interface ListWorkspacesInput {
  // No parameters needed
}

export interface ListWorkspacesResult {
  workspaces: string[];
  count: number;
}

export const listWorkspacesDefinition = {
  name: 'list_workspaces',
  description: `List all available workspaces.

Workspaces are configured via the WORKSPACES environment variable as a JSON object 
mapping workspace names to absolute paths. Use this tool to discover available 
workspaces before using read_docs, update_doc, or list_files.`,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleListWorkspaces(
  config: Config,
  _input: ListWorkspacesInput
): Promise<ListWorkspacesResult> {
  const workspaces = getWorkspaceNames(config);
  
  return {
    workspaces,
    count: workspaces.length,
  };
}

