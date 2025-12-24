/**
 * Decision & Document Management Tools
 *
 * Category 5: Decision & Document Management
 * - manage_documents: Consolidated tool for document/decision management
 *   - get_decision_history: Get decision history for a topic
 *   - supersede_document: Update document based on decision
 *   - get_document_history: Get document version history
 *   - check_freshness: Check if document is up-to-date
 *
 * DEPRECATED:
 * - create_decision: Use create_entity with type: 'decision' instead
 */

import type {
  Entity,
  EntityId,
  Decision,
  Document,
} from '../models/v2-types.js';

import type {
  CreateDecisionInput,
  CreateDecisionOutput,
  GetDecisionHistoryInput,
  GetDecisionHistoryOutput,
  SupersedeDocumentInput,
  SupersedeDocumentOutput,
  GetDocumentHistoryInput,
  GetDocumentHistoryOutput,
  CheckDocumentFreshnessInput,
  CheckDocumentFreshnessOutput,
  ManageDocumentsInput,
  ManageDocumentsOutput,
  EntityFull,
  Workstream,
} from './tool-types.js';

// =============================================================================
// Dependencies Interface
// =============================================================================

/**
 * Dependencies for decision and document tools.
 */
export interface DecisionDocumentDependencies {
  /** Create a new decision */
  createDecision: (data: {
    title: string;
    context: string;
    decision: string;
    rationale: string;
    workstream: Workstream;
    decided_by: string;
    enables?: EntityId[];
    supersedes?: EntityId;
  }) => Promise<Decision>;

  /** Get entity by ID */
  getEntity: (id: EntityId) => Promise<Entity | null>;

  /** Get all decisions */
  getAllDecisions: (options?: {
    workstream?: Workstream;
    includeSuperseded?: boolean;
    includeArchived?: boolean;
  }) => Promise<Decision[]>;

  /** Get all documents */
  getAllDocuments: () => Promise<Document[]>;

  /** Update document */
  updateDocument: (id: EntityId, data: Partial<Document>) => Promise<Document>;

  /** Convert entity to full representation */
  toEntityFull: (entity: Entity) => Promise<EntityFull>;

  /** Get current timestamp */
  getCurrentTimestamp: () => string;

  /** Generate next ID */
  generateId: (type: 'decision' | 'document') => EntityId;

  /** Get decisions that affect a document */
  getDecisionsAffectingDocument: (docId: EntityId) => Promise<Decision[]>;

  /** Search content for pattern */
  searchContent: (entityId: EntityId, pattern: string) => Promise<boolean>;

  /** Add entity to canvas (optional) */
  addToCanvas?: (entity: Entity, canvasPath: string) => Promise<boolean>;
}

// =============================================================================
// Manage Documents (Consolidated Tool)
// =============================================================================

/**
 * Consolidated tool for document and decision management.
 * Dispatches to the appropriate handler based on action.
 */
