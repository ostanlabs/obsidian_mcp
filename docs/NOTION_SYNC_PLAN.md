# Notion Sync Plan: V2 Entity Support

> **Version:** 1.0
> **Date:** January 2026
> **Status:** PLANNED
> **Priority:** Medium
> **Estimated Effort:** 2-3 days

---

## Overview

The Obsidian Plugin currently only syncs entities with `type: accomplishment` to Notion. This plan outlines the work needed to support all V2 entity types (milestone, story, task, decision, document).

---

## Current State

### What Works
- Plugin has a `NotionClient` class that handles Notion API integration
- Syncs notes with `type: accomplishment` frontmatter
- Creates/updates pages in a Notion database
- Syncs dependencies between pages
- Supports archiving pages
- Has polling-based sync and on-demand sync

### What's Missing
- V2 entity types are not recognized by the sync logic
- Notion database schema doesn't have columns for V2-specific fields
- No mapping between V2 entity statuses and Notion properties

---

## Proposed Changes

### Phase 1: Database Schema Update

**Goal:** Update Notion database to support V2 entity types

**New Properties to Add:**
| Property | Type | Purpose |
|----------|------|---------|
| `Entity Type` | Select | milestone, story, task, decision, document |
| `Priority` | Select | Critical, High, Medium, Low |
| `Effort` | Select | Engineering, Business, Marketing, etc. |
| `Target Date` | Date | For milestones |
| `Parent ID` | Text | Reference to parent entity |
| `Workstream` | Select | Engineering, Business, Marketing, etc. |

**Status Mapping:**
| V2 Status | Notion Status |
|-----------|---------------|
| Not Started | Not Started |
| In Progress | In Progress |
| Completed | Done |
| Blocked | Blocked |
| Pending | Pending |
| Decided | Decided |
| Draft | Draft |
| Approved | Approved |
| Superseded | Superseded |

### Phase 2: Sync Logic Update

**Goal:** Update plugin sync logic to handle V2 entities

**Files to Modify:**
1. `obsidian_plugin/notion/notionClient.ts`
   - Update `syncNote()` to handle V2 entity types
   - Add type-specific field mapping
   - Update database schema creation

2. `obsidian_plugin/main.ts`
   - Update sync commands to recognize V2 entities
   - Update frontmatter type checks

**Type Detection Logic:**
```typescript
// Current (only accomplishment)
if (frontmatter.type === 'accomplishment') {
  await this.notionClient.syncNote(frontmatter);
}

// New (all V2 types)
const v2Types = ['milestone', 'story', 'task', 'decision', 'document'];
if (v2Types.includes(frontmatter.type)) {
  await this.notionClient.syncNote(frontmatter);
}
```

### Phase 3: Bidirectional Sync (Optional)

**Goal:** Allow changes in Notion to sync back to Obsidian

**Considerations:**
- Requires Notion webhook or polling
- Conflict resolution strategy needed
- May be out of scope for initial implementation

---

## Implementation Steps

### Step 1: Update NotionClient (1 day)
- [ ] Add V2 entity type support to `createDatabase()`
- [ ] Update `syncNote()` to map V2 fields to Notion properties
- [ ] Add status mapping for all entity types
- [ ] Handle type-specific fields (target_date, acceptance_criteria, etc.)

### Step 2: Update Plugin Commands (0.5 day)
- [ ] Update type checks in sync commands
- [ ] Update UI to show sync status for V2 entities
- [ ] Test sync for each entity type

### Step 3: Migration Support (0.5 day)
- [ ] Create migration script for existing databases
- [ ] Add new properties to existing Notion databases
- [ ] Document migration process

### Step 4: Testing (0.5 day)
- [ ] Test create/update/archive for each entity type
- [ ] Test dependency sync between V2 entities
- [ ] Test with existing accomplishment-type entities

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing sync | Keep backward compatibility with `type: accomplishment` |
| Notion API rate limits | Implement batching and rate limiting |
| Schema migration issues | Provide manual migration instructions |

---

## Success Criteria

- [ ] All V2 entity types can be synced to Notion
- [ ] Existing accomplishment sync continues to work
- [ ] Entity relationships (parent, depends_on) are preserved
- [ ] Status changes sync correctly
- [ ] Archive/restore operations sync to Notion

---

## Dependencies

- Obsidian Plugin codebase (`obsidian_plugin/`)
- Notion API access
- V2 entity schemas (see `ENTITY_SCHEMAS.md`)

---

## Notes

This plan focuses on the Obsidian Plugin, not the MCP server. The MCP server does not directly interact with Notion - all Notion sync is handled by the plugin.

