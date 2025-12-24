/**
 * Implementation Handoff Tools
 *
 * Category 6: Implementation Handoff
 * - get_ready_for_implementation: Find stories/specs ready to implement
 * - generate_implementation_package: Create implementation context
 * - validate_spec_completeness: Check if spec is ready for implementation
 *
 * @deprecated All tools in this module are deprecated due to low usage and will be removed.
 * These tools are considered "Plugin territory" and should be implemented in the Obsidian plugin instead.
 */

import type {
  Entity,
  EntityId,
  Story,
  Document,
  Decision,
} from '../models/v2-types.js';

import type {
  GetReadyForImplementationInput,
  GetReadyForImplementationOutput,
  GenerateImplementationPackageInput,
  GenerateImplementationPackageOutput,
  ValidateSpecCompletenessInput,
  ValidateSpecCompletenessOutput,
  Workstream,
  Priority,
} from './tool-types.js';

// =============================================================================
// Dependencies Interface
// =============================================================================

/**
 * Dependencies for implementation handoff tools.
 */
export interface ImplementationHandoffDependencies {
  /** Get all stories */
  getAllStories: (options?: {
    workstream?: Workstream;
    priorities?: Priority[];
  }) => Promise<Story[]>;

  /** Get all documents */
  getAllDocuments: (options?: {
    workstream?: Workstream;
  }) => Promise<Document[]>;

  /** Get entity by ID */
  getEntity: (id: EntityId) => Promise<Entity | null>;

  /** Get entity path */
  getEntityPath: (id: EntityId) => Promise<string>;

  /** Get decisions related to an entity */
  getRelatedDecisions: (entityId: EntityId) => Promise<Decision[]>;

  /** Get entities that block this entity */
  getBlockingEntities: (entityId: EntityId) => Promise<Entity[]>;

  /** Get entities that this entity depends on */
  getDependencies: (entityId: EntityId) => Promise<Entity[]>;

  /** Check if entity has open TODOs */
  hasOpenTodos: (entityId: EntityId) => Promise<boolean>;

  /** Get acceptance criteria for an entity */
  getAcceptanceCriteria: (entityId: EntityId) => Promise<string[]>;

  /** Get implementation context for an entity */
  getImplementationContext: (entityId: EntityId) => Promise<string | undefined>;

  /** Get related documents for an entity */
  getRelatedDocuments: (entityId: EntityId) => Promise<Document[]>;

  /** Search content for pattern */
  searchContent: (entityId: EntityId, pattern: string) => Promise<boolean>;
}

// =============================================================================
// Get Ready For Implementation
// =============================================================================

/**
 * Find stories and specs that are ready for implementation.
 * @deprecated This tool is deprecated due to low usage and will be removed.
 */
export async function getReadyForImplementation(
  input: GetReadyForImplementationInput,
  deps: ImplementationHandoffDependencies
): Promise<GetReadyForImplementationOutput> {
  const { workstream, priority } = input;

  // Get all stories and documents (specs)
  const stories = await deps.getAllStories({ workstream, priorities: priority });
  const documents = await deps.getAllDocuments({ workstream });

  // Filter to specs only
  const specs = documents.filter((d) => d.doc_type === 'spec');

  const ready: GetReadyForImplementationOutput['ready'] = [];
  const almostReady: GetReadyForImplementationOutput['almost_ready'] = [];
  let notReadyCount = 0;

  // Evaluate each story
  for (const story of stories) {
    const evaluation = await evaluateReadiness(story, deps);

    if (evaluation.score >= 0.9) {
      ready.push({
        id: story.id,
        title: story.title,
        type: 'story',
        readiness_score: evaluation.score,
        checklist: evaluation.checklist,
        implementation_estimate: story.effort || 'Unknown',
        suggested_start: 'Ready now',
      });
    } else if (evaluation.score >= 0.6) {
      almostReady.push({
        id: story.id,
        title: story.title,
        readiness_score: evaluation.score,
        blockers: evaluation.blockers,
        what_to_resolve: evaluation.blockers.map((b) => b.detail).join('; '),
      });
    } else {
      notReadyCount++;
    }
  }

  // Evaluate each spec
  for (const spec of specs) {
    const evaluation = await evaluateReadiness(spec, deps);

    if (evaluation.score >= 0.9) {
      ready.push({
        id: spec.id,
        title: spec.title,
        type: 'document',
        readiness_score: evaluation.score,
        checklist: evaluation.checklist,
        implementation_estimate: 'See spec',
        suggested_start: 'Ready now',
      });
    } else if (evaluation.score >= 0.6) {
      almostReady.push({
        id: spec.id,
        title: spec.title,
        readiness_score: evaluation.score,
        blockers: evaluation.blockers,
        what_to_resolve: evaluation.blockers.map((b) => b.detail).join('; '),
      });
    } else {
      notReadyCount++;
    }
  }

  // Sort by readiness score
  ready.sort((a, b) => b.readiness_score - a.readiness_score);
  almostReady.sort((a, b) => b.readiness_score - a.readiness_score);

  return {
    ready,
    almost_ready: almostReady,
    not_ready_count: notReadyCount,
  };
}