export async function manageDocuments(
  input: ManageDocumentsInput,
  deps: DecisionDocumentDependencies
): Promise<ManageDocumentsOutput> {
  const { action } = input;

  switch (action) {
    case 'get_decision_history': {
      const result = await getDecisionHistory({
        topic: input.topic,
        workstream: input.workstream,
        include_superseded: input.include_superseded,
        include_archived: input.include_archived,
      }, deps);
      return { action: 'get_decision_history', ...result };
    }

    case 'supersede_document': {
      if (!input.document_id || !input.decision_id || !input.new_content || !input.change_summary) {
        throw new Error('supersede_document requires document_id, decision_id, new_content, and change_summary');
      }
      const result = await supersedeDocument({
        document_id: input.document_id,
        decision_id: input.decision_id,
        new_content: input.new_content,
        change_summary: input.change_summary,
      }, deps);
      return { action: 'supersede_document', ...result };
    }

    case 'get_document_history': {
      if (!input.document_id) {
        throw new Error('get_document_history requires document_id');
      }
      const result = await getDocumentHistory({
        document_id: input.document_id,
      }, deps);
      return { action: 'get_document_history', ...result };
    }

    case 'check_freshness': {
      if (!input.document_id) {
        throw new Error('check_freshness requires document_id');
      }
      const result = await checkDocumentFreshness({
        document_id: input.document_id,
      }, deps);
      return { action: 'check_freshness', ...result };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// =============================================================================
// Create Decision (DEPRECATED)
// =============================================================================

/**
 * Create a new decision record.
 *
 * @deprecated Use `create_entity` with `type: 'decision'` instead.
 * Example: `create_entity({ type: 'decision', data: { title: '...', workstream: '...', ... } })`
 */
export async function createDecision(
  input: CreateDecisionInput,
  deps: DecisionDocumentDependencies
): Promise<CreateDecisionOutput> {
  const {
    title,
    context,
    decision,
    rationale,
    workstream,
    decided_by,
    enables,
    supersedes,
    affects_documents,
    add_to_canvas,
    canvas_source,
  } = input;

  // Create the decision
  const newDecision = await deps.createDecision({
    title,
    context,
    decision,
    rationale,
    workstream,
    decided_by,
    enables,
    supersedes,
  });

  // Add to canvas if requested
  if (add_to_canvas && deps.addToCanvas && canvas_source) {
    await deps.addToCanvas(newDecision, canvas_source);
  }

  // Mark affected documents as potentially stale
  const staleDocuments: EntityId[] = [];
  if (affects_documents) {
    for (const docId of affects_documents) {
      const doc = await deps.getEntity(docId);
      if (doc && doc.type === 'document') {
        staleDocuments.push(docId);
      }
    }
  }

  const decisionFull = await deps.toEntityFull(newDecision);

  return {
    id: newDecision.id,
    decision: decisionFull,
    enabled_count: enables?.length || 0,
    stale_documents: staleDocuments,
  };
}

// =============================================================================
// Get Decision History
// =============================================================================

/**
 * Get decision history for a topic or workstream.
 * By default includes archived decisions since most decisions are archived after being decided.
 */
export async function getDecisionHistory(
  input: GetDecisionHistoryInput,
  deps: DecisionDocumentDependencies
): Promise<GetDecisionHistoryOutput> {
  const { topic, workstream, include_superseded } = input;
  // Default to including archived decisions (most decisions are archived after being decided)
  const include_archived = input.include_archived ?? true;

  // Get all decisions
  const decisions = await deps.getAllDecisions({
    workstream,
    includeSuperseded: include_superseded,
    includeArchived: include_archived,
  });

  // Filter by topic if provided
  const filtered = topic
    ? decisions.filter((d) => d.title.toLowerCase().includes(topic.toLowerCase()))
    : decisions;

  // Build decision list
  const decisionList = filtered.map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    decided_on: d.decided_on || d.created_at,
    enables: d.enables || [],
    superseded_by: undefined as EntityId | undefined, // Would need reverse lookup
  }));

  // Build decision chains (supersession chains)
  const chains: GetDecisionHistoryOutput['decision_chains'] = [];
  const processed = new Set<EntityId>();

  for (const d of filtered) {
    if (processed.has(d.id)) continue;

    // Find the chain this decision belongs to
    const history: EntityId[] = [];
    let current: Decision | null = d;

    // Walk back through supersedes
    while (current?.supersedes) {
      const prev = await deps.getEntity(current.supersedes);
      if (prev && prev.type === 'decision') {
        history.unshift(prev.id);
        processed.add(prev.id);
        current = prev as Decision;
      } else {
        break;
      }
    }

    if (history.length > 0) {
      chains.push({
        current: d.id,
        history,
      });
    }
    processed.add(d.id);
  }

  return {
    decisions: decisionList,
    decision_chains: chains,
  };
}

// =============================================================================
// Supersede Document
// =============================================================================

/**
 * Update a document based on a decision, creating a new version.
 */
