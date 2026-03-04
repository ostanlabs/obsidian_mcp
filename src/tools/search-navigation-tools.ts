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
  Task,
  Decision,
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
  PaginationInput,
  PaginationOutput,
} from './tool-types.js';

import { PAGINATION_DEFAULTS } from './tool-types.js';
import { applyPagination } from './pagination-utils.js';

// =============================================================================
// Semantic Content Extraction
// =============================================================================

/**
 * Extract relevant content excerpt based on a query.
 * Uses simple keyword matching to find and return relevant paragraphs.
 *
 * Algorithm:
 * 1. Split content into paragraphs
 * 2. Score each paragraph based on query term matches
 * 3. Return top-scoring paragraphs with context
 *
 * @param content Full content to search
 * @param query Search query
 * @param maxLength Maximum length of returned excerpt (default: 1000 chars)
 * @returns Relevant excerpt or empty string if no matches
 */
function extractSemanticContent(content: string, query: string, maxLength: number = 1000): string {
  if (!content || !query) return '';

  // Tokenize query into terms
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  if (queryTerms.length === 0) return '';

  // Split content into paragraphs (by double newline or heading)
  const paragraphs = content.split(/\n\n+|\n(?=#)/);

  // Score each paragraph
  const scored = paragraphs.map((para, index) => {
    const paraLower = para.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      // Count occurrences of each term
      const regex = new RegExp(term, 'gi');
      const matches = paraLower.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    // Boost score for headings
    if (para.startsWith('#')) {
      score *= 1.5;
    }

    return { para, score, index };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Collect top paragraphs until we hit maxLength
  const result: string[] = [];
  let totalLength = 0;

  for (const { para, score } of scored) {
    if (score === 0) break; // No more matches

    if (totalLength + para.length > maxLength && result.length > 0) {
      break;
    }

    result.push(para);
    totalLength += para.length;
  }

  if (result.length === 0) {
    return ''; // No relevant content found
  }

  // Sort by original order to maintain document flow
  const originalOrder = result.map(para => ({
    para,
    index: paragraphs.indexOf(para),
  }));
  originalOrder.sort((a, b) => a.index - b.index);

  return originalOrder.map(o => o.para).join('\n\n');
}

// =============================================================================
// Dependencies Interface
// =============================================================================

/**
 * Semantic search result from MSRL.
 */
export interface SemanticSearchResult {
  docUri: string;
  headingPath: string;
  excerpt: string;
  score: number;
}

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

  /** Semantic search using MSRL (optional - only available if MSRL is initialized) */
  semanticSearch?: (query: string, options?: {
    topK?: number;
    docUriPrefix?: string;
  }) => Promise<SemanticSearchResult[]>;

  /** Get all entities with optional filters (for list mode) */
  getAllEntities: (options?: {
    includeCompleted?: boolean;
    includeArchived?: boolean;
    includeSuperseded?: boolean;
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
  extras?: { relevance_score?: number; snippet?: string; path?: string; validation?: ValidationResult }
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

  // Always include validation status as an object
  if (extras?.validation !== undefined) {
    result.validation = {
      valid: extras.validation.valid,
    };
    if (!extras.validation.valid && extras.validation.errors.length > 0) {
      result.validation.reason = extras.validation.errors.join('; ');
    }
  }

  return result;
}

/**
 * Compute etag from search results for cache validation.
 * Uses a simple hash of entity IDs and their update timestamps.
 */
function computeEtag(entities: Entity[]): string {
  if (entities.length === 0) return 'empty';

  // Create a deterministic string from sorted entity IDs and their update times
  const sortedData = entities
    .map(e => `${e.id}:${e.updated_at || e.created_at || ''}`)
    .sort()
    .join('|');

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < sortedData.length; i++) {
    hash = ((hash << 5) + hash) + sortedData.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(36);
}

/**
 * Get the latest update timestamp from a list of entities.
 */
function getLatestUpdate(entities: Entity[]): string | undefined {
  if (entities.length === 0) return undefined;

  let latest: Date | undefined;
  for (const entity of entities) {
    const timestamp = entity.updated_at || entity.created_at;
    if (timestamp) {
      const date = new Date(timestamp);
      if (!latest || date > latest) {
        latest = date;
      }
    }
  }

  return latest?.toISOString();
}

/**
 * Filter entities by 'since' timestamp (only return entities updated after this time).
 */
function filterBySince(entities: Entity[], since: string | undefined): Entity[] {
  if (!since) return entities;

  const sinceDate = new Date(since);
  if (isNaN(sinceDate.getTime())) {
    // Invalid date, return all entities
    return entities;
  }

  return entities.filter(entity => {
    const timestamp = entity.updated_at || entity.created_at;
    if (!timestamp) return false;
    const entityDate = new Date(timestamp);
    return entityDate > sinceDate;
  });
}

/**
 * Extract pagination input from SearchEntitiesInput, handling legacy limit/offset.
 */
function extractPaginationInput(input: SearchEntitiesInput): PaginationInput {
  // If new pagination params are provided, use them
  if (input.max_items !== undefined || input.continuation_token !== undefined || input.max_response_size !== undefined) {
    return {
      max_items: input.max_items,
      max_response_size: input.max_response_size,
      continuation_token: input.continuation_token,
    };
  }

  // Fall back to legacy limit/offset if provided
  if (input.limit !== undefined || input.offset !== undefined) {
    // Convert legacy offset to continuation token format
    const offset = input.offset ?? 0;
    const maxItems = input.limit ?? PAGINATION_DEFAULTS.MAX_ITEMS;
    return {
      max_items: maxItems,
      // If offset > 0, we need to encode it as a continuation token
      continuation_token: offset > 0 ? Buffer.from(JSON.stringify({ offset })).toString('base64url') : undefined,
    };
  }

  // Use defaults
  return {};
}

/**
 * Full-text search across entities with filters.
 * Supports four modes:
 * 1. Semantic search mode: query + semantic=true - MSRL hybrid search
 * 2. Search mode: query is provided - full-text search (BM25)
 * 3. Navigation mode: from_id + direction - traverse hierarchy
 * 4. List mode: filters only (or no params) - list entities matching filters
 *
 * Pagination: Default max_items is 20 (conservative for smaller contexts).
 * Agents with larger context windows can increase max_items up to 200.
 */
export async function searchEntities(
  input: SearchEntitiesInput,
  deps: SearchNavigationDependencies
): Promise<SearchEntitiesOutput> {
  const { query, semantic, from_id, direction, depth = 1, filters, fields, since } = input;
  const paginationInput = extractPaginationInput(input);

  // Navigation mode: if from_id and direction are specified
  if (from_id && direction) {
    return performNavigation(from_id, direction, depth, filters, fields, paginationInput, since, deps);
  }

  // Semantic search mode: if query and semantic=true
  if (query && semantic) {
    return performSemanticSearch(query, filters, fields, paginationInput, since, deps);
  }

  // Search mode: if query is provided (BM25)
  if (query) {
    return performBM25Search(query, filters, fields, paginationInput, since, deps);
  }

  // List mode: no query, no navigation - just list entities with filters
  return performListMode(filters, fields, paginationInput, since, deps);
}

/**
 * Perform BM25 full-text search.
 */
async function performBM25Search(
  query: string,
  filters: SearchEntitiesInput['filters'] | undefined,
  fields: EntityField[] | undefined,
  paginationInput: PaginationInput,
  since: string | undefined,
  deps: SearchNavigationDependencies
): Promise<SearchEntitiesOutput> {
  // Get all matching results (we'll paginate after)
  const searchResults = await deps.searchEntities(query, {
    types: filters?.type,
    statuses: filters?.status,
    workstreams: filters?.workstream,
    archived: filters?.archived,
    limit: PAGINATION_DEFAULTS.MAX_ITEMS_LIMIT * 2, // Get enough for pagination
  });

  // Extract entities for since filtering and etag computation
  let matchedEntities = searchResults.map(r => r.entity);

  // Apply 'since' filter if provided
  matchedEntities = filterBySince(matchedEntities, since);
  const matchedEntityIds = new Set(matchedEntities.map(e => e.id));

  // Build result items with paths and validation
  const allResults: SearchResultItem[] = [];
  for (const { entity, score, snippet } of searchResults) {
    // Skip entities filtered out by 'since'
    if (!matchedEntityIds.has(entity.id)) continue;

    const path = await deps.getEntityPath(entity.id);
    const validation = await checkIfValid(entity, deps);

    // Apply valid filter if specified
    if (filters?.valid !== undefined && validation.valid !== filters.valid) {
      continue;
    }

    allResults.push(buildSearchResultItem(entity, fields, {
      relevance_score: score,
      snippet,
      path,
      validation,
    }));
  }

  // Apply pagination
  const { items, pagination } = applyPagination({
    items: allResults,
    pagination: paginationInput,
    context: `search:${query}`,
  });

  // Compute etag and latest_update from matched entities
  const etag = computeEtag(matchedEntities);
  const latest_update = getLatestUpdate(matchedEntities);

  return {
    results: items,
    total_matches: allResults.length,
    pagination,
    etag,
    latest_update,
  };
}

/**
 * Perform semantic search using MSRL.
 * Maps MSRL results back to entities.
 */
async function performSemanticSearch(
  query: string,
  filters: SearchEntitiesInput['filters'] | undefined,
  fields: EntityField[] | undefined,
  paginationInput: PaginationInput,
  since: string | undefined,
  deps: SearchNavigationDependencies
): Promise<SearchEntitiesOutput> {
  if (!deps.semanticSearch) {
    throw new Error('Semantic search not available - MSRL engine not initialized');
  }

  // Build doc URI prefix filter based on entity type filter
  let docUriPrefix: string | undefined;
  if (filters?.type && filters.type.length === 1) {
    // Map entity type to folder prefix
    const typeToFolder: Record<EntityType, string> = {
      milestone: 'milestones/',
      story: 'stories/',
      task: 'tasks/',
      decision: 'decisions/',
      document: 'documents/',
      feature: 'features/',
    };
    docUriPrefix = typeToFolder[filters.type[0]];
  }

  // Perform semantic search - cap at 50 (MSRL's maxTopK limit)
  // This is sufficient since semantic search returns the most relevant results first
  const semanticResults = await deps.semanticSearch(query, {
    topK: Math.min(50, PAGINATION_DEFAULTS.MAX_ITEMS_LIMIT * 2),
    docUriPrefix,
  });

  // Map MSRL results to entities
  const allResults: SearchResultItem[] = [];
  const matchedEntities: Entity[] = [];
  const processedIds = new Set<EntityId>();

  for (const result of semanticResults) {
    // Extract entity ID from docUri (e.g., "stories/S-001.md" -> "S-001")
    const match = result.docUri.match(/([A-Z]+-\d+)\.md$/);
    if (!match) continue;

    const entityId = match[1] as EntityId;

    // Skip duplicates (same entity might appear multiple times from different chunks)
    if (processedIds.has(entityId)) continue;
    processedIds.add(entityId);

    // Get the entity
    const entity = await deps.getEntity(entityId);
    if (!entity) continue;

    // Apply 'since' filter
    if (since) {
      const sinceDate = new Date(since);
      const entityDate = new Date(entity.updated_at || entity.created_at || '');
      if (!isNaN(sinceDate.getTime()) && entityDate <= sinceDate) continue;
    }

    // Apply remaining filters
    if (filters?.status && !filters.status.includes(entity.status as EntityStatus)) continue;
    if (filters?.workstream && !filters.workstream.includes(entity.workstream)) continue;
    if (filters?.archived !== undefined) {
      const isArchived = 'archived' in entity && entity.archived === true;
      if (filters.archived !== isArchived) continue;
    }

    // Compute validation
    const validation = await checkIfValid(entity, deps);

    // Apply valid filter if specified
    if (filters?.valid !== undefined && validation.valid !== filters.valid) {
      continue;
    }

    // Track matched entities for etag computation
    matchedEntities.push(entity);

    // Build result item
    const path = await deps.getEntityPath(entityId);
    allResults.push(buildSearchResultItem(entity, fields, {
      relevance_score: result.score,
      snippet: result.excerpt,
      path,
      validation,
    }));
  }

  // Apply pagination
  const { items, pagination } = applyPagination({
    items: allResults,
    pagination: paginationInput,
    context: `semantic:${query}`,
  });

  // Compute etag and latest_update from matched entities
  const etag = computeEtag(matchedEntities);
  const latest_update = getLatestUpdate(matchedEntities);

  return {
    results: items,
    total_matches: allResults.length,
    pagination,
    etag,
    latest_update,
  };
}

/**
 * Check if an entity is orphaned based on its type:
 * - Stories/Tasks: parent is missing or points to non-existent entity
 * - Decisions: affects is empty or all referenced entities don't exist
 * - Documents/Features: implemented_by is empty or all referenced entities don't exist
 * - Milestones: never orphaned (they are top-level)
 */
async function checkIfOrphaned(
  entity: Entity,
  deps: SearchNavigationDependencies
): Promise<boolean> {
  switch (entity.type) {
    case 'story':
    case 'task': {
      const parentId = (entity as Story | Task).parent;
      if (!parentId) return true; // No parent = orphaned
      const parent = await deps.getEntity(parentId);
      return parent === null; // Parent doesn't exist = orphaned
    }

    case 'decision': {
      const affects = (entity as Decision).affects;
      if (!affects || affects.length === 0) return true; // No affects = orphaned
      // Check if ALL referenced entities don't exist
      for (const refId of affects) {
        const ref = await deps.getEntity(refId);
        if (ref !== null) return false; // At least one exists = not orphaned
      }
      return true; // All references are gone = orphaned
    }

    case 'document': {
      const implementedBy = (entity as Document).implemented_by;
      if (!implementedBy || implementedBy.length === 0) return true; // No implementers = orphaned
      // Check if ALL referenced entities don't exist
      for (const refId of implementedBy) {
        const ref = await deps.getEntity(refId);
        if (ref !== null) return false; // At least one exists = not orphaned
      }
      return true; // All references are gone = orphaned
    }

    case 'feature': {
      const implementedBy = (entity as Feature).implemented_by;
      if (!implementedBy || implementedBy.length === 0) return true; // No implementers = orphaned
      // Check if ALL referenced entities don't exist
      for (const refId of implementedBy) {
        const ref = await deps.getEntity(refId);
        if (ref !== null) return false; // At least one exists = not orphaned
      }
      return true; // All references are gone = orphaned
    }

    case 'milestone':
      // Milestones are top-level, never orphaned
      return false;

    default:
      return false;
  }
}

/**
 * Decision validation limits by entity type.
 * All affected entities must be in the same workstream as the decision.
 */
const DECISION_AFFECTS_LIMITS = {
  document: 1,
  task: 3,      // Must be within same milestone
  story: 3,     // Must be within same milestone
  feature: 3,
  milestone: 2,
} as const;

/**
 * Validation result for an entity.
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Check if an entity is valid according to business rules.
 * Currently only decisions have validation rules:
 * - Max 1 document per decision
 * - Max 3 tasks per decision (within same milestone)
 * - Max 3 stories per decision (within same milestone)
 * - Max 3 features per decision
 * - Max 2 milestones per decision
 * - All affected entities must be in the same workstream as the decision
 * - Tasks/stories must be within the same milestone
 */
async function checkIfValid(
  entity: Entity,
  deps: SearchNavigationDependencies
): Promise<ValidationResult> {
  // Story validation: check cross-milestone dependencies
  if (entity.type === 'story') {
    return checkStoryValid(entity as Story, deps);
  }

  // Decision validation
  if (entity.type === 'decision') {
    return checkDecisionValid(entity as Decision, deps);
  }

  // All other entities are always valid (for now)
  return { valid: true, errors: [] };
}

/**
 * Validate a story's dependencies.
 * Stories should not have depends_on or blocks relationships with stories from different milestones.
 * Cross-milestone dependencies should be expressed at the milestone level instead.
 */
async function checkStoryValid(
  story: Story,
  deps: SearchNavigationDependencies
): Promise<ValidationResult> {
  const errors: string[] = [];
  const storyMilestone = story.parent; // Story's parent is its milestone

  if (!storyMilestone) {
    // Story without a milestone - can't validate cross-milestone deps
    return { valid: true, errors: [] };
  }

  // Check depends_on for cross-milestone story dependencies
  const dependsOn = story.depends_on || [];
  for (const depId of dependsOn) {
    const depEntity = await deps.getEntity(depId);
    if (!depEntity || depEntity.type !== 'story') continue;

    const depStory = depEntity as Story;
    if (depStory.parent && depStory.parent !== storyMilestone) {
      errors.push(
        `Cross-milestone dependency: depends_on ${depId} (milestone ${depStory.parent}) but this story is in milestone ${storyMilestone}. ` +
        `Consider adding milestone-level dependency instead: ${storyMilestone} depends_on ${depStory.parent}`
      );
    }
  }

  // Check blocks for cross-milestone story dependencies
  const blocks = story.blocks || [];
  for (const blockId of blocks) {
    const blockEntity = await deps.getEntity(blockId);
    if (!blockEntity || blockEntity.type !== 'story') continue;

    const blockStory = blockEntity as Story;
    if (blockStory.parent && blockStory.parent !== storyMilestone) {
      errors.push(
        `Cross-milestone dependency: blocks ${blockId} (milestone ${blockStory.parent}) but this story is in milestone ${storyMilestone}. ` +
        `Consider adding milestone-level dependency instead: ${blockStory.parent} depends_on ${storyMilestone}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a decision's affects field.
 * Rules:
 * - Max 1 document per decision
 * - Max 3 tasks per decision (within same milestone)
 * - Max 3 stories per decision (within same milestone)
 * - Max 3 features per decision
 * - Max 2 milestones per decision
 * - All affected entities must be in the same workstream as the decision
 */
async function checkDecisionValid(
  decision: Decision,
  deps: SearchNavigationDependencies
): Promise<ValidationResult> {
  const errors: string[] = [];
  const affects = decision.affects || [];

  if (affects.length === 0) {
    // No affects = valid (orphaned check is separate)
    return { valid: true, errors: [] };
  }

  // Group affected entities by type
  const byType: Record<string, EntityId[]> = {
    document: [],
    task: [],
    story: [],
    feature: [],
    milestone: [],
  };

  // Track milestones for tasks/stories (for same-milestone validation)
  const taskMilestones = new Set<EntityId>();
  const storyMilestones = new Set<EntityId>();

  for (const affectedId of affects) {
    const affected = await deps.getEntity(affectedId);
    if (!affected) continue; // Skip non-existent entities

    // Check workstream match
    if (affected.workstream !== decision.workstream) {
      errors.push(`Cross-workstream dependency: ${affectedId} is in workstream '${affected.workstream}' but decision is in '${decision.workstream}'`);
    }

    // Group by type
    if (affected.type in byType) {
      byType[affected.type].push(affectedId);
    }

    // Track milestones for tasks/stories
    if (affected.type === 'task') {
      const task = affected as Task;
      if (task.parent) {
        // Task's parent is a story, need to get story's parent (milestone)
        const story = await deps.getEntity(task.parent);
        if (story && story.type === 'story') {
          const storyEntity = story as Story;
          if (storyEntity.parent) {
            taskMilestones.add(storyEntity.parent);
          }
        }
      }
    } else if (affected.type === 'story') {
      const story = affected as Story;
      if (story.parent) {
        storyMilestones.add(story.parent);
      }
    }
  }

  // Check count limits
  for (const [type, ids] of Object.entries(byType)) {
    const limit = DECISION_AFFECTS_LIMITS[type as keyof typeof DECISION_AFFECTS_LIMITS];
    if (ids.length > limit) {
      errors.push(`Too many ${type}s: ${ids.length} (max ${limit}). Consider splitting into multiple decisions.`);
    }
  }

  // Check same-milestone constraint for tasks
  if (taskMilestones.size > 1) {
    errors.push(`Tasks span ${taskMilestones.size} milestones. Tasks in a decision should be within the same milestone.`);
  }

  // Check same-milestone constraint for stories
  if (storyMilestones.size > 1) {
    errors.push(`Stories span ${storyMilestones.size} milestones. Stories in a decision should be within the same milestone.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * List entities with optional filters.
 * Internal helper for searchEntities list mode.
 */
async function performListMode(
  filters: SearchEntitiesInput['filters'] | undefined,
  fields: EntityField[] | undefined,
  paginationInput: PaginationInput,
  since: string | undefined,
  deps: SearchNavigationDependencies
): Promise<SearchEntitiesOutput> {
  // Get all entities with basic filters
  let entities = await deps.getAllEntities({
    includeArchived: filters?.archived ?? false,
    includeSuperseded: filters?.include_superseded ?? false,
    includeCompleted: true,
    types: filters?.type,
    workstream: filters?.workstream?.[0], // getAllEntities only supports single workstream
  });

  // Apply 'since' filter if provided
  entities = filterBySince(entities, since);

  // Apply additional filters that getAllEntities doesn't support
  if (filters?.status && filters.status.length > 0) {
    entities = entities.filter(e => filters.status!.includes(e.status as EntityStatus));
  }

  // Apply workstream filter for multiple workstreams (getAllEntities only supports one)
  if (filters?.workstream && filters.workstream.length > 1) {
    entities = entities.filter(e => filters.workstream!.includes(e.workstream));
  }

  // Apply orphaned filter - find entities with missing or non-existent parents/references
  if (filters?.orphaned === true) {
    const orphanedEntities: Entity[] = [];
    for (const entity of entities) {
      const isOrphaned = await checkIfOrphaned(entity, deps);
      if (isOrphaned) {
        orphanedEntities.push(entity);
      }
    }
    entities = orphanedEntities;
  }

  // Compute validation for all entities and optionally filter by valid status
  const validationResults = new Map<EntityId, ValidationResult>();
  for (const entity of entities) {
    const validation = await checkIfValid(entity, deps);
    validationResults.set(entity.id, validation);
  }

  // Apply valid filter if specified
  if (filters?.valid !== undefined) {
    entities = entities.filter(e => {
      const validation = validationResults.get(e.id);
      return validation?.valid === filters.valid;
    });
  }

  // Build all results with field filtering and validation
  const allResults: SearchResultItem[] = entities.map(entity => {
    const validation = validationResults.get(entity.id) || { valid: true, errors: [] };
    return buildSearchResultItem(entity, fields, { validation });
  });

  // Apply pagination
  const { items, pagination } = applyPagination({
    items: allResults,
    pagination: paginationInput,
    context: 'list',
  });

  // Compute etag and latest_update from matched entities
  const etag = computeEtag(entities);
  const latest_update = getLatestUpdate(entities);

  return {
    results: items,
    total_matches: allResults.length,
    pagination,
    etag,
    latest_update,
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
  paginationInput: PaginationInput,
  since: string | undefined,
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

  // Apply 'since' filter if provided
  let filteredResults = filterBySince(rawResults, since);

  // Apply filters to results
  if (filters) {
    filteredResults = filteredResults.filter(entity => {
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

  // Compute validation for all entities and optionally filter by valid status
  const validationResults = new Map<EntityId, ValidationResult>();
  for (const entity of filteredResults) {
    const validation = await checkIfValid(entity, deps);
    validationResults.set(entity.id, validation);
  }

  // Apply valid filter if specified
  if (filters?.valid !== undefined) {
    filteredResults = filteredResults.filter(e => {
      const validation = validationResults.get(e.id);
      return validation?.valid === filters.valid;
    });
  }

  // Convert to output format with field filtering and validation
  const allResults: SearchResultItem[] = filteredResults.map(entity => {
    const validation = validationResults.get(entity.id) || { valid: true, errors: [] };
    return buildSearchResultItem(entity, fields, { validation });
  });

  // Apply pagination
  const { items, pagination } = applyPagination({
    items: allResults,
    pagination: paginationInput,
    context: `nav:${from_id}:${direction}`,
  });

  // Compute etag and latest_update from matched entities
  const etag = computeEtag(filteredResults);
  const latest_update = getLatestUpdate(filteredResults);

  return {
    results: items,
    total_matches: allResults.length,
    pagination,
    origin: originSummary,
    path_description: pathDescription,
    etag,
    latest_update,
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
  const { id, fields = DEFAULT_FIELDS, content_mode = 'none', query } = input;

  const entity = await deps.getEntity(id);
  if (!entity) {
    throw new Error(`Entity not found: ${id}`);
  }

  // Validate semantic mode requires query
  if (content_mode === 'semantic' && !query) {
    throw new Error('query parameter is required when content_mode is "semantic"');
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

  // Content - handle content_mode
  // Note: content_mode takes precedence over fields.includes('content')
  if (content_mode === 'full' || (content_mode === 'none' && fieldSet.has('content'))) {
    const full = await deps.toEntityFull(entity);
    result.content = full.content;
  } else if (content_mode === 'semantic' && query) {
    const full = await deps.toEntityFull(entity);
    result.content = extractSemanticContent(full.content, query);
  }
  // content_mode === 'none' and no 'content' in fields: no content included

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
 *
 * Pagination: Default max_items is 20 (conservative for smaller contexts).
 * Agents with larger context windows can increase max_items up to 200.
 */
export async function getEntities(
  input: GetEntitiesInput,
  deps: SearchNavigationDependencies
): Promise<GetEntitiesOutput> {
  const { ids, fields, max_items, max_response_size, continuation_token } = input;

  // Apply pagination to the IDs array
  const { items: paginatedIds, pagination } = applyPagination({
    items: ids,
    pagination: { max_items, max_response_size, continuation_token },
    context: 'get_entities',
  });

  const entities: Record<EntityId, GetEntityOutput> = {};
  const notFound: EntityId[] = [];

  // Process paginated IDs in parallel for efficiency
  await Promise.all(
    paginatedIds.map(async (id) => {
      try {
        const entityOutput = await getEntity({ id, fields }, deps);
        entities[id] = entityOutput;
      } catch {
        // Entity not found
        notFound.push(id);
      }
    })
  );

  // Only include pagination if there are more items or we're not on page 1
  const includePagination = pagination.has_more || pagination.page > 1;

  return {
    entities,
    not_found: notFound,
    ...(includePagination ? { pagination } : {}),
  };
}
