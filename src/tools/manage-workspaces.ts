import { Config, WorkspaceConfig } from '../models/types.js';
import { getWorkspacesConfigPath } from '../utils/config.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

export interface ManageWorkspacesInput {
  action: 'add' | 'update' | 'remove';
  name: string;
  path?: string;
  description?: string;
}

export interface ManageWorkspacesResult {
  success: boolean;
  action: string;
  workspace: string;
  message: string;
  workspaces: Record<string, WorkspaceConfig>;
}

export const manageWorkspacesDefinition = {
  name: 'manage_workspaces',
  description: 'Add, update, or remove workspaces from the configuration. Workspaces define document collections that the AI can access.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'update', 'remove'],
        description: 'Action to perform: add a new workspace, update an existing one, or remove one',
      },
      name: {
        type: 'string',
        description: 'Name of the workspace (used as identifier)',
      },
      path: {
        type: 'string',
        description: 'Absolute path to the workspace folder (required for add/update)',
      },
      description: {
        type: 'string',
        description: 'Description of what the workspace contains (required for add/update)',
      },
    },
    required: ['action', 'name'],
  },
};

export async function handleManageWorkspaces(
  config: Config,
  input: ManageWorkspacesInput
): Promise<ManageWorkspacesResult> {
  const { action, name, path, description } = input;
  const configPath = getWorkspacesConfigPath(config);

  // Load current workspaces
  let workspaces: Record<string, WorkspaceConfig> = {};
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      workspaces = JSON.parse(content);
    } catch (e) {
      throw new Error(`Failed to parse workspaces.json: ${e}`);
    }
  }

  switch (action) {
    case 'add': {
      if (!path || !description) {
        throw new Error('path and description are required when adding a workspace');
      }
      if (workspaces[name]) {
        throw new Error(`Workspace "${name}" already exists. Use action "update" to modify it.`);
      }
      workspaces[name] = { path, description };
      break;
    }

    case 'update': {
      if (!workspaces[name]) {
        throw new Error(`Workspace "${name}" does not exist. Use action "add" to create it.`);
      }
      if (path) {
        workspaces[name].path = path;
      }
      if (description) {
        workspaces[name].description = description;
      }
      break;
    }

    case 'remove': {
      if (!workspaces[name]) {
        throw new Error(`Workspace "${name}" does not exist.`);
      }
      delete workspaces[name];
      break;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }

  // Write updated config
  writeFileSync(configPath, JSON.stringify(workspaces, null, 2), 'utf-8');

  // Update the in-memory config
  config.workspaces = workspaces;

  const actionPastTense = action === 'add' ? 'added' : action === 'update' ? 'updated' : 'removed';

  return {
    success: true,
    action,
    workspace: name,
    message: `Workspace "${name}" ${actionPastTense} successfully. Restart the MCP server for changes to take full effect.`,
    workspaces,
  };
}