export async function supersedeDocument(
  input: SupersedeDocumentInput,
  deps: DecisionDocumentDependencies
): Promise<SupersedeDocumentOutput> {
  const { document_id, decision_id, new_content, change_summary } = input;

  // Get the document
  const doc = await deps.getEntity(document_id);
  if (!doc || doc.type !== 'document') {
    throw new Error(`Document not found: ${document_id}`);
  }

  // Get the decision
  const decision = await deps.getEntity(decision_id);
  if (!decision || decision.type !== 'decision') {
    throw new Error(`Decision not found: ${decision_id}`);
  }

  const document = doc as Document;
  const currentVersion = parseInt(document.version || '1', 10);
  const newVersion = currentVersion + 1;

  // Update the document
  // Note: We store the decision reference in implementation_context since
  // Document doesn't have a supersedes_decision field
  await deps.updateDocument(document_id, {
    content: new_content,
    version: String(newVersion),
    implementation_context: `Updated per decision ${decision_id}: ${change_summary}`,
    previous_versions: [
      ...(document.previous_versions || []),
      document.id, // Reference to previous version
    ],
  });

  return {
    document_id,
    new_version: newVersion,
    decision_id,
    previous_version_ref: `${document_id}@v${currentVersion}`,
  };
}

// =============================================================================
// Get Document History
// =============================================================================

/**
 * Get version history for a document.
 */
export async function getDocumentHistory(
  input: GetDocumentHistoryInput,
  deps: DecisionDocumentDependencies
): Promise<GetDocumentHistoryOutput> {
  const { document_id } = input;

  const doc = await deps.getEntity(document_id);
  if (!doc || doc.type !== 'document') {
    throw new Error(`Document not found: ${document_id}`);
  }

  const document = doc as Document;
  const currentVersion = parseInt(document.version || '1', 10);

  // Build history from previous_versions
  const history: GetDocumentHistoryOutput['history'] = [];

  // Current version
  history.push({
    version: currentVersion,
    date: document.updated_at,
    // Note: supersedes_decision would need to be parsed from implementation_context
    // or stored separately in a real implementation
    supersedes_decision: undefined,
    change_summary: 'Current version',
  });

  // Previous versions (simplified - would need more metadata in real impl)
  if (document.previous_versions) {
    for (let i = document.previous_versions.length - 1; i >= 0; i--) {
      history.push({
        version: currentVersion - (document.previous_versions.length - i),
        date: document.created_at, // Would need actual dates
        change_summary: 'Previous version',
      });
    }
  }

  return {
    document_id,
    current_version: currentVersion,
    history,
  };
}

// =============================================================================
// Check Document Freshness
// =============================================================================

/**
 * Check if a document is up-to-date with related decisions.
 */
export async function checkDocumentFreshness(
  input: CheckDocumentFreshnessInput,
  deps: DecisionDocumentDependencies
): Promise<CheckDocumentFreshnessOutput> {
  const { document_id } = input;

  const doc = await deps.getEntity(document_id);
  if (!doc || doc.type !== 'document') {
    throw new Error(`Document not found: ${document_id}`);
  }

  const document = doc as Document;
  const staleReasons: CheckDocumentFreshnessOutput['stale_reasons'] = [];
  const suggestedUpdates: string[] = [];

  // Check for newer decisions that might affect this document
  const relatedDecisions = await deps.getDecisionsAffectingDocument(document_id);
  for (const decision of relatedDecisions) {
    if (decision.decided_on && decision.decided_on > document.updated_at) {
      staleReasons.push({
        type: 'newer_decision',
        detail: `Decision "${decision.title}" was made after last document update`,
        entity_id: decision.id,
      });
      suggestedUpdates.push(`Review and incorporate decision: ${decision.title}`);
    }
  }

  // Check for TODO items in content
  const hasTodos = await deps.searchContent(document_id, 'TODO|FIXME|XXX');
  if (hasTodos) {
    staleReasons.push({
      type: 'todo_items',
      detail: 'Document contains TODO/FIXME items',
    });
    suggestedUpdates.push('Address TODO items in document');
  }

  return {
    document_id,
    is_fresh: staleReasons.length === 0,
    stale_reasons: staleReasons,
    suggested_updates: suggestedUpdates,
  };
}
