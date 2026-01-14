/**
 * V2 Entity Parser
 *
 * Parses markdown files into Entity objects.
 */

import {
  Entity,
  EntityId,
  EntityType,
  Milestone,
  Story,
  Task,
  Decision,
  Document,
  Feature,
  MilestoneStatus,
  StoryStatus,
  TaskStatus,
  DecisionStatus,
  DocumentStatus,
  FeatureStatus,
  FeatureTier,
  FeaturePhase,
  Priority,
  Effort,
  VaultPath,
  CanvasPath,
  ValidationError,
  getEntityTypeFromId,
} from '../../models/v2-types.js';

// =============================================================================
// Parser Types
// =============================================================================

export interface ParseResult<T extends Entity = Entity> {
  entity: T;
  frontmatter: Record<string, any>;
  content: string;
  errors: string[];
}

export interface FrontmatterData {
  [key: string]: any;
}

// =============================================================================
// Entity Parser Class
// =============================================================================

/**
 * Parses markdown files with YAML frontmatter into Entity objects.
 */
export class EntityParser {
  // ---------------------------------------------------------------------------
  // Main Parse Method
  // ---------------------------------------------------------------------------

  /** Parse markdown content into an Entity */
  parse(content: string, filePath: VaultPath): ParseResult {
    const errors: string[] = [];

    // Extract frontmatter and body
    const { frontmatter, body } = this.extractFrontmatter(content);

    // Get entity ID from frontmatter or filename
    const id = this.extractId(frontmatter, filePath);
    if (!id) {
      throw new ValidationError('Entity ID not found in frontmatter or filename');
    }

    // Determine entity type
    const type = getEntityTypeFromId(id);
    if (!type) {
      throw new ValidationError(`Invalid entity ID format: ${id}`);
    }

    // Parse based on type
    let entity: Entity;
    switch (type) {
      case 'milestone':
        entity = this.parseMilestone(id, frontmatter, body, filePath, errors);
        break;
      case 'story':
        entity = this.parseStory(id, frontmatter, body, filePath, errors);
        break;
      case 'task':
        entity = this.parseTask(id, frontmatter, body, filePath, errors);
        break;
      case 'decision':
        entity = this.parseDecision(id, frontmatter, body, filePath, errors);
        break;
      case 'document':
        entity = this.parseDocument(id, frontmatter, body, filePath, errors);
        break;
      case 'feature':
        entity = this.parseFeature(id, frontmatter, body, filePath, errors);
        break;
      default:
        throw new ValidationError(`Unknown entity type: ${type}`);
    }

    return { entity, frontmatter, content: body, errors };
  }

  // ---------------------------------------------------------------------------
  // Frontmatter Extraction
  // ---------------------------------------------------------------------------

