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
  EntitySummary,
  EntityFull,
  EntityStatus,
  Workstream,
  Effort,
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

  /** Get all entities with optional filters (for list mode) */
  getAllEntities: (options?: {
    includeCompleted?: boolean;
    includeArchived?: boolean;
    workstream?: string;
    types?: EntityType[];
  }) => Promise<Entity[]>;

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
 * Supports three modes:
 * 1. Search mode: query is provided - full-text search
 * 2. Navigation mode: from_id + direction - traverse hierarchy
 * 3. List mode: filters only (or no params) - list entities matching filters
 */
export async function searchEntities(
  input: SearchEntitiesInput,
  deps: SearchNavigationDependencies
): Promise<SearchEntitiesOutput> {
  const { query, from_id, direction, depth = 1, filters, limit = 50 } = input;

  // Navigation mode: if from_id and direction are specified
  if (from_id && direction) {
    return performNavigation(from_id, direction, depth, filters, deps);
  }

  // Search mode: if query is provided
  if (query) {
    const searchResults = await deps.searchEntities(query, {
      types: filters?.type,
      statuses: filters?.status,
      workstreams: filters?.workstream,
      archived: filters?.archived,
      limit,
    });

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

  // List mode: no query, no navigation - just list entities with filters
  return performListMode(filters, limit, deps);
}

/**
 * List entities with optional filters.
 * Internal helper for searchEntities list mode.
 */
async function performListMode(
  filters: SearchEntitiesInput['filters'] | undefined,
  limit: number,
  deps: SearchNavigationDependencies
): Promise<SearchEntitiesOutput> {
  // Get all entities with basic filters
  let entities = await deps.getAllEntities({
    includeArchived: filters?.archived ?? false,
    includeCompleted: true,
    types: filters?.type,
    workstream: filters?.workstream?.[0], // getAllEntities only supports single workstream
  });

  // Apply additional filters that getAllEntities doesn't support
  if (filters?.status && filters.status.length > 0) {
    entities = entities.filter(e => filters.status!.includes(e.status as EntityStatus));
  }

  // Apply workstream filter for multiple workstreams (getAllEntities only supports one)
  if (filters?.workstream && filters.workstream.length > 1) {
    entities = entities.filter(e => filters.workstream!.includes(e.workstream));
  }

  // Apply effort filter if present
  if (filters?.effort && filters.effort.length > 0) {
    entities = entities.filter(e => {
      if ('effort' in e && e.effort) {
        return filters.effort!.includes(e.effort as Effort);
      }
      return false;
    });
  }

  // Apply limit
  const limitedEntities = entities.slice(0, limit);

  // Build results
  const results: SearchEntitiesOutput['results'] = limitedEntities.map(entity => ({
    id: entity.id,
    type: entity.type,
    title: entity.title,
    status: entity.status as EntityStatus,
    workstream: entity.workstream,
    parent: 'parent' in entity ? (entity.parent as EntityId) : undefined,
  }));

  return {
    results,
    total_matches: entities.length,
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
