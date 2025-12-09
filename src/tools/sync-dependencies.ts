import { Config } from '../models/types.js';
import { loadCanvas } from '../services/canvas-service.js';
import { readFile, writeFileAtomic, listFiles } from '../utils/file-utils.js';
import { getAccomplishmentsPath } from '../utils/config.js';
import { parseAccomplishment, serializeAccomplishment } from '../parsers/markdown-parser.js';
import { getIncomingEdges } from '../parsers/canvas-parser.js';

export const syncDependenciesDefinition = {
  name: 'sync_dependencies',
  description: `Sync all dependencies from canvas edges to accomplishment frontmatter.

This reads all edges from the canvas file and updates the \`depends_on\` array in each 
accomplishment's frontmatter to match. Use this to:
- Initialize dependencies after manually drawing arrows on canvas
- Fix any sync issues between canvas edges and MD files
- Batch update all accomplishments after importing a canvas

Returns a summary of what was updated.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      canvas_source: {
        type: 'string',
        description: 'Canvas file path (relative to vault). Defaults to DEFAULT_CANVAS.',
      },
    },
    required: [],
  },
};

export interface SyncDependenciesInput {
  canvas_source?: string;
}

export interface SyncDependenciesResult {
  success: boolean;
  canvas_source: string;
  total_accomplishments: number;
  updated_count: number;
  updates: Array<{
    id: string;
    title: string;
    old_depends_on: string[];
    new_depends_on: string[];
  }>;
  errors: string[];
}

/**
 * Build a map from file path to accomplishment ID
 */
async function buildFileToIdMap(
  config: Config
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const accomplishmentsPath = getAccomplishmentsPath(config);
  const files = await listFiles(accomplishmentsPath);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const filePath = `${accomplishmentsPath}/${file}`;
    try {
      const content = await readFile(filePath);
      const idMatch = content.match(/^id:\s*(.+)$/m);
      if (idMatch) {
        // Store with relative path (as used in canvas)
        const relativePath = `${config.accomplishmentsFolder}/${file}`;
        map.set(relativePath, idMatch[1].trim());
      }
    } catch {
      // Skip unreadable files
    }
  }

  return map;
}

/**
 * Build a map from node ID to file path
 */
function buildNodeToFileMap(
  canvas: { nodes: Array<{ id: string; type: string; file?: string }> }
): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of canvas.nodes) {
    if (node.type === 'file' && node.file) {
      map.set(node.id, node.file);
    }
  }
  return map;
}

export async function handleSyncDependencies(
  config: Config,
  input: SyncDependenciesInput
): Promise<SyncDependenciesResult> {
  const { canvas_source } = input;
  const canvasPath = canvas_source || config.defaultCanvas;
  const errors: string[] = [];
  const updates: SyncDependenciesResult['updates'] = [];

  // Load canvas
  const canvas = await loadCanvas(config, canvas_source);

  // Build lookup maps
  const fileToId = await buildFileToIdMap(config);
  const nodeToFile = buildNodeToFileMap(canvas);

  // For each file node, compute its dependencies from incoming edges
  const accomplishmentsPath = getAccomplishmentsPath(config);
  const files = await listFiles(accomplishmentsPath);
  let updatedCount = 0;

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const relativePath = `${config.accomplishmentsFolder}/${file}`;
    const fullPath = `${accomplishmentsPath}/${file}`;

    try {
      // Find the node for this file
      const node = canvas.nodes.find(
        (n) => n.type === 'file' && n.file === relativePath
      );

      if (!node) {
        // File not on canvas, skip
        continue;
      }

      // Get incoming edges (dependencies)
      const incomingEdges = getIncomingEdges(canvas, node.id);

      // Convert edge sources to accomplishment IDs
      const newDependsOn: string[] = [];
      for (const edge of incomingEdges) {
        const blockerFile = nodeToFile.get(edge.fromNode);
        if (blockerFile) {
          const blockerId = fileToId.get(blockerFile);
          if (blockerId) {
            newDependsOn.push(blockerId);
          }
        }
      }

      // Read and parse the accomplishment
      const content = await readFile(fullPath);
      const accomplishment = parseAccomplishment(content);

      // Check if depends_on needs updating
      const oldDependsOn = [...accomplishment.frontmatter.depends_on];
      const oldSet = new Set(oldDependsOn);
      const newSet = new Set(newDependsOn);

      const needsUpdate =
        oldDependsOn.length !== newDependsOn.length ||
        oldDependsOn.some((id) => !newSet.has(id)) ||
        newDependsOn.some((id) => !oldSet.has(id));

      if (needsUpdate) {
        // Update frontmatter
        accomplishment.frontmatter.depends_on = newDependsOn;
        accomplishment.frontmatter.updated = new Date().toISOString();

        // Write back
        const newContent = serializeAccomplishment(accomplishment);
        await writeFileAtomic(fullPath, newContent);

        updates.push({
          id: accomplishment.frontmatter.id,
          title: accomplishment.frontmatter.title,
          old_depends_on: oldDependsOn,
          new_depends_on: newDependsOn,
        });

        updatedCount++;
      }
    } catch (e) {
      errors.push(`Error processing ${file}: ${e}`);
    }
  }

  return {
    success: errors.length === 0,
    canvas_source: canvasPath,
    total_accomplishments: fileToId.size,
    updated_count: updatedCount,
    updates,
    errors,
  };
}

