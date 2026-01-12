/**
 * V2 Entity Serializer
 *
 * Serializes Entity objects to markdown files with YAML frontmatter.
 */

import {
  Entity,
  EntityType,
  Milestone,
  Story,
  Task,
  Decision,
  Document,
  InlineTask,
} from '../../models/v2-types.js';

// =============================================================================
// Serializer Types
// =============================================================================

export interface SerializeOptions {
  /** Include content/body section */
  includeContent?: boolean;
  /** Pretty print YAML (default: true) */
  prettyPrint?: boolean;
  /** Fields to exclude from frontmatter */
  excludeFields?: string[];
}

// =============================================================================
// Entity Serializer Class
// =============================================================================

/**
 * Serializes Entity objects to markdown with YAML frontmatter.
 */
export class EntitySerializer {
  // ---------------------------------------------------------------------------
  // Main Serialize Method
  // ---------------------------------------------------------------------------

  /** Serialize an Entity to markdown string */
  serialize(entity: Entity, options: SerializeOptions = {}): string {
    const { includeContent = true, excludeFields = [] } = options;

    // Get frontmatter data based on entity type
    const frontmatter = this.entityToFrontmatter(entity, excludeFields);

    // Build YAML frontmatter
    const yaml = this.toYaml(frontmatter);

    // Get content/body
    const content = includeContent ? this.getEntityContent(entity) : '';

    // Combine frontmatter and content
    return `---\n${yaml}---\n${content ? `\n${content}` : ''}`;
  }

  // ---------------------------------------------------------------------------
  // Entity to Frontmatter Conversion
  // ---------------------------------------------------------------------------

  /** Convert entity to frontmatter object */
  private entityToFrontmatter(entity: Entity, excludeFields: string[]): Record<string, any> {
    const base = this.getBaseFrontmatter(entity);

    let specific: Record<string, any>;
    switch (entity.type) {
      case 'milestone':
        specific = this.getMilestoneFrontmatter(entity);
        break;
      case 'story':
        specific = this.getStoryFrontmatter(entity);
        break;
      case 'task':
        specific = this.getTaskFrontmatter(entity);
        break;
      case 'decision':
        specific = this.getDecisionFrontmatter(entity);
        break;
      case 'document':
        specific = this.getDocumentFrontmatter(entity);
        break;
    }

    const combined = { ...base, ...specific };

    // Remove excluded fields
    for (const field of excludeFields) {
      delete combined[field];
    }

    // Remove undefined/null values
    return this.cleanObject(combined);
  }

