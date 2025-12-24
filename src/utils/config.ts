import { Config, WorkspaceConfig } from '../models/types.js';
import { readFileSync, existsSync, writeFileSync } from 'fs';

const WORKSPACES_TEMPLATE = {
  "example_workspace": {
    "path": "/path/to/your/documents",
    "description": "Description of what this workspace contains"
  }
};

export function getConfig(): Config {
  const vaultPath = process.env.VAULT_PATH;
  const defaultCanvas = process.env.DEFAULT_CANVAS;

  if (!vaultPath) {
    throw new Error('VAULT_PATH environment variable is required. Should point to the project folder containing milestones/, stories/, tasks/, decisions/, documents/ subfolders.');
  }
  if (!defaultCanvas) {
    throw new Error('DEFAULT_CANVAS environment variable is required. Should be the canvas filename (e.g., "AgentPlatform.canvas").');
  }

  // Load workspaces from workspaces.json in vault folder
  let workspaces: Record<string, WorkspaceConfig> = {};
  const workspacesConfigPath = `${vaultPath}/workspaces.json`;

  if (!existsSync(workspacesConfigPath)) {
    // Create template file on first run
    writeFileSync(workspacesConfigPath, JSON.stringify(WORKSPACES_TEMPLATE, null, 2), 'utf-8');
    console.error(`Created workspaces.json template at: ${workspacesConfigPath}`);
    console.error('Please edit this file to configure your workspaces.');
  }

  try {
    const content = readFileSync(workspacesConfigPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Validate workspace config structure
    for (const [name, config] of Object.entries(parsed)) {
      if (typeof config !== 'object' || config === null) {
        throw new Error(`Workspace "${name}" must be an object with path and description`);
      }
      const wsConfig = config as Record<string, unknown>;
      if (typeof wsConfig.path !== 'string') {
        throw new Error(`Workspace "${name}" must have a "path" string`);
      }
      if (typeof wsConfig.description !== 'string') {
        throw new Error(`Workspace "${name}" must have a "description" string`);
      }
      workspaces[name] = {
        path: wsConfig.path,
        description: wsConfig.description,
      };
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`workspaces.json is not valid JSON: ${e.message}`);
    }
    throw e;
  }

  return {
    vaultPath,
    defaultCanvas,
    workspaces,
  };
}

/**
 * Get workspace config by name
 */
export function getWorkspace(config: Config, workspaceName: string): WorkspaceConfig | undefined {
  return config.workspaces[workspaceName];
}

/**
 * Get the absolute path for a workspace
 */
export function getWorkspacePath(config: Config, workspaceName: string): string | undefined {
  return config.workspaces[workspaceName]?.path;
}

/**
 * Get workspace description
 */
export function getWorkspaceDescription(config: Config, workspaceName: string): string | undefined {
  return config.workspaces[workspaceName]?.description;
}

/**
 * Get all workspace names
 */
export function getWorkspaceNames(config: Config): string[] {
  return Object.keys(config.workspaces);
}

/**
 * Get all workspaces with their configs
 */
export function getAllWorkspaces(config: Config): Record<string, WorkspaceConfig> {
  return config.workspaces;
}

/**
 * Get the path to workspaces.json config file
 */
export function getWorkspacesConfigPath(config: Config): string {
  return `${config.vaultPath}/workspaces.json`;
}

