import {
  CanvasFile,
  CanvasNode,
  CanvasEdge,
  Config,
  NotFoundError,
} from '../models/types.js';
import { parseCanvas, serializeCanvas, findNodeByFile } from '../parsers/canvas-parser.js';
import { readFile, writeFileAtomic, fileExists } from '../utils/file-utils.js';
import { getCanvasPath } from '../utils/config.js';
import { generateId } from '../utils/file-utils.js';

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
 */
export async function addAccomplishmentNode(
  config: Config,
  filePath: string,
  position: { x: number; y: number },
  canvasSource?: string
): Promise<CanvasNode> {
  const canvas = await loadCanvas(config, canvasSource);
  
  const node: CanvasNode = {
    id: generateId(),
    type: 'file',
    file: filePath,
    x: position.x,
    y: position.y,
    width: 400,
    height: 300,
  };
  
  canvas.nodes.push(node);
  await saveCanvas(config, canvas, canvasSource);
  
  return node;
}

/**
 * Remove an accomplishment node from canvas
 */
export async function removeAccomplishmentNode(
  config: Config,
  filePath: string,
  canvasSource?: string
): Promise<void> {
  const canvas = await loadCanvas(config, canvasSource);
  
  const node = findNodeByFile(canvas, filePath);
  if (!node) return;
  
  // Remove node and all associated edges
  canvas.nodes = canvas.nodes.filter(n => n.id !== node.id);
  canvas.edges = canvas.edges.filter(e => e.fromNode !== node.id && e.toNode !== node.id);
  
  await saveCanvas(config, canvas, canvasSource);
}

/**
 * Update node position
 */
export async function updateNodePosition(
  config: Config,
  filePath: string,
  position: { x: number; y: number },
  canvasSource?: string
): Promise<void> {
  const canvas = await loadCanvas(config, canvasSource);
  
  const node = findNodeByFile(canvas, filePath);
  if (!node) return;
  
  node.x = position.x;
  node.y = position.y;
  
  await saveCanvas(config, canvas, canvasSource);
}

/**
 * Add a dependency edge between two accomplishments
 */
export async function addDependencyEdge(
  config: Config,
  blockerFilePath: string,
  blockedFilePath: string,
  canvasSource?: string
): Promise<CanvasEdge | null> {
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
  
  const edge: CanvasEdge = {
    id: generateId(),
    fromNode: blockerNode.id,
    toNode: blockedNode.id,
    fromSide: 'right',
    toSide: 'left',
  };
  
  canvas.edges.push(edge);
  await saveCanvas(config, canvas, canvasSource);
  
  return edge;
}

/**
 * Remove a dependency edge
 */
export async function removeDependencyEdge(
  config: Config,
  blockerFilePath: string,
  blockedFilePath: string,
  canvasSource?: string
): Promise<void> {
  const canvas = await loadCanvas(config, canvasSource);
  
  const blockerNode = findNodeByFile(canvas, blockerFilePath);
  const blockedNode = findNodeByFile(canvas, blockedFilePath);
  
  if (!blockerNode || !blockedNode) return;
  
  canvas.edges = canvas.edges.filter(
    e => !(e.fromNode === blockerNode.id && e.toNode === blockedNode.id)
  );
  
  await saveCanvas(config, canvas, canvasSource);
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

