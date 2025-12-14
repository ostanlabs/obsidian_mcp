import { Config } from '../models/types.js';
import { getAllWorkspaces, getWorkspacesConfigPath } from '../utils/config.js';
import { getFileModifiedTime } from '../utils/file-utils.js';

export interface ListWorkspacesInput {}

export interface WorkspaceInfo {
  name: string;
  description: string;
}

export interface ListWorkspacesResult {
  workspaces: WorkspaceInfo[];
  count: number;
  config_last_changed: string;
}

export const listWorkspacesDefinition = {
  name: 'list_workspaces',
  description: 'List all configured workspaces with their descriptions. Workspaces are named document collections configured in workspaces.json in the vault folder.',
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
  const allWorkspaces = getAllWorkspaces(config);
  const configPath = getWorkspacesConfigPath(config);
  const configLastChanged = await getFileModifiedTime(configPath);

  const workspaces: WorkspaceInfo[] = Object.entries(allWorkspaces).map(([name, wsConfig]) => ({
    name,
    description: wsConfig.description,
  }));

  return {
    workspaces,
    count: workspaces.length,
    config_last_changed: configLastChanged,
  };
}

