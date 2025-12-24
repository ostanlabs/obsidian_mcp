/**
 * V2 Canvas Manager
 *
 * Centralized service for managing Obsidian canvas files.
 * Handles node and edge operations with atomic batch updates.
 *
 * Key features:
 * - Atomic file writes (temp file + rename) to prevent corruption
 * - Obsidian reload trigger to sync UI after file changes
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

import type {
  Entity,
  EntityId,
  CanvasNode,
  CanvasEdge,
  CanvasFile,
  CanvasPath,
  VaultPath,
} from '../../models/v2-types.js';

import { writeFileAtomic, triggerObsidianReload } from '../../utils/file-utils.js';

// =============================================================================
// Types
// =============================================================================

export interface Position {
  x: number;
  y: number;
}

export interface NodeDimensions {
  width: number;
  height: number;
}

export type CanvasOperation =
  | { type: 'add_node'; filePath: string; position?: Position; dimensions?: NodeDimensions }
  | { type: 'remove_node'; filePath: string }
  | { type: 'update_node_path'; oldPath: string; newPath: string }
  | { type: 'add_edge'; fromFilePath: string; toFilePath: string }
  | { type: 'remove_edge'; fromFilePath: string; toFilePath: string };

export interface BatchResult {
  success: boolean;
  nodesAdded: number;
  nodesRemoved: number;
  nodesUpdated: number;
  edgesAdded: number;
  edgesRemoved: number;
  errors: string[];
}

// Layout configuration
export interface LayoutConfig {
  /** Horizontal spacing between dependency stages */
  stageSpacing: number;
  /** Vertical spacing between items in same lane */
  itemSpacing: number;
  /** Padding around lanes */
  lanePadding: number;
  /** Starting X position */
  startX: number;
  /** Starting Y position */
  startY: number;
}

export interface WorkstreamLane {
  name: string;
  yStart: number;
}

export interface LayoutResult {
  success: boolean;
  nodesRepositioned: number;
  errors: string[];
}

// Default layout configuration
const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  stageSpacing: 400,
  itemSpacing: 120,
  lanePadding: 50,
  startX: 0,
  startY: 0,
};

// Default node dimensions by entity type
const DEFAULT_DIMENSIONS: Record<string, NodeDimensions> = {
  milestone: { width: 500, height: 400 },
  story: { width: 400, height: 300 },
  task: { width: 350, height: 250 },
  decision: { width: 400, height: 300 },
  document: { width: 400, height: 350 },
  default: { width: 400, height: 300 },
};

// =============================================================================
// Canvas Manager Class
// =============================================================================

export class CanvasManager {
  private vaultPath: string;
  private defaultCanvas: string;
  private entityPathResolver: (entityId: EntityId) => Promise<VaultPath | null>;

  constructor(
    vaultPath: string,
    defaultCanvas: string,
    entityPathResolver: (entityId: EntityId) => Promise<VaultPath | null>
  ) {
    this.vaultPath = vaultPath;
    this.defaultCanvas = defaultCanvas;
    this.entityPathResolver = entityPathResolver;
  }

  // ---------------------------------------------------------------------------
  // Canvas I/O
  // ---------------------------------------------------------------------------

