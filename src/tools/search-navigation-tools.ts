/**
 * Search & Navigation Tools
 *
 * Category 4: Search & Navigation
 * - search_entities: Full-text search with filters
 * - get_entity_summary: Quick entity overview
 * - get_entity_full: Complete entity with relationships
 * - navigate_hierarchy: Traverse entity relationships
 */

import type {
  Entity,
  EntityId,
  EntityType,
} from '../models/v2-types.js';

import type {
  SearchEntitiesInput,
  SearchEntitiesOutput,
  GetEntitySummaryInput,
  GetEntitySummaryOutput,
  GetEntityFullInput,
  GetEntityFullOutput,
  NavigateHierarchyInput,
  NavigateHierarchyOutput,
  EntitySummary,
  EntityFull,
  EntityStatus,
  Workstream,
} from './tool-types.js';

// =============================================================================
// Dependencies Interface
// =============================================================================

/**
 * Dependencies for search and navigation tools.
 */
export interface SearchNavigationDependencies {
  /** Search entities by query */
  searchEntities: (query: string, options?: {
    types?: EntityType[];
    statuses?: EntityStatus[];
    workstreams?: Workstream[];
    archived?: boolean;
    limit?: number;
  }) => Promise<Array<{ entity: Entity; score: number; snippet: string }>>;

  /** Get entity by ID */
  getEntity: (id: EntityId) => Promise<Entity | null>;

  /** Get entity path */
  getEntityPath: (id: EntityId) => Promise<string>;

  /** Convert entity to summary */
  toEntitySummary: (entity: Entity) => EntitySummary;

  /** Convert entity to full representation */
  toEntityFull: (entity: Entity) => Promise<EntityFull>;

  /** Get parent entity */
  getParent: (id: EntityId) => Promise<Entity | null>;

  /** Get children of an entity */
  getChildren: (id: EntityId) => Promise<Entity[]>;

  /** Get siblings of an entity */
  getSiblings: (id: EntityId) => Promise<Entity[]>;

  /** Get entities that this entity depends on */
  getDependencies: (id: EntityId) => Promise<Entity[]>;

  /** Get entities that depend on this entity */
  getDependents: (id: EntityId) => Promise<Entity[]>;

  /** Get task progress for a story */
  getTaskProgress: (storyId: EntityId) => Promise<{ total: number; completed: number }>;
}

// =============================================================================
// Search Entities
// =============================================================================

/**
 * Full-text search across entities with filters.
 */
export async function searchEntities(
  input: SearchEntitiesInput,
  deps: SearchNavigationDependencies
): Promise<SearchEntitiesOutput> {
  const { query, filters, limit = 20, include_content } = input;

  // Perform search
  const searchResults = await deps.searchEntities(query, {
    types: filters?.type,
    statuses: filters?.status,
    workstreams: filters?.workstream,
    archived: filters?.archived,
    limit,
  });

  // Build results
  const results: SearchEntitiesOutput['results'] = [];

  for (const { entity, score, snippet } of searchResults) {
    const path = await deps.getEntityPath(entity.id);

    results.push({
      id: entity.id,
      type: entity.type,
      title: entity.title,
      status: entity.status,
      workstream: entity.workstream,
      relevance_score: score,
      snippet,
      parent: 'parent' in entity ? (entity.parent as EntityId) : undefined,
      path,
    });
  }

  return {
    results,
    total_matches: results.length,
  };
}

// =============================================================================
// Get Entity Summary
// =============================================================================

/**
 * Get a quick overview of an entity.
 */
export async function getEntitySummary(
  input: GetEntitySummaryInput,
  deps: SearchNavigationDependencies
): Promise<GetEntitySummaryOutput> {
  const { id } = input;

  const entity = await deps.getEntity(id);
  if (!entity) {
    throw new Error(`Entity not found: ${id}`);
  }

  const summary = deps.toEntitySummary(entity);
  const dependencies = await deps.getDependencies(id);
  const dependents = await deps.getDependents(id);

  // Get task progress for stories
  let taskProgress: { total: number; completed: number } | undefined;
  if (entity.type === 'story') {
    taskProgress = await deps.getTaskProgress(id);
  }

  return {
    ...summary,
    effort: 'effort' in entity ? (entity.effort as GetEntitySummaryOutput['effort']) : undefined,
    priority: 'priority' in entity ? (entity.priority as GetEntitySummaryOutput['priority']) : undefined,
    dependencies: {
      blocks: dependents.map((e) => e.id),
      blocked_by: dependencies.map((e) => e.id),
    },
    task_progress: taskProgress,
  };
}

// =============================================================================
// Get Entity Full
// =============================================================================

/**
 * Get complete entity with all relationships.
 */
export async function getEntityFull(
  input: GetEntityFullInput,
  deps: SearchNavigationDependencies
): Promise<GetEntityFullOutput> {
  const { id } = input;

  const entity = await deps.getEntity(id);
  if (!entity) {
    throw new Error(`Entity not found: ${id}`);
  }

  return deps.toEntityFull(entity);
}

// =============================================================================
// Navigate Hierarchy
// =============================================================================

/**
 * Traverse entity relationships in a given direction.
 */
export async function navigateHierarchy(
  input: NavigateHierarchyInput,
  deps: SearchNavigationDependencies
): Promise<NavigateHierarchyOutput> {
  const { from_id, direction, depth = 1 } = input;

  const origin = await deps.getEntity(from_id);
  if (!origin) {
    throw new Error(`Entity not found: ${from_id}`);
  }

  const originSummary = deps.toEntitySummary(origin);
  const results: EntitySummary[] = [];
  let pathDescription = '';

  switch (direction) {
    case 'up': {
      // Navigate to parent(s)
      let current = origin;
      let currentDepth = 0;
      while (currentDepth < depth) {
        const parent = await deps.getParent(current.id);
        if (!parent) break;
        results.push(deps.toEntitySummary(parent));
        current = parent;
        currentDepth++;
      }
      pathDescription = `Parent chain from ${origin.title} (${results.length} level(s) up)`;
      break;
    }

    case 'down': {
      // Navigate to children
      const collectChildren = async (parentId: EntityId, currentDepth: number) => {
        if (currentDepth >= depth) return;
        const children = await deps.getChildren(parentId);
        for (const child of children) {
          results.push(deps.toEntitySummary(child));
          await collectChildren(child.id, currentDepth + 1);
        }
      };
      await collectChildren(from_id, 0);
      pathDescription = `Children of ${origin.title} (${results.length} item(s), depth ${depth})`;
      break;
    }

    case 'siblings': {
      // Get siblings (same parent)
      const siblings = await deps.getSiblings(from_id);
      for (const sibling of siblings) {
        results.push(deps.toEntitySummary(sibling));
      }
      pathDescription = `Siblings of ${origin.title} (${results.length} item(s))`;
      break;
    }

    case 'dependencies': {
      // Get dependency graph
      const dependencies = await deps.getDependencies(from_id);
      const dependents = await deps.getDependents(from_id);

      for (const dep of dependencies) {
        results.push(deps.toEntitySummary(dep));
      }
      for (const dep of dependents) {
        results.push(deps.toEntitySummary(dep));
      }
      pathDescription = `Dependencies of ${origin.title}: ${dependencies.length} blocking, ${dependents.length} blocked by`;
      break;
    }
  }

  return {
    origin: originSummary,
    results,
    path_description: pathDescription,
  };
}
