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
  Document,
  Feature,
  Story,
  Milestone,
} from '../models/v2-types.js';

import type {
  SearchEntitiesInput,
  SearchEntitiesOutput,
  SearchResultItem,
  GetEntityInput,
  GetEntityOutput,
  GetEntitiesInput,
  GetEntitiesOutput,
  EntityField,
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

/** Default fields for search results when none specified */
const SEARCH_DEFAULT_FIELDS: EntityField[] = ['id', 'type', 'title', 'status', 'workstream'];

/**
 * Build a search result item with only the requested fields.
 */
function buildSearchResultItem(
  entity: Entity,
  requestedFields: EntityField[] | undefined,
  extras?: { relevance_score?: number; snippet?: string; path?: string }
): SearchResultItem {
  const fields = requestedFields || SEARCH_DEFAULT_FIELDS;
  const fieldSet = new Set(fields);

  // Always include id
  const result: SearchResultItem = { id: entity.id };

  // Add requested fields
  if (fieldSet.has('type')) result.type = entity.type;
  if (fieldSet.has('title')) result.title = entity.title;
  if (fieldSet.has('status')) result.status = entity.status as EntityStatus;
  if (fieldSet.has('workstream')) result.workstream = entity.workstream;
  if (fieldSet.has('last_updated')) result.last_updated = entity.updated_at || new Date().toISOString();
  if (fieldSet.has('parent') && 'parent' in entity && entity.parent) {
    result.parent = entity.parent as EntityId;
  }
  if (fieldSet.has('priority') && 'priority' in entity) {
    result.priority = (entity as Milestone | Story).priority;
  }
  if (fieldSet.has('phase') && 'phase' in entity) {
    result.phase = (entity as Feature).phase;
  }
  if (fieldSet.has('tier') && 'tier' in entity) {
    result.tier = (entity as Feature).tier;
  }

  // Add search-specific extras
  if (extras?.relevance_score !== undefined) result.relevance_score = extras.relevance_score;
  if (extras?.snippet !== undefined) result.snippet = extras.snippet;
  if (extras?.path !== undefined) result.path = extras.path;

  return result;
}

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
  const { query, from_id, direction, depth = 1, filters, limit = 50, offset = 0, fields } = input;

  // Navigation mode: if from_id and direction are specified
  if (from_id && direction) {
    return performNavigation(from_id, direction, depth, filters, fields, deps);
  }

  // Search mode: if query is provided
  if (query) {
    const searchResults = await deps.searchEntities(query, {
      types: filters?.type,
      statuses: filters?.status,
      workstreams: filters?.workstream,
      archived: filters?.archived,
      limit: limit + offset, // Get enough results to handle offset
    });

    // Apply offset
    const paginatedResults = searchResults.slice(offset, offset + limit);
    const results: SearchResultItem[] = [];

    for (const { entity, score, snippet } of paginatedResults) {
      const path = await deps.getEntityPath(entity.id);
      results.push(buildSearchResultItem(entity, fields, { relevance_score: score, snippet, path }));
    }

    return {
      results,
      total_matches: searchResults.length,
      pagination: {
        offset,
        limit,
        has_more: offset + limit < searchResults.length,
      },
    };
  }

  // List mode: no query, no navigation - just list entities with filters
  return performListMode(filters, limit, offset, fields, deps);
}

/**
 * List entities with optional filters.
 * Internal helper for searchEntities list mode.
 */
async function performListMode(
  filters: SearchEntitiesInput['filters'] | undefined,
  limit: number,
  offset: number,
  fields: EntityField[] | undefined,
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

  const totalMatches = entities.length;

  // Apply pagination
  const paginatedEntities = entities.slice(offset, offset + limit);

  // Build results with field filtering
  const results: SearchResultItem[] = paginatedEntities.map(entity =>
    buildSearchResultItem(entity, fields)
  );

  return {
    results,
    total_matches: totalMatches,
    pagination: {
      offset,
      limit,
      has_more: offset + limit < totalMatches,
    },
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
  fields: EntityField[] | undefined,
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

  // Convert to output format with field filtering
  const results: SearchResultItem[] = filteredResults.map(entity =>
    buildSearchResultItem(entity, fields)
  );

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

/** Fields that are always applicable to all entity types */
const UNIVERSAL_FIELDS: EntityField[] = ['id', 'type', 'title', 'status', 'workstream', 'last_updated', 'content', 'dependencies', 'dependency_details'];

/** Fields applicable to specific entity types */
const TYPE_SPECIFIC_FIELDS: Record<EntityType, EntityField[]> = {
  milestone: ['priority', 'children', 'children_count'],
  story: ['parent', 'children', 'children_count', 'priority', 'task_progress', 'acceptance_criteria', 'implementation_context'],
  task: ['parent', 'acceptance_criteria'],
  decision: [],
  document: ['documents', 'implementation_context'],
  feature: ['documented_by', 'implemented_by', 'decided_by', 'test_refs', 'user_story', 'tier', 'phase'],
};

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

  // Track inapplicable fields
  const applicableFields = new Set([...UNIVERSAL_FIELDS, ...(TYPE_SPECIFIC_FIELDS[entity.type] || [])]);
  const inapplicableFields: string[] = [];

  // Check for inapplicable fields
  for (const field of fields) {
    if (!applicableFields.has(field)) {
      inapplicableFields.push(field);
    }
  }

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

  // Priority
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

  // Document-specific fields
  if (entity.type === 'document') {
    const doc = entity as Document;
    if (fieldSet.has('documents') && doc.documents && doc.documents.length > 0) {
      result.documents = doc.documents;
    }
  }

  // Feature-specific fields
  if (entity.type === 'feature') {
    const feature = entity as Feature;
    if (fieldSet.has('documented_by') && feature.documented_by && feature.documented_by.length > 0) {
      result.documented_by = feature.documented_by;
    }
    if (fieldSet.has('implemented_by') && feature.implemented_by && feature.implemented_by.length > 0) {
      result.implemented_by = feature.implemented_by;
    }
    if (fieldSet.has('decided_by') && feature.decided_by && feature.decided_by.length > 0) {
      result.decided_by = feature.decided_by;
    }
    if (fieldSet.has('test_refs') && feature.test_refs && feature.test_refs.length > 0) {
      result.test_refs = feature.test_refs;
    }
    if (fieldSet.has('user_story') && feature.user_story) {
      result.user_story = feature.user_story;
    }
    if (fieldSet.has('tier') && feature.tier) {
      result.tier = feature.tier;
    }
    if (fieldSet.has('phase') && feature.phase) {
      result.phase = feature.phase;
    }
  }

  // Add _field_info if there are inapplicable fields
  if (inapplicableFields.length > 0) {
    result._field_info = { inapplicable: inapplicableFields };
  }

  return result;
}

// =============================================================================
// Get Entities (Bulk)
// =============================================================================

/**
 * Get multiple entities in a single call.
 * More efficient than multiple get_entity calls.
 */
export async function getEntities(
  input: GetEntitiesInput,
  deps: SearchNavigationDependencies
): Promise<GetEntitiesOutput> {
  const { ids, fields } = input;

  const entities: Record<EntityId, GetEntityOutput> = {};
  const notFound: EntityId[] = [];

  // Process all IDs in parallel for efficiency
  await Promise.all(
    ids.map(async (id) => {
      try {
        const entityOutput = await getEntity({ id, fields }, deps);
        entities[id] = entityOutput;
      } catch {
        // Entity not found
        notFound.push(id);
      }
    })
  );

  return {
    entities,
    not_found: notFound,
  };
}
