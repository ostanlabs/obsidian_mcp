import { Config } from '../models/types.js';

export function getConfig(): Config {
  const vaultPath = process.env.VAULT_PATH;
  const accomplishmentsFolder = process.env.ACCOMPLISHMENTS_FOLDER;
  const defaultCanvas = process.env.DEFAULT_CANVAS;
  const workspacesJson = process.env.WORKSPACES;

  if (!vaultPath) {
    throw new Error('VAULT_PATH environment variable is required');
  }
  if (!accomplishmentsFolder) {
    throw new Error('ACCOMPLISHMENTS_FOLDER environment variable is required');
  }
  if (!defaultCanvas) {
    throw new Error('DEFAULT_CANVAS environment variable is required');
  }

  // Parse WORKSPACES JSON (optional, defaults to empty object)
  let workspaces: Record<string, string> = {};
  if (workspacesJson) {
    try {
      workspaces = JSON.parse(workspacesJson);
      // Validate that all values are strings (paths)
      for (const [name, path] of Object.entries(workspaces)) {
        if (typeof path !== 'string') {
          throw new Error(`Workspace "${name}" path must be a string`);
        }
      }
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error(`WORKSPACES environment variable is not valid JSON: ${e.message}`);
      }
      throw e;
    }
  }

  return {
    vaultPath,
    accomplishmentsFolder,
    defaultCanvas,
    workspaces,
  };
}

export function getAccomplishmentsPath(config: Config): string {
  return `${config.vaultPath}/${config.accomplishmentsFolder}`;
}

export function getCanvasPath(config: Config, canvasSource?: string): string {
  return `${config.vaultPath}/${canvasSource || config.defaultCanvas}`;
}

export function getAccomplishmentFilePath(config: Config, title: string): string {
  return `${getAccomplishmentsPath(config)}/${title}.md`;
}

export function getRelativeAccomplishmentPath(config: Config, title: string): string {
  return `${config.accomplishmentsFolder}/${title}.md`;
}

/**
 * Get the absolute path for a workspace
 */
export function getWorkspacePath(config: Config, workspaceName: string): string | undefined {
  return config.workspaces[workspaceName];
}

/**
 * Get all workspace names
 */
export function getWorkspaceNames(config: Config): string[] {
  return Object.keys(config.workspaces);
}

