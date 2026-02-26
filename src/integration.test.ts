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
import type { EntityId } from './models/v2-types.js';

// Tool implementations
import {
  createEntity,
  updateEntity,
  updateEntityStatus,
  archiveEntity,
  restoreFromArchive,
  handleEntity,
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

      // UPDATE (with return_full to get entity in response)
      const updateResult = await updateEntity({
        id: createResult.id,
        data: {
          title: 'Q1 Release - Updated',
        },
        return_full: true,
      }, deps);

      expect(updateResult.status).toBe('ok');
      expect(updateResult.id).toBe(createResult.id);
      expect('entity' in updateResult && updateResult.entity?.title).toBe('Q1 Release - Updated');

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

    it('should return minimal response by default (no entity)', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create a milestone
      const createResult = await createEntity({
        type: 'milestone',
        data: { title: 'Minimal Response Test', workstream: 'engineering' },
      }, deps);

      // Update without return_full (default: minimal response)
      const updateResult = await updateEntity({
        id: createResult.id,
        data: { title: 'Minimal Response Test - Updated' },
      }, deps);

      // Verify minimal response structure
      expect(updateResult.status).toBe('ok');
      expect(updateResult.id).toBe(createResult.id);
      expect(updateResult.changes).toBeDefined();
      expect(updateResult.changes!.length).toBeGreaterThan(0);
      expect(updateResult.changes!.some(c => c.field === 'title')).toBe(true);

      // Verify entity is NOT included in minimal response
      expect('entity' in updateResult).toBe(false);
      expect('dependencies_added' in updateResult).toBe(false);
      expect('dependencies_removed' in updateResult).toBe(false);
    });

    it('should return full entity when return_full=true', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create a milestone
      const createResult = await createEntity({
        type: 'milestone',
        data: { title: 'Full Response Test', workstream: 'engineering' },
      }, deps);

      // Update with return_full=true
      const updateResult = await updateEntity({
        id: createResult.id,
        data: { title: 'Full Response Test - Updated' },
        return_full: true,
      }, deps);

      // Verify full response structure
      expect(updateResult.status).toBe('ok');
      expect(updateResult.id).toBe(createResult.id);
      expect('entity' in updateResult).toBe(true);
      expect((updateResult as { entity: { title: string } }).entity.title).toBe('Full Response Test - Updated');
      expect('dependencies_added' in updateResult).toBe(true);
      expect('dependencies_removed' in updateResult).toBe(true);
    });

    it('should return only specified fields when return_fields is provided', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create a milestone
      const createResult = await createEntity({
        type: 'milestone',
        data: { title: 'Partial Response Test', workstream: 'engineering', priority: 'High' },
      }, deps);

      // Update with return_fields
      const updateResult = await updateEntity({
        id: createResult.id,
        data: { title: 'Partial Response Test - Updated' },
        return_fields: ['id', 'title', 'status'],
      }, deps);

      // Verify partial response structure
      expect(updateResult.status).toBe('ok');
      expect(updateResult.id).toBe(createResult.id);
      expect('entity' in updateResult).toBe(true);

      const entity = (updateResult as { entity: Record<string, unknown> }).entity;
      expect(entity.id).toBe(createResult.id);
      expect(entity.title).toBe('Partial Response Test - Updated');
      expect(entity.status).toBeDefined();

      // Verify fields NOT requested are NOT included
      expect('workstream' in entity).toBe(false);
      expect('priority' in entity).toBe(false);
      expect('children' in entity).toBe(false);
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

      // Create multiple entities with proper hierarchy
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Authentication System', workstream: 'security' },
      }, deps);

      const story = await createEntity({
        type: 'story',
        data: { title: 'OAuth Integration', workstream: 'security', outcome: 'Support OAuth2 authentication', parent: milestone.id },
      }, deps);

      await createEntity({
        type: 'task',
        data: { title: 'Database Migration', workstream: 'infrastructure', goal: 'Migrate to PostgreSQL', parent: story.id },
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

    it('should return etag and latest_update in search results', async () => {
      const deps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();

      // Create an entity
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Etag Test Milestone', workstream: 'engineering' },
      }, deps);

      // Re-initialize to index new entities
      await runtime.initialize();

      // Search for the entity
      const results = await searchEntities({
        query: 'Etag Test',
        limit: 10,
      }, searchDeps);

      // Should have etag and latest_update
      expect(results.etag).toBeDefined();
      expect(typeof results.etag).toBe('string');
      expect(results.etag!.length).toBeGreaterThan(0);

      expect(results.latest_update).toBeDefined();
      expect(typeof results.latest_update).toBe('string');
      // Should be a valid ISO timestamp
      expect(new Date(results.latest_update!).toISOString()).toBe(results.latest_update);
    });

    it('should filter entities by since timestamp', async () => {
      const deps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();

      // Create first entity
      const milestone1 = await createEntity({
        type: 'milestone',
        data: { title: 'Since Test Old', workstream: 'engineering' },
      }, deps);

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));
      const midpoint = new Date().toISOString();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create second entity after midpoint
      const milestone2 = await createEntity({
        type: 'milestone',
        data: { title: 'Since Test New', workstream: 'engineering' },
      }, deps);

      // Re-initialize to index new entities
      await runtime.initialize();

      // Search without since - should find both
      const allResults = await searchEntities({
        filters: { type: ['milestone'] },
        limit: 100,
      }, searchDeps);

      const allTitles = allResults.results.map(r => r.title);
      expect(allTitles).toContain('Since Test Old');
      expect(allTitles).toContain('Since Test New');

      // Search with since - should only find the newer one
      const sinceResults = await searchEntities({
        filters: { type: ['milestone'] },
        since: midpoint,
        limit: 100,
      }, searchDeps);

      const sinceTitles = sinceResults.results.map(r => r.title);
      expect(sinceTitles).not.toContain('Since Test Old');
      expect(sinceTitles).toContain('Since Test New');
    });

    it('should return consistent etag for same result set', async () => {
      const deps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();

      // Create an entity
      await createEntity({
        type: 'milestone',
        data: { title: 'Consistent Etag Test', workstream: 'engineering' },
      }, deps);

      // Re-initialize to index new entities
      await runtime.initialize();

      // Search twice
      const results1 = await searchEntities({
        query: 'Consistent Etag',
        limit: 10,
      }, searchDeps);

      const results2 = await searchEntities({
        query: 'Consistent Etag',
        limit: 10,
      }, searchDeps);

      // Etags should be the same for the same result set
      expect(results1.etag).toBe(results2.etag);
    });
  });

  // ===========================================================================
  // Scenario 3: Decision & Document Workflow
  // ===========================================================================

  describe('Scenario 3: Decision & Document Workflow', () => {
    it('should create decisions and track history', async () => {
      const deps = runtime.getEntityManagementDeps();
      const decisionDeps = runtime.getDecisionDocumentDeps();

      // Create a milestone and story for decision to affect
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Database Setup', workstream: 'infrastructure' },
      }, deps);

      const story = await createEntity({
        type: 'story',
        data: { title: 'Setup PostgreSQL', workstream: 'infrastructure', parent: milestone.entity.id },
      }, deps);

      // Create a decision using createEntity (must have affects)
      const decision = await createEntity({
        type: 'decision',
        data: {
          title: 'Use PostgreSQL for persistence',
          context: 'We need a reliable database for production',
          decision: 'Adopt PostgreSQL as our primary database',
          rationale: 'PostgreSQL offers ACID compliance and excellent performance',
          workstream: 'infrastructure',
          decided_by: 'Engineering Team',
          affects: [story.entity.id],
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

      // Create a milestone first (parent for story)
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Performance Improvements', workstream: 'engineering' },
      }, deps);

      // Create a story with parent
      const story = await createEntity({
        type: 'story',
        data: {
          title: 'Implement caching',
          workstream: 'engineering',
          outcome: 'Improve performance with caching',
          parent: milestone.id,
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

      // Create some entities with proper hierarchy
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Q1 Goals', workstream: 'product' },
      }, deps);

      await createEntity({
        type: 'story',
        data: { title: 'Feature A', workstream: 'product', outcome: 'Test outcome', parent: milestone.id },
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

      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Security Audit', workstream: 'security' },
      }, deps);

      const story = await createEntity({
        type: 'story',
        data: { title: 'Security Story', workstream: 'security', outcome: 'Security tests', parent: milestone.id },
      }, deps);

      await createEntity({
        type: 'task',
        data: { title: 'Pen Testing', workstream: 'security', goal: 'Run penetration tests', parent: story.id },
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

    it('should return only requested fields when fields parameter is provided', async () => {
      const deps = runtime.getEntityManagementDeps();
      const projectDeps = runtime.getProjectUnderstandingDeps();

      // Create some entities
      await createEntity({
        type: 'milestone',
        data: { title: 'Test Milestone', workstream: 'engineering' },
      }, deps);

      await runtime.initialize();

      // Request only health and stats
      const analysis = await analyzeProjectState({ fields: ['health', 'stats'] }, projectDeps);

      // Should have health and stats
      expect(analysis.health).toBeDefined();
      expect(analysis.health.overall).toBeDefined();
      expect(analysis.stats).toBeDefined();
      expect(analysis.stats.decisions_pending).toBeDefined();

      // Should NOT have blockers or suggested_actions
      expect(analysis.blockers).toBeUndefined();
      expect(analysis.suggested_actions).toBeUndefined();
    });

    it('should return all fields when no fields parameter is provided', async () => {
      const deps = runtime.getEntityManagementDeps();
      const projectDeps = runtime.getProjectUnderstandingDeps();

      await createEntity({
        type: 'milestone',
        data: { title: 'Test Milestone', workstream: 'engineering' },
      }, deps);

      await runtime.initialize();

      // No fields parameter = all fields
      const analysis = await analyzeProjectState({}, projectDeps);

      expect(analysis.health).toBeDefined();
      expect(analysis.blockers).toBeDefined();
      expect(analysis.suggested_actions).toBeDefined();
      expect(analysis.stats).toBeDefined();
    });

    it('should include all blocker sub-fields when blockers field is requested', async () => {
      const deps = runtime.getEntityManagementDeps();
      const projectDeps = runtime.getProjectUnderstandingDeps();

      await createEntity({
        type: 'milestone',
        data: { title: 'Test Milestone', workstream: 'engineering' },
      }, deps);

      await runtime.initialize();

      // Request only blockers
      const analysis = await analyzeProjectState({ fields: ['blockers'] }, projectDeps);

      // Should have blockers with all sub-fields
      expect(analysis.blockers).toBeDefined();
      expect(analysis.blockers.critical_path).toBeDefined();
      expect(analysis.blockers.by_type).toBeDefined();
      expect(analysis.blockers.by_type.pending_decisions).toBeDefined();
      expect(analysis.blockers.by_type.incomplete_specs).toBeDefined();
      expect(analysis.blockers.stale_items).toBeDefined();

      // Should NOT have other top-level fields
      expect(analysis.health).toBeUndefined();
      expect(analysis.suggested_actions).toBeUndefined();
      expect(analysis.stats).toBeUndefined();
    });

    it('should return only specific blocker sub-fields when requested', async () => {
      const deps = runtime.getEntityManagementDeps();
      const projectDeps = runtime.getProjectUnderstandingDeps();

      await createEntity({
        type: 'milestone',
        data: { title: 'Test Milestone', workstream: 'engineering' },
      }, deps);

      await runtime.initialize();

      // Request only critical_path
      const analysis = await analyzeProjectState({ fields: ['critical_path'] }, projectDeps);

      // Should have blockers with critical_path populated
      expect(analysis.blockers).toBeDefined();
      expect(analysis.blockers.critical_path).toBeDefined();
      // Other blocker sub-fields should be empty arrays
      expect(analysis.blockers.by_type.pending_decisions).toEqual([]);
      expect(analysis.blockers.by_type.incomplete_specs).toEqual([]);
      expect(analysis.blockers.stale_items).toEqual([]);
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

      // Create milestone first (parent for story)
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'TypeScript Migration', workstream: 'engineering' },
      }, deps);

      // Create story (for decision to affect)
      const decisionTargetStory = await createEntity({
        type: 'story',
        data: { title: 'Migrate to TypeScript', workstream: 'engineering', parent: milestone.entity.id },
      }, deps);

      // Create decision (must have affects - can affect story, task, or document)
      await createEntity({
        type: 'decision',
        data: {
          title: 'Use TypeScript',
          workstream: 'engineering',
          context: 'Need type safety',
          decision: 'Adopt TypeScript',
          rationale: 'Better developer experience',
          affects: [decisionTargetStory.entity.id],
        },
      }, deps);

      // Create story with parent
      const story = await createEntity({
        type: 'story',
        data: {
          title: 'Refactor to TypeScript',
          workstream: 'engineering',
          outcome: 'Codebase uses TypeScript',
          parent: milestone.id,
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

      // Create milestone first (parent for story)
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'API Development', workstream: 'engineering' },
      }, deps);

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
          parent: milestone.id,
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

      // Create milestone first (parent for story)
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Decisions Milestone', workstream: 'decisions' },
      }, deps);

      // Create a story with parent
      const story = await createEntity({
        type: 'story',
        data: { title: 'Story to Enable', workstream: 'decisions', parent: milestone.id },
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

      // Create a milestone and story for decisions to affect
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'History Test Milestone', workstream: 'history-test' },
      }, deps);

      const story = await createEntity({
        type: 'story',
        data: { title: 'History Test Story', workstream: 'history-test', parent: milestone.entity.id },
      }, deps);

      // Create multiple decisions using createEntity (must have affects - can affect story, task, or document)
      await createEntity({
        type: 'decision',
        data: {
          title: 'Decision 1',
          context: 'Context 1',
          decision: 'Decision 1',
          rationale: 'Rationale 1',
          workstream: 'history-test',
          decided_by: 'team',
          affects: [story.entity.id],
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
          affects: [story.entity.id],
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

      // Create milestone first (parent for story)
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Batch Test Milestone', workstream: 'batch-test' },
      }, deps);

      // Create a story with parent
      const story = await createEntity({
        type: 'story',
        data: { title: 'Batch Test Story', workstream: 'batch-test', parent: milestone.id },
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

      // Create milestone first (parent for story)
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Batch Test Milestone 2', workstream: 'batch-test' },
      }, deps);

      // Create a story with parent
      const story = await createEntity({
        type: 'story',
        data: { title: 'Batch Test Story 2', workstream: 'batch-test', parent: milestone.id },
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

      // Create milestone first (parent for story)
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Batch Field Milestone', workstream: 'batch-test' },
      }, deps);

      // Create a story with parent
      const story = await createEntity({
        type: 'story',
        data: { title: 'Batch Field Test', workstream: 'batch-test', parent: milestone.id },
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

      // Create milestone first (parent for story)
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Dry Run Milestone', workstream: 'dry-run-test' },
      }, deps);

      // Create a story with parent
      const story = await createEntity({
        type: 'story',
        data: { title: 'Dry Run Test', workstream: 'dry-run-test', priority: 'Medium', parent: milestone.id },
      }, deps);

      // Update with dry_run=true - test multiple fields including non-standard ones
      const result = await batchUpdate({
        ops: [
          { client_id: 'u1', op: 'update', id: story.id, payload: { title: 'Changed Title', priority: 'High' } },
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

      // Verify the changes array contains the actual field changes
      const titleChange = result.would_update?.[0].changes.find(c => c.field === 'title');
      expect(titleChange).toBeDefined();
      expect(titleChange?.before).toBe('Dry Run Test');
      expect(titleChange?.after).toBe('Changed Title');

      const priorityChange = result.would_update?.[0].changes.find(c => c.field === 'priority');
      expect(priorityChange).toBeDefined();
      expect(priorityChange?.before).toBe('Medium');
      expect(priorityChange?.after).toBe('High');

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

    it('should return changes array with update_entity', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create milestone first (parent for story)
      const milestone = await createEntity({
        type: 'milestone',
        data: { title: 'Changes Test Milestone', workstream: 'core' },
      }, deps);

      // Create a story with parent
      const story = await createEntity({
        type: 'story',
        data: {
          title: 'Changes Test Story',
          workstream: 'core',
          status: 'Not Started',
          priority: 'Medium',
          parent: milestone.id,
        },
      }, deps);

      // Update the story
      const result = await updateEntity({
        id: story.id,
        data: { title: 'Updated Title', priority: 'High' },
      }, deps);

      // Should have changes array
      expect(result.changes).toBeDefined();
      expect(result.changes!.length).toBeGreaterThan(0);

      // Find title change
      const titleChange = result.changes!.find(c => c.field === 'title');
      expect(titleChange).toBeDefined();
      expect(titleChange!.before).toBe('Changes Test Story');
      expect(titleChange!.after).toBe('Updated Title');

      // Find priority change
      const priorityChange = result.changes!.find(c => c.field === 'priority');
      expect(priorityChange).toBeDefined();
      expect(priorityChange!.before).toBe('Medium');
      expect(priorityChange!.after).toBe('High');
    });

    it('should not duplicate dataview blocks on feature update', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create a feature
      const feature = await createEntity({
        type: 'feature',
        data: {
          title: 'Dataview Test Feature',
          workstream: 'core',
          status: 'Planned',
          tier: 'OSS',
          phase: 'MVP',
          user_story: 'As a user, I want to test dataview blocks',
        },
      }, deps);

      // Update the feature multiple times
      await updateEntity({
        id: feature.id,
        data: { tier: 'Premium' },
      }, deps);

      await updateEntity({
        id: feature.id,
        data: { phase: 'GA' },
      }, deps);

      // Get the entity content
      const entity = await deps.getEntity(feature.id);
      expect(entity).toBeDefined();

      // Check that dataview blocks are not duplicated
      // The content should have at most one instance of each dataview section
      const content = (entity as any).content || '';
      const implementedByMatches = content.match(/## 🔗 Implemented By/g);
      expect(implementedByMatches?.length || 0).toBeLessThanOrEqual(1);
    });
  });

  // ===========================================================================
  // Scenario 16: V2 Unified Entity Tool
  // ===========================================================================
  describe('Scenario 16: V2 Unified Entity Tool', () => {
    it('should create entity with flat schema', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create milestone using unified entity tool with flat schema
      const result = await handleEntity({
        action: 'create',
        type: 'milestone',
        title: 'V2 Test Milestone',
        workstream: 'engineering',
        priority: 'High',
        target_date: '2024-06-01',
      }, deps);

      expect(result).toBeDefined();
      expect('id' in result).toBe(true);
      expect((result as any).id).toMatch(/^M-\d+$/);
      expect((result as any).dependencies_created).toBe(0);
    });

    it('should create entity with minimal response by default', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create without return_full - should NOT include entity
      const result = await handleEntity({
        action: 'create',
        type: 'milestone',
        title: 'Minimal Response Test',
        workstream: 'engineering',
      }, deps);

      expect(result).toBeDefined();
      expect('id' in result).toBe(true);
      // By default, entity should not be included
      expect((result as any).entity).toBeUndefined();
    });

    it('should create entity with full response when return_full=true', async () => {
      const deps = runtime.getEntityManagementDeps();

      const result = await handleEntity({
        action: 'create',
        type: 'milestone',
        title: 'Full Response Test',
        workstream: 'engineering',
        return_full: true,
      }, deps);

      expect(result).toBeDefined();
      expect('id' in result).toBe(true);
      expect((result as any).entity).toBeDefined();
      expect((result as any).entity.title).toBe('Full Response Test');
    });

    it('should update entity with flat schema', async () => {
      const deps = runtime.getEntityManagementDeps();

      // First create a milestone
      const createResult = await handleEntity({
        action: 'create',
        type: 'milestone',
        title: 'Update Test Milestone',
        workstream: 'engineering',
      }, deps);

      const id = (createResult as any).id;

      // Update using unified entity tool
      const updateResult = await handleEntity({
        action: 'update',
        id,
        title: 'Updated Milestone Title',
        priority: 'Critical',
      }, deps);

      expect(updateResult).toBeDefined();
      expect((updateResult as any).id).toBe(id);
      expect((updateResult as any).status).toBe('ok');
      expect((updateResult as any).changes).toBeDefined();
      expect((updateResult as any).changes.length).toBeGreaterThan(0);
    });

    it('should archive entity via update action', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create a milestone
      const createResult = await handleEntity({
        action: 'create',
        type: 'milestone',
        title: 'Archive Test Milestone',
        workstream: 'engineering',
      }, deps);

      const id = (createResult as any).id;

      // Archive using unified entity tool
      const archiveResult = await handleEntity({
        action: 'update',
        id,
        archived: true,
      }, deps);

      expect(archiveResult).toBeDefined();
      expect((archiveResult as any).id).toBe(id);
      expect((archiveResult as any).archive_result).toBeDefined();
      expect((archiveResult as any).archive_result.archived).toBe(true);
    });

    it('should validate required fields for create', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Missing type
      await expect(handleEntity({
        action: 'create',
        title: 'No Type',
        workstream: 'engineering',
      } as any, deps)).rejects.toThrow(/type is required/);

      // Missing title
      await expect(handleEntity({
        action: 'create',
        type: 'milestone',
        workstream: 'engineering',
      }, deps)).rejects.toThrow(/title is required/);

      // Missing workstream
      await expect(handleEntity({
        action: 'create',
        type: 'milestone',
        title: 'No Workstream',
      }, deps)).rejects.toThrow(/workstream is required/);
    });

    it('should validate required id for update', async () => {
      const deps = runtime.getEntityManagementDeps();

      await expect(handleEntity({
        action: 'update',
        title: 'No ID',
      } as any, deps)).rejects.toThrow(/id is required/);
    });

    it('should create story with parent relationship', async () => {
      const deps = runtime.getEntityManagementDeps();

      // Create milestone first
      const milestoneResult = await handleEntity({
        action: 'create',
        type: 'milestone',
        title: 'Parent Milestone',
        workstream: 'engineering',
      }, deps);

      const milestoneId = (milestoneResult as any).id;

      // Create story with parent
      const storyResult = await handleEntity({
        action: 'create',
        type: 'story',
        title: 'Child Story',
        workstream: 'engineering',
        parent: milestoneId,
        outcome: 'Test outcome',
      }, deps);

      expect(storyResult).toBeDefined();
      expect((storyResult as any).id).toMatch(/^S-\d+$/);
    });

    it('should reject orphaned story (no parent)', async () => {
      const deps = runtime.getEntityManagementDeps();

      await expect(handleEntity({
        action: 'create',
        type: 'story',
        title: 'Orphan Story',
        workstream: 'engineering',
      }, deps)).rejects.toThrow(/orphaned/i);
    });
  });

  // ===========================================================================
  // Scenario 17: V2 Unified Entities Tool (bulk operations)
  // ===========================================================================
  describe('Scenario 17: V2 Unified Entities Tool', () => {
    it('should fetch multiple entities with get action', async () => {
      const entityDeps = runtime.getEntityManagementDeps();
      const entitiesDeps = runtime.getEntitiesDeps();

      // Create some entities first
      const m1 = await handleEntity({
        action: 'create',
        type: 'milestone',
        title: 'Entities Test M1',
        workstream: 'engineering',
      }, entityDeps);

      const m2 = await handleEntity({
        action: 'create',
        type: 'milestone',
        title: 'Entities Test M2',
        workstream: 'engineering',
      }, entityDeps);

      // Fetch both using entities tool
      const { handleEntities } = await import('./tools/batch-operations-tools.js');
      const result = await handleEntities({
        action: 'get',
        ids: [(m1 as any).id, (m2 as any).id],
      }, entitiesDeps);

      expect(result).toBeDefined();
      expect((result as any).count).toBe(2);
      expect((result as any).entities).toHaveLength(2);
    });

    it('should return not_found for missing entities', async () => {
      const entitiesDeps = runtime.getEntitiesDeps();
      const { handleEntities } = await import('./tools/batch-operations-tools.js');

      const result = await handleEntities({
        action: 'get',
        ids: ['M-999', 'S-999'] as any,
      }, entitiesDeps);

      expect(result).toBeDefined();
      expect((result as any).count).toBe(0);
      expect((result as any).not_found).toContain('M-999');
      expect((result as any).not_found).toContain('S-999');
    });

    it('should filter fields in get action', async () => {
      const entityDeps = runtime.getEntityManagementDeps();
      const entitiesDeps = runtime.getEntitiesDeps();

      // Create entity
      const m1 = await handleEntity({
        action: 'create',
        type: 'milestone',
        title: 'Fields Test Milestone',
        workstream: 'engineering',
      }, entityDeps);

      const { handleEntities } = await import('./tools/batch-operations-tools.js');
      const result = await handleEntities({
        action: 'get',
        ids: [(m1 as any).id],
        fields: ['id', 'title'],
      }, entitiesDeps);

      expect(result).toBeDefined();
      const entity = (result as any).entities[0];
      expect(entity.id).toBe((m1 as any).id);
      expect(entity.title).toBe('Fields Test Milestone');
      // Should not have other fields
      expect(entity.workstream).toBeUndefined();
    });

    it('should perform batch operations', async () => {
      const entitiesDeps = runtime.getEntitiesDeps();
      const { handleEntities } = await import('./tools/batch-operations-tools.js');

      // Create multiple entities in batch
      const result = await handleEntities({
        action: 'batch',
        ops: [
          {
            client_id: 'batch-m1',
            op: 'create',
            type: 'milestone',
            payload: {
              title: 'Batch Milestone 1',
              workstream: 'engineering',
            },
          },
          {
            client_id: 'batch-m2',
            op: 'create',
            type: 'milestone',
            payload: {
              title: 'Batch Milestone 2',
              workstream: 'engineering',
            },
          },
        ],
      }, entitiesDeps);

      expect(result).toBeDefined();
      expect((result as any).summary.total).toBe(2);
      expect((result as any).summary.succeeded).toBe(2);
      expect((result as any).summary.failed).toBe(0);
    });

    it('should validate required fields for get action', async () => {
      const entitiesDeps = runtime.getEntitiesDeps();
      const { handleEntities } = await import('./tools/batch-operations-tools.js');

      await expect(handleEntities({
        action: 'get',
        // Missing ids
      } as any, entitiesDeps)).rejects.toThrow(/ids is required/);
    });

    it('should validate required fields for batch action', async () => {
      const entitiesDeps = runtime.getEntitiesDeps();
      const { handleEntities } = await import('./tools/batch-operations-tools.js');

      await expect(handleEntities({
        action: 'batch',
        // Missing ops
      } as any, entitiesDeps)).rejects.toThrow(/ops is required/);
    });
  });

  // ===========================================================================
  // Scenario 18: Content Mode for Entity Get
  // ===========================================================================
  describe('Scenario 18: Content Mode for Entity Get', () => {
    it('should return no content with content_mode=none (default)', async () => {
      const deps = runtime.getSearchNavigationDeps();
      const { getEntity } = await import('./tools/search-navigation-tools.js');

      // Create a document with content
      const entityDeps = runtime.getEntityManagementDeps();
      const createResult = await handleEntity({
        action: 'create',
        type: 'document',
        title: 'Content Mode Test Doc',
        workstream: 'engineering',
        content: 'This is the full document content with authentication details.',
      }, entityDeps);

      const id = (createResult as any).id;

      // Get with default content_mode (none)
      const result = await getEntity({ id }, deps);

      expect(result).toBeDefined();
      expect(result.id).toBe(id);
      expect(result.content).toBeUndefined();
    });

    it('should return full content with content_mode=full', async () => {
      const deps = runtime.getSearchNavigationDeps();
      const { getEntity } = await import('./tools/search-navigation-tools.js');

      // Create a document with content
      const entityDeps = runtime.getEntityManagementDeps();
      const createResult = await handleEntity({
        action: 'create',
        type: 'document',
        title: 'Full Content Test Doc',
        workstream: 'engineering',
        content: 'This is the full document content.',
      }, entityDeps);

      const id = (createResult as any).id;

      // Get with content_mode=full
      const result = await getEntity({ id, content_mode: 'full' }, deps);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content).toContain('full document content');
    });

    it('should return semantic excerpt with content_mode=semantic', async () => {
      const deps = runtime.getSearchNavigationDeps();
      const { getEntity } = await import('./tools/search-navigation-tools.js');

      // Create a document with multiple paragraphs
      const entityDeps = runtime.getEntityManagementDeps();
      const createResult = await handleEntity({
        action: 'create',
        type: 'document',
        title: 'Semantic Content Test Doc',
        workstream: 'engineering',
        content: `# Introduction

This document covers various topics.

## Authentication

The authentication system uses OAuth2 for secure login.
Users can authenticate using their credentials.

## Database

The database uses PostgreSQL for data storage.
All data is encrypted at rest.

## Conclusion

This concludes the document.`,
      }, entityDeps);

      const id = (createResult as any).id;

      // Get with content_mode=semantic and query
      const result = await getEntity({
        id,
        content_mode: 'semantic',
        query: 'authentication OAuth2',
      }, deps);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      // Should contain authentication-related content
      expect(result.content!.toLowerCase()).toContain('authentication');
      // Should NOT contain unrelated content (or at least prioritize auth content)
      // The semantic extraction should return relevant paragraphs
    });

    it('should throw error when content_mode=semantic without query', async () => {
      const deps = runtime.getSearchNavigationDeps();
      const { getEntity } = await import('./tools/search-navigation-tools.js');

      // Create a document
      const entityDeps = runtime.getEntityManagementDeps();
      const createResult = await handleEntity({
        action: 'create',
        type: 'document',
        title: 'Error Test Doc',
        workstream: 'engineering',
      }, entityDeps);

      const id = (createResult as any).id;

      // Get with content_mode=semantic but no query
      await expect(getEntity({
        id,
        content_mode: 'semantic',
        // Missing query
      }, deps)).rejects.toThrow(/query.*required/i);
    });

    it('should work with entity tool get action', async () => {
      const entityDeps = runtime.getEntityManagementDeps();
      const searchDeps = runtime.getSearchNavigationDeps();
      const { getEntity } = await import('./tools/search-navigation-tools.js');

      // Create a document
      const createResult = await handleEntity({
        action: 'create',
        type: 'document',
        title: 'Entity Tool Content Mode Test',
        workstream: 'engineering',
        content: 'Document about API design patterns.',
      }, entityDeps);

      const id = (createResult as any).id;

      // Get via entity tool (which routes to getEntity)
      const result = await getEntity({
        id,
        content_mode: 'full',
      }, searchDeps);

      expect(result).toBeDefined();
      expect(result.content).toContain('API design patterns');
    });
  });

  // ===========================================================================
  // Scenario 19: read_docs outline_only and search modes
  // ===========================================================================
  describe('Scenario 19: read_docs outline_only and search modes', () => {
    let docsConfig: V2Config;
    let docsDir: string;

    beforeEach(async () => {
      // Create a docs workspace directory
      docsDir = path.join(tempDir, 'docs');
      await fs.mkdir(docsDir, { recursive: true });

      // Create config with docs workspace
      docsConfig = {
        ...config,
        workspaces: {
          docs: {
            path: docsDir,
            description: 'Documentation workspace',
          },
        },
      };
    });

    it('should return only outline when outline_only=true', async () => {
      const { handleReadDocs } = await import('./tools/read-docs.js');
      const { handleUpdateDoc } = await import('./tools/update-doc.js');

      // Create a test document with headings
      await handleUpdateDoc(docsConfig, {
        workspace: 'docs',
        name: 'outline-test',
        operation: 'create',
        content: `# Main Title

Introduction paragraph.

## Section One

Content for section one.

### Subsection 1.1

More content here.

## Section Two

Content for section two.

# Another Main Section

Final content.`,
      });

      // Read with outline_only
      const result = await handleReadDocs(docsConfig, {
        workspace: 'docs',
        doc_name: 'outline-test',
        outline_only: true,
      });

      expect(result).toBeDefined();
      expect(result.content).toBe(''); // No content in outline mode
      expect(result.outline).toBeDefined();
      expect(result.outline!.length).toBe(5); // 5 headings
      expect(result.outline![0]).toEqual({ level: 1, text: 'Main Title', line: 0 });
      expect(result.outline![1]).toEqual({ level: 2, text: 'Section One', line: 4 });
      expect(result.outline![2]).toEqual({ level: 3, text: 'Subsection 1.1', line: 8 });
      expect(result.outline![3]).toEqual({ level: 2, text: 'Section Two', line: 12 });
      expect(result.outline![4]).toEqual({ level: 1, text: 'Another Main Section', line: 16 });
    });

    it('should return matching sections when search is provided', async () => {
      const { handleReadDocs } = await import('./tools/read-docs.js');
      const { handleUpdateDoc } = await import('./tools/update-doc.js');

      // Create a test document with multiple sections
      await handleUpdateDoc(docsConfig, {
        workspace: 'docs',
        name: 'search-test',
        operation: 'create',
        content: `# API Documentation

This document covers the API.

## Authentication

The authentication system uses OAuth2 for secure login.
Users must authenticate before accessing protected endpoints.

## Database

The database uses PostgreSQL for data storage.
All data is encrypted at rest.

## Authorization

After authentication, users are authorized based on roles.
Authorization checks happen on every request.

## Logging

All requests are logged for debugging.`,
      });

      // Search for authentication-related content
      const result = await handleReadDocs(docsConfig, {
        workspace: 'docs',
        doc_name: 'search-test',
        search: 'authentication OAuth2',
      });

      expect(result).toBeDefined();
      expect(result.search_info).toBeDefined();
      expect(result.search_info!.query).toBe('authentication OAuth2');
      expect(result.search_info!.matches).toBeGreaterThan(0);
      expect(result.search_info!.sections_returned).toBeGreaterThan(0);
      // Content should contain authentication-related sections
      expect(result.content.toLowerCase()).toContain('authentication');
      expect(result.content.toLowerCase()).toContain('oauth2');
      // Should include outline for context
      expect(result.outline).toBeDefined();
    });

    it('should return empty content when search has no matches', async () => {
      const { handleReadDocs } = await import('./tools/read-docs.js');
      const { handleUpdateDoc } = await import('./tools/update-doc.js');

      await handleUpdateDoc(docsConfig, {
        workspace: 'docs',
        name: 'no-match-test',
        operation: 'create',
        content: `# Simple Document

Just some basic content here.`,
      });

      const result = await handleReadDocs(docsConfig, {
        workspace: 'docs',
        doc_name: 'no-match-test',
        search: 'xyznonexistent123',
      });

      expect(result).toBeDefined();
      expect(result.content).toBe('');
      expect(result.search_info!.matches).toBe(0);
      expect(result.search_info!.sections_returned).toBe(0);
    });

    it('should still support default pagination mode', async () => {
      const { handleReadDocs } = await import('./tools/read-docs.js');
      const { handleUpdateDoc } = await import('./tools/update-doc.js');

      await handleUpdateDoc(docsConfig, {
        workspace: 'docs',
        name: 'pagination-test',
        operation: 'create',
        content: `# Document

Line 1
Line 2
Line 3`,
      });

      const result = await handleReadDocs(docsConfig, {
        workspace: 'docs',
        doc_name: 'pagination-test',
      });

      expect(result).toBeDefined();
      expect(result.content).toContain('# Document');
      expect(result.content).toContain('Line 1');
      expect(result.line_count).toBe(5);
    });
  });

});

