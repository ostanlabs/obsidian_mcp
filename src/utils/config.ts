import { Config } from '../models/types.js';

export function getConfig(): Config {
  const vaultPath = process.env.VAULT_PATH;
  const accomplishmentsFolder = process.env.ACCOMPLISHMENTS_FOLDER;
  const defaultCanvas = process.env.DEFAULT_CANVAS;

  if (!vaultPath) {
    throw new Error('VAULT_PATH environment variable is required');
  }
  if (!accomplishmentsFolder) {
    throw new Error('ACCOMPLISHMENTS_FOLDER environment variable is required');
  }
  if (!defaultCanvas) {
    throw new Error('DEFAULT_CANVAS environment variable is required');
  }

  return {
    vaultPath,
    accomplishmentsFolder,
    defaultCanvas,
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

