/**
 * Tests for V2 Entity Parser
 */

import { describe, it, expect } from 'vitest';
import { EntityParser } from './entity-parser.js';
import type { VaultPath, Milestone, Story, Task, Decision, Document } from '../../models/v2-types.js';
import { ValidationError } from '../../models/v2-types.js';

describe('EntityParser', () => {
  const parser = new EntityParser();

  describe('Frontmatter Extraction', () => {
    it('should parse basic frontmatter', () => {
      const content = `---
id: M-001
title: Test Milestone
workstream: engineering
status: In Progress
---
# Content here`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      expect(result.entity.id).toBe('M-001');
      expect(result.entity.title).toBe('Test Milestone');
      expect(result.entity.workstream).toBe('engineering');
    });

    it('should extract ID from filename when not in frontmatter', () => {
      const content = `---
title: Test
workstream: engineering
status: In Progress
---
# Just content`;
      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      expect(result.entity.id).toBe('M-001');
    });

    it('should parse arrays in frontmatter', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
depends_on:
  - M-002
  - M-003
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;
      expect(milestone.depends_on).toEqual(['M-002', 'M-003']);
    });

    it('should handle content without frontmatter', () => {
      const content = `# Just a title

Some content without frontmatter`;
      // Should throw because no ID can be extracted
      expect(() => parser.parse(content, '/vault/random.md' as VaultPath)).toThrow(ValidationError);
    });

    it('should handle empty frontmatter arrays', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
depends_on: []
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;
      expect(milestone.depends_on).toEqual([]);
    });

    it('should skip comments in frontmatter', () => {
      const content = `---
id: M-001
# This is a comment
title: Test
workstream: engineering
status: In Progress
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      expect(result.entity.title).toBe('Test');
    });

    it('should parse inline arrays', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
depends_on: [M-002, M-003]
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;
      expect(milestone.depends_on).toEqual(['M-002', 'M-003']);
    });

    it('should parse quoted values', () => {
      const content = `---
id: M-001
title: "Test with quotes"
workstream: 'engineering'
status: In Progress
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      expect(result.entity.title).toBe('Test with quotes');
      expect(result.entity.workstream).toBe('engineering');
    });

    it('should parse boolean values', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
archived: true
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      expect(result.entity.archived).toBe(true);
    });

    it('should parse null values', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
owner: null
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;
      expect(milestone.owner).toBeNull();
    });

    it('should parse tilde as null', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
owner: ~
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;
      expect(milestone.owner).toBeNull();
    });

    it('should parse numeric values', () => {
      const content = `---
id: T-001
title: Test Task
workstream: engineering
status: In Progress
parent: S-001
goal: Test goal
estimate_hrs: 4.5
actual_hrs: 2
---
Content`;

      const result = parser.parse(content, '/vault/T-001.md' as VaultPath);
      const task = result.entity as Task;
      expect(task.estimate_hrs).toBe(4.5);
      expect(task.actual_hrs).toBe(2);
    });

    it('should handle corrupted inline arrays with valid IDs', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
depends_on: [M-002, invalid, M-003]
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;
      // Should extract only valid IDs
      expect(milestone.depends_on).toEqual(['M-002', 'M-003']);
    });

    it('should extract valid IDs from corrupted elements', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
depends_on: [corruptedM-002text, M-003]
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;
      // Should extract M-002 from corrupted element
      expect(milestone.depends_on).toContain('M-002');
      expect(milestone.depends_on).toContain('M-003');
    });

    it('should remove duplicate IDs from arrays', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
depends_on: [M-002, M-002, M-003]
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;
      expect(milestone.depends_on).toEqual(['M-002', 'M-003']);
    });
  });

  describe('Milestone Parsing', () => {
    it('should parse a complete milestone', () => {
      const content = `---
id: M-001
title: Q1 Release
workstream: engineering
status: In Progress
archived: false
created: 2024-01-01
modified: 2024-01-15
target_date: 2024-03-31
owner: john
priority: High
canvas_source: /vault/canvas.canvas
---
# Q1 Release

This is the milestone content.`;

      const result = parser.parse(content, '/vault/milestones/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;

      expect(milestone.type).toBe('milestone');
      expect(milestone.id).toBe('M-001');
      expect(milestone.title).toBe('Q1 Release');
      expect(milestone.target_date).toBe('2024-03-31');
      expect(milestone.owner).toBe('john');
      expect(milestone.priority).toBe('High');
    });
  });

  describe('Story Parsing', () => {
    it('should parse a complete story', () => {
      const content = `---
id: S-001
title: User Authentication
workstream: engineering
status: In Progress
parent: M-001
effort: Engineering
priority: High
---
# User Authentication

Story content here.`;

      const result = parser.parse(content, '/vault/stories/S-001.md' as VaultPath);
      const story = result.entity as Story;

      expect(story.type).toBe('story');
      expect(story.id).toBe('S-001');
      expect(story.parent).toBe('M-001');
      expect(story.effort).toBe('Engineering');
      expect(story.priority).toBe('High');
    });
  });

  describe('Task Parsing', () => {
    it('should parse a complete task', () => {
      const content = `---
id: T-001
title: Implement login form
workstream: engineering
status: In Progress
parent: S-001
goal: Create the login form UI
estimate_hrs: 4
actual_hrs: 2
assignee: jane
---
# Implement login form

Task details.`;

      const result = parser.parse(content, '/vault/tasks/T-001.md' as VaultPath);
      const task = result.entity as Task;

      expect(task.type).toBe('task');
      expect(task.id).toBe('T-001');
      expect(task.parent).toBe('S-001');
      expect(task.goal).toBe('Create the login form UI');
      expect(task.estimate_hrs).toBe(4);
      expect(task.actual_hrs).toBe(2);
      expect(task.assignee).toBe('jane');
    });
  });

  describe('Decision Parsing', () => {
    it('should parse a complete decision', () => {
      const content = `---
id: DEC-001
title: Use React for frontend
workstream: engineering
status: Decided
context: Need to choose a frontend framework
decision: Use React
rationale: Team expertise and ecosystem
decided_by: tech-lead
decided_on: 2024-01-10
---
# Use React for frontend

Decision details.`;

      const result = parser.parse(content, '/vault/decisions/DEC-001.md' as VaultPath);
      const decision = result.entity as Decision;

      expect(decision.type).toBe('decision');
      expect(decision.id).toBe('DEC-001');
      expect(decision.context).toBe('Need to choose a frontend framework');
      expect(decision.decision).toBe('Use React');
      expect(decision.decided_by).toBe('tech-lead');
    });

    it('should parse decision with supersedes field', () => {
      const content = `---
id: DEC-002
title: Switch to Vue
workstream: engineering
status: Decided
supersedes: DEC-001
---
# Switch to Vue`;

      const result = parser.parse(content, '/vault/decisions/DEC-002.md' as VaultPath);
      const decision = result.entity as Decision;

      expect(decision.supersedes).toBe('DEC-001');
    });

    it('should parse decision with enables array', () => {
      const content = `---
id: DEC-001
title: Use React
workstream: engineering
status: Decided
enables:
  - DOC-001
  - S-001
---
# Use React`;

      const result = parser.parse(content, '/vault/decisions/DEC-001.md' as VaultPath);
      const decision = result.entity as Decision;

      expect(decision.enables).toEqual(['DOC-001', 'S-001']);
    });
  });

  describe('Document Parsing', () => {
    it('should parse a complete document', () => {
      const content = `---
id: DOC-001
title: API Specification
workstream: engineering
status: Draft
doc_type: spec
version: 1.0.0
---
# API Specification

## Overview
This document describes the API.

## Endpoints
- GET /users
- POST /users`;

      const result = parser.parse(content, '/vault/documents/DOC-001.md' as VaultPath);
      const doc = result.entity as Document;

      expect(doc.type).toBe('document');
      expect(doc.id).toBe('DOC-001');
      expect(doc.doc_type).toBe('spec');
      expect(doc.version).toBe('1.0.0');
    });

    it('should parse document with previous_versions array', () => {
      const content = `---
id: DOC-003
title: API Spec v3
workstream: engineering
status: Draft
doc_type: spec
previous_versions:
  - DOC-001
  - DOC-002
---
# API Spec v3`;

      const result = parser.parse(content, '/vault/documents/DOC-003.md' as VaultPath);
      const doc = result.entity as Document;

      expect(doc.previous_versions).toEqual(['DOC-001', 'DOC-002']);
    });

    it('should parse document with implemented_by array', () => {
      const content = `---
id: DOC-001
title: API Spec
workstream: engineering
status: Draft
doc_type: spec
implemented_by:
  - S-001
  - T-001
---
# API Spec`;

      const result = parser.parse(content, '/vault/documents/DOC-001.md' as VaultPath);
      const doc = result.entity as Document;

      expect(doc.implemented_by).toEqual(['S-001', 'T-001']);
    });

    it('should parse document with version field', () => {
      const content = `---
id: DOC-001
title: API Spec
workstream: engineering
status: Draft
doc_type: spec
version: "2.0.0"
---
# API Spec`;

      const result = parser.parse(content, '/vault/documents/DOC-001.md' as VaultPath);
      const doc = result.entity as Document;

      expect(doc.version).toBe('2.0.0');
    });
  });

  describe('Error Handling', () => {
    it('should throw ValidationError for missing ID', () => {
      const content = `---
title: Test
workstream: engineering
status: In Progress
---
Content`;

      expect(() => parser.parse(content, '/vault/random.md' as VaultPath)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid ID format', () => {
      const content = `---
id: INVALID-001
title: Test
workstream: engineering
status: In Progress
---
Content`;

      expect(() => parser.parse(content, '/vault/INVALID-001.md' as VaultPath)).toThrow(ValidationError);
    });

    it('should throw ValidationError for unknown entity type', () => {
      const content = `---
id: X-001
title: Test
workstream: engineering
status: In Progress
---
Content`;

      expect(() => parser.parse(content, '/vault/X-001.md' as VaultPath)).toThrow(ValidationError);
    });

    it('should handle malformed frontmatter gracefully', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
malformed: [unclosed bracket
---
Content`;

      // Should still parse the valid fields
      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      expect(result.entity.id).toBe('M-001');
    });

    it('should handle empty content', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
---`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      expect(result.entity.id).toBe('M-001');
    });
  });

  describe('Section Extraction', () => {
    it('should extract sections from content', () => {
      const content = `---
id: T-001
title: Test Task
workstream: engineering
status: In Progress
parent: S-001
goal: Test goal
---
# Test Task

## Description
This is the description section.

## Technical Notes
These are technical notes.

## Notes
General notes here.`;

      const result = parser.parse(content, '/vault/T-001.md' as VaultPath);
      const task = result.entity as Task;

      expect(task.description).toBe('This is the description section.');
      expect(task.technical_notes).toBe('These are technical notes.');
      expect(task.notes).toBe('General notes here.');
    });

    it('should handle sections with multiple paragraphs', () => {
      const content = `---
id: T-001
title: Test Task
workstream: engineering
status: In Progress
parent: S-001
goal: Test goal
---
# Test Task

## Description
First paragraph.

Second paragraph.

## Notes
Notes here.`;

      const result = parser.parse(content, '/vault/T-001.md' as VaultPath);
      const task = result.entity as Task;

      expect(task.description).toContain('First paragraph.');
      expect(task.description).toContain('Second paragraph.');
    });

    it('should extract objective from body content before sections for milestones', () => {
      // The parser extracts body content BEFORE any section headers as the objective
      // (not the content of an ## Objective section)
      const content = `---
id: M-001
title: Q1 Release
workstream: engineering
status: In Progress
---
Deliver the Q1 release with all planned features.

## Details
Some additional details here.`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;

      expect(milestone.objective).toBe('Deliver the Q1 release with all planned features.');
    });

    it('should extract outcome section for stories', () => {
      const content = `---
id: S-001
title: User Auth
workstream: engineering
status: In Progress
parent: M-001
---
# User Auth

## Outcome
Users can securely log in and out.`;

      const result = parser.parse(content, '/vault/S-001.md' as VaultPath);
      const story = result.entity as Story;

      expect(story.outcome).toBe('Users can securely log in and out.');
    });

    it('should store entire body as content for documents', () => {
      // The parser stores the entire body (after frontmatter) as content
      const content = `---
id: DOC-001
title: API Spec
workstream: engineering
status: Draft
doc_type: spec
---
# API Spec

This is the main content of the document.`;

      const result = parser.parse(content, '/vault/DOC-001.md' as VaultPath);
      const doc = result.entity as Document;

      expect(doc.content).toBe('# API Spec\n\nThis is the main content of the document.');
    });
  });

  describe('ID Extraction from Filename', () => {
    it('should extract milestone ID from filename', () => {
      const content = `---
title: Test
workstream: engineering
status: In Progress
---
Content`;

      const result = parser.parse(content, '/vault/milestones/M-001 Test.md' as VaultPath);
      expect(result.entity.id).toBe('M-001');
    });

    it('should extract story ID from filename', () => {
      const content = `---
title: Test
workstream: engineering
status: In Progress
parent: M-001
---
Content`;

      const result = parser.parse(content, '/vault/stories/S-001 Test.md' as VaultPath);
      expect(result.entity.id).toBe('S-001');
    });

    it('should extract task ID from filename', () => {
      const content = `---
title: Test
workstream: engineering
status: In Progress
parent: S-001
goal: Test
---
Content`;

      const result = parser.parse(content, '/vault/tasks/T-001 Test.md' as VaultPath);
      expect(result.entity.id).toBe('T-001');
    });

    it('should extract decision ID from filename', () => {
      const content = `---
title: Test
workstream: engineering
status: Proposed
---
Content`;

      const result = parser.parse(content, '/vault/decisions/DEC-001 Test.md' as VaultPath);
      expect(result.entity.id).toBe('DEC-001');
    });

    it('should extract document ID from filename', () => {
      const content = `---
title: Test
workstream: engineering
status: Draft
doc_type: spec
---
Content`;

      const result = parser.parse(content, '/vault/documents/DOC-001 Test.md' as VaultPath);
      expect(result.entity.id).toBe('DOC-001');
    });
  });

  describe('Array Field Handling', () => {
    it('should handle YAML multi-line arrays', () => {
      const content = `---
id: T-001
title: Test
workstream: engineering
status: In Progress
parent: S-001
goal: Test
depends_on:
  - T-002
  - T-003
  - DEC-001
---
Content`;

      const result = parser.parse(content, '/vault/T-001.md' as VaultPath);
      const task = result.entity as Task;

      expect(task.depends_on).toEqual(['T-002', 'T-003', 'DEC-001']);
    });

    it('should handle empty inline array', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
depends_on: []
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;

      expect(milestone.depends_on).toEqual([]);
    });

    it('should handle inline array with spaces', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
depends_on: [ M-002 , M-003 ]
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;

      expect(milestone.depends_on).toEqual(['M-002', 'M-003']);
    });

    it('should handle inline array with quoted values', () => {
      const content = `---
id: M-001
title: Test
workstream: engineering
status: In Progress
depends_on: ["M-002", 'M-003']
---
Content`;

      const result = parser.parse(content, '/vault/M-001.md' as VaultPath);
      const milestone = result.entity as Milestone;

      expect(milestone.depends_on).toEqual(['M-002', 'M-003']);
    });
  });
});

