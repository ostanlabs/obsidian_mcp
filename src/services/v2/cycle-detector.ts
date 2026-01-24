/**
 * Cycle Detector Service
 *
 * Detects cycles in entity dependency graphs using DFS.
 * Operates in strict mode: rejects entity creation/update if cycle detected.
 *
 * Algorithm:
 * 1. Build dependency graph from entities
 * 2. Use DFS with coloring (white/gray/black) to detect back edges
 * 3. If cycle detected, return the cycle path and suggestions for breaking it
 */

import { EntityId, Entity, EntityType, getEntityTypeFromId } from '../../models/v2-types.js';

// =============================================================================
// Types
// =============================================================================

export interface CycleDetectionResult {
  /** Whether a cycle was detected */
  hasCycle: boolean;
  /** The cycle path if detected (e.g., [A, B, C, A]) */
  cyclePath?: EntityId[];
  /** Human-readable message describing the cycle */
  message?: string;
  /** Suggestions for breaking the cycle */
  suggestions?: CycleBreakSuggestion[];
}

export interface CycleBreakSuggestion {
  /** The dependency to remove */
  removeEdge: { from: EntityId; to: EntityId };
  /** Priority of this suggestion (lower is better) */
  priority: number;
  /** Reason for this suggestion */
  reason: string;
}

// =============================================================================
// Node Colors for DFS
// =============================================================================

enum NodeColor {
  WHITE = 'white', // Not visited
  GRAY = 'gray',   // Currently being processed (in stack)
  BLACK = 'black', // Fully processed
}

// =============================================================================
// Cycle Detector
// =============================================================================

/**
 * Detects cycles in dependency graphs using DFS.
 */
export class CycleDetector {
  /**
   * Check if adding a dependency would create a cycle.
   *
   * @param fromId - Entity that would depend on toId
   * @param toId - Entity that fromId would depend on
   * @param getDependencies - Function to get dependencies of an entity
   * @returns CycleDetectionResult with cycle info if detected
   */
  wouldCreateCycle(
    fromId: EntityId,
    toId: EntityId,
    getDependencies: (id: EntityId) => EntityId[]
  ): CycleDetectionResult {
    // Check if toId can reach fromId (which would create a cycle)
    const visited = new Set<EntityId>();
    const path: EntityId[] = [];

    const canReach = this.dfsCanReach(toId, fromId, getDependencies, visited, path);

    if (canReach) {
      // Cycle would be: fromId -> toId -> ... -> fromId
      const cyclePath = [fromId, toId, ...path, fromId];
      return {
        hasCycle: true,
        cyclePath,
        message: `Adding dependency ${fromId} → ${toId} would create a cycle: ${cyclePath.join(' → ')}`,
        suggestions: this.generateBreakSuggestions(cyclePath, getDependencies),
      };
    }

    return { hasCycle: false };
  }

  /**
   * Detect cycles in the entire dependency graph.
   *
   * @param entities - All entities to check
   * @param getDependencies - Function to get dependencies of an entity
   * @returns CycleDetectionResult with first cycle found, if any
   */
  detectCycles(
    entities: Entity[],
    getDependencies: (id: EntityId) => EntityId[]
  ): CycleDetectionResult {
    const colors = new Map<EntityId, NodeColor>();
    const parent = new Map<EntityId, EntityId>();

    // Initialize all nodes as white
    for (const entity of entities) {
      colors.set(entity.id, NodeColor.WHITE);
    }

    // Run DFS from each unvisited node
    for (const entity of entities) {
      if (colors.get(entity.id) === NodeColor.WHITE) {
        const cycle = this.dfsFindCycle(entity.id, getDependencies, colors, parent);
        if (cycle) {
          return {
            hasCycle: true,
            cyclePath: cycle,
            message: `Cycle detected: ${cycle.join(' → ')}`,
            suggestions: this.generateBreakSuggestions(cycle, getDependencies),
          };
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * DFS to check if target is reachable from current.
   */
  private dfsCanReach(
    current: EntityId,
    target: EntityId,
    getDependencies: (id: EntityId) => EntityId[],
    visited: Set<EntityId>,
    path: EntityId[]
  ): boolean {
    if (current === target) {
      return true;
    }

    if (visited.has(current)) {
      return false;
    }

    visited.add(current);
    path.push(current);

    for (const dep of getDependencies(current)) {
      if (this.dfsCanReach(dep, target, getDependencies, visited, path)) {
        return true;
      }
    }

    path.pop();
    return false;
  }

  /**
   * DFS to find a cycle starting from the given node.
   * Uses three-color algorithm (white/gray/black).
   */
  private dfsFindCycle(
    nodeId: EntityId,
    getDependencies: (id: EntityId) => EntityId[],
    colors: Map<EntityId, NodeColor>,
    parent: Map<EntityId, EntityId>
  ): EntityId[] | null {
    colors.set(nodeId, NodeColor.GRAY);

    for (const dep of getDependencies(nodeId)) {
      // Ensure dep is in the color map
      if (!colors.has(dep)) {
        colors.set(dep, NodeColor.WHITE);
      }

      if (colors.get(dep) === NodeColor.GRAY) {
        // Found a back edge - reconstruct cycle
        return this.reconstructCycle(nodeId, dep, parent);
      }

      if (colors.get(dep) === NodeColor.WHITE) {
        parent.set(dep, nodeId);
        const cycle = this.dfsFindCycle(dep, getDependencies, colors, parent);
        if (cycle) {
          return cycle;
        }
      }
    }

    colors.set(nodeId, NodeColor.BLACK);
    return null;
  }

  /**
   * Reconstruct the cycle path from parent pointers.
   */
  private reconstructCycle(
    from: EntityId,
    to: EntityId,
    parent: Map<EntityId, EntityId>
  ): EntityId[] {
    const cycle: EntityId[] = [to];
    let current = from;

    while (current !== to) {
      cycle.unshift(current);
      const p = parent.get(current);
      if (!p) break;
      current = p;
    }

    cycle.push(to); // Complete the cycle
    return cycle;
  }

  /**
   * Generate suggestions for breaking a cycle.
   * Uses priority rules based on entity types.
   */
  private generateBreakSuggestions(
    cyclePath: EntityId[],
    _getDependencies: (id: EntityId) => EntityId[]
  ): CycleBreakSuggestion[] {
    const suggestions: CycleBreakSuggestion[] = [];

    // Priority order for breaking: task > story > milestone > decision > document
    const typePriority: Record<EntityType, number> = {
      task: 1,
      story: 2,
      milestone: 3,
      decision: 4,
      document: 5,
      feature: 6,
    };

    // For each edge in the cycle, suggest removing it
    for (let i = 0; i < cyclePath.length - 1; i++) {
      const from = cyclePath[i];
      const to = cyclePath[i + 1];
      const fromType = getEntityTypeFromId(from);
      const toType = getEntityTypeFromId(to);

      // Calculate priority based on types
      const fromPriority = fromType ? typePriority[fromType] : 10;
      const toPriority = toType ? typePriority[toType] : 10;

      suggestions.push({
        removeEdge: { from, to },
        priority: fromPriority + toPriority,
        reason: `Remove dependency from ${from} (${fromType || 'unknown'}) to ${to} (${toType || 'unknown'})`,
      });
    }

    // Sort by priority (lower is better)
    suggestions.sort((a, b) => a.priority - b.priority);

    return suggestions;
  }
}

/** Default detector instance */
export const cycleDetector = new CycleDetector();

