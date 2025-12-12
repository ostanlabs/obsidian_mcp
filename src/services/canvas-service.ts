import {
  CanvasFile,
  CanvasNode,
  CanvasEdge,
  Config,
  NotFoundError,
} from '../models/types.js';
import { parseCanvas, serializeCanvas, findNodeByFile } from '../parsers/canvas-parser.js';
import { readFile, writeFileAtomic, fileExists, triggerObsidianReload } from '../utils/file-utils.js';
import { getCanvasPath } from '../utils/config.js';
import { generateId } from '../utils/file-utils.js';

/**
 * Canvas operation types for merge-based updates
 */
export type CanvasOperation =
  | { type: 'add_node'; node: CanvasNode }
  | { type: 'remove_node'; filePath: string }
  | { type: 'update_position'; filePath: string; position: { x: number; y: number } }
  | { type: 'add_edge'; fromFilePath: string; toFilePath: string }
  | { type: 'remove_edge'; fromFilePath: string; toFilePath: string };

/**
 * Apply multiple operations to canvas atomically with merge strategy.
 *
 * Flow:
 * 1. Read current canvas (captures Obsidian's latest state)
 * 2. Apply our operations in memory (our changes take precedence on conflicts)
 * 3. Write to temp file
 * 4. Atomic rename to canvas file
 * 5. Trigger Obsidian reload
 *
 * This minimizes race conditions with Obsidian and preserves user changes
 * that don't conflict with our operations.
 */
export async function applyCanvasOperations(
  config: Config,
  operations: CanvasOperation[],
  canvasSource?: string
): Promise<void> {
  if (operations.length === 0) return;

  const canvasPath = getCanvasPath(config, canvasSource);

  // Step 1: Read current canvas (captures any user changes)
  const canvas = await loadCanvas(config, canvasSource);

  // Step 2: Apply our operations (our changes win on conflicts)
  for (const op of operations) {
    switch (op.type) {
      case 'add_node': {
        // Check if node with same file already exists
        const existing = findNodeByFile(canvas, op.node.file!);
        if (existing) {
          // Update to our values (our changes win)
          Object.assign(existing, op.node);
        } else {
          canvas.nodes.push(op.node);
        }
        break;
      }

      case 'remove_node': {
        const node = findNodeByFile(canvas, op.filePath);
        if (node) {
          canvas.nodes = canvas.nodes.filter(n => n.id !== node.id);
          canvas.edges = canvas.edges.filter(e => e.fromNode !== node.id && e.toNode !== node.id);
        }
        break;
      }

      case 'update_position': {
        const node = findNodeByFile(canvas, op.filePath);
        if (node) {
          node.x = op.position.x;
          node.y = op.position.y;
        }
        break;
      }

      case 'add_edge': {
        const fromNode = findNodeByFile(canvas, op.fromFilePath);
        const toNode = findNodeByFile(canvas, op.toFilePath);
        if (fromNode && toNode) {
          // Only add if not already exists
          const exists = canvas.edges.some(
            e => e.fromNode === fromNode.id && e.toNode === toNode.id
          );
          if (!exists) {
            canvas.edges.push({
              id: generateId(),
              fromNode: fromNode.id,
              toNode: toNode.id,
              fromSide: 'right',
              toSide: 'left',
            });
          }
        }
        break;
      }

      case 'remove_edge': {
        const fromNode = findNodeByFile(canvas, op.fromFilePath);
        const toNode = findNodeByFile(canvas, op.toFilePath);
        if (fromNode && toNode) {
          canvas.edges = canvas.edges.filter(
            e => !(e.fromNode === fromNode.id && e.toNode === toNode.id)
          );
        }
        break;
      }
    }
  }

  // Steps 3-4: Write to temp file and atomic rename (handled by writeFileAtomic)
  const content = serializeCanvas(canvas);
  await writeFileAtomic(canvasPath, content);

  // Step 5: Trigger Obsidian to reload the canvas
  triggerObsidianReload(config.vaultPath, canvasPath);
}

/**
 * Load a canvas file
 */
export async function loadCanvas(config: Config, canvasSource?: string): Promise<CanvasFile> {
  const canvasPath = getCanvasPath(config, canvasSource);
  
  if (!(await fileExists(canvasPath))) {
    throw new NotFoundError(`Canvas file not found: ${canvasPath}`);
  }
  
  const content = await readFile(canvasPath);
  return parseCanvas(content);
}

/**
 * Save a canvas file
 */
export async function saveCanvas(
  config: Config,
  canvas: CanvasFile,
  canvasSource?: string
): Promise<void> {
  const canvasPath = getCanvasPath(config, canvasSource);
  const content = serializeCanvas(canvas);
  await writeFileAtomic(canvasPath, content);
}

/**
 * Get all accomplishment IDs from canvas by reading file nodes
 */
