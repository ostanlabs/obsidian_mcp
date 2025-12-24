# Entity Lifecycle Specification

> **Version:** 2.0
> **Date:** December 2024
> **Scope:** Shared between Obsidian Plugin and MCP Server
> **Status:** Implementation Spec

---

## Overview

This document defines the lifecycle of each entity type: valid status transitions, archive rules, superseding behavior, and cascade effects. Both the Plugin and MCP must enforce these rules consistently.

---

## Table of Contents

1. [Lifecycle States](#lifecycle-states)
2. [Status Transitions](#status-transitions)
3. [Archive Lifecycle](#archive-lifecycle)
4. [Superseding Behavior](#superseding-behavior)
5. [Cascade Effects](#cascade-effects)
6. [Blocked State Logic](#blocked-state-logic)
7. [Progress Computation](#progress-computation)
8. [Validation Rules](#validation-rules)

---

## Lifecycle States

### State Categories

Each entity exists in one of these lifecycle categories:

```
┌─────────────────────────────────────────────────────────────────┐
│                        ACTIVE                                    │
│  • Visible by default                                           │
│  • In all queries                                               │
│  • On canvas                                                    │
│  • Editable                                                     │
├─────────────────────────────────────────────────────────────────┤
│                       COMPLETED                                  │
│  • Visible with filter                                          │
│  • Grayed on canvas                                             │
│  • Still editable (can reopen)                                  │
├─────────────────────────────────────────────────────────────────┤
│                       ARCHIVED                                   │
│  • Explicit query only                                          │
│  • Off canvas (moved to archive/)                               │
│  • Read-only (must restore to edit)                             │
├─────────────────────────────────────────────────────────────────┤
│                      SUPERSEDED                                  │
│  • Marked as replaced                                           │
│  • Historical reference preserved                               │
│  • Links redirect to replacement                                │
└─────────────────────────────────────────────────────────────────┘
```

### Status by Entity Type

```typescript
// Milestone lifecycle
type MilestoneStatus = 
  | 'Not Started'   // Initial state
  | 'In Progress'   // Work has begun
  | 'Completed'     // All stories done
  | 'Blocked';      // Has incomplete blockers

// Story lifecycle
type StoryStatus = 
  | 'Not Started'   // Initial state
  | 'In Progress'   // Tasks being worked
  | 'Completed'     // All tasks done
  | 'Blocked';      // Has incomplete blockers

// Task lifecycle
type TaskStatus = 
  | 'Open'          // Initial state
  | 'InProgress'    // Currently working
  | 'Complete'      // Done
  | 'OnHold';       // Paused

// Decision lifecycle
type DecisionStatus = 
  | 'Pending'       // Awaiting decision
  | 'Decided'       // Decision made
  | 'Superseded';   // Replaced by new decision

// Document lifecycle
type DocumentStatus = 
  | 'Draft'         // Work in progress
  | 'Review'        // Under review
  | 'Approved'      // Ready for implementation
  | 'Superseded';   // Replaced by new version
```

---

## Status Transitions

### Transition Diagrams

#### Milestone Transitions

```
                    ┌──────────────┐
                    │  Not Started │
                    └──────┬───────┘
                           │ start()
                           ▼
        blocked()   ┌──────────────┐   complete()
       ┌───────────▶│  In Progress │──────────────┐
       │            └──────────────┘              │
       │                   │                      │
       │                   │ block()              ▼
       │                   ▼               ┌──────────────┐
       │            ┌──────────────┐       │  Completed   │
       └────────────│   Blocked    │       └──────────────┘
                    └──────────────┘              │
                           │                      │ archive()
                           │ unblock()            ▼
                           └─────────────▶ [ARCHIVED]
```

#### Story Transitions

```
                    ┌──────────────┐
                    │  Not Started │
                    └──────┬───────┘
                           │ start()
                           ▼
        blocked()   ┌──────────────┐   complete()
       ┌───────────▶│  In Progress │──────────────┐
       │            └──────────────┘              │
       │                   │                      │
       │                   │ block()              ▼
       │                   ▼               ┌──────────────┐
       │            ┌──────────────┐       │  Completed   │
       └────────────│   Blocked    │       └──────────────┘
                    └──────────────┘
                           │
                           │ unblock()
                           └─────────────▶ (previous state)
```

#### Task Transitions

```
          ┌────────────────────────────────┐
          │                                │
          ▼                                │
    ┌──────────┐    start()    ┌───────────────┐
    │   Open   │──────────────▶│  InProgress   │
    └──────────┘               └───────┬───────┘
          ▲                            │
          │ reopen()                   │ complete()
          │                            ▼
    ┌──────────┐               ┌───────────────┐
    │  OnHold  │◀──────────────│   Complete    │
    └──────────┘    hold()     └───────────────┘
          │
          │ resume()
          └────────────────────▶ (InProgress)
```

#### Decision Transitions

```
    ┌──────────────┐
    │   Pending    │
    └──────┬───────┘
           │ decide()
           ▼
    ┌──────────────┐
    │   Decided    │
    └──────┬───────┘
           │ supersede()
           ▼
    ┌──────────────┐
    │  Superseded  │  (linked to new decision)
    └──────────────┘
```

#### Document Transitions

```
    ┌──────────────┐
    │    Draft     │
    └──────┬───────┘
           │ submit()
           ▼
    ┌──────────────┐
    │   Review     │
    └──────┬───────┘
           │                    │ reject()
           │ approve()          └────────────┐
           ▼                                 ▼
    ┌──────────────┐               ┌──────────────┐
    │   Approved   │               │    Draft     │
    └──────┬───────┘               └──────────────┘
           │ supersede()
           ▼
    ┌──────────────┐
    │  Superseded  │  (linked to new version)
    └──────────────┘
```

### Transition Matrix

```typescript
interface TransitionRule {
  from: EntityStatus;
  to: EntityStatus;
  action: string;
  conditions?: string[];
  side_effects?: string[];
}

const MILESTONE_TRANSITIONS: TransitionRule[] = [
  { from: 'Not Started', to: 'In Progress', action: 'start' },
  { from: 'Not Started', to: 'Blocked', action: 'block', conditions: ['has_incomplete_blockers'] },
  { from: 'In Progress', to: 'Completed', action: 'complete', conditions: ['all_stories_complete'], side_effects: ['check_archive_trigger'] },
  { from: 'In Progress', to: 'Blocked', action: 'block', conditions: ['has_incomplete_blockers'] },
  { from: 'Blocked', to: 'In Progress', action: 'unblock', conditions: ['no_incomplete_blockers'] },
  { from: 'Blocked', to: 'Not Started', action: 'unblock', conditions: ['no_incomplete_blockers', 'no_stories_started'] },
];

const STORY_TRANSITIONS: TransitionRule[] = [
  { from: 'Not Started', to: 'In Progress', action: 'start', side_effects: ['parent_in_progress'] },
  { from: 'Not Started', to: 'Blocked', action: 'block', conditions: ['has_incomplete_blockers'] },
  { from: 'In Progress', to: 'Completed', action: 'complete', conditions: ['all_tasks_complete'], side_effects: ['check_parent_completion'] },
  { from: 'In Progress', to: 'Blocked', action: 'block', conditions: ['has_incomplete_blockers'] },
  { from: 'Blocked', to: 'In Progress', action: 'unblock', conditions: ['no_incomplete_blockers'] },
  { from: 'Blocked', to: 'Not Started', action: 'unblock', conditions: ['no_incomplete_blockers', 'no_tasks_started'] },
  { from: 'Completed', to: 'In Progress', action: 'reopen' },
];

const TASK_TRANSITIONS: TransitionRule[] = [
  { from: 'Open', to: 'InProgress', action: 'start', side_effects: ['parent_in_progress'] },
  { from: 'InProgress', to: 'Complete', action: 'complete', side_effects: ['check_parent_completion'] },
  { from: 'InProgress', to: 'OnHold', action: 'hold' },
  { from: 'OnHold', to: 'InProgress', action: 'resume' },
  { from: 'OnHold', to: 'Open', action: 'reopen' },
  { from: 'Complete', to: 'Open', action: 'reopen' },
];

const DECISION_TRANSITIONS: TransitionRule[] = [
  { from: 'Pending', to: 'Decided', action: 'decide', side_effects: ['unblock_enabled_entities'] },
  { from: 'Decided', to: 'Superseded', action: 'supersede', conditions: ['has_replacement_decision'] },
];

const DOCUMENT_TRANSITIONS: TransitionRule[] = [
  { from: 'Draft', to: 'Review', action: 'submit' },
  { from: 'Review', to: 'Draft', action: 'reject' },
  { from: 'Review', to: 'Approved', action: 'approve', side_effects: ['enable_implementing_stories'] },
  { from: 'Approved', to: 'Superseded', action: 'supersede', conditions: ['has_replacement_version'] },
  { from: 'Approved', to: 'Draft', action: 'revise' },
];
```

### Transition Enforcement

```typescript
class LifecycleManager {
  private transitions: Map<EntityType, TransitionRule[]>;
  
  canTransition(
    entity: EntityBase,
    newStatus: EntityStatus
  ): { allowed: boolean; reason?: string } {
    const rules = this.transitions.get(entity.type);
    if (!rules) {
      return { allowed: false, reason: 'Unknown entity type' };
    }
    
    const rule = rules.find(r => r.from === entity.status && r.to === newStatus);
    if (!rule) {
      return { 
        allowed: false, 
        reason: `Invalid transition: ${entity.status} → ${newStatus}` 
      };
    }
    
    // Check conditions
    if (rule.conditions) {
      for (const condition of rule.conditions) {
        const result = this.checkCondition(entity, condition);
        if (!result.met) {
          return { allowed: false, reason: result.reason };
        }
      }
    }
    
    return { allowed: true };
  }
  
  async transition(
    entity: EntityBase,
    newStatus: EntityStatus
  ): Promise<TransitionResult> {
    const check = this.canTransition(entity, newStatus);
    if (!check.allowed) {
      throw new Error(check.reason);
    }
    
    const rule = this.getRule(entity.type, entity.status, newStatus);
    const oldStatus = entity.status;
    
    // Apply transition
    entity.status = newStatus;
    entity.updated_at = new Date().toISOString();
    
    // Execute side effects
    const sideEffects: string[] = [];
    if (rule.side_effects) {
      for (const effect of rule.side_effects) {
        const result = await this.executeSideEffect(entity, effect);
        sideEffects.push(...result);
      }
    }
    
    return {
      entity_id: entity.id,
      old_status: oldStatus,
      new_status: newStatus,
      side_effects: sideEffects,
    };
  }
  
  private checkCondition(
    entity: EntityBase,
    condition: string
  ): { met: boolean; reason?: string } {
    switch (condition) {
      case 'has_incomplete_blockers':
        const blockers = this.getIncompleteBlockers(entity.id);
        return { 
          met: blockers.length > 0, 
          reason: blockers.length === 0 ? 'No incomplete blockers' : undefined 
        };
        
      case 'no_incomplete_blockers':
        const incBlockers = this.getIncompleteBlockers(entity.id);
        return { 
          met: incBlockers.length === 0, 
          reason: incBlockers.length > 0 ? `Blocked by: ${incBlockers.join(', ')}` : undefined 
        };
        
      case 'all_stories_complete':
        const stories = this.getChildren(entity.id, 'story');
        const incomplete = stories.filter(s => s.status !== 'Completed');
        return { 
          met: incomplete.length === 0, 
          reason: incomplete.length > 0 ? `${incomplete.length} stories not complete` : undefined 
        };
        
      case 'all_tasks_complete':
        const tasks = this.getChildren(entity.id, 'task');
        const incompleteTasks = tasks.filter(t => t.status !== 'Complete');
        return { 
          met: incompleteTasks.length === 0, 
          reason: incompleteTasks.length > 0 ? `${incompleteTasks.length} tasks not complete` : undefined 
        };
        
      case 'has_replacement_decision':
        return { met: !!entity.superseded_by };
        
      case 'has_replacement_version':
        return { met: !!entity.superseded_by };
        
      default:
        return { met: true };
    }
  }
}

interface TransitionResult {
  entity_id: EntityId;
  old_status: EntityStatus;
  new_status: EntityStatus;
  side_effects: string[];
}
```

---

## Archive Lifecycle

### Archive Triggers

```typescript
interface ArchiveTrigger {
  type: 'manual' | 'milestone_complete' | 'time_based' | 'superseded';
  entity_types: EntityType[];
  conditions?: string[];
}

const ARCHIVE_TRIGGERS: ArchiveTrigger[] = [
  // Milestone archival (cascades to children)
  {
    type: 'milestone_complete',
    entity_types: ['milestone'],
    conditions: ['status === "Completed"', 'all_stories_complete'],
  },
  
  // Manual archival
  {
    type: 'manual',
    entity_types: ['milestone', 'story', 'task', 'decision', 'document'],
  },
  
  // Time-based (optional, via settings)
  {
    type: 'time_based',
    entity_types: ['milestone', 'story', 'task'],
    conditions: ['status === "Completed"', 'completed_days_ago > threshold'],
  },
  
  // Superseded entities
  {
    type: 'superseded',
    entity_types: ['decision', 'document'],
    conditions: ['status === "Superseded"'],
  },
];
```

### Archive Process

```typescript
interface ArchiveOperation {
  source_path: VaultPath;
  archive_path: VaultPath;
  children?: ArchiveOperation[];
}

class ArchiveManager {
  async archiveMilestone(
    milestoneId: MilestoneId,
    options?: { force?: boolean }
  ): Promise<ArchiveResult> {
    const milestone = await this.getEntity(milestoneId);
    
    // Validation
    if (!options?.force && milestone.status !== 'Completed') {
      throw new Error('Cannot archive incomplete milestone (use force: true to override)');
    }
    
    // Build archive path
    const quarter = this.getQuarter(milestone.completed_at ?? milestone.updated_at);
    const archiveDir = `archive/${quarter}/${milestone.id}_${this.slugify(milestone.title)}`;
    
    // Collect all entities to archive
    const operations: ArchiveOperation[] = [];
    
    // Milestone itself
    operations.push({
      source_path: milestone.vault_path,
      archive_path: `${archiveDir}/_milestone.md`,
    });
    
    // Stories
    const stories = await this.getChildren(milestoneId, 'story');
    for (const story of stories) {
      operations.push({
        source_path: story.vault_path,
        archive_path: `${archiveDir}/stories/${story.id}_${this.slugify(story.title)}.md`,
      });
      
      // Tasks of this story
      const tasks = await this.getChildren(story.id, 'task');
      for (const task of tasks) {
        operations.push({
          source_path: task.vault_path,
          archive_path: `${archiveDir}/tasks/${task.id}_${this.slugify(task.title)}.md`,
        });
      }
    }
    
    // Execute archive
    const result = await this.executeArchive(operations);
    
    // Update canvas (remove nodes)
    await this.removeFromCanvas(milestone.canvas_source, [
      milestone.id,
      ...stories.map(s => s.id),
      ...operations.filter(o => o.archive_path.includes('/tasks/')).map(o => 
        o.archive_path.match(/T-\d+/)?.[0]
      ).filter(Boolean),
    ]);
    
    // Update index
    await this.updateIndexForArchive(operations);
    
    return result;
  }
  
  async archiveEntity(
    entityId: EntityId,
    options?: { force?: boolean }
  ): Promise<ArchiveResult> {
    const entity = await this.getEntity(entityId);
    
    // Check for children
    const children = await this.getChildren(entityId);
    if (children.length > 0 && !options?.force) {
      throw new Error(`Cannot archive ${entityId}: has ${children.length} children (use force: true to include)`);
    }
    
    // Individual entity archive goes to simpler structure
    const quarter = this.getQuarter(entity.updated_at);
    const archiveDir = `archive/${quarter}/${entity.type}s`;
    
    const operation: ArchiveOperation = {
      source_path: entity.vault_path,
      archive_path: `${archiveDir}/${entity.id}_${this.slugify(entity.title)}.md`,
      children: options?.force ? await this.buildChildOperations(entityId, archiveDir) : undefined,
    };
    
    return this.executeArchive([operation]);
  }
  
  async restoreFromArchive(
    entityId: EntityId
  ): Promise<RestoreResult> {
    // Find in archive
    const archivePath = await this.findInArchive(entityId);
    if (!archivePath) {
      throw new Error(`Entity ${entityId} not found in archive`);
    }
    
    // Determine restore destination
    const entity = await this.parseArchivedEntity(archivePath);
    const restorePath = this.getActivePath(entity);
    
    // Move back
    await this.vault.rename(archivePath, restorePath);
    
    // Update entity metadata
    entity.archived = false;
    entity.updated_at = new Date().toISOString();
    await this.saveEntity(entity, restorePath);
    
    // Re-add to canvas
    await this.addToCanvas(entity);
    
    // Update index
    await this.indexManager.indexFile(restorePath);
    
    return {
      entity_id: entityId,
      restored_to: restorePath,
      status: entity.status,
    };
  }
  
  private getQuarter(isoDate: string): string {
    const date = new Date(isoDate);
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${year}-Q${quarter}`;
  }
  
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 50);
  }
}

interface ArchiveResult {
  archived_count: number;
  archive_path: string;
  archived_entities: EntityId[];
}

interface RestoreResult {
  entity_id: EntityId;
  restored_to: VaultPath;
  status: EntityStatus;
}
```

### Archive Structure

```
archive/
├── 2024-Q4/
│   ├── M-001_MVP_Launch/
│   │   ├── _milestone.md
│   │   ├── stories/
│   │   │   ├── S-001_User_Auth.md
│   │   │   └── S-002_Dashboard.md
│   │   └── tasks/
│   │       ├── T-001_Login_Page.md
│   │       └── T-002_Session_Mgmt.md
│   ├── decisions/
│   │   └── DEC-005_Deprecated.md
│   └── documents/
│       └── DOC-002_Old_Spec.md
└── 2025-Q1/
    └── ...
```

---

## Superseding Behavior

### Decision Superseding

```typescript
async function supersedeDecision(
  oldDecisionId: DecisionId,
  newDecision: {
    title: string;
    context: string;
    decision: string;
    rationale: string;
  }
): Promise<{ old_id: DecisionId; new_id: DecisionId }> {
  // 1. Create new decision
  const newId = await generateId('decision');
  const newDecisionEntity: Decision = {
    id: newId,
    type: 'decision',
    title: newDecision.title,
    status: 'Decided',
    context: newDecision.context,
    decision: newDecision.decision,
    rationale: newDecision.rationale,
    supersedes: oldDecisionId,
    decided_on: new Date().toISOString(),
    // ... other fields
  };
  
  await createEntity(newDecisionEntity);
  
  // 2. Update old decision
  const oldDecision = await getEntity(oldDecisionId);
  oldDecision.status = 'Superseded';
  oldDecision.superseded_by = newId;
  oldDecision.updated_at = new Date().toISOString();
  await updateEntity(oldDecision);
  
  // 3. Transfer enables relationships
  const enabled = index.graph.enables.get(oldDecisionId) ?? new Set();
  for (const entityId of enabled) {
    index.graph.addEnables(newId, entityId);
  }
  
  // 4. Mark affected documents as potentially stale
  const affectedDocs = oldDecision.affects_documents ?? [];
  for (const docId of affectedDocs) {
    await markDocumentPotentiallyStale(docId, newId);
  }
  
  return { old_id: oldDecisionId, new_id: newId };
}
```

### Document Superseding

```typescript
async function supersedeDocument(
  docId: DocumentId,
  updates: {
    changes: string;           // Summary of what changed
    new_content: string;       // Full new content
    decision_id: DecisionId;   // Decision that triggered this
  }
): Promise<{ doc_id: DocumentId; new_version: number }> {
  const doc = await getEntity(docId);
  
  // 1. Record previous version
  const previousVersions = doc.previous_versions ?? [];
  previousVersions.push({
    version: doc.version,
    date: doc.updated_at,
    superseded_by: updates.decision_id,
    change_summary: updates.changes,
    git_ref: await getGitCommit(doc.vault_path),  // Save git ref for retrieval
  });
  
  // 2. Update document in place
  const newVersion = doc.version + 1;
  doc.version = newVersion;
  doc.status = 'Approved';  // Reset to approved (might need review in some flows)
  doc.supersedes_decision = updates.decision_id;
  doc.previous_versions = previousVersions;
  doc.updated_at = new Date().toISOString();
  
  // 3. Write new content
  const frontmatter = serializeFrontmatter(doc);
  const newFile = `${frontmatter}\n\n${updates.new_content}`;
  await writeFile(doc.vault_path, newFile);
  
  // 4. Git commit (preserve history)
  await gitCommit(doc.vault_path, `Update ${docId} to v${newVersion} per ${updates.decision_id}`);
  
  return { doc_id: docId, new_version: newVersion };
}
```

### Supersede Chain Traversal

```typescript
// Get current (non-superseded) version of a decision
function getCurrentDecision(decisionId: DecisionId): DecisionId {
  let current = decisionId;
  let iterations = 0;
  const maxIterations = 100;  // Prevent infinite loops
  
  while (iterations < maxIterations) {
    const decision = index.primary.get(current);
    if (!decision || decision.status !== 'Superseded') {
      return current;
    }
    
    const supersededBy = index.graph.superseded_by.get(current);
    if (!supersededBy) {
      return current;
    }
    
    current = supersededBy as DecisionId;
    iterations++;
  }
  
  throw new Error(`Supersede chain too long for ${decisionId}`);
}

// Get full supersede chain
function getSupersedChain(entityId: EntityId): EntityId[] {
  const chain: EntityId[] = [];
  let current: EntityId | undefined = entityId;
  
  // Walk backwards (older versions)
  while (current) {
    const entity = index.primary.get(current);
    if (!entity) break;
    
    chain.unshift(current);
    current = index.graph.supersedes.get(current);
  }
  
  // Walk forwards (newer versions)
  current = index.graph.superseded_by.get(entityId);
  while (current) {
    chain.push(current);
    current = index.graph.superseded_by.get(current);
  }
  
  return chain;
}
```

---

## Cascade Effects

### Status Cascade Rules

```typescript
interface CascadeRule {
  trigger: { entity_type: EntityType; status: EntityStatus };
  direction: 'up' | 'down';
  target_type: EntityType;
  effect: 'status_change' | 'recompute' | 'notify';
  details: Record<string, any>;
}

const CASCADE_RULES: CascadeRule[] = [
  // Task completion → recompute story progress
  {
    trigger: { entity_type: 'task', status: 'Complete' },
    direction: 'up',
    target_type: 'story',
    effect: 'recompute',
    details: { recompute: 'task_progress' },
  },
  
  // All tasks complete → story can complete
  {
    trigger: { entity_type: 'task', status: 'Complete' },
    direction: 'up',
    target_type: 'story',
    effect: 'status_change',
    details: { 
      condition: 'all_siblings_complete',
      new_status: 'Completed',
      auto: false,  // Suggest, don't auto-apply
    },
  },
  
  // Task started → story in progress
  {
    trigger: { entity_type: 'task', status: 'InProgress' },
    direction: 'up',
    target_type: 'story',
    effect: 'status_change',
    details: { 
      condition: 'parent_not_started',
      new_status: 'In Progress',
      auto: true,
    },
  },
  
  // Story started → milestone in progress
  {
    trigger: { entity_type: 'story', status: 'In Progress' },
    direction: 'up',
    target_type: 'milestone',
    effect: 'status_change',
    details: { 
      condition: 'parent_not_started',
      new_status: 'In Progress',
      auto: true,
    },
  },
  
  // Story completion → recompute milestone progress
  {
    trigger: { entity_type: 'story', status: 'Completed' },
    direction: 'up',
    target_type: 'milestone',
    effect: 'recompute',
    details: { recompute: 'story_progress' },
  },
  
  // Milestone archived → cascade to children
  {
    trigger: { entity_type: 'milestone', status: 'Completed' },
    direction: 'down',
    target_type: 'story',
    effect: 'notify',
    details: { message: 'ready_for_archive' },
  },
  
  // Decision decided → unblock enabled entities
  {
    trigger: { entity_type: 'decision', status: 'Decided' },
    direction: 'down',  // "down" here means to enabled entities
    target_type: 'story',  // or any enabled type
    effect: 'recompute',
    details: { recompute: 'blocked_status' },
  },
];

class CascadeManager {
  async handleStatusChange(
    entity: EntityBase,
    oldStatus: EntityStatus,
    newStatus: EntityStatus
  ): Promise<CascadeResult[]> {
    const results: CascadeResult[] = [];
    
    const applicableRules = CASCADE_RULES.filter(
      r => r.trigger.entity_type === entity.type && r.trigger.status === newStatus
    );
    
    for (const rule of applicableRules) {
      const result = await this.applyRule(entity, rule);
      if (result) {
        results.push(result);
      }
    }
    
    return results;
  }
  
  private async applyRule(
    entity: EntityBase,
    rule: CascadeRule
  ): Promise<CascadeResult | null> {
    const targets = rule.direction === 'up' 
      ? await this.getParent(entity.id)
      : await this.getTargets(entity.id, rule);
    
    if (!targets || targets.length === 0) return null;
    
    switch (rule.effect) {
      case 'status_change':
        return this.applyStatusChange(targets, rule.details);
        
      case 'recompute':
        return this.applyRecompute(targets, rule.details);
        
      case 'notify':
        return this.applyNotify(targets, rule.details);
        
      default:
        return null;
    }
  }
}

interface CascadeResult {
  rule: string;
  affected_entities: EntityId[];
  changes: { entity_id: EntityId; field: string; old_value: any; new_value: any }[];
}
```

---

## Blocked State Logic

### Blocked Status Computation

```typescript
function computeBlockedStatus(entityId: EntityId): {
  is_blocked: boolean;
  blockers: BlockerInfo[];
} {
  const blockers: BlockerInfo[] = [];
  const blockerIds = index.graph.getBlockedBy(entityId);
  
  for (const blockerId of blockerIds) {
    const blocker = index.primary.get(blockerId);
    if (!blocker) continue;
    
    if (!isComplete(blocker.status)) {
      blockers.push({
        id: blockerId,
        type: blocker.type,
        title: blocker.title,
        status: blocker.status,
        blocking_reason: `${blocker.type} "${blocker.title}" is ${blocker.status}`,
      });
    }
  }
  
  // Also check for pending decisions that enable this
  const enabledBy = index.graph.enabled_by.get(entityId) ?? new Set();
  for (const decisionId of enabledBy) {
    const decision = index.primary.get(decisionId);
    if (decision && decision.status === 'Pending') {
      blockers.push({
        id: decisionId,
        type: 'decision',
        title: decision.title,
        status: 'Pending',
        blocking_reason: `Waiting for decision: "${decision.title}"`,
      });
    }
  }
  
  return {
    is_blocked: blockers.length > 0,
    blockers,
  };
}

interface BlockerInfo {
  id: EntityId;
  type: EntityType;
  title: string;
  status: EntityStatus;
  blocking_reason: string;
}

function isComplete(status: EntityStatus): boolean {
  return ['Completed', 'Complete', 'Decided', 'Approved'].includes(status);
}
```

### Auto-Block/Unblock

```typescript
class BlockStatusManager {
  async recomputeAllBlockedStatus(): Promise<void> {
    // Recompute for all non-completed entities
    for (const [id, metadata] of index.primary.entries()) {
      if (isComplete(metadata.status)) continue;
      
      const { is_blocked, blockers } = computeBlockedStatus(id);
      
      if (is_blocked !== metadata.is_blocked) {
        metadata.is_blocked = is_blocked;
        
        // Status transition if needed
        if (is_blocked && metadata.status !== 'Blocked') {
          // Don't auto-block, just mark
          metadata.is_blocked = true;
        } else if (!is_blocked && metadata.status === 'Blocked') {
          // Auto-unblock to previous state
          await this.unblockEntity(id);
        }
      }
    }
  }
  
  private async unblockEntity(entityId: EntityId): Promise<void> {
    const metadata = index.primary.get(entityId);
    if (!metadata || metadata.status !== 'Blocked') return;
    
    // Determine previous state based on children
    const children = index.secondary.getChildren(entityId);
    const hasStartedChildren = [...children].some(childId => {
      const child = index.primary.get(childId);
      return child && !['Not Started', 'Open'].includes(child.status);
    });
    
    const newStatus = hasStartedChildren ? 'In Progress' : 'Not Started';
    
    await lifecycleManager.transition(
      await getEntity(entityId),
      newStatus as EntityStatus
    );
  }
}
```

---

## Progress Computation

### Task Progress

```typescript
interface TaskProgress {
  total: number;
  complete: number;
  in_progress: number;
  open: number;
  on_hold: number;
  percentage: number;
}

function computeTaskProgress(storyId: StoryId): TaskProgress {
  const taskIds = index.secondary.getChildren(storyId);
  
  const progress: TaskProgress = {
    total: taskIds.size,
    complete: 0,
    in_progress: 0,
    open: 0,
    on_hold: 0,
    percentage: 0,
  };
  
  for (const taskId of taskIds) {
    const task = index.primary.get(taskId);
    if (!task) continue;
    
    switch (task.status) {
      case 'Complete': progress.complete++; break;
      case 'InProgress': progress.in_progress++; break;
      case 'Open': progress.open++; break;
      case 'OnHold': progress.on_hold++; break;
    }
  }
  
  progress.percentage = progress.total > 0 
    ? Math.round((progress.complete / progress.total) * 100) 
    : 0;
  
  return progress;
}
```

### Story Progress (for Milestones)

```typescript
interface StoryProgress {
  total: number;
  completed: number;
  in_progress: number;
  not_started: number;
  blocked: number;
  percentage: number;
}

function computeStoryProgress(milestoneId: MilestoneId): StoryProgress {
  const storyIds = index.secondary.getChildren(milestoneId);
  
  const progress: StoryProgress = {
    total: storyIds.size,
    completed: 0,
    in_progress: 0,
    not_started: 0,
    blocked: 0,
    percentage: 0,
  };
  
  for (const storyId of storyIds) {
    const story = index.primary.get(storyId);
    if (!story) continue;
    
    switch (story.status) {
      case 'Completed': progress.completed++; break;
      case 'In Progress': progress.in_progress++; break;
      case 'Not Started': progress.not_started++; break;
      case 'Blocked': progress.blocked++; break;
    }
  }
  
  progress.percentage = progress.total > 0 
    ? Math.round((progress.completed / progress.total) * 100) 
    : 0;
  
  return progress;
}
```

---

## Validation Rules

### Entity Validation

```typescript
interface ValidationRule {
  entity_types: EntityType[];
  field?: string;
  rule: string;
  severity: 'error' | 'warning';
  validate: (entity: EntityBase) => boolean;
  message: string;
}

const VALIDATION_RULES: ValidationRule[] = [
  // Required fields
  {
    entity_types: ['milestone', 'story', 'task', 'decision', 'document'],
    field: 'title',
    rule: 'required',
    severity: 'error',
    validate: (e) => !!e.title && e.title.trim().length > 0,
    message: 'Title is required',
  },
  {
    entity_types: ['milestone', 'story', 'task', 'decision', 'document'],
    field: 'workstream',
    rule: 'required',
    severity: 'error',
    validate: (e) => !!e.workstream,
    message: 'Workstream is required',
  },
  
  // Story-specific
  {
    entity_types: ['story'],
    field: 'effort',
    rule: 'required',
    severity: 'error',
    validate: (e) => !!(e as Story).effort,
    message: 'Effort type is required for stories',
  },
  
  // Task-specific
  {
    entity_types: ['task'],
    field: 'goal',
    rule: 'required',
    severity: 'error',
    validate: (e) => !!(e as Task).goal,
    message: 'Goal is required for tasks',
  },
  
  // Decision-specific
  {
    entity_types: ['decision'],
    field: 'decision',
    rule: 'required_when_decided',
    severity: 'error',
    validate: (e) => {
      const dec = e as Decision;
      return dec.status !== 'Decided' || !!dec.decision;
    },
    message: 'Decision text is required when status is Decided',
  },
  
  // Document-specific
  {
    entity_types: ['document'],
    field: 'doc_type',
    rule: 'required',
    severity: 'error',
    validate: (e) => !!(e as Document).doc_type,
    message: 'Document type is required',
  },
  
  // Circular dependency check
  {
    entity_types: ['milestone', 'story', 'task'],
    rule: 'no_circular_dependencies',
    severity: 'error',
    validate: (e) => !index.graph.hasCycle(e.id),
    message: 'Circular dependency detected',
  },
  
  // Parent validation
  {
    entity_types: ['story'],
    field: 'parent',
    rule: 'valid_parent_type',
    severity: 'error',
    validate: (e) => {
      const story = e as Story;
      if (!story.parent) return true;
      const parent = index.primary.get(story.parent);
      return parent?.type === 'milestone';
    },
    message: 'Story parent must be a milestone',
  },
  
  // Orphan warning
  {
    entity_types: ['story'],
    rule: 'has_parent',
    severity: 'warning',
    validate: (e) => !!(e as Story).parent,
    message: 'Story has no parent milestone',
  },
];

function validateEntity(entity: EntityBase): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  const applicableRules = VALIDATION_RULES.filter(
    r => r.entity_types.includes(entity.type)
  );
  
  for (const rule of applicableRules) {
    if (!rule.validate(entity)) {
      if (rule.severity === 'error') {
        errors.push({
          field: rule.field ?? 'entity',
          message: rule.message,
          code: rule.rule,
        });
      } else {
        warnings.push({
          field: rule.field ?? 'entity',
          message: rule.message,
        });
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2024-12-17 | Initial lifecycle specification |
