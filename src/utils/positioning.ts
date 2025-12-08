import { CanvasFile, CanvasNode, Position } from '../models/types.js';

// Constants for positioning
export const NODE_WIDTH = 400;
export const NODE_HEIGHT = 300;
export const HORIZONTAL_GAP = 100;
export const VERTICAL_GAP = 50;
export const START_X = 0;
export const START_Y = 0;

/**
 * Calculate position for a new accomplishment based on its dependencies
 */
export function calculatePosition(
  canvas: CanvasFile,
  dependsOnNodeIds: string[]
): Position {
  if (dependsOnNodeIds.length === 0) {
    // No dependencies: place in leftmost column
    return calculateLeftColumnPosition(canvas);
  }

  // Has dependencies: place to the right of blockers
  return calculateDependentPosition(canvas, dependsOnNodeIds);
}

/**
 * Calculate position in the leftmost column (for items with no dependencies)
 */
function calculateLeftColumnPosition(canvas: CanvasFile): Position {
  // Find all nodes that have no incoming edges (no dependencies)
  const nodesWithNoDeps = getNodesWithNoDependencies(canvas);
  
  if (nodesWithNoDeps.length === 0) {
    return { x: START_X, y: START_Y };
  }

  // Find the lowest Y position among left column nodes
  const maxY = Math.max(...nodesWithNoDeps.map(n => n.y + n.height));
  
  return { x: START_X, y: maxY + VERTICAL_GAP };
}

/**
 * Calculate position for a node that has dependencies
 */
function calculateDependentPosition(
  canvas: CanvasFile,
  blockerNodeIds: string[]
): Position {
  // Get blocker nodes
  const blockerNodes = blockerNodeIds
    .map(id => canvas.nodes.find(n => n.id === id))
    .filter((n): n is CanvasNode => n !== undefined);

  if (blockerNodes.length === 0) {
    return calculateLeftColumnPosition(canvas);
  }

  // Calculate X: to the right of the rightmost blocker
  const maxBlockerX = Math.max(...blockerNodes.map(n => n.x + n.width));
  const newX = maxBlockerX + HORIZONTAL_GAP;

  // Calculate Y: average of blocker Y positions
  const avgBlockerY = average(blockerNodes.map(n => n.y));

  // Check for collisions and find available Y
  const newY = findAvailableY(canvas, newX, avgBlockerY);

  return { x: newX, y: newY };
}

/**
 * Get all nodes that have no incoming edges (dependencies)
 */
function getNodesWithNoDependencies(canvas: CanvasFile): CanvasNode[] {
  const nodesWithIncoming = new Set(canvas.edges.map(e => e.toNode));
  return canvas.nodes.filter(n => !nodesWithIncoming.has(n.id));
}

/**
 * Find an available Y position at the given X coordinate
 */
function findAvailableY(canvas: CanvasFile, x: number, preferredY: number): number {
  // Get nodes in the same column (overlapping X range)
  const nodesInColumn = canvas.nodes.filter(n => {
    const nodeRight = n.x + n.width;
    const targetRight = x + NODE_WIDTH;
    return !(nodeRight < x || n.x > targetRight);
  });

  if (nodesInColumn.length === 0) {
    return preferredY;
  }

  // Sort by Y position
  nodesInColumn.sort((a, b) => a.y - b.y);

  // Try preferred Y first
  if (!hasCollision(nodesInColumn, preferredY)) {
    return preferredY;
  }

  // Try positions above and below preferred Y
  for (let offset = VERTICAL_GAP + NODE_HEIGHT; offset < 10000; offset += VERTICAL_GAP + NODE_HEIGHT) {
    // Try below
    const belowY = preferredY + offset;
    if (!hasCollision(nodesInColumn, belowY)) {
      return belowY;
    }

    // Try above
    const aboveY = preferredY - offset;
    if (aboveY >= 0 && !hasCollision(nodesInColumn, aboveY)) {
      return aboveY;
    }
  }

  // Fallback: place at the bottom
  const maxY = Math.max(...nodesInColumn.map(n => n.y + n.height));
  return maxY + VERTICAL_GAP;
}

/**
 * Check if placing a node at Y would collide with existing nodes
 */
function hasCollision(nodes: CanvasNode[], y: number): boolean {
  const top = y;
  const bottom = y + NODE_HEIGHT;

  return nodes.some(n => {
    const nodeTop = n.y;
    const nodeBottom = n.y + n.height;
    return !(bottom < nodeTop || top > nodeBottom);
  });
}

/**
 * Calculate average of numbers
 */
function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/**
 * Recalculate position for an existing node based on its current dependencies
 */
export function recalculatePosition(
  canvas: CanvasFile,
  nodeId: string,
  dependsOnNodeIds: string[]
): Position {
  // Temporarily remove the node from canvas for position calculation
  const canvasWithoutNode: CanvasFile = {
    nodes: canvas.nodes.filter(n => n.id !== nodeId),
    edges: canvas.edges.filter(e => e.fromNode !== nodeId && e.toNode !== nodeId),
  };

  return calculatePosition(canvasWithoutNode, dependsOnNodeIds);
}

