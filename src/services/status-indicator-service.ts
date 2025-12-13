import { Config, AccomplishmentStatus, CanvasNode, CanvasFile } from '../models/types.js';
import { loadCanvas } from './canvas-service.js';
import { listAccomplishments, getAccomplishment } from './accomplishment-service.js';
import { findNodeByFile } from '../parsers/canvas-parser.js';
import { getRelativeAccomplishmentPath } from '../utils/config.js';

/**
 * Status indicator emoji and color mapping
 */
const STATUS_INDICATORS: Record<AccomplishmentStatus, { emoji: string; color?: string }> = {
  'Blocked': { emoji: '🚫', color: '1' },      // Red
  'Completed': { emoji: '✅', color: '4' },    // Green
  'In Progress': { emoji: '🔄', color: '5' },  // Cyan
  'Not Started': { emoji: '⚪' },              // No color (default)
};

/**
 * Generate the status indicator node ID for an accomplishment
 */
export function getStatusIndicatorId(accomplishmentId: string): string {
  return `status-${accomplishmentId}`;
}

/**
 * Find a status indicator node in the canvas
 */
export function findStatusIndicator(canvas: CanvasFile, accomplishmentId: string): CanvasNode | undefined {
  const indicatorId = getStatusIndicatorId(accomplishmentId);
  return canvas.nodes.find(n => n.id === indicatorId);
}

/**
 * Create or update a status indicator node for an accomplishment.
 * This modifies the canvas in memory - caller must save it.
 */
export function updateStatusIndicatorInCanvas(
  canvas: CanvasFile,
  accomplishmentNode: CanvasNode,
  accomplishmentId: string,
  status: AccomplishmentStatus
): void {
  const indicatorId = getStatusIndicatorId(accomplishmentId);
  const indicator = STATUS_INDICATORS[status];
  
  // Calculate position: top-right corner of accomplishment node
  const indicatorX = accomplishmentNode.x + accomplishmentNode.width + 5;
  const indicatorY = accomplishmentNode.y;
  const indicatorWidth = 30;
  const indicatorHeight = 30;

  // Find existing indicator
  const existingIndex = canvas.nodes.findIndex(n => n.id === indicatorId);

  const indicatorNode: CanvasNode = {
    id: indicatorId,
    type: 'text',
    text: indicator.emoji,
    x: indicatorX,
    y: indicatorY,
    width: indicatorWidth,
    height: indicatorHeight,
    ...(indicator.color && { color: indicator.color }),
  };

  if (existingIndex >= 0) {
    // Update existing
    canvas.nodes[existingIndex] = indicatorNode;
  } else {
    // Add new
    canvas.nodes.push(indicatorNode);
  }
}

/**
 * Remove a status indicator node from the canvas.
 * This modifies the canvas in memory - caller must save it.
 */
export function removeStatusIndicatorFromCanvas(
  canvas: CanvasFile,
  accomplishmentId: string
): void {
  const indicatorId = getStatusIndicatorId(accomplishmentId);
  const index = canvas.nodes.findIndex(n => n.id === indicatorId);
  if (index >= 0) {
    canvas.nodes.splice(index, 1);
  }
}

/**
 * Update status indicator for a single accomplishment.
 * Loads canvas, updates indicator, saves canvas.
 */
export async function updateStatusIndicator(
  config: Config,
  accomplishmentId: string,
  status: AccomplishmentStatus,
  canvasSource?: string
): Promise<void> {
  // Get the accomplishment to find its title (used for file path)
  const accomplishment = await getAccomplishment(config, accomplishmentId);
  const title = accomplishment.frontmatter.title;

  const canvas = await loadCanvas(config, canvasSource);
  const relPath = getRelativeAccomplishmentPath(config, title);
  const accNode = findNodeByFile(canvas, relPath);

  if (!accNode) {
    // Accomplishment not on canvas, skip
    return;
  }

  updateStatusIndicatorInCanvas(canvas, accNode, accomplishmentId, status);

  // Save canvas using atomic write
  const { writeFileAtomic } = await import('../utils/file-utils.js');
  const { getCanvasPath } = await import('../utils/config.js');
  const { serializeCanvas } = await import('../parsers/canvas-parser.js');

  const canvasPath = getCanvasPath(config, canvasSource);
  await writeFileAtomic(canvasPath, serializeCanvas(canvas));
}