// =============================================================================
// Helper: Evaluate Readiness
// =============================================================================

interface ReadinessEvaluation {
  score: number;
  checklist: GetReadyForImplementationOutput['ready'][0]['checklist'];
  blockers: GetReadyForImplementationOutput['almost_ready'][0]['blockers'];
}

async function evaluateReadiness(
  entity: Story | Document,
  deps: ImplementationHandoffDependencies
): Promise<ReadinessEvaluation> {
  const blockers: ReadinessEvaluation['blockers'] = [];

  // Check decisions
  const decisions = await deps.getRelatedDecisions(entity.id);
  const pendingDecisions = decisions.filter((d) => d.status === 'Pending');
  const allDecisionsMade = pendingDecisions.length === 0;
  if (!allDecisionsMade) {
    for (const d of pendingDecisions) {
      blockers.push({
        type: 'pending_decision',
        id: d.id,
        detail: `Pending decision: ${d.title}`,
      });
    }
  }

  // Check blocking dependencies
  const blockingEntities = await deps.getBlockingEntities(entity.id);
  const noBlockingDependencies = blockingEntities.length === 0;
  if (!noBlockingDependencies) {
    for (const b of blockingEntities) {
      blockers.push({
        type: 'blocking_dependency',
        id: b.id,
        detail: `Blocked by: ${b.title}`,
      });
    }
  }

  // Check acceptance criteria
  const acceptanceCriteria = await deps.getAcceptanceCriteria(entity.id);
  const acceptanceCriteriaDefined = acceptanceCriteria.length > 0;
  if (!acceptanceCriteriaDefined) {
    blockers.push({
      type: 'missing_acceptance_criteria',
      detail: 'No acceptance criteria defined',
    });
  }

  // Check TODOs
  const hasOpenTodos = await deps.hasOpenTodos(entity.id);
  const noOpenTodos = !hasOpenTodos;
  if (!noOpenTodos) {
    blockers.push({
      type: 'open_todos',
      detail: 'Has unresolved TODO items',
    });
  }

  // Check status
  const statusApproved =
    entity.type === 'story'
      ? entity.status === 'In Progress' || entity.status === 'Not Started'
      : entity.status === 'Approved';
  if (!statusApproved) {
    blockers.push({
      type: 'status_not_approved',
      detail: `Status is ${entity.status}, not approved for implementation`,
    });
  }

  const checklist = {
    all_decisions_made: allDecisionsMade,
    no_blocking_dependencies: noBlockingDependencies,
    acceptance_criteria_defined: acceptanceCriteriaDefined,
    no_open_todos: noOpenTodos,
    status_approved: statusApproved,
  };

  // Calculate score
  const checkCount = Object.values(checklist).length;
  const passedCount = Object.values(checklist).filter(Boolean).length;
  const score = passedCount / checkCount;

  return { score, checklist, blockers };
}

// =============================================================================
// Generate Implementation Package
// =============================================================================

/**
 * Generate a complete implementation package for a spec.
 * @deprecated This tool is deprecated due to low usage and will be removed.
 */
export async function generateImplementationPackage(
  input: GenerateImplementationPackageInput,
  deps: ImplementationHandoffDependencies
): Promise<GenerateImplementationPackageOutput> {
  const { spec_id } = input;

  const entity = await deps.getEntity(spec_id);
  if (!entity) {
    throw new Error(`Entity not found: ${spec_id}`);
  }

  // Get primary spec content
  const primarySpec = {
    id: entity.id,
    title: entity.title,
    content: 'content' in entity ? (entity.content as string) || '' : '',
  };

  // Get related documents
  const relatedDocs = await deps.getRelatedDocuments(spec_id);
  const requiredContext: GenerateImplementationPackageOutput['required_context'] = [];
  const referenceLinks: GenerateImplementationPackageOutput['reference_links'] = [];

  for (const doc of relatedDocs) {
    const path = await deps.getEntityPath(doc.id);

    if (doc.doc_type === 'spec' || doc.doc_type === 'adr') {
      requiredContext.push({
        id: doc.id,
        title: doc.title,
        content: doc.content || '',
        relevance: `Related ${doc.doc_type}`,
      });
    } else {
      referenceLinks.push({
        id: doc.id,
        title: doc.title,
        summary: doc.content?.substring(0, 200) || '',
        path,
      });
    }
  }

  // Get related decisions
  const relatedDecisions = await deps.getRelatedDecisions(spec_id);
  const decisions: GenerateImplementationPackageOutput['decisions'] = relatedDecisions.map((d) => ({
    id: d.id,
    title: d.title,
    decision: d.decision || '',
    rationale: d.rationale || '',
  }));

  // Get acceptance criteria
  const acceptanceCriteria = await deps.getAcceptanceCriteria(spec_id);

  // Get implementation context for constraints
  const implContext = await deps.getImplementationContext(spec_id);
  const constraints: string[] = [];
  if (implContext) {
    constraints.push(implContext);
  }

  // Check for open items
  const openItems: GenerateImplementationPackageOutput['open_items'] = [];
  const pendingDecisions = relatedDecisions.filter((d) => d.status === 'Pending');
  for (const d of pendingDecisions) {
    openItems.push({
      type: 'pending_decision',
      detail: `Decision pending: ${d.title}`,
    });
  }

  // Check for assumptions/risks in content
  const hasAssumptions = await deps.searchContent(spec_id, 'ASSUMPTION|ASSUME');
  if (hasAssumptions) {
    openItems.push({
      type: 'assumption',
      detail: 'Document contains assumptions that should be verified',
    });
  }

  const hasRisks = await deps.searchContent(spec_id, 'RISK|WARNING');
  if (hasRisks) {
    openItems.push({
      type: 'risk',
      detail: 'Document contains identified risks',
    });
  }

  // Extract related systems from content (simplified)
  const relatedSystems: string[] = [];

  return {
    primary_spec: primarySpec,
    required_context: requiredContext,
    reference_links: referenceLinks,
    related_systems: relatedSystems,
    decisions,
    acceptance_criteria: acceptanceCriteria,
    constraints,
    open_items: openItems,
  };
}

