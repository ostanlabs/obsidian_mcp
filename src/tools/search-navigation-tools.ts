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
  GetEntityInput,
  GetEntityOutput,
  EntityField,
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
 * Enhanced to support navigation mode (consolidates navigate_hierarchy).
 */
export async function searchEntities(
  input: SearchEntitiesInput,
  deps: SearchNavigationDependencies
): Promise<SearchEntitiesOutput> {
  const { query, from_id, direction, depth = 1, filters, limit = 20 } = input;

  // Navigation mode: if from_id and direction are specified
  if (from_id && direction) {
    return performNavigation(from_id, direction, depth, filters, deps);
  }

  // Search mode: query is required
  if (!query) {
    throw new Error('Either query (for search) or from_id+direction (for navigation) is required');
  }

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

/**
 * Perform navigation from an entity in a given direction.
 * Internal helper for searchEntities navigation mode.
 */
async function performNavigation(
  from_id: EntityId,
  direction: 'up' | 'down' | 'siblings' | 'dependencies',
  depth: number,
  filters: SearchEntitiesInput['filters'] | undefined,
  deps: SearchNavigationDependencies
): Promise<SearchEntitiesOutput> {
  const origin = await deps.getEntity(from_id);
  if (!origin) {
    throw new Error(`Entity not found: ${from_id}`);
  }

  const originSummary = deps.toEntitySummary(origin);
  const rawResults: Entity[] = [];
  let pathDescription = '';

  switch (direction) {
    case 'up': {
      // Navigate to parent(s)
      let current = origin;
      let currentDepth = 0;
      while (currentDepth < depth) {
        const parent = await deps.getParent(current.id);
        if (!parent) break;
        rawResults.push(parent);
        current = parent;
        currentDepth++;
      }
      pathDescription = `Parent chain from ${origin.title} (${rawResults.length} level(s) up)`;
      break;
    }

    case 'down': {
      // Navigate to children
      const collectChildren = async (parentId: EntityId, currentDepth: number) => {
        if (currentDepth >= depth) return;
        const children = await deps.getChildren(parentId);
        for (const child of children) {
          rawResults.push(child);
          await collectChildren(child.id, currentDepth + 1);
        }
      };
      await collectChildren(from_id, 0);
      pathDescription = `Children of ${origin.title} (${rawResults.length} item(s), depth ${depth})`;
      break;
    }

    case 'siblings': {
      // Get siblings (same parent)
      const siblings = await deps.getSiblings(from_id);
      rawResults.push(...siblings);
      pathDescription = `Siblings of ${origin.title} (${rawResults.length} item(s))`;
      break;
    }

    case 'dependencies': {
      // Get dependency graph
      const dependencies = await deps.getDependencies(from_id);
      const dependents = await deps.getDependents(from_id);
      rawResults.push(...dependencies, ...dependents);
      pathDescription = `Dependencies of ${origin.title}: ${dependencies.length} blocking, ${dependents.length} blocked by`;
      break;
    }
  }

  // Apply filters to results
  let filteredResults = rawResults;
  if (filters) {
    filteredResults = rawResults.filter(entity => {
      if (filters.type && !filters.type.includes(entity.type)) return false;
      if (filters.status && !filters.status.includes(entity.status as EntityStatus)) return false;
      if (filters.workstream && !filters.workstream.includes(entity.workstream)) return false;
      if (filters.archived !== undefined) {
        const isArchived = 'archived' in entity && entity.archived === true;
        if (filters.archived !== isArchived) return false;
      }
      return true;
    });
  }

  // Convert to output format
  const results: SearchEntitiesOutput['results'] = filteredResults.map(entity => ({
    id: entity.id,
    type: entity.type,
    title: entity.title,
    status: entity.status as EntityStatus,
    workstream: entity.workstream,
    parent: 'parent' in entity ? (entity.parent as EntityId) : undefined,
  }));

  return {
    results,
    total_matches: results.length,
    origin: originSummary,
    path_description: pathDescription,
  };
}

// =============================================================================
// Get Entity (Unified - replaces get_entity_summary and get_entity_full)
// =============================================================================

/** Default fields returned when no fields specified */
const DEFAULT_FIELDS: EntityField[] = ['id', 'type', 'title', 'status', 'workstream', 'last_updated'];

/**
 * Get entity with selective field retrieval.
 * Replaces get_entity_summary and get_entity_full with field-based control.
 */
export async function getEntity(
  input: GetEntityInput,
  deps: SearchNavigationDependencies
): Promise<GetEntityOutput> {
  const { id, fields = DEFAULT_FIELDS } = input;

  const entity = await deps.getEntity(id);
  if (!entity) {
    throw new Error(`Entity not found: ${id}`);
  }

  // Always include base fields
  const result: GetEntityOutput = {
    id: entity.id,
    type: entity.type,
    title: entity.title,
    status: entity.status as EntityStatus,
    workstream: entity.workstream || 'default',
    last_updated: entity.updated_at || new Date().toISOString(),
  };

  // Add optional fields based on request
  const fieldSet = new Set(fields);

  // Parent info
  if (fieldSet.has('parent') && 'parent' in entity && entity.parent) {
    const parentEntity = await deps.getEntity(entity.parent as EntityId);
    if (parentEntity) {
      result.parent = { id: parentEntity.id, title: parentEntity.title };
    }
  }

  // Children count
  if (fieldSet.has('children_count') || fieldSet.has('children')) {
    const children = await deps.getChildren(id);
    result.children_count = children.length;

    if (fieldSet.has('children')) {
      result.children = children.map(c => deps.toEntitySummary(c));
    }
  }

  // Content
  if (fieldSet.has('content')) {
    const full = await deps.toEntityFull(entity);
    result.content = full.content;
  }

  // Effort and priority
  if (fieldSet.has('effort') && 'effort' in entity) {
    result.effort = entity.effort as GetEntityOutput['effort'];
  }
  if (fieldSet.has('priority') && 'priority' in entity) {
    result.priority = entity.priority as GetEntityOutput['priority'];
  }

  // Dependencies (IDs only)
  if (fieldSet.has('dependencies')) {
    const dependencies = await deps.getDependencies(id);
    const dependents = await deps.getDependents(id);
    result.dependencies = {
      blocks: dependents.map(e => e.id),
      blocked_by: dependencies.map(e => e.id),
    };
  }

  // Dependency details (with summaries)
  if (fieldSet.has('dependency_details')) {
    const dependencies = await deps.getDependencies(id);
    const dependents = await deps.getDependents(id);
    result.dependency_details = {
      blocks: dependents.map(e => deps.toEntitySummary(e)),
      blocked_by: dependencies.map(e => deps.toEntitySummary(e)),
    };
  }

  // Task progress (for stories)
  if (fieldSet.has('task_progress') && entity.type === 'story') {
    result.task_progress = await deps.getTaskProgress(id);
  }

  // Acceptance criteria
  if (fieldSet.has('acceptance_criteria') && 'acceptance_criteria' in entity) {
    result.acceptance_criteria = entity.acceptance_criteria as string[];
  }

  return result;
}

// =============================================================================
// Get Entity Summary (Legacy - deprecated, use getEntity instead)
// =============================================================================

/**
 * Get a quick overview of an entity.
 * @deprecated Use getEntity with fields parameter instead
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
// Get Entity Full (Legacy - deprecated, use getEntity instead)
// =============================================================================

/**
 * Get complete entity with all relationships.
 * @deprecated Use getEntity with fields parameter instead
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
// Navigate Hierarchy (DEPRECATED)
// =============================================================================

/**
 * Traverse entity relationships in a given direction.
 *
 * @deprecated Use `searchEntities` with `from_id` and `direction` parameters instead.
 * Example: `searchEntities({ from_id: 'M-001', direction: 'down', depth: 2 })`
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