  /** Extract YAML frontmatter from markdown content */
  private extractFrontmatter(content: string): { frontmatter: FrontmatterData; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const yamlContent = match[1];
    const body = match[2] || '';

    // Simple YAML parser (handles basic key: value pairs)
    const frontmatter: FrontmatterData = {};
    const lines = yamlContent.split('\n');
    let currentKey = '';
    let currentArray: string[] | null = null;

    for (const line of lines) {
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) continue;

      // Check for array item
      if (line.match(/^\s+-\s+/)) {
        const value = line.replace(/^\s+-\s+/, '').trim();
        if (currentArray) {
          currentArray.push(this.parseValue(value));
        }
        continue;
      }

      // Check for key: value
      const kvMatch = line.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        // Save previous array if any
        if (currentArray && currentKey) {
          frontmatter[currentKey] = currentArray;
          currentArray = null;
        }

        currentKey = kvMatch[1];
        const value = kvMatch[2].trim();

        if (value === '' || value === '[]') {
          // Start of array or empty array
          currentArray = [];
        } else {
          frontmatter[currentKey] = this.parseValue(value);
        }
      }
    }

    // Save final array if any
    if (currentArray && currentKey) {
      frontmatter[currentKey] = currentArray;
    }

    return { frontmatter, body };
  }

  /** Parse a YAML value */
  private parseValue(value: string): any {
    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Check if it's a string-wrapped array like "[M-001, M-002]"
    // This handles corrupted YAML where arrays were serialized as strings
    if (value.startsWith('[') && value.endsWith(']')) {
      return this.parseInlineArray(value);
    }

    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Null
    if (value === 'null' || value === '~') return null;

    // Number
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }

    return value;
  }

  /** Parse an inline YAML array like [M-001, M-002] */
  private parseInlineArray(value: string): string[] {
    // Remove brackets
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];

    // Split by comma and clean up each element
    const elements = inner.split(',').map(el => {
      let cleaned = el.trim();
      // Remove quotes if present
      if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
          (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
        cleaned = cleaned.slice(1, -1);
      }
      return cleaned;
    }).filter(el => el.length > 0);

    // Validate and extract entity IDs
    // This handles corrupted arrays by extracting only valid entity IDs
    return this.extractValidEntityIds(elements);
  }

  /** Extract valid entity IDs from an array of strings */
  private extractValidEntityIds(elements: string[]): string[] {
    const validIds: string[] = [];
    // Pattern includes all entity types: M (milestone), S (story), T (task), DEC (decision), DOC (document), F (feature)
    const idPattern = /^(M-\d{3}|S-\d{3}|T-\d{3}|DEC-\d{3}|DOC-\d{3}|F-\d{3})$/;

    for (const el of elements) {
      if (idPattern.test(el)) {
        validIds.push(el);
      } else {
        // Try to extract valid IDs from corrupted elements
        // This handles cases like character-by-character corruption
        const matches = el.match(/(M-\d{3}|S-\d{3}|T-\d{3}|DEC-\d{3}|DOC-\d{3}|F-\d{3})/g);
        if (matches) {
          validIds.push(...matches);
        }
      }
    }

    // Remove duplicates while preserving order
    return [...new Set(validIds)];
  }

  // ---------------------------------------------------------------------------
  // ID Extraction
  // ---------------------------------------------------------------------------

  /** Extract entity ID from frontmatter (ID is required in frontmatter) */
  private extractId(frontmatter: FrontmatterData, _filePath: VaultPath): EntityId | null {
    // ID must be in frontmatter - filenames no longer contain IDs
    if (frontmatter.id) {
      return frontmatter.id as EntityId;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Entity Type Parsers
  // ---------------------------------------------------------------------------

  private parseMilestone(
    id: EntityId,
    fm: FrontmatterData,
    body: string,
    filePath: VaultPath,
    errors: string[]
  ): Milestone {
    // Extract objective from body if not in frontmatter
    // The serializer writes objective directly to body (not as a section header)
    // So we use the body content if no frontmatter objective exists
    const objective = fm.objective || this.extractBodyContent(body);

    return {
      id: id as any, // Cast to specific ID type
      type: 'milestone',
      title: fm.title || this.extractTitleFromBody(body) || 'Untitled',
      workstream: fm.workstream || 'default',
      status: this.validateStatus<MilestoneStatus>(fm.status, ['Not Started', 'In Progress', 'Completed', 'Blocked'] as MilestoneStatus[], 'Not Started' as MilestoneStatus),
      priority: this.validatePriority(fm.priority),
      objective,
      target_date: fm.target_date,
      owner: fm.owner,
      depends_on: fm.depends_on || [],
      implements: fm.implements,
      success_criteria: fm.success_criteria,
      archived: fm.archived || false,
      canvas_source: fm.canvas_source || '',
      vault_path: filePath,
      cssclasses: fm.cssclasses || [],
      created_at: fm.created_at || new Date().toISOString(),
      updated_at: fm.updated_at || new Date().toISOString(),
    };
  }

  private parseStory(
    id: EntityId,
    fm: FrontmatterData,
    body: string,
    filePath: VaultPath,
    errors: string[]
  ): Story {
    // Extract outcome and notes from body sections if not in frontmatter
    const outcome = fm.outcome || this.extractSection(body, 'Outcome');
    const notes = fm.notes || this.extractSection(body, 'Notes');

    return {
      id: id as any, // Cast to specific ID type
      type: 'story',
      title: fm.title || this.extractTitleFromBody(body) || 'Untitled',
      workstream: fm.workstream || 'default',
      status: this.validateStatus<StoryStatus>(fm.status, ['Not Started', 'In Progress', 'Completed', 'Blocked'] as StoryStatus[], 'Not Started' as StoryStatus),
      priority: this.validatePriority(fm.priority),
      effort: this.validateEffort(fm.effort),
      parent: fm.parent,
      outcome,
      tasks: fm.tasks,
      depends_on: fm.depends_on || [],
      implements: fm.implements,
      acceptance_criteria: fm.acceptance_criteria,
      notes,
      archived: fm.archived || false,
      canvas_source: fm.canvas_source || '',
      vault_path: filePath,
      cssclasses: fm.cssclasses || [],
      created_at: fm.created_at || new Date().toISOString(),
      updated_at: fm.updated_at || new Date().toISOString(),
    };
  }

  private parseTask(
    id: EntityId,
    fm: FrontmatterData,
    body: string,
    filePath: VaultPath,
    errors: string[]
  ): Task {
    // Extract description, technical_notes, and notes from body sections if not in frontmatter
    const description = fm.description || this.extractSection(body, 'Description');
    const technical_notes = fm.technical_notes || this.extractSection(body, 'Technical Notes');
    const notes = fm.notes || this.extractSection(body, 'Notes');

    return {
      id: id as any, // Cast to specific ID type
      type: 'task',
      title: fm.title || this.extractTitleFromBody(body) || 'Untitled',
      workstream: fm.workstream || 'default',
      status: this.validateStatus<TaskStatus>(fm.status, ['Not Started', 'In Progress', 'Completed', 'Blocked'] as TaskStatus[], 'Not Started' as TaskStatus),
      parent: fm.parent,
      depends_on: fm.depends_on,
      goal: fm.goal || '',
      estimate_hrs: fm.estimate_hrs,
      actual_hrs: fm.actual_hrs,
      assignee: fm.assignee,
      description,
      technical_notes,
      notes,
      archived: fm.archived || false,
      canvas_source: fm.canvas_source || '',
      vault_path: filePath,
      cssclasses: fm.cssclasses || [],
      created_at: fm.created_at || new Date().toISOString(),
      updated_at: fm.updated_at || new Date().toISOString(),
    };
  }

  private parseDecision(
    id: EntityId,
    fm: FrontmatterData,
    body: string,
    filePath: VaultPath,
    errors: string[]
  ): Decision {
    // Extract context, decision, and rationale from body sections
    // (they may also be in frontmatter for backwards compatibility)
    const context = fm.context || this.extractSection(body, 'Context');
    const decision = fm.decision || this.extractSection(body, 'Decision');
    const rationale = fm.rationale || this.extractSection(body, 'Rationale');

    return {
      id: id as any, // Cast to specific ID type
      type: 'decision',
      title: fm.title || this.extractTitleFromBody(body) || 'Untitled',
      workstream: fm.workstream || 'default',
      status: this.validateStatus<DecisionStatus>(fm.status, ['Pending', 'Decided', 'Superseded'] as DecisionStatus[], 'Pending' as DecisionStatus),
      context,
      decision,
      rationale,
      alternatives: fm.alternatives,
      decided_by: fm.decided_by,
      decided_on: fm.decided_on,
      supersedes: fm.supersedes,
      blocks: fm.blocks,
      depends_on: fm.depends_on,
      superseded_by: fm.superseded_by,
      affects: fm.affects,
      archived: fm.archived || false,
      canvas_source: fm.canvas_source || '',
      vault_path: filePath,
      cssclasses: fm.cssclasses || [],
      created_at: fm.created_at || new Date().toISOString(),
      updated_at: fm.updated_at || new Date().toISOString(),
    };
  }

  private parseDocument(
    id: EntityId,
    fm: FrontmatterData,
    body: string,
    filePath: VaultPath,
    errors: string[]
  ): Document {
    return {
      id: id as any, // Cast to specific ID type
      type: 'document',
      title: fm.title || this.extractTitleFromBody(body) || 'Untitled',
      workstream: fm.workstream || 'default',
      status: this.validateStatus<DocumentStatus>(fm.status, ['Draft', 'Review', 'Approved', 'Superseded'] as DocumentStatus[], 'Draft' as DocumentStatus),
      doc_type: fm.doc_type || 'spec',
      version: fm.version,
      owner: fm.owner,
      implementation_context: fm.implementation_context,
      implemented_by: fm.implemented_by,
      previous_version: fm.previous_version,
      documents: fm.documents,
      content: body,
      archived: fm.archived || false,
      canvas_source: fm.canvas_source || '',
      vault_path: filePath,
      cssclasses: fm.cssclasses || [],
      created_at: fm.created_at || new Date().toISOString(),
      updated_at: fm.updated_at || new Date().toISOString(),
    };
  }

  private parseFeature(
    id: EntityId,
    fm: FrontmatterData,
    body: string,
    filePath: VaultPath,
    errors: string[]
  ): Feature {
    return {
      id: id as any, // Cast to specific ID type
      type: 'feature',
      title: fm.title || this.extractTitleFromBody(body) || 'Untitled',
      workstream: fm.workstream || 'default',
      status: this.validateStatus<FeatureStatus>(fm.status, ['Planned', 'In Progress', 'Complete', 'Deferred'] as FeatureStatus[], 'Planned' as FeatureStatus),
      user_story: fm.user_story || '',
      tier: this.validateTier(fm.tier),
      phase: this.validatePhase(fm.phase),
      implemented_by: fm.implemented_by,
      documented_by: fm.documented_by,
      decided_by: fm.decided_by,
      test_refs: fm.test_refs || [],
      content: body,
      archived: fm.archived || false,
      canvas_source: fm.canvas_source || '',
      vault_path: filePath,
      cssclasses: fm.cssclasses || [],
      created_at: fm.created_at || new Date().toISOString(),
      updated_at: fm.updated_at || new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Validation Helpers
  // ---------------------------------------------------------------------------

  private validateStatus<T extends string>(value: any, valid: T[], defaultValue: T): T {
    if (valid.includes(value)) return value;
    return defaultValue;
  }

  private validatePriority(value: any): Priority {
    const valid: Priority[] = ['Critical', 'High', 'Medium', 'Low'];
    return valid.includes(value) ? value : 'Medium';
  }

  private validateEffort(value: any): Effort {
    const valid: Effort[] = ['Engineering', 'Business', 'Infra', 'Research', 'Design', 'Marketing'];
    return valid.includes(value) ? value : 'Engineering';
  }

  private validateTier(value: any): FeatureTier {
    const valid: FeatureTier[] = ['OSS', 'Premium'];
    return valid.includes(value) ? value : 'OSS';
  }

  private validatePhase(value: any): FeaturePhase {
    const valid: FeaturePhase[] = ['MVP', '0', '1', '2', '3', '4', '5'];
    // Convert to string to handle YAML parsing numbers (e.g., phase: 4 vs phase: "4")
    const strValue = value !== undefined && value !== null ? String(value) : undefined;
    if (strValue && valid.includes(strValue as FeaturePhase)) {
      return strValue as FeaturePhase;
    }
    return 'MVP';
  }

  private extractTitleFromBody(body: string): string | null {
    const match = body.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract content from a markdown section (## SectionName).
   * Returns the content between this section header and the next section header (or end of file).
   */
  private extractSection(body: string, sectionName: string): string | undefined {
    // Match ## SectionName (case-insensitive)
    const regex = new RegExp(`^##\\s+${sectionName}\\s*$`, 'im');
    const match = body.match(regex);
    if (!match || match.index === undefined) return undefined;

    // Find the start of content (after the header line)
    const startIndex = match.index + match[0].length;
    const afterHeader = body.slice(startIndex);

    // Find the next section header (## or end of content)
    const nextSectionMatch = afterHeader.match(/^##\s+/m);
    const endIndex = nextSectionMatch?.index ?? afterHeader.length;

    // Extract and trim the content
    const content = afterHeader.slice(0, endIndex).trim();
    return content || undefined;
  }

  /**
   * Extract body content before any section headers.
   * Used for milestone objective which is written directly to body without a section header.
   */
  private extractBodyContent(body: string): string | undefined {
    // Find the first section header (## or dataview block)
    const firstSectionMatch = body.match(/^##\s+|^```dataview/m);

    if (firstSectionMatch?.index !== undefined) {
      // Return content before the first section
      const content = body.slice(0, firstSectionMatch.index).trim();
      return content || undefined;
    }

    // No sections found, return trimmed body
    const content = body.trim();
    return content || undefined;
  }
}