  /** Get base frontmatter fields common to all entities */
  private getBaseFrontmatter(entity: Entity): Record<string, any> {
    return {
      id: entity.id,
      type: entity.type,
      title: entity.title,
      workstream: entity.workstream,
      status: entity.status,
      archived: entity.archived || undefined,
      canvas_source: entity.canvas_source || undefined,
      cssclasses: entity.cssclasses?.length ? entity.cssclasses : undefined,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }

  /** Get milestone-specific frontmatter */
  private getMilestoneFrontmatter(entity: Milestone): Record<string, any> {
    return {
      target_date: entity.target_date,
      owner: entity.owner,
      priority: entity.priority,
      // Hierarchy
      children: entity.children?.length ? entity.children : undefined,
      // Dependencies
      depends_on: entity.depends_on?.length ? entity.depends_on : undefined,
      blocks: entity.blocks?.length ? entity.blocks : undefined,
      // Implementation
      implements: entity.implements?.length ? entity.implements : undefined,
      success_criteria: entity.success_criteria?.length ? entity.success_criteria : undefined,
    };
  }

  /** Get story-specific frontmatter */
  private getStoryFrontmatter(entity: Story): Record<string, any> {
    return {
      effort: entity.effort,
      priority: entity.priority,
      // Hierarchy
      parent: entity.parent,
      children: entity.children?.length ? entity.children : undefined,
      // Dependencies
      depends_on: entity.depends_on?.length ? entity.depends_on : undefined,
      blocks: entity.blocks?.length ? entity.blocks : undefined,
      // Implementation
      implements: entity.implements?.length ? entity.implements : undefined,
      acceptance_criteria: entity.acceptance_criteria?.length ? entity.acceptance_criteria : undefined,
      tasks: entity.tasks?.length ? this.serializeInlineTasks(entity.tasks) : undefined,
    };
  }

  /** Get task-specific frontmatter */
  private getTaskFrontmatter(entity: Task): Record<string, any> {
    return {
      // Hierarchy
      parent: entity.parent,
      // Dependencies
      depends_on: entity.depends_on?.length ? entity.depends_on : undefined,
      blocks: entity.blocks?.length ? entity.blocks : undefined,
      // Task-specific
      goal: entity.goal,
      estimate_hrs: entity.estimate_hrs,
      actual_hrs: entity.actual_hrs,
      assignee: entity.assignee,
    };
  }

  /** Get decision-specific frontmatter */
  private getDecisionFrontmatter(entity: Decision): Record<string, any> {
    return {
      decided_by: entity.decided_by,
      decided_on: entity.decided_on,
      // Dependencies
      depends_on: entity.depends_on?.length ? entity.depends_on : undefined,
      blocks: entity.blocks?.length ? entity.blocks : undefined,
      // Supersession
      supersedes: entity.supersedes,
      superseded_by: entity.superseded_by,
      alternatives: entity.alternatives?.length ? entity.alternatives : undefined,
    };
  }

  /** Get document-specific frontmatter */
  private getDocumentFrontmatter(entity: Document): Record<string, any> {
    return {
      doc_type: entity.doc_type,
      version: entity.version,
      owner: entity.owner,
      // Dependencies
      depends_on: entity.depends_on?.length ? entity.depends_on : undefined,
      blocks: entity.blocks?.length ? entity.blocks : undefined,
      // Implementation
      implemented_by: entity.implemented_by?.length ? entity.implemented_by : undefined,
      // Versioning
      previous_version: entity.previous_version,
      next_version: entity.next_version,
    };
  }

  // ---------------------------------------------------------------------------
  // Content Extraction
  // ---------------------------------------------------------------------------

  /** Get content/body from entity */
  private getEntityContent(entity: Entity): string {
    switch (entity.type) {
      case 'milestone':
        return this.buildMilestoneContent(entity);
      case 'story':
        return this.buildStoryContent(entity);
      case 'task':
        return this.buildTaskContent(entity);
      case 'decision':
        return this.buildDecisionContent(entity);
      case 'document':
        return this.buildDocumentContent(entity);
    }
  }

  /** Build milestone content with objective and related queries */
  private buildMilestoneContent(entity: Milestone): string {
    const sections: string[] = [];

    if (entity.objective) {
      sections.push(entity.objective);
    }

    // Add Dataview queries for related items
    sections.push(this.buildRelatedSection(entity.id, 'milestone'));

    return sections.join('\n\n');
  }

  /** Build story content with outcome and notes */
  private buildStoryContent(entity: Story): string {
    const sections: string[] = [];

    if (entity.outcome) {
      sections.push(`## Outcome\n\n${entity.outcome}`);
    }

    if (entity.notes) {
      sections.push(`## Notes\n\n${entity.notes}`);
    }

    // Add Dataview queries for related items
    sections.push(this.buildRelatedSection(entity.id, 'story'));

    return sections.join('\n\n');
  }

  /** Build task content with description and notes */
  private buildTaskContent(entity: Task): string {
    const sections: string[] = [];

    if (entity.description) {
      sections.push(`## Description\n\n${entity.description}`);
    }

    if (entity.technical_notes) {
      sections.push(`## Technical Notes\n\n${entity.technical_notes}`);
    }

    if (entity.notes) {
      sections.push(`## Notes\n\n${entity.notes}`);
    }

    // Add Dataview queries for related items
    sections.push(this.buildRelatedSection(entity.id, 'task'));

    return sections.join('\n\n');
  }

  /** Build decision content with context, decision, and rationale */
  private buildDecisionContent(entity: Decision): string {
    const sections: string[] = [];

    if (entity.context) {
      sections.push(`## Context\n\n${entity.context}`);
    }

    if (entity.decision) {
      sections.push(`## Decision\n\n${entity.decision}`);
    }

    if (entity.rationale) {
      sections.push(`## Rationale\n\n${entity.rationale}`);
    }

    // Add Dataview query for entities this decision enables
    sections.push(this.buildDecisionRelatedSection(entity.id));

    return sections.join('\n\n');
  }

  /** Build document content */
  private buildDocumentContent(entity: Document): string {
    const sections: string[] = [];

    if (entity.content) {
      sections.push(entity.content);
    }

    // Add Dataview query for entities implementing this document
    sections.push(this.buildDocumentRelatedSection(entity.id));

    return sections.join('\n\n');
  }

  /** Build related section with Dataview queries for milestone/story/task */
  private buildRelatedSection(entityId: string, entityType: 'milestone' | 'story' | 'task'): string {
    const sections: string[] = [];

    // Documents this entity implements (milestone, story only)
    if (entityType === 'milestone' || entityType === 'story') {
      sections.push(`## 📄 Documents

\`\`\`dataview
TABLE title as "Document", document_type as "Type", version as "Version"
FROM "documents"
WHERE contains(this.implements, id)
SORT title ASC
\`\`\``);
    }

    // Decisions that enable this entity
    sections.push(`## 🎯 Decisions

\`\`\`dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "${entityId}")
SORT decided_at DESC
\`\`\``);

    // For tasks: also show decisions this task depends on
    if (entityType === 'task') {
      sections.push(`### Blocking Decisions

\`\`\`dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
\`\`\``);
    }

    return sections.join('\n\n');
  }

  /** Build related section for decisions */
  private buildDecisionRelatedSection(decisionId: string): string {
    return `## 🔗 Enabled Entities

\`\`\`dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "${decisionId}") OR contains(file.frontmatter.enabled_by, "${decisionId}")
SORT type ASC, title ASC
\`\`\`

## 📄 Affected Documents

\`\`\`dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
\`\`\``;
  }

  /** Build related section for documents */
  private buildDocumentRelatedSection(documentId: string): string {
    return `## 🔗 Implemented By

\`\`\`dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "${documentId}")
SORT type ASC, title ASC
\`\`\`

## 🎯 Related Decisions

\`\`\`dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "${documentId}")
SORT decided_at DESC
\`\`\``;
  }

  // ---------------------------------------------------------------------------
  // YAML Serialization
  // ---------------------------------------------------------------------------

  /** Convert object to YAML string */
  private toYaml(obj: Record<string, any>): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;

      const yamlValue = this.valueToYaml(value, 0);
      lines.push(`${key}: ${yamlValue}`);
    }

