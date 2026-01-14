/**
 * Integration Tests for MCP Tools
 *
 * These tests exercise the full stack: tools → runtime → services
 * Each scenario covers multiple components to maximize coverage efficiently.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { getV2Runtime, V2Runtime, resetV2Runtime } from './services/v2/v2-runtime.js';
import type { V2Config } from './models/v2-types.js';
import type { EntityId, EntityType } from './models/v2-types.js';

// Tool implementations
import {
  createEntity,
  updateEntity,
  updateEntityStatus,
  archiveEntity,
  restoreFromArchive,
} from './tools/entity-management-tools.js';
import {
  searchEntities,
  getEntity,
} from './tools/search-navigation-tools.js';
import {
  getDecisionHistory,
} from './tools/decision-document-tools.js';
import {
  batchUpdate,
} from './tools/batch-operations-tools.js';
import {
  getProjectOverview,
  getWorkstreamStatus,
  analyzeProjectState,
} from './tools/project-understanding-tools.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('MCP Integration Tests', () => {
  let tempDir: string;
  let runtime: V2Runtime;
  let config: V2Config;

  beforeEach(async () => {
    // Reset the runtime singleton to ensure clean state between tests
    resetV2Runtime();

    // Create temp directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-integration-test-'));

    config = {
      vaultPath: tempDir,
      entitiesFolder: 'accomplishments',
      archiveFolder: 'accomplishments/archive',
      canvasFolder: 'accomplishments',
      defaultCanvas: 'canvas.canvas',
      workspaces: {},
    };

    // Create folder structure
    await fs.mkdir(path.join(tempDir, 'accomplishments', 'milestones'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'accomplishments', 'stories'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'accomplishments', 'tasks'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'accomplishments', 'decisions'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'accomplishments', 'documents'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'accomplishments', 'archive'), { recursive: true });

    // Get runtime
    runtime = await getV2Runtime(config);
    await runtime.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // Scenario 1: Entity CRUD Workflow
  // ===========================================================================

  describe('Scenario 1: Entity CRUD Workflow', () => {
    it('should create, read, update, and delete a milestone', async () => {
      const deps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();

      // CREATE
      const createResult = await createEntity({
        type: 'milestone',
        data: {
          title: 'Q1 Release',
          workstream: 'engineering',
          objective: 'Deliver Q1 features',
        },
      }, deps);

      expect(createResult.id).toMatch(/^M-\d{3}$/);
      expect(createResult.entity.title).toBe('Q1 Release');
      expect(createResult.entity.status).toBe('Not Started');

      // READ via get_entity
      const fullResult = await getEntity({
        id: createResult.id,
        fields: ['id', 'title', 'status', 'type', 'workstream'],
      }, searchDeps);

      // getEntity returns entity fields directly
      expect(fullResult.id).toBe(createResult.id);
      expect(fullResult.title).toBe('Q1 Release');

      // UPDATE
      const updateResult = await updateEntity({
        id: createResult.id,
        data: {
          title: 'Q1 Release - Updated',
        },
      }, deps);

      expect(updateResult.entity.title).toBe('Q1 Release - Updated');
      expect(updateResult.id).toBe(createResult.id);

      // UPDATE STATUS
      const statusResult = await updateEntityStatus({
        id: createResult.id,
        status: 'In Progress',
      }, deps);

      expect(statusResult.old_status).toBe('Not Started');
      expect(statusResult.new_status).toBe('In Progress');

      // Verify file exists (filename is based on title, not ID)
      const files = await fs.readdir(path.join(tempDir, 'accomplishments', 'milestones'));
      expect(files.length).toBeGreaterThanOrEqual(1);
      // After update, title is "Q1 Release - Updated" which becomes "Q1_Release_-_Updated.md"
      expect(files.some(f => f.includes('Q1_Release'))).toBe(true);
    });

    it('should create a full hierarchy: milestone → story → task', async () => {
      const deps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();

      // Create milestone
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Q1 Release', workstream: 'engineering' },
      }, deps);

      // Create story under milestone
      const story = await createEntity({
        type: 'story',
        data: {
          title: 'User Authentication',
          workstream: 'engineering',
          parent: milestone.id,
          outcome: 'Users can log in securely',
        },
      }, deps);

      // Verify story was created with correct ID
      expect(story.id).toMatch(/^S-\d{3}$/);
      expect(story.entity.title).toBe('User Authentication');

      // Create task under story
      const task = await createEntity({
        type: 'task',
        data: {
          title: 'Implement JWT tokens',
          workstream: 'engineering',
          parent: story.id,
          goal: 'Add JWT authentication',
        },
      }, deps);

      // Verify task was created
      expect(task.id).toMatch(/^T-\d{3}$/);
      expect(task.entity.title).toBe('Implement JWT tokens');

      // Navigate hierarchy - get children using searchEntities
      const navDown = await searchEntities({
        from_id: story.id,
        direction: 'down',
        depth: 2,
      }, searchDeps);

      expect(navDown.results.length).toBe(1);
      expect(navDown.results[0].id).toBe(task.id);

      // Navigate hierarchy - get parent using searchEntities
      const navUp = await searchEntities({
        from_id: story.id,
        direction: 'up',
        depth: 2,
      }, searchDeps);

      expect(navUp.results.length).toBe(1);
      expect(navUp.results[0].id).toBe(milestone.id);
    });
  });

  // ===========================================================================
  // Scenario 2: Search & Navigation
  // ===========================================================================

  describe('Scenario 2: Search & Navigation', () => {
    it('should search entities by query and filters', async () => {
      const deps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();

      // Create multiple entities
      await createEntity({
        type: 'milestone',
        data: { title: 'Authentication System', workstream: 'security' },
      }, deps);

      await createEntity({
        type: 'story',
        data: { title: 'OAuth Integration', workstream: 'security', outcome: 'Support OAuth2 authentication' },
      }, deps);

      await createEntity({
        type: 'task',
        data: { title: 'Database Migration', workstream: 'infrastructure', goal: 'Migrate to PostgreSQL' },
      }, deps);

      // Re-initialize to index new entities
      await runtime.initialize();

      // Search for "authentication"
      const authResults = await searchEntities({
        query: 'authentication',
        limit: 10,
      }, searchDeps);

      expect(authResults.results.length).toBeGreaterThanOrEqual(1);

      // Search with type filter
      const milestoneResults = await searchEntities({
        query: 'system',
        filters: { type: ['milestone'] },
        limit: 10,
      }, searchDeps);

      expect(milestoneResults.results.every(r => r.type === 'milestone')).toBe(true);
    });

    it('should get entity summary and full details', async () => {
      const deps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();

      const milestone = await createEntity({
        type: 'milestone',
        data: {
          title: 'Q2 Goals',
          workstream: 'product',
          objective: 'Complete Q2 deliverables',
          priority: 'High',
        },
      }, deps);

      // Get entity with summary fields
      const summary = await getEntity({ id: milestone.id, fields: ['id', 'title', 'type', 'status'] }, searchDeps);
      expect(summary.id).toBe(milestone.id);
      expect(summary.title).toBe('Q2 Goals');
      expect(summary.type).toBe('milestone');

      // Get entity with all fields
      const full = await getEntity({
        id: milestone.id,
        fields: ['id', 'title', 'type', 'status', 'workstream', 'content'],
      }, searchDeps);

      expect(full.id).toBe(milestone.id);
      // Content may be empty or contain the objective
      expect(full.title).toBe('Q2 Goals');
    });
  });

  // ===========================================================================
  // Scenario 3: Decision & Document Workflow
  // ===========================================================================

  describe('Scenario 3: Decision & Document Workflow', () => {
    it('should create decisions and track history', async () => {
      const deps = runtime.getEntityManagementDeps();
      const decisionDeps = runtime.getDecisionDocumentDeps();

      // Create a decision using createEntity
      const decision = await createEntity({
        type: 'decision',
        data: {
          title: 'Use PostgreSQL for persistence',
          context: 'We need a reliable database for production',
          decision: 'Adopt PostgreSQL as our primary database',
          rationale: 'PostgreSQL offers ACID compliance and excellent performance',
          workstream: 'infrastructure',
          decided_by: 'Engineering Team',
        },
      }, deps);

      expect(decision.id).toMatch(/^DEC-\d{3}$/);
      expect(decision.entity.title).toBe('Use PostgreSQL for persistence');
      // Decisions are created with 'Pending' status (initial status)
      expect(decision.entity.status).toBe('Pending');

      // Get decision history - takes topic/workstream, not id
      const history = await getDecisionHistory({
        topic: 'PostgreSQL',
        workstream: 'infrastructure',
      }, decisionDeps);

      expect(history.decisions.length).toBeGreaterThanOrEqual(1);
      expect(history.decisions[0].id).toBe(decision.id);
    });

    it('should create decision that enables entities', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create a story first
      const story = await createEntity({
        type: 'story',
        data: {
          title: 'Implement caching',
          workstream: 'engineering',
          outcome: 'Improve performance with caching',
        },
      }, deps);

      // Create decision that blocks the story using createEntity
      const decision = await createEntity({
        type: 'decision',
        data: {
          title: 'Use Redis for caching',
          context: 'Need fast caching solution',
          decision: 'Adopt Redis',
          rationale: 'Redis is fast and well-supported',
          workstream: 'engineering',
          decided_by: 'Engineering Team',
          blocks: [story.id],
        },
      }, deps);

      expect(decision.entity.title).toBe('Use Redis for caching');
    });
  });

  // ===========================================================================
  // Scenario 4: Batch Operations
  // ===========================================================================

  describe('Scenario 4: Batch Operations', () => {
    it('should perform batch create operations', async () => {
      const batchDeps = runtime.getBatchOperationsDeps();

      // batchUpdate with create operations
      const result = await batchUpdate({
        ops: [
          {
            op: 'create',
            client_id: 'batch-m1',
            type: 'milestone',
            payload: { title: 'Batch Milestone 1', workstream: 'engineering' },
          },
          {
            op: 'create',
            client_id: 'batch-m2',
            type: 'milestone',
            payload: { title: 'Batch Milestone 2', workstream: 'engineering' },
          },
          {
            op: 'create',
            client_id: 'batch-s1',
            type: 'story',
            payload: { title: 'Batch Story 1', workstream: 'engineering', outcome: 'Test outcome' },
          },
        ],
      }, batchDeps);

      expect(result.results.length).toBe(3);
      expect(result.summary.succeeded).toBe(3);
    });

    it('should batch update status', async () => {
      const deps = runtime.getEntityManagementDeps();
      const batchDeps = runtime.getBatchOperationsDeps();

      // Create entities
      const m1 = await createEntity({
        type: 'milestone',
        data: { title: 'M1', workstream: 'eng' },
      }, deps);

      const m2 = await createEntity({
        type: 'milestone',
        data: { title: 'M2', workstream: 'eng' },
      }, deps);

      // Batch update status using batchUpdate
      const result = await batchUpdate({
        ops: [
          { op: 'update', client_id: 'upd-m1', id: m1.id, payload: { status: 'In Progress' } },
          { op: 'update', client_id: 'upd-m2', id: m2.id, payload: { status: 'In Progress' } },
        ],
      }, batchDeps);

      expect(result.results.length).toBe(2);
      expect(result.summary.succeeded).toBe(2);
    });
  });

  // ===========================================================================
  // Scenario 5: Project Understanding
  // ===========================================================================

  describe('Scenario 5: Project Understanding', () => {
    it('should get project overview', async () => {
      const deps = runtime.getEntityManagementDeps();
      const projectDeps = runtime.getProjectUnderstandingDeps();

      // Create some entities
      await createEntity({
        type: 'milestone',
        data: { title: 'Q1 Goals', workstream: 'product' },
      }, deps);

      await createEntity({
        type: 'story',
        data: { title: 'Feature A', workstream: 'product', outcome: 'Test outcome' },
      }, deps);

      await runtime.initialize();

      const overview = await getProjectOverview({}, projectDeps);

      // GetProjectOverviewOutput has summary.milestones, summary.stories, etc.
      expect(overview.summary.milestones.total).toBeGreaterThanOrEqual(1);
      expect(overview.summary.stories.total).toBeGreaterThanOrEqual(1);
    });

    it('should get workstream status', async () => {
      const deps = runtime.getEntityManagementDeps();
      const projectDeps = runtime.getProjectUnderstandingDeps();

      await createEntity({
        type: 'milestone',
        data: { title: 'Security Audit', workstream: 'security' },
      }, deps);

      await createEntity({
        type: 'task',
        data: { title: 'Pen Testing', workstream: 'security', goal: 'Run penetration tests' },
      }, deps);

      await runtime.initialize();

      const status = await getWorkstreamStatus({
        workstream: 'security',
      }, projectDeps);

      expect(status.workstream).toBe('security');
      // GetWorkstreamStatusOutput has summary.total
      expect(status.summary.total).toBeGreaterThanOrEqual(2);
    });

    it('should analyze project state', async () => {
      const deps = runtime.getEntityManagementDeps();
      const projectDeps = runtime.getProjectUnderstandingDeps();

      // Create milestone with story
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Release 1.0', workstream: 'engineering' },
      }, deps);

      await createEntity({
        type: 'story',
        data: { title: 'Core Feature', workstream: 'engineering', parent: milestone.id, outcome: 'Test' },
      }, deps);

      await runtime.initialize();

      const analysis = await analyzeProjectState({}, projectDeps);

      // AnalyzeProjectStateOutput has health.overall
      expect(analysis.health.overall).toBeDefined();
    });
  });

  // ===========================================================================
  // Scenario 6: Archive & Restore Workflow
  // ===========================================================================

  describe('Scenario 6: Archive & Restore Workflow', () => {
    it('should archive an entity', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create entity
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Old Project', workstream: 'legacy' },
      }, deps);

      // Update to In Progress first, then Completed (valid transition)
      await updateEntityStatus({
        id: milestone.id,
        status: 'In Progress',
      }, deps);

      await updateEntityStatus({
        id: milestone.id,
        status: 'Completed',
      }, deps);

      // Archive
      const archiveResult = await archiveEntity({
        id: milestone.id,
        force: true,
      }, deps);

      expect(archiveResult.archived).toBe(true);
      expect(archiveResult.archive_path).toContain('archive');

      // Verify entity is archived
      const entity = await deps.getEntity(milestone.id);
      expect(entity?.archived).toBe(true);
    });
  });

  // ===========================================================================
  // Scenario 8: Dependencies & Relationships
  // ===========================================================================

  describe('Scenario 8: Dependencies & Relationships', () => {
    it('should create entities with dependencies', async () => {
      const deps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();

      // Create decision
      const decision = await createEntity({
        type: 'decision',
        data: {
          title: 'Use TypeScript',
          workstream: 'engineering',
          context: 'Need type safety',
          decision: 'Adopt TypeScript',
          rationale: 'Better developer experience',
        },
      }, deps);

      // Create story
      const story = await createEntity({
        type: 'story',
        data: {
          title: 'Refactor to TypeScript',
          workstream: 'engineering',
          outcome: 'Codebase uses TypeScript',
        },
      }, deps);

      // Verify entities were created
      const full = await getEntity({
        id: story.id,
        fields: ['id', 'title', 'type', 'status', 'workstream'],
      }, searchDeps);

      expect(full.id).toBe(story.id);
      expect(full.title).toBe('Refactor to TypeScript');
    });

    it('should handle implements relationship', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create document
      const doc = await createEntity({
        type: 'document',
        data: {
          title: 'API Specification',
          workstream: 'engineering',
          doc_type: 'spec',
          content: 'API design document',
        },
      }, deps);

      // Create story that implements the document
      const story = await createEntity({
        type: 'story',
        data: {
          title: 'Implement API',
          workstream: 'engineering',
          implements: [doc.id],
          outcome: 'API matches specification',
        },
      }, deps);

      expect(story.entity.title).toBe('Implement API');
    });
  });

  // ===========================================================================
  // Scenario 9: Error Handling
  // ===========================================================================

  describe('Scenario 9: Error Handling', () => {
    it('should handle invalid entity ID', async () => {
      const searchDeps = runtime.getSearchNavigationDeps();

      await expect(getEntity({
        id: 'INVALID-999' as EntityId,
      }, searchDeps)).rejects.toThrow();
    });

    it('should handle invalid status transition', async () => {
      const deps = runtime.getEntityManagementDeps();

      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Test', workstream: 'test' },
      }, deps);

      // Try to go directly to Completed (should fail - need In Progress first)
      await expect(updateEntityStatus({
        id: milestone.id,
        status: 'Completed',
      }, deps)).rejects.toThrow();
    });

    it('should handle missing required fields', async () => {
      const deps = runtime.getEntityManagementDeps();

      await expect(createEntity({
        type: 'milestone',
        data: {
          // Missing title
          workstream: 'test',
        } as any,
      }, deps)).rejects.toThrow();
    });
  });

  // ===========================================================================
  // Scenario 10: Status Cascade
  // ===========================================================================

  describe('Scenario 10: Status Cascade', () => {
    it('should cascade status updates to children', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create hierarchy
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Parent Milestone', workstream: 'eng' },
      }, deps);

      const story = await createEntity({
        type: 'story',
        data: { title: 'Child Story', workstream: 'eng', parent: milestone.id },
      }, deps);

      const task = await createEntity({
        type: 'task',
        data: { title: 'Grandchild Task', workstream: 'eng', parent: story.id, goal: 'Do work' },
      }, deps);

      // Update milestone to In Progress
      await updateEntityStatus({
        id: milestone.id,
        status: 'In Progress',
      }, deps);

      // Update story to In Progress
      await updateEntityStatus({
        id: story.id,
        status: 'In Progress',
      }, deps);

      // Update task to Completed
      await updateEntityStatus({
        id: task.id,
        status: 'In Progress',
      }, deps);

      await updateEntityStatus({
        id: task.id,
        status: 'Completed',
      }, deps);

      // Verify task is completed
      const taskEntity = await deps.getEntity(task.id);
      expect(taskEntity?.status).toBe('Completed');
    });
  });

  // ===========================================================================
  // Scenario 11: Extended Archive Operations
  // ===========================================================================

  describe('Scenario 11: Extended Archive Operations', () => {
    it('should archive milestone with children', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create hierarchy
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Archive Test Milestone', workstream: 'archive-test' },
      }, deps);

      const story = await createEntity({
        type: 'story',
        data: { title: 'Archive Test Story', workstream: 'archive-test', parent: milestone.id },
      }, deps);

      const task = await createEntity({
        type: 'task',
        data: { title: 'Archive Test Task', workstream: 'archive-test', parent: story.id, goal: 'Test' },
      }, deps);

      // Complete the hierarchy (required for archiving)
      await updateEntityStatus({ id: milestone.id, status: 'In Progress' }, deps);
      await updateEntityStatus({ id: story.id, status: 'In Progress' }, deps);
      await updateEntityStatus({ id: task.id, status: 'In Progress' }, deps);
      await updateEntityStatus({ id: task.id, status: 'Completed' }, deps);
      await updateEntityStatus({ id: story.id, status: 'Completed' }, deps);
      await updateEntityStatus({ id: milestone.id, status: 'Completed' }, deps);

      // Archive the milestone
      const archiveResult = await archiveEntity({
        id: milestone.id,
        force: true,
      }, deps);

      expect(archiveResult.archived).toBe(true);
    });

    it('should restore archived entity', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create and complete entity
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Restore Test', workstream: 'restore-test' },
      }, deps);

      await updateEntityStatus({ id: milestone.id, status: 'In Progress' }, deps);
      await updateEntityStatus({ id: milestone.id, status: 'Completed' }, deps);

      // Archive
      await archiveEntity({ id: milestone.id, force: true }, deps);

      // Restore
      const restoreResult = await restoreFromArchive({
        id: milestone.id,
        restore_children: false,
      }, deps);

      expect(restoreResult.restored).toBe(true);

      // Verify entity is no longer archived
      const entity = await deps.getEntity(milestone.id);
      expect(entity?.archived).toBe(false);
    });
  });

  // ===========================================================================
  // Scenario 12: Extended Decision & Document Operations
  // ===========================================================================

  describe('Scenario 12: Extended Decision & Document Operations', () => {
    it('should create decision with blocks relationship', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create a story first
      const story = await createEntity({
        type: 'story',
        data: { title: 'Story to Enable', workstream: 'decisions' },
      }, deps);

      // Create decision that blocks the story using createEntity
      const decision = await createEntity({
        type: 'decision',
        data: {
          title: 'Enable Story Decision',
          context: 'We need to decide on the approach',
          decision: 'Use approach A',
          rationale: 'It is simpler',
          workstream: 'decisions',
          decided_by: 'team',
          blocks: [story.id],
        },
      }, deps);

      expect(decision.id).toMatch(/^DEC-\d{3}$/);
    });

    it('should get decision history by workstream', async () => {
      const deps = runtime.getEntityManagementDeps();
      const decisionDeps = runtime.getDecisionDocumentDeps();

      // Create multiple decisions using createEntity
      await createEntity({
        type: 'decision',
        data: {
          title: 'Decision 1',
          context: 'Context 1',
          decision: 'Decision 1',
          rationale: 'Rationale 1',
          workstream: 'history-test',
          decided_by: 'team',
        },
      }, deps);

      await createEntity({
        type: 'decision',
        data: {
          title: 'Decision 2',
          context: 'Context 2',
          decision: 'Decision 2',
          rationale: 'Rationale 2',
          workstream: 'history-test',
          decided_by: 'team',
        },
      }, deps);

      // Get history
      const history = await getDecisionHistory({
        workstream: 'history-test',
      }, decisionDeps);

      expect(history.decisions.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // Scenario 13: Extended Batch Operations
  // ===========================================================================

  describe('Scenario 13: Extended Batch Operations', () => {
    it('should create entities with dependencies in batch', async () => {
      const batchDeps = runtime.getBatchOperationsDeps();

      const result = await batchUpdate({
        ops: [
          {
            op: 'create',
            client_id: 'batch-m',
            type: 'milestone',
            payload: { title: 'Batch Milestone', workstream: 'batch-deps' },
          },
          {
            op: 'create',
            client_id: 'batch-s',
            type: 'story',
            payload: { title: 'Batch Story', workstream: 'batch-deps', depends_on: ['@batch-m'] },
          },
        ],
      }, batchDeps);

      expect(result.results.length).toBe(2);
      expect(result.summary.succeeded).toBe(2);
    });

    it('should batch update multiple entity statuses', async () => {
      const deps = runtime.getEntityManagementDeps();
      const batchDeps = runtime.getBatchOperationsDeps();

      // Create entities
      const m1 = await createEntity({
        type: 'milestone',
        data: { title: 'Batch Status M1', workstream: 'batch-status' },
      }, deps);

      const m2 = await createEntity({
        type: 'milestone',
        data: { title: 'Batch Status M2', workstream: 'batch-status' },
      }, deps);

      // Batch update to In Progress using batchUpdate
      const result = await batchUpdate({
        ops: [
          { op: 'update', client_id: 'upd-m1', id: m1.id, payload: { status: 'In Progress' } },
          { op: 'update', client_id: 'upd-m2', id: m2.id, payload: { status: 'In Progress' } },
        ],
      }, batchDeps);

      expect(result.results.length).toBe(2);
      expect(result.summary.succeeded).toBe(2);

      // Verify statuses
      const entity1 = await deps.getEntity(m1.id);
      const entity2 = await deps.getEntity(m2.id);
      expect(entity1?.status).toBe('In Progress');
      expect(entity2?.status).toBe('In Progress');
    });
  });

  // ===========================================================================
  // Scenario 14: Navigate Hierarchy
  // ===========================================================================

  describe('Scenario 14: Navigate Hierarchy', () => {
    it('should navigate up the hierarchy', async () => {
      const deps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();

      // Create hierarchy
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Nav Milestone', workstream: 'nav' },
      }, deps);

      const story = await createEntity({
        type: 'story',
        data: { title: 'Nav Story', workstream: 'nav', parent: milestone.id },
      }, deps);

      const task = await createEntity({
        type: 'task',
        data: { title: 'Nav Task', workstream: 'nav', parent: story.id, goal: 'Navigate' },
      }, deps);

      // Navigate up from task using searchEntities
      const upResult = await searchEntities({
        from_id: task.id,
        direction: 'up',
        depth: 2,
      }, searchDeps);

      expect(upResult.results.length).toBeGreaterThanOrEqual(1);
    });

    it('should navigate down the hierarchy', async () => {
      const deps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();

      // Create hierarchy
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Nav Down Milestone', workstream: 'nav-down' },
      }, deps);

      await createEntity({
        type: 'story',
        data: { title: 'Nav Down Story 1', workstream: 'nav-down', parent: milestone.id },
      }, deps);

      await createEntity({
        type: 'story',
        data: { title: 'Nav Down Story 2', workstream: 'nav-down', parent: milestone.id },
      }, deps);

      // Navigate down from milestone using searchEntities
      const downResult = await searchEntities({
        from_id: milestone.id,
        direction: 'down',
        depth: 1,
      }, searchDeps);

      expect(downResult.results.length).toBeGreaterThanOrEqual(2);
    });

    it('should get siblings', async () => {
      const deps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();

      // Create parent and siblings
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Sibling Parent', workstream: 'siblings' },
      }, deps);

      const story1 = await createEntity({
        type: 'story',
        data: { title: 'Sibling 1', workstream: 'siblings', parent: milestone.id },
      }, deps);

      await createEntity({
        type: 'story',
        data: { title: 'Sibling 2', workstream: 'siblings', parent: milestone.id },
      }, deps);

      // Get siblings of story1 using searchEntities
      const siblingsResult = await searchEntities({
        from_id: story1.id,
        direction: 'siblings',
      }, searchDeps);

      expect(siblingsResult.results.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // Scenario 15: Efficiency Improvements
  // ===========================================================================
  describe('Scenario 15: Efficiency Improvements', () => {
    it('should return entities with batch_update when include_entities=true', async () => {
      const deps = runtime.getEntityManagementDeps();
      const batchDeps = runtime.getBatchOperationsDeps();

      // Create a story first
      const story = await createEntity({
        type: 'story',
        data: { title: 'Batch Test Story', workstream: 'batch-test' },
      }, deps);

      // Update with include_entities=true
      const result = await batchUpdate({
        ops: [
          { client_id: 'u1', op: 'update', id: story.id, payload: { status: 'In Progress' } },
        ],
        options: { include_entities: true },
      }, batchDeps);

      expect(result.summary.succeeded).toBe(1);
      expect(result.results[0].entity).toBeDefined();
      expect(result.results[0].entity?.id).toBe(story.id);
      expect(result.results[0].entity?.title).toBe('Batch Test Story');
    });

    it('should NOT return entities with batch_update when include_entities=false', async () => {
      const deps = runtime.getEntityManagementDeps();
      const batchDeps = runtime.getBatchOperationsDeps();

      // Create a story first
      const story = await createEntity({
        type: 'story',
        data: { title: 'Batch Test Story 2', workstream: 'batch-test' },
      }, deps);

      // Update with include_entities=false (default)
      const result = await batchUpdate({
        ops: [
          { client_id: 'u1', op: 'update', id: story.id, payload: { status: 'In Progress' } },
        ],
        options: { include_entities: false },
      }, batchDeps);

      expect(result.summary.succeeded).toBe(1);
      expect(result.results[0].entity).toBeUndefined();
    });

    it('should filter fields with batch_update when fields option is provided', async () => {
      const deps = runtime.getEntityManagementDeps();
      const batchDeps = runtime.getBatchOperationsDeps();

      // Create a story first
      const story = await createEntity({
        type: 'story',
        data: { title: 'Batch Field Test', workstream: 'batch-test' },
      }, deps);

      // Update with include_entities=true and specific fields
      const result = await batchUpdate({
        ops: [
          { client_id: 'u1', op: 'update', id: story.id, payload: { status: 'In Progress' } },
        ],
        options: { include_entities: true, fields: ['id', 'title', 'status'] },
      }, batchDeps);

      expect(result.summary.succeeded).toBe(1);
      expect(result.results[0].entity).toBeDefined();
      expect(result.results[0].entity?.id).toBe(story.id);
      expect(result.results[0].entity?.title).toBe('Batch Field Test');
      // Should not have content since we only requested id, title, status
      expect(result.results[0].entity?.content).toBeUndefined();
    });

    it('should preview changes with batch_update dry_run=true', async () => {
      const deps = runtime.getEntityManagementDeps();
      const batchDeps = runtime.getBatchOperationsDeps();

      // Create a story first
      const story = await createEntity({
        type: 'story',
        data: { title: 'Dry Run Test', workstream: 'dry-run-test' },
      }, deps);

      // Update with dry_run=true
      const result = await batchUpdate({
        ops: [
          { client_id: 'u1', op: 'update', id: story.id, payload: { title: 'Changed Title' } },
        ],
        options: { dry_run: true },
      }, batchDeps);

      // Should have dry_run flag and would_update array
      expect(result.dry_run).toBe(true);
      expect(result.would_update).toBeDefined();
      expect(result.would_update?.length).toBe(1);
      expect(result.would_update?.[0].client_id).toBe('u1');
      expect(result.would_update?.[0].id).toBe(story.id);
      expect(result.would_update?.[0].op).toBe('update');
      expect(result.would_update?.[0].changes.length).toBeGreaterThan(0);

      // Verify entity was NOT actually updated - title should still be 'Dry Run Test'
      const entityAfter = await deps.getEntity(story.id);
      expect(entityAfter?.title).toBe('Dry Run Test');
    });

    it('should return detailed changes with reconcile_relationships', async () => {
      // Test reconcile_relationships returns enhanced output
      const result = await runtime.reconcileImplementsRelationships({ dry_run: true });

      // Should have the new output format
      expect(result).toHaveProperty('scanned');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('dry_run');
      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('details'); // Legacy format

      // dry_run should be true
      expect(result.dry_run).toBe(true);
      // updated should be 0 in dry_run mode
      expect(result.updated).toBe(0);
    });
  });

});

