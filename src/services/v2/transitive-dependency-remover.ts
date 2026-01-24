/**
 * Transitive Dependency Remover Service
 *
 * Removes redundant transitive dependencies from entity dependency graphs.
 * If A depends on B and B depends on C, then A→C is transitive and can be removed.
 *
 * Algorithm:
 * 1. Build dependency graph from all entities
 * 2. For each entity, compute transitive closure of its dependencies
 * 3. Remove direct dependencies that are reachable through other paths
 * 4. Return list of removed dependencies for Agent feedback
 */

import { EntityId, Entity } from '../../models/v2-types.js';

// =============================================================================
// Types
// =============================================================================

export interface TransitiveRemovalResult {
  /** Entity that had dependencies removed */
  entityId: EntityId;
  /** Dependencies that were removed (transitive) */
  removedDependencies: EntityId[];
  /** Message describing the removal (for Agent feedback) */
  message: string;
}

export interface TransitiveRemovalSummary {
  /** Total number of entities processed */
  entitiesProcessed: number;
  /** Total number of transitive dependencies removed */
  totalRemoved: number;
  /** Details of each removal */
  removals: TransitiveRemovalResult[];
}

// =============================================================================
// Dependency Graph
// =============================================================================

/**
 * Simple dependency graph for transitive analysis.
 */
class DependencyGraph {
  private adjacency: Map<EntityId, Set<EntityId>> = new Map();

  addNode(id: EntityId): void {
    if (!this.adjacency.has(id)) {
      this.adjacency.set(id, new Set());
    }
  }

  addEdge(from: EntityId, to: EntityId): void {
    this.addNode(from);
    this.addNode(to);
    this.adjacency.get(from)!.add(to);
  }

  getDirectDependencies(id: EntityId): Set<EntityId> {
    return this.adjacency.get(id) || new Set();
  }

  /**
   * Compute transitive closure for a node using BFS.
   * Returns all nodes reachable from the given node.
   */
  getTransitiveClosure(id: EntityId): Set<EntityId> {
    const reachable = new Set<EntityId>();
    const queue: EntityId[] = [...this.getDirectDependencies(id)];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);

      for (const dep of this.getDirectDependencies(current)) {
        if (!reachable.has(dep)) {
          queue.push(dep);
        }
      }
    }

    return reachable;
  }

  /**
   * Find transitive dependencies for a node.
   * A dependency is transitive if it's reachable through another direct dependency.
   */
  findTransitiveDependencies(id: EntityId): EntityId[] {
    const direct = this.getDirectDependencies(id);
    const transitive: EntityId[] = [];

    for (const dep of direct) {
      // Check if this dependency is reachable through any other direct dependency
      for (const otherDep of direct) {
        if (otherDep === dep) continue;

        // Get transitive closure of otherDep
        const reachableFromOther = this.getTransitiveClosure(otherDep);
        if (reachableFromOther.has(dep)) {
          transitive.push(dep);
          break; // Found one path, no need to check others
        }
      }
    }

    return transitive;
  }
}

// =============================================================================
// Transitive Dependency Remover
// =============================================================================

/**
 * Service for removing transitive dependencies from entities.
 */
export class TransitiveDependencyRemover {
  /**
   * Analyze an entity's dependencies and find transitive ones.
   * Does not modify the entity - returns what would be removed.
   */
  analyzeEntity(
    entity: Entity,
    getDependencies: (id: EntityId) => EntityId[]
  ): TransitiveRemovalResult | null {
    const dependsOn = (entity as { depends_on?: EntityId[] }).depends_on;
    if (!dependsOn || dependsOn.length < 2) {
      return null; // Need at least 2 dependencies for transitivity
    }

    // Build local graph for this entity's dependencies
    const graph = new DependencyGraph();
    graph.addNode(entity.id);

    // Add direct dependencies
    for (const dep of dependsOn) {
      graph.addEdge(entity.id, dep);
    }

    // Add dependencies of dependencies (one level deep for efficiency)
    for (const dep of dependsOn) {
      const depDeps = getDependencies(dep);
      for (const depDep of depDeps) {
        graph.addEdge(dep, depDep);
      }
    }

    // Find transitive dependencies
    const transitive = graph.findTransitiveDependencies(entity.id);

    if (transitive.length === 0) {
      return null;
    }

    return {
      entityId: entity.id,
      removedDependencies: transitive,
      message: `Removed ${transitive.length} transitive dependenc${transitive.length === 1 ? 'y' : 'ies'} from ${entity.id}: ${transitive.join(', ')}`,
    };
  }

  /**
   * Remove transitive dependencies from an entity.
   * Returns the modified entity and removal result.
   */
  removeTransitiveDependencies(
    entity: Entity,
    getDependencies: (id: EntityId) => EntityId[]
  ): { entity: Entity; result: TransitiveRemovalResult | null } {
    const analysis = this.analyzeEntity(entity, getDependencies);

    if (!analysis) {
      return { entity, result: null };
    }

    // Create a copy of the entity with transitive dependencies removed
    const modifiedEntity = { ...entity };
    const dependsOn = (modifiedEntity as { depends_on?: EntityId[] }).depends_on;

    if (dependsOn) {
      const removedSet = new Set(analysis.removedDependencies);
      (modifiedEntity as { depends_on: EntityId[] }).depends_on = dependsOn.filter(
        (dep) => !removedSet.has(dep)
      );
    }

    return { entity: modifiedEntity, result: analysis };
  }

  /**
   * Process multiple entities and remove transitive dependencies.
   */
  processEntities(
    entities: Entity[],
    getDependencies: (id: EntityId) => EntityId[]
  ): TransitiveRemovalSummary {
    const removals: TransitiveRemovalResult[] = [];

    for (const entity of entities) {
      const result = this.analyzeEntity(entity, getDependencies);
      if (result) {
        removals.push(result);
      }
    }

    return {
      entitiesProcessed: entities.length,
      totalRemoved: removals.reduce((sum, r) => sum + r.removedDependencies.length, 0),
      removals,
    };
  }
}

/** Default remover instance */
export const transitiveDependencyRemover = new TransitiveDependencyRemover();

