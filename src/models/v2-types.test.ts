/**
 * Tests for V2 Entity Types
 */

import { describe, it, expect } from 'vitest';
import {
  type EntityType,
  type MilestoneStatus,
  type StoryStatus,
  type TaskStatus,
  type DecisionStatus,
  type DocumentStatus,
  type EntityId,
  type MilestoneId,
  type StoryId,
  type Milestone,
  type Story,
  type Task,
  type Decision,
  type Document,
  type Entity,
  type EntityMetadata,
  isEntityType,
  isMilestoneId,
  isStoryId,
  isTaskId,
  isDecisionId,
  isDocumentId,
  getEntityTypeFromId,
} from './v2-types.js';

describe('v2-types', () => {
  describe('isEntityType', () => {
    it('should return true for valid entity types', () => {
      expect(isEntityType('milestone')).toBe(true);
      expect(isEntityType('story')).toBe(true);
      expect(isEntityType('task')).toBe(true);
      expect(isEntityType('decision')).toBe(true);
      expect(isEntityType('document')).toBe(true);
    });

    it('should return false for invalid entity types', () => {
      expect(isEntityType('invalid')).toBe(false);
      expect(isEntityType('')).toBe(false);
      expect(isEntityType('accomplishment')).toBe(false);
    });
  });

  describe('ID type guards', () => {
    describe('isMilestoneId', () => {
      it('should return true for valid milestone IDs', () => {
        expect(isMilestoneId('M-001')).toBe(true);
        expect(isMilestoneId('M-999')).toBe(true);
        expect(isMilestoneId('M-12345')).toBe(true);
      });

      it('should return false for invalid milestone IDs', () => {
        expect(isMilestoneId('S-001')).toBe(false);
        expect(isMilestoneId('M001')).toBe(false);
        expect(isMilestoneId('m-001')).toBe(false);
        expect(isMilestoneId('')).toBe(false);
      });
    });

    describe('isStoryId', () => {
      it('should return true for valid story IDs', () => {
        expect(isStoryId('S-001')).toBe(true);
        expect(isStoryId('S-999')).toBe(true);
      });

      it('should return false for invalid story IDs', () => {
        expect(isStoryId('M-001')).toBe(false);
        expect(isStoryId('s-001')).toBe(false);
      });
    });

    describe('isTaskId', () => {
      it('should return true for valid task IDs', () => {
        expect(isTaskId('T-001')).toBe(true);
        expect(isTaskId('T-999')).toBe(true);
      });

      it('should return false for invalid task IDs', () => {
        expect(isTaskId('M-001')).toBe(false);
        expect(isTaskId('t-001')).toBe(false);
      });
    });

    describe('isDecisionId', () => {
      it('should return true for valid decision IDs', () => {
        expect(isDecisionId('DEC-001')).toBe(true);
        expect(isDecisionId('DEC-999')).toBe(true);
      });

      it('should return false for invalid decision IDs', () => {
        expect(isDecisionId('M-001')).toBe(false);
        expect(isDecisionId('dec-001')).toBe(false);
      });
    });

    describe('isDocumentId', () => {
      it('should return true for valid document IDs', () => {
        expect(isDocumentId('DOC-001')).toBe(true);
        expect(isDocumentId('DOC-999')).toBe(true);
      });

      it('should return false for invalid document IDs', () => {
        expect(isDocumentId('M-001')).toBe(false);
        expect(isDocumentId('doc-001')).toBe(false);
      });
    });
  });

  describe('getEntityTypeFromId', () => {
    it('should return correct entity type for valid IDs', () => {
      expect(getEntityTypeFromId('M-001')).toBe('milestone');
      expect(getEntityTypeFromId('S-001')).toBe('story');
      expect(getEntityTypeFromId('T-001')).toBe('task');
      expect(getEntityTypeFromId('DEC-001')).toBe('decision');
      expect(getEntityTypeFromId('DOC-001')).toBe('document');
    });

    it('should return null for invalid IDs', () => {
      expect(getEntityTypeFromId('invalid')).toBeNull();
      expect(getEntityTypeFromId('ACC-001')).toBeNull();
      expect(getEntityTypeFromId('')).toBeNull();
    });
  });

  describe('Entity interfaces', () => {
    it('should allow creating valid Milestone objects', () => {
      const milestone: Milestone = {
        id: 'M-001' as MilestoneId,
        type: 'milestone',
        title: 'Q1 Release',
        workstream: 'engineering',
        status: 'In Progress',
        archived: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-15',
        vault_path: '/milestones/M-001.md',
        canvas_source: '/canvas.canvas',
        cssclasses: [],
        target_date: '2024-03-31',
        priority: 'High',
        depends_on: [],
      };
      expect(milestone.type).toBe('milestone');
      expect(milestone.status).toBe('In Progress');
    });

    it('should allow creating valid Story objects', () => {
      const story: Story = {
        id: 'S-001' as StoryId,
        type: 'story',
        title: 'User Authentication',
        workstream: 'engineering',
        status: 'In Progress',
        archived: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-15',
        vault_path: '/stories/S-001.md',
        canvas_source: '/canvas.canvas',
        cssclasses: [],
        parent: 'M-001' as MilestoneId,
        priority: 'Medium',
        depends_on: [],
      };
      expect(story.type).toBe('story');
      expect(story.parent).toBe('M-001');
    });
  });
});

