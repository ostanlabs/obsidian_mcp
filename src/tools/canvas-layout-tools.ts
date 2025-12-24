/**
 * Canvas Layout Tools
 *
 * Category 8: Canvas Layout
 * - auto_layout_canvas: Reposition nodes using dependency-driven horizontal flow
 *
 * Layout Strategy:
 * - X position = topological order (distance from root nodes based on edges)
 * - Y position = workstream lane
 */

import type { CanvasPath } from '../models/v2-types.js';
import type { AutoLayoutCanvasInput, AutoLayoutCanvasOutput } from './tool-types.js';
import type { LayoutConfig } from '../services/v2/canvas-manager.js';

// =============================================================================
// Dependencies Interface
// =============================================================================

/**
 * Dependencies for canvas layout tools.
 * Injected at runtime to allow for testing and flexibility.
 */
export interface CanvasLayoutDependencies {
  /** Auto-layout canvas nodes */
  autoLayout: (
    entityMetadataResolver: (filePath: string) => Promise<{ workstream?: string; entityType?: string } | null>,
    canvasPath?: CanvasPath,
    config?: Partial<LayoutConfig>
  ) => Promise<{
    success: boolean;
    nodesRepositioned: number;
    errors: string[];
  }>;

  /** Get entity metadata from file path */
  getEntityMetadata: (filePath: string) => Promise<{ workstream?: string; entityType?: string } | null>;

  /** Get all file nodes from canvas */
  getAllFileNodes: (canvasPath?: CanvasPath) => Promise<Array<{ file?: string }>>;
}

// =============================================================================
// Auto Layout Canvas
// =============================================================================

/**
 * Auto-layout canvas nodes using dependency-driven horizontal flow with workstream lanes.
 *
 * This repositions all nodes on the canvas based on:
 * 1. Dependency order (X axis) - nodes flow left to right based on edge dependencies
 * 2. Workstream lanes (Y axis) - nodes are grouped vertically by their workstream
 */
export async function autoLayoutCanvas(
  input: AutoLayoutCanvasInput,
  deps: CanvasLayoutDependencies
): Promise<AutoLayoutCanvasOutput> {
  const { canvas_source, options } = input;

  // Convert input options to LayoutConfig
  const layoutConfig: Partial<LayoutConfig> = {};
  if (options?.stage_spacing !== undefined) {
    layoutConfig.stageSpacing = options.stage_spacing;
  }
  if (options?.item_spacing !== undefined) {
    layoutConfig.itemSpacing = options.item_spacing;
  }
  if (options?.lane_padding !== undefined) {
    layoutConfig.lanePadding = options.lane_padding;
  }

  // Get all file nodes to determine workstreams
  const fileNodes = await deps.getAllFileNodes(canvas_source as CanvasPath | undefined);
  const workstreamsFound = new Set<string>();

  // Collect workstreams from nodes
  for (const node of fileNodes) {
    if (node.file) {
      const metadata = await deps.getEntityMetadata(node.file);
      if (metadata?.workstream) {
        workstreamsFound.add(metadata.workstream);
      }
    }
  }

  // Create metadata resolver that respects preserve_workstreams option
  const preserveWorkstreams = new Set(options?.preserve_workstreams || []);

  const metadataResolver = async (filePath: string) => {
    const metadata = await deps.getEntityMetadata(filePath);

    // If this workstream should be preserved, return null to skip repositioning
    if (metadata?.workstream && preserveWorkstreams.has(metadata.workstream)) {
      return null;
    }

    return metadata;
  };

  // Run auto-layout
  const result = await deps.autoLayout(
    metadataResolver,
    canvas_source as CanvasPath | undefined,
    layoutConfig
  );

  return {
    success: result.success,
    nodes_repositioned: result.nodesRepositioned,
    workstreams_found: Array.from(workstreamsFound).sort(),
    errors: result.errors,
  };
}