/**
 * Remove status indicator for a single accomplishment.
 */
export async function removeStatusIndicator(
  config: Config,
  accomplishmentId: string,
  canvasSource?: string
): Promise<void> {
  const canvas = await loadCanvas(config, canvasSource);
  removeStatusIndicatorFromCanvas(canvas, accomplishmentId);

  const { writeFileAtomic } = await import('../utils/file-utils.js');
  const { getCanvasPath } = await import('../utils/config.js');
  const { serializeCanvas } = await import('../parsers/canvas-parser.js');

  const canvasPath = getCanvasPath(config, canvasSource);
  await writeFileAtomic(canvasPath, serializeCanvas(canvas));
}

export interface ReconcileResult {
  created: number;
  updated: number;
  removed: number;
  total_accomplishments: number;
}

/**
 * Reconcile all status indicators on the canvas.
 * Creates missing indicators, updates incorrect ones, removes orphaned ones.
 */
export async function reconcileAllStatusIndicators(
  config: Config,
  canvasSource?: string
): Promise<ReconcileResult> {
  const { writeFileAtomic } = await import('../utils/file-utils.js');
  const { getCanvasPath } = await import('../utils/config.js');
  const { serializeCanvas } = await import('../parsers/canvas-parser.js');

  const canvas = await loadCanvas(config, canvasSource);
  const accomplishments = await listAccomplishments(config, undefined, canvasSource);

  const result: ReconcileResult = {
    created: 0,
    updated: 0,
    removed: 0,
    total_accomplishments: accomplishments.length,
  };

  // Track which indicator IDs we've processed
  const processedIndicatorIds = new Set<string>();

  // Process each accomplishment
  for (const acc of accomplishments) {
    // Use title for file path lookup (canvas stores files by title)
    const relPath = getRelativeAccomplishmentPath(config, acc.title);
    const accNode = findNodeByFile(canvas, relPath);

    if (!accNode) {
      // Accomplishment not on canvas, skip
      continue;
    }

    const indicatorId = getStatusIndicatorId(acc.id);
    processedIndicatorIds.add(indicatorId);

    const existingIndicator = findStatusIndicator(canvas, acc.id);
    const expectedIndicator = STATUS_INDICATORS[acc.status];

    if (!existingIndicator) {
      // Create new indicator
      updateStatusIndicatorInCanvas(canvas, accNode, acc.id, acc.status);
      result.created++;
    } else {
      // Check if update needed (emoji or position changed)
      const expectedX = accNode.x + accNode.width + 5;
      const expectedY = accNode.y;

      if (existingIndicator.text !== expectedIndicator.emoji ||
          existingIndicator.x !== expectedX ||
          existingIndicator.y !== expectedY ||
          existingIndicator.color !== expectedIndicator.color) {
        updateStatusIndicatorInCanvas(canvas, accNode, acc.id, acc.status);
        result.updated++;
      }
    }
  }

  // Remove orphaned indicators (indicators without corresponding accomplishment)
  const orphanedIndicators = canvas.nodes.filter(
    n => n.id.startsWith('status-') && !processedIndicatorIds.has(n.id)
  );

  for (const orphan of orphanedIndicators) {
    const index = canvas.nodes.findIndex(n => n.id === orphan.id);
    if (index >= 0) {
      canvas.nodes.splice(index, 1);
      result.removed++;
    }
  }

  // Save canvas once at the end
  const canvasPath = getCanvasPath(config, canvasSource);
  await writeFileAtomic(canvasPath, serializeCanvas(canvas));

  return result;
}