export async function getAllAccomplishmentIds(
  config: Config,
  canvasSource?: string
): Promise<string[]> {
  const canvas = await loadCanvas(config, canvasSource);
  const ids: string[] = [];
  
  // Get all file nodes that are in the accomplishments folder
  for (const node of canvas.nodes) {
    if (node.type === 'file' && node.file?.startsWith(config.accomplishmentsFolder)) {
      // Read the file to get the ID from frontmatter
      try {
        const filePath = `${config.vaultPath}/${node.file}`;
        const content = await readFile(filePath);
        const idMatch = content.match(/^id:\s*(.+)$/m);
        if (idMatch) {
          ids.push(idMatch[1].trim());
        }
      } catch {
        // File might not exist or be readable
      }
    }
  }
  
  return ids;
}

/**
 * Generate next accomplishment ID
 */
export async function generateAccomplishmentId(
  config: Config,
  canvasSource?: string
): Promise<string> {
  const existingIds = await getAllAccomplishmentIds(config, canvasSource);
  
  const numbers = existingIds
    .map(id => {
      const match = id.match(/^ACC-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => !isNaN(n));
  
  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `ACC-${String(maxNumber + 1).padStart(3, '0')}`;
}

/**
 * Add a node to canvas for an accomplishment
 * Uses merge-based approach to handle concurrent Obsidian edits
 */
export async function addAccomplishmentNode(
  config: Config,
  filePath: string,
  position: { x: number; y: number },
  canvasSource?: string
): Promise<CanvasNode> {
  const node: CanvasNode = {
    id: generateId(),
    type: 'file',
    file: filePath,
    x: position.x,
    y: position.y,
    width: 400,
    height: 300,
  };

  await applyCanvasOperations(config, [{ type: 'add_node', node }], canvasSource);

  return node;
}

/**
 * Remove an accomplishment node from canvas
 * Uses merge-based approach to handle concurrent Obsidian edits
 */
export async function removeAccomplishmentNode(
  config: Config,
  filePath: string,
  canvasSource?: string
): Promise<void> {
  await applyCanvasOperations(config, [{ type: 'remove_node', filePath }], canvasSource);
}

/**
 * Update node position
 * Uses merge-based approach to handle concurrent Obsidian edits
 */
export async function updateNodePosition(
  config: Config,
  filePath: string,
  position: { x: number; y: number },
  canvasSource?: string
): Promise<void> {
  await applyCanvasOperations(config, [{ type: 'update_position', filePath, position }], canvasSource);
}

/**
 * Add a dependency edge between two accomplishments
 * Uses merge-based approach to handle concurrent Obsidian edits
 */
export async function addDependencyEdge(
  config: Config,
  blockerFilePath: string,
  blockedFilePath: string,
  canvasSource?: string
): Promise<CanvasEdge | null> {
  // First check if nodes exist (read-only operation)
  const canvas = await loadCanvas(config, canvasSource);
  const blockerNode = findNodeByFile(canvas, blockerFilePath);
  const blockedNode = findNodeByFile(canvas, blockedFilePath);

  if (!blockerNode || !blockedNode) {
    return null;
  }

  // Check if edge already exists
  const existingEdge = canvas.edges.find(
    e => e.fromNode === blockerNode.id && e.toNode === blockedNode.id
  );
  if (existingEdge) {
    return existingEdge;
  }

  // Apply the operation with merge strategy
  await applyCanvasOperations(
    config,
    [{ type: 'add_edge', fromFilePath: blockerFilePath, toFilePath: blockedFilePath }],
    canvasSource
  );

  // Return the edge info (re-read to get the actual edge created)
  const updatedCanvas = await loadCanvas(config, canvasSource);
  const newBlockerNode = findNodeByFile(updatedCanvas, blockerFilePath);
  const newBlockedNode = findNodeByFile(updatedCanvas, blockedFilePath);

  return updatedCanvas.edges.find(
    e => e.fromNode === newBlockerNode?.id && e.toNode === newBlockedNode?.id
  ) || null;
}

/**
 * Remove a dependency edge
 * Uses merge-based approach to handle concurrent Obsidian edits
 */
export async function removeDependencyEdge(
  config: Config,
  blockerFilePath: string,
  blockedFilePath: string,
  canvasSource?: string
): Promise<void> {
  await applyCanvasOperations(
    config,
    [{ type: 'remove_edge', fromFilePath: blockerFilePath, toFilePath: blockedFilePath }],
    canvasSource
  );
}

/**
 * Get node by file path
 */
export async function getNodeByFilePath(
  config: Config,
  filePath: string,
  canvasSource?: string
): Promise<CanvasNode | undefined> {
  const canvas = await loadCanvas(config, canvasSource);
  return findNodeByFile(canvas, filePath);
}

/**
 * Get node IDs for given file paths
 */
export async function getNodeIdsByFilePaths(
  config: Config,
  filePaths: string[],
  canvasSource?: string
): Promise<string[]> {
  const canvas = await loadCanvas(config, canvasSource);
  const nodeIds: string[] = [];
  
  for (const filePath of filePaths) {
    const node = findNodeByFile(canvas, filePath);
    if (node) {
      nodeIds.push(node.id);
    }
  }
  
  return nodeIds;
}