    return lines.join('\n') + '\n';
  }

  /** Convert a value to YAML representation */
  private valueToYaml(value: any, indent: number): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      // Check if string needs quoting
      if (this.needsQuoting(value)) {
        return `"${this.escapeString(value)}"`;
      }
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';

      // Check if array contains objects
      if (typeof value[0] === 'object' && value[0] !== null) {
        return this.arrayOfObjectsToYaml(value, indent);
      }

      // Simple array - inline format
      const items = value.map(v => this.valueToYaml(v, indent));
      return `[${items.join(', ')}]`;
    }

    if (typeof value === 'object') {
      return this.objectToYaml(value, indent + 2);
    }

    return String(value);
  }

  /** Convert array of objects to YAML */
  private arrayOfObjectsToYaml(arr: any[], indent: number): string {
    const lines: string[] = [''];
    const pad = ' '.repeat(indent + 2);

    for (const item of arr) {
      const entries = Object.entries(item);
      if (entries.length === 0) continue;

      const [firstKey, firstValue] = entries[0];
      lines.push(`${pad}- ${firstKey}: ${this.valueToYaml(firstValue, indent + 4)}`);

      for (let i = 1; i < entries.length; i++) {
        const [key, val] = entries[i];
        lines.push(`${pad}  ${key}: ${this.valueToYaml(val, indent + 4)}`);
      }
    }

    return lines.join('\n');
  }

  /** Convert object to YAML */
  private objectToYaml(obj: Record<string, any>, indent: number): string {
    const lines: string[] = [''];
    const pad = ' '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      lines.push(`${pad}${key}: ${this.valueToYaml(value, indent)}`);
    }

    return lines.join('\n');
  }

  /** Check if string needs quoting */
  private needsQuoting(str: string): boolean {
    // Quote if contains special characters or looks like other types
    if (/^[\d.]+$/.test(str)) return true; // Looks like number
    if (/^(true|false|null|yes|no|on|off)$/i.test(str)) return true;
    if (/[:#\[\]{}|>&*!?,]/.test(str)) return true;
    if (str.includes('\n')) return true;
    if (str.startsWith(' ') || str.endsWith(' ')) return true;
    return false;
  }

  /** Escape string for YAML */
  private escapeString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  /** Serialize inline tasks for frontmatter */
  private serializeInlineTasks(tasks: InlineTask[]): any[] {
    return tasks.map(task => ({
      number: task.number,
      name: task.name,
      goal: task.goal,
      status: task.status,
      estimate_hrs: task.estimate_hrs,
      description: task.description,
    }));
  }

  /** Remove undefined/null values from object */
  private cleanObject(obj: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }
}

// =============================================================================
// CSS Classes Generator
// =============================================================================

/**
 * Generate CSS classes for visual differentiation on canvas.
 *
 * CSS classes control:
 * - Border thickness: entity type (milestone=4px, story=2px, task=1px)
 * - Border color: workstream/effort type
 * - Visual state: status indicators
 */
export function generateCssClasses(entity: Entity): string[] {
  const classes: string[] = [];

  // Type class - controls border thickness and node size
  classes.push(`canvas-${entity.type}`);

  // Effort/workstream class - controls border color
  const effort = getEffortFromEntity(entity);
  if (effort) {
    classes.push(`canvas-effort-${normalizeForCss(effort)}`);
  }

  // Status class - controls visual state (opacity, badges, etc.)
  if (entity.status) {
    classes.push(`canvas-status-${normalizeForCss(entity.status)}`);
  }

  // Priority class (optional, for milestones and stories)
  const priority = getPriorityFromEntity(entity);
  if (priority) {
    classes.push(`canvas-priority-${normalizeForCss(priority)}`);
  }

  return classes;
}

/**
 * Get effort/workstream from entity for CSS class generation.
 */
function getEffortFromEntity(entity: Entity): string | null {
  switch (entity.type) {
    case 'story':
      return (entity as Story).effort || entity.workstream;
    case 'task':
    case 'milestone':
    case 'decision':
    case 'document':
      return entity.workstream;
  }
}

/**
 * Get priority from entity if applicable.
 */
function getPriorityFromEntity(entity: Entity): string | null {
  switch (entity.type) {
    case 'milestone':
      return (entity as Milestone).priority;
    case 'story':
      return (entity as Story).priority;
    default:
      return null;
  }
}

/**
 * Normalize a string for use in CSS class names.
 * Converts to lowercase and replaces spaces with hyphens.
 */
function normalizeForCss(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