// =============================================================================
// Validate Spec Completeness
// =============================================================================

/**
 * Validate that a spec is complete and ready for implementation.
 * @deprecated This tool is deprecated due to low usage and will be removed.
 */
export async function validateSpecCompleteness(
  input: ValidateSpecCompletenessInput,
  deps: ImplementationHandoffDependencies
): Promise<ValidateSpecCompletenessOutput> {
  const { spec_id } = input;

  const entity = await deps.getEntity(spec_id);
  if (!entity) {
    throw new Error(`Entity not found: ${spec_id}`);
  }

  const issues: ValidateSpecCompletenessOutput['issues'] = [];

  // Check acceptance criteria
  const acceptanceCriteria = await deps.getAcceptanceCriteria(spec_id);
  const hasAcceptanceCriteria = acceptanceCriteria.length > 0;
  if (!hasAcceptanceCriteria) {
    issues.push({
      severity: 'error',
      check: 'has_acceptance_criteria',
      detail: 'No acceptance criteria defined',
      suggestion: 'Add acceptance criteria to define what "done" looks like',
    });
  }

  // Check TODOs
  const hasOpenTodos = await deps.hasOpenTodos(spec_id);
  const allTodosResolved = !hasOpenTodos;
  if (!allTodosResolved) {
    issues.push({
      severity: 'warning',
      check: 'all_todos_resolved',
      detail: 'Document contains unresolved TODO items',
      suggestion: 'Resolve all TODO items before implementation',
    });
  }

  // Check dependencies
  const blockingEntities = await deps.getBlockingEntities(spec_id);
  const dependenciesMet = blockingEntities.length === 0;
  if (!dependenciesMet) {
    issues.push({
      severity: 'error',
      check: 'dependencies_met',
      detail: `Blocked by ${blockingEntities.length} entities`,
      suggestion: 'Resolve blocking dependencies first',
    });
  }

  // Check decisions
  const decisions = await deps.getRelatedDecisions(spec_id);
  const pendingDecisions = decisions.filter((d) => d.status === 'Pending');
  const decisionsMade = pendingDecisions.length === 0;
  if (!decisionsMade) {
    issues.push({
      severity: 'error',
      check: 'decisions_made',
      detail: `${pendingDecisions.length} pending decisions`,
      suggestion: 'Make all pending decisions before implementation',
    });
  }

  // Check status
  const statusApproved =
    entity.type === 'document'
      ? (entity as Document).status === 'Approved'
      : entity.type === 'story'
        ? (entity as Story).status !== 'Blocked'
        : true;
  if (!statusApproved) {
    issues.push({
      severity: 'warning',
      check: 'status_approved',
      detail: `Status is ${entity.status}`,
      suggestion: 'Update status to indicate readiness',
    });
  }

  // Check implementation context
  const implContext = await deps.getImplementationContext(spec_id);
  const implementationContextDefined = !!implContext;
  if (!implementationContextDefined) {
    issues.push({
      severity: 'warning',
      check: 'implementation_context_defined',
      detail: 'No implementation context defined',
      suggestion: 'Add implementation notes and constraints',
    });
  }

  const checks = {
    has_acceptance_criteria: hasAcceptanceCriteria,
    all_todos_resolved: allTodosResolved,
    dependencies_met: dependenciesMet,
    decisions_made: decisionsMade,
    status_approved: statusApproved,
    implementation_context_defined: implementationContextDefined,
  };

  // Calculate score
  const checkCount = Object.values(checks).length;
  const passedCount = Object.values(checks).filter(Boolean).length;
  const score = passedCount / checkCount;

  const isComplete = issues.filter((i) => i.severity === 'error').length === 0;

  return {
    spec_id,
    is_complete: isComplete,
    score,
    checks,
    issues,
  };
}
