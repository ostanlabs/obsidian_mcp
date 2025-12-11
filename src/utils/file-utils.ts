import { promises as fs } from 'fs';
import { dirname } from 'path';

/**
 * Read file content as string
 */
export async function readFile(path: string): Promise<string> {
  return fs.readFile(path, 'utf-8');
}

/**
 * Write file atomically (write to temp, then rename)
 */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tempPath = `${path}.tmp`;
  
  // Ensure directory exists
  await fs.mkdir(dirname(path), { recursive: true });
  
  // Write to temp file
  await fs.writeFile(tempPath, content, 'utf-8');
  
  // Rename to target (atomic on most filesystems)
  await fs.rename(tempPath, path);
}

/**
 * Delete a file
 */
export async function deleteFile(path: string): Promise<void> {
  await fs.unlink(path);
}

/**
 * Check if file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * List files in directory (non-recursive, returns filenames only)
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * List files recursively in directory (returns relative paths like "subfolder/doc.md")
 */
export async function listFilesRecursive(dirPath: string, basePath: string = ''): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.isFile()) {
        files.push(relativePath);
      } else if (entry.isDirectory()) {
        const subFiles = await listFilesRecursive(`${dirPath}/${entry.name}`, relativePath);
        files.push(...subFiles);
      }
    }

    return files;
  } catch {
    return [];
  }
}

/**
 * Generate a unique ID for canvas nodes/edges
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