  private async readCanvas(canvasPath: CanvasPath): Promise<CanvasFile> {
    const fullPath = path.join(this.vaultPath, canvasPath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const data = JSON.parse(content);
      return {
        nodes: data.nodes || [],
        edges: data.edges || [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Canvas doesn't exist, return empty
        return { nodes: [], edges: [] };
      }
      throw error;
    }
  }

  private async writeCanvas(canvasPath: CanvasPath, canvas: CanvasFile): Promise<void> {
    const fullPath = path.join(this.vaultPath, canvasPath);
    const content = JSON.stringify(canvas, null, 2);

    // Use atomic write (temp file + rename) to prevent corruption from concurrent access
    await writeFileAtomic(fullPath, content);

    // Trigger Obsidian to reload the canvas so UI stays in sync
    triggerObsidianReload(this.vaultPath, canvasPath);
  }

  private findNodeByFile(canvas: CanvasFile, filePath: string): CanvasNode | undefined {
    return canvas.nodes.find(n => n.type === 'file' && n.file === filePath);
  }

  private generateNodeId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private generateEdgeId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  // ---------------------------------------------------------------------------
  // Single Operations
  // ---------------------------------------------------------------------------

  /**
   * Add a node to canvas for an entity file.
   * Returns the node ID if successful.
   */
  async addNode(
    filePath: VaultPath,
    canvasPath?: CanvasPath,
    position?: Position,
    dimensions?: NodeDimensions
  ): Promise<string | null> {
    const targetCanvas = canvasPath || this.defaultCanvas;
    const canvas = await this.readCanvas(targetCanvas);

    // Check if node already exists
    const existing = this.findNodeByFile(canvas, filePath);
    if (existing) {
      return existing.id;
    }

    // Calculate position (simple grid layout if not specified)
    const pos = position || this.calculateNextPosition(canvas);
    const dims = dimensions || DEFAULT_DIMENSIONS.default;

    const node: CanvasNode = {
      id: this.generateNodeId(),
      type: 'file',
      file: filePath,
      x: pos.x,
      y: pos.y,
      width: dims.width,
      height: dims.height,
    };

    canvas.nodes.push(node);
    await this.writeCanvas(targetCanvas, canvas);
    return node.id;
  }

  /**
   * Remove a node from canvas by file path.
   * Also removes any edges connected to the node.
   */
  async removeNode(filePath: VaultPath, canvasPath?: CanvasPath): Promise<boolean> {
    const targetCanvas = canvasPath || this.defaultCanvas;
    const canvas = await this.readCanvas(targetCanvas);

    const node = this.findNodeByFile(canvas, filePath);
    if (!node) {
      return false;
    }

    // Remove node
    canvas.nodes = canvas.nodes.filter(n => n.id !== node.id);

    // Remove connected edges
    canvas.edges = canvas.edges.filter(
      e => e.fromNode !== node.id && e.toNode !== node.id
    );

    await this.writeCanvas(targetCanvas, canvas);
    return true;
  }

  /**
   * Update a node's file path (used when files are moved/renamed).
   */
  async updateNodePath(
    oldPath: VaultPath,
    newPath: VaultPath,
    canvasPath?: CanvasPath
  ): Promise<boolean> {
    const targetCanvas = canvasPath || this.defaultCanvas;
    const canvas = await this.readCanvas(targetCanvas);

    const node = this.findNodeByFile(canvas, oldPath);
    if (!node) {
      return false;
    }

    node.file = newPath;
    await this.writeCanvas(targetCanvas, canvas);
    return true;
  }

  /**
   * Add an edge between two nodes (for dependencies).
   * Returns the edge ID if successful.
   */
  async addEdge(
    fromFilePath: VaultPath,
    toFilePath: VaultPath,
    canvasPath?: CanvasPath
  ): Promise<string | null> {
    const targetCanvas = canvasPath || this.defaultCanvas;
    const canvas = await this.readCanvas(targetCanvas);

    const fromNode = this.findNodeByFile(canvas, fromFilePath);
    const toNode = this.findNodeByFile(canvas, toFilePath);

    if (!fromNode || !toNode) {
      return null;
    }

    // Check if edge already exists
    const existing = canvas.edges.find(
      e => e.fromNode === fromNode.id && e.toNode === toNode.id
    );
    if (existing) {
      return existing.id;
    }

    const edge: CanvasEdge = {
      id: this.generateEdgeId(),
      fromNode: fromNode.id,
      toNode: toNode.id,
      fromSide: 'right',
      toSide: 'left',
    };

    canvas.edges.push(edge);
    await this.writeCanvas(targetCanvas, canvas);
    return edge.id;
  }

  /**
   * Remove an edge between two nodes.
   */
  async removeEdge(
    fromFilePath: VaultPath,
    toFilePath: VaultPath,
    canvasPath?: CanvasPath
  ): Promise<boolean> {
    const targetCanvas = canvasPath || this.defaultCanvas;
    const canvas = await this.readCanvas(targetCanvas);

    const fromNode = this.findNodeByFile(canvas, fromFilePath);
    const toNode = this.findNodeByFile(canvas, toFilePath);

    if (!fromNode || !toNode) {
      return false;
    }

    const initialLength = canvas.edges.length;
    canvas.edges = canvas.edges.filter(
      e => !(e.fromNode === fromNode.id && e.toNode === toNode.id)
    );

    if (canvas.edges.length === initialLength) {
      return false; // No edge was removed
    }

    await this.writeCanvas(targetCanvas, canvas);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Batch Operations
  // ---------------------------------------------------------------------------

  /**
   * Apply multiple operations atomically (single read/write).
   */
  async batchUpdate(
    operations: CanvasOperation[],
    canvasPath?: CanvasPath
  ): Promise<BatchResult> {
    const targetCanvas = canvasPath || this.defaultCanvas;
    const canvas = await this.readCanvas(targetCanvas);

    const result: BatchResult = {
      success: true,
      nodesAdded: 0,
      nodesRemoved: 0,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesRemoved: 0,
      errors: [],
    };

    for (const op of operations) {
      try {
        switch (op.type) {
          case 'add_node': {
            const existing = this.findNodeByFile(canvas, op.filePath);
            if (!existing) {
              const pos = op.position || this.calculateNextPosition(canvas);
              const dims = op.dimensions || DEFAULT_DIMENSIONS.default;
              canvas.nodes.push({
                id: this.generateNodeId(),
                type: 'file',
                file: op.filePath,
                x: pos.x,
                y: pos.y,
                width: dims.width,
                height: dims.height,
              });
              result.nodesAdded++;
            }
            break;
          }

          case 'remove_node': {
            const node = this.findNodeByFile(canvas, op.filePath);
            if (node) {
              canvas.nodes = canvas.nodes.filter(n => n.id !== node.id);
              canvas.edges = canvas.edges.filter(
                e => e.fromNode !== node.id && e.toNode !== node.id
              );
              result.nodesRemoved++;
            }
            break;
          }

          case 'update_node_path': {
            const node = this.findNodeByFile(canvas, op.oldPath);
            if (node) {
              node.file = op.newPath;
              result.nodesUpdated++;
            }
            break;
          }

          case 'add_edge': {
            const fromNode = this.findNodeByFile(canvas, op.fromFilePath);
            const toNode = this.findNodeByFile(canvas, op.toFilePath);
            if (fromNode && toNode) {
              const exists = canvas.edges.some(
                e => e.fromNode === fromNode.id && e.toNode === toNode.id
              );
              if (!exists) {
                canvas.edges.push({
                  id: this.generateEdgeId(),
                  fromNode: fromNode.id,
                  toNode: toNode.id,
                  fromSide: 'right',
                  toSide: 'left',
                });
                result.edgesAdded++;
              }
            }
            break;
          }

          case 'remove_edge': {
            const fromNode = this.findNodeByFile(canvas, op.fromFilePath);
            const toNode = this.findNodeByFile(canvas, op.toFilePath);
            if (fromNode && toNode) {
              const initialLength = canvas.edges.length;
              canvas.edges = canvas.edges.filter(
                e => !(e.fromNode === fromNode.id && e.toNode === toNode.id)
              );
              if (canvas.edges.length < initialLength) {
                result.edgesRemoved++;
              }
            }
            break;
          }
        }
      } catch (error) {
        result.errors.push(`Operation ${op.type} failed: ${error}`);
        result.success = false;
      }
    }

    await this.writeCanvas(targetCanvas, canvas);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Query Methods
  // ---------------------------------------------------------------------------

  /**
   * Get a node by entity file path.
   */
  async getNodeByFilePath(
    filePath: VaultPath,
    canvasPath?: CanvasPath
  ): Promise<CanvasNode | null> {
    const targetCanvas = canvasPath || this.defaultCanvas;
    const canvas = await this.readCanvas(targetCanvas);
    return this.findNodeByFile(canvas, filePath) || null;
  }

  /**
   * Get all file nodes from canvas.
   */
  async getAllFileNodes(canvasPath?: CanvasPath): Promise<CanvasNode[]> {
    const targetCanvas = canvasPath || this.defaultCanvas;
    const canvas = await this.readCanvas(targetCanvas);
    return canvas.nodes.filter(n => n.type === 'file');
  }

  /**
   * Check if canvas file exists.
   */
  async canvasExists(canvasPath?: CanvasPath): Promise<boolean> {
    const targetCanvas = canvasPath || this.defaultCanvas;
    const fullPath = path.join(this.vaultPath, targetCanvas);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-Layout
  // ---------------------------------------------------------------------------

  /**
   * Auto-layout canvas nodes using dependency-driven horizontal flow with workstream lanes.
   *
   * Strategy:
   * - X position = topological order (distance from root nodes based on edges)
   * - Y position = workstream lane
   *
   * @param entityMetadataResolver - Function to get entity metadata (workstream, type) from file path
   * @param canvasPath - Optional canvas path (uses default if not specified)
   * @param config - Optional layout configuration
   */
  async autoLayout(
    entityMetadataResolver: (filePath: string) => Promise<{ workstream?: string; entityType?: string } | null>,
    canvasPath?: CanvasPath,
    config: Partial<LayoutConfig> = {}
  ): Promise<LayoutResult> {
    const layoutConfig = { ...DEFAULT_LAYOUT_CONFIG, ...config };
    const targetCanvas = canvasPath || this.defaultCanvas;
    const result: LayoutResult = {
      success: true,
      nodesRepositioned: 0,
      errors: [],
    };

    try {
      const canvas = await this.readCanvas(targetCanvas);
      const fileNodes = canvas.nodes.filter(n => n.type === 'file');

      if (fileNodes.length === 0) {
        return result;
      }

      // Step 1: Build dependency graph and calculate topological order
      const nodeDepths = this.calculateNodeDepths(canvas);

      // Step 2: Group nodes by workstream
      const nodesByWorkstream = new Map<string, CanvasNode[]>();
      const unknownWorkstream: CanvasNode[] = [];

      for (const node of fileNodes) {
        if (!node.file) continue;

        const metadata = await entityMetadataResolver(node.file);
        const workstream = metadata?.workstream || 'Unknown';

        if (workstream === 'Unknown') {
          unknownWorkstream.push(node);
        } else {
          if (!nodesByWorkstream.has(workstream)) {
            nodesByWorkstream.set(workstream, []);
          }
          nodesByWorkstream.get(workstream)!.push(node);
        }
      }

      // Add unknown workstream if there are nodes
      if (unknownWorkstream.length > 0) {
        nodesByWorkstream.set('Unknown', unknownWorkstream);
      }

      // Step 3: Calculate workstream lanes
      const workstreamLanes = this.calculateWorkstreamLanes(
        nodesByWorkstream,
        layoutConfig
      );

      // Step 4: Position nodes within their lanes
      for (const [workstream, nodes] of nodesByWorkstream) {
        const lane = workstreamLanes.get(workstream);
        if (!lane) continue;

        // Sort nodes by their dependency depth (topological order)
        nodes.sort((a, b) => {
          const depthA = nodeDepths.get(a.id) || 0;
          const depthB = nodeDepths.get(b.id) || 0;
          return depthA - depthB;
        });

        // Group nodes by depth for column layout
        const nodesByDepth = new Map<number, CanvasNode[]>();
        for (const node of nodes) {
          const depth = nodeDepths.get(node.id) || 0;
          if (!nodesByDepth.has(depth)) {
            nodesByDepth.set(depth, []);
          }
          nodesByDepth.get(depth)!.push(node);
        }

        // Position nodes column by column
        const depths = Array.from(nodesByDepth.keys()).sort((a, b) => a - b);
        for (const depth of depths) {
          const depthNodes = nodesByDepth.get(depth)!;
          const xPos = layoutConfig.startX + layoutConfig.lanePadding +
                       depth * layoutConfig.stageSpacing;

          for (let i = 0; i < depthNodes.length; i++) {
            const node = depthNodes[i];
            const nodeHeight = node.height || DEFAULT_DIMENSIONS.default.height;

            node.x = xPos;
            node.y = lane.yStart + layoutConfig.lanePadding +
                     i * (nodeHeight + layoutConfig.itemSpacing);
            result.nodesRepositioned++;
          }
        }
      }

      // Write updated canvas
      await this.writeCanvas(targetCanvas, canvas);

    } catch (err) {
      result.success = false;
      result.errors.push(`Layout failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return result;
  }

  /**
   * Calculate the topological depth of each node based on edges.
   * Nodes with no incoming edges have depth 0.
   * Depth = max(depth of all predecessors) + 1
   */
  private calculateNodeDepths(canvas: CanvasFile): Map<string, number> {
    const depths = new Map<string, number>();
    const incomingEdges = new Map<string, string[]>();
    const outgoingEdges = new Map<string, string[]>();

    // Build adjacency lists
    for (const node of canvas.nodes) {
      incomingEdges.set(node.id, []);
      outgoingEdges.set(node.id, []);
    }

    for (const edge of canvas.edges) {
      const incoming = incomingEdges.get(edge.toNode);
      if (incoming) incoming.push(edge.fromNode);

      const outgoing = outgoingEdges.get(edge.fromNode);
      if (outgoing) outgoing.push(edge.toNode);
    }

    // Find root nodes (no incoming edges)
    const roots: string[] = [];
    for (const [nodeId, incoming] of incomingEdges) {
      if (incoming.length === 0) {
        roots.push(nodeId);
        depths.set(nodeId, 0);
      }
    }

    // BFS to calculate depths
    const queue = [...roots];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const currentDepth = depths.get(nodeId) || 0;

      for (const childId of outgoingEdges.get(nodeId) || []) {
        const existingDepth = depths.get(childId);
        const newDepth = currentDepth + 1;

        if (existingDepth === undefined || newDepth > existingDepth) {
          depths.set(childId, newDepth);
          queue.push(childId);
        }
      }
    }

    // Handle disconnected nodes (no edges)
    for (const node of canvas.nodes) {
      if (!depths.has(node.id)) {
        depths.set(node.id, 0);
      }
    }

    return depths;
  }

  /**
   * Calculate Y positions for workstream lanes.
   */
  private calculateWorkstreamLanes(
    nodesByWorkstream: Map<string, CanvasNode[]>,
    config: LayoutConfig
  ): Map<string, WorkstreamLane> {
    const lanes = new Map<string, WorkstreamLane>();
    let currentY = config.startY;

    // Sort workstreams for consistent ordering
    const workstreams = Array.from(nodesByWorkstream.keys()).sort();

    for (const workstream of workstreams) {
      const nodes = nodesByWorkstream.get(workstream)!;

      // Calculate lane height based on max nodes at any depth
      const maxNodesInColumn = this.getMaxNodesInColumn(nodes);
      const nodeHeight = DEFAULT_DIMENSIONS.default.height;
      const laneHeight = config.lanePadding * 2 +
                         maxNodesInColumn * (nodeHeight + config.itemSpacing);

      lanes.set(workstream, {
        name: workstream,
        yStart: currentY,
      });

      currentY += laneHeight + config.itemSpacing;
    }

    return lanes;
  }

  /**
   * Get the maximum number of nodes in any single column (depth level).
   */
  private getMaxNodesInColumn(nodes: CanvasNode[]): number {
    // This is a simplified calculation - in practice we'd need the depth info
    // For now, estimate based on total nodes
    return Math.min(nodes.length, 5);
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  private calculateNextPosition(canvas: CanvasFile): Position {
    // Simple grid layout: find rightmost node and place next to it
    if (canvas.nodes.length === 0) {
      return { x: 0, y: 0 };
    }

    const fileNodes = canvas.nodes.filter(n => n.type === 'file');
    if (fileNodes.length === 0) {
      return { x: 0, y: 0 };
    }

    // Find the rightmost node
    let maxX = -Infinity;
    let maxXNode: CanvasNode | null = null;
    for (const node of fileNodes) {
      if (node.x > maxX) {
        maxX = node.x;
        maxXNode = node;
      }
    }

    if (!maxXNode) {
      return { x: 0, y: 0 };
    }

    // Place new node to the right with some padding
    return {
      x: maxXNode.x + (maxXNode.width || 400) + 50,
      y: maxXNode.y,
    };
  }

  /**
   * Get dimensions for a specific entity type.
   */
  getDimensionsForType(entityType: string): NodeDimensions {
    return DEFAULT_DIMENSIONS[entityType] || DEFAULT_DIMENSIONS.default;
  }
}

