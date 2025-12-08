# Canvas Structured Items Plugin - Design Document

## Overview

This plugin enables visual project planning in Obsidian by converting canvas text nodes into structured accomplishment items. Each accomplishment is represented as both a canvas node (for visual layout and dependencies) and a markdown file (for detailed content).

## Core Concepts

### Accomplishment
An accomplishment is the atomic unit of work in this system. It represents a deliverable outcome with:
- Structured metadata (frontmatter)
- Rich content (outcome, acceptance criteria, tasks)
- Visual position on canvas
- Dependencies on other accomplishments

### Canvas as Project View
The `.canvas` file serves as the visual project board where:
- Accomplishments are positioned spatially
- Arrows (edges) represent dependencies
- Colors indicate effort levels or in-progress status

### Markdown Files as Source of Truth
Each accomplishment's detailed content lives in a `.md` file with:
- YAML frontmatter for structured properties
- Markdown body for human-readable content

---

## Data Structures

### Canvas File Structure (`.canvas`)

```json
{
  "nodes": [
    {
      "id": "abc123",
      "type": "file",
      "file": "accomplishments/My Accomplishment.md",
      "x": 100,
      "y": 200,
      "width": 400,
      "height": 300,
      "color": "3"
    }
  ],
  "edges": [
    {
      "id": "edge1",
      "fromNode": "abc123",
      "fromSide": "right",
      "toNode": "def456",
      "toSide": "left",
      "label": ""
    }
  ]
}
```

#### Node Properties
| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier within canvas |
| `type` | string | `"file"` for accomplishments |
| `file` | string | Vault-relative path to MD file |
| `x`, `y` | number | Position on canvas |
| `width`, `height` | number | Node dimensions |
| `color` | string | Color code (1-6) or hex. Indicates effort or in-progress |

#### Edge Properties (Dependencies)
| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `fromNode` | string | Source node ID (the dependency) |
| `toNode` | string | Target node ID (depends on source) |
| `fromSide` | string | `"left"`, `"right"`, `"top"`, `"bottom"` |
| `toSide` | string | `"left"`, `"right"`, `"top"`, `"bottom"` |
| `label` | string | Optional label on arrow |

**Dependency Convention:** `A → B` means "A must complete before B" (B depends on A).

---

### Markdown File Structure

```markdown
---
type: accomplishment
title: My Accomplishment Title
id: ACC-001
effort: Medium
status: Not Started
priority: High
inProgress: false
time_estimate: 8
depends_on: []
created_by_plugin: true
created: 2024-01-15T10:00:00.000Z
updated: 2024-01-15T10:00:00.000Z
canvas_source: projects/my-project.canvas
vault_path: accomplishments/My Accomplishment.md
notion_page_id: abc123-def456
---

# My Accomplishment Title (Accomplishment)

## Outcome

The final state that will be true once this is done.

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Tasks

### Task 1: Setup Environment
- **Goal:** Prepare development environment
- **Estimate:** 2h
- **Status:** ⬜ Not Started
- **Notes:** Implementation details

### Task 2: Implement Feature
- **Goal:** Build the core functionality
- **Estimate:** 4h
- **Status:** ⬜ Not Started
- **Notes:** Implementation details

## Notes

Additional context, links, or references.
```

#### Frontmatter Properties

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Always `"accomplishment"` |
| `title` | string | Display name |
| `id` | string | Unique identifier (e.g., `ACC-001`) |
| `effort` | string | Effort level from settings (e.g., `"Small"`, `"Medium"`, `"Large"`) |
| `status` | string | `"Not Started"`, `"In Progress"`, `"Completed"`, `"Blocked"` |
| `priority` | string | `"Low"`, `"Medium"`, `"High"`, `"Critical"` |
| `inProgress` | boolean | When `true`, node border turns red |
| `time_estimate` | number | Total estimated hours (sum of task estimates) |
| `depends_on` | string[] | Array of accomplishment IDs this depends on |
| `created_by_plugin` | boolean | `true` if created by this plugin |
| `created` | string | ISO timestamp of creation |
| `updated` | string | ISO timestamp of last update |
| `canvas_source` | string | Path to parent canvas file |
| `vault_path` | string | Path to this MD file |
| `notion_page_id` | string | Notion page ID (if synced) |

#### Body Sections

| Section | Purpose |
|---------|---------|
| **Outcome** | Describes the final state when complete |
| **Acceptance Criteria** | Checkboxes for completion criteria |
| **Tasks** | Sub-tasks with goal, estimate, status, notes |
| **Notes** | Free-form additional information |

---

## Relationships

### Canvas Node ↔ MD File
```
Canvas Node (visual)              MD File (content)
├── id: "abc123"                  ├── frontmatter.id: "ACC-001"
├── file: "accomplishments/X.md"  ├── frontmatter.vault_path: "accomplishments/X.md"
├── color: "3"                    ├── frontmatter.effort: "Medium"
└── x, y, width, height           └── frontmatter.canvas_source: "project.canvas"
```

### Dependencies (Canvas Edges → Frontmatter)
```
Canvas Edge                       MD File A              MD File B
├── fromNode: "nodeA"      →      id: "ACC-001"   
├── toNode: "nodeB"        →                             depends_on: ["ACC-001"]
└── (A → B = B depends on A)
```

### Notion Sync
```
MD File                           Notion Page
├── frontmatter.title       →     Name (title)
├── frontmatter.id          →     ID (rich_text)
├── frontmatter.effort      →     Effort (select)
├── frontmatter.status      →     Status (select)
├── frontmatter.priority    →     Priority (select)
├── frontmatter.inProgress  →     In Progress (checkbox)
├── frontmatter.time_estimate →   Time Estimate (number)
├── frontmatter.created     →     Created (date)
├── frontmatter.updated     →     Updated (date)
├── frontmatter.depends_on  →     Depends On (relation)
├── body content            →     Page blocks
└── notion_page_id          ←     Page ID (stored back)
```

---

## File Locations

```
vault/
├── .obsidian/
│   └── plugins/
│       └── canvas-structured-items/
│           ├── main.js
│           ├── manifest.json
│           └── data.json          # Plugin settings
├── templates/
│   └── accomplishment.md          # Template file
├── accomplishments/               # Default folder for MD files
│   ├── Setup Project.md
│   ├── Implement Feature.md
│   └── Write Tests.md
└── projects/
    └── my-project.canvas          # Canvas file
```

---

## Operations (CRUD)

### Create Accomplishment
1. User converts text node or creates new item on canvas
2. Plugin generates unique ID (e.g., `ACC-001`)
3. Plugin creates MD file from template with frontmatter
4. Plugin updates canvas: converts text node to file node pointing to MD
5. (Optional) Sync to Notion, store `notion_page_id` in frontmatter

### Read Accomplishment
1. Parse canvas file to get node position, color, connections
2. Read MD file for frontmatter properties and body content
3. Combine for full accomplishment data

### Update Accomplishment
1. **From Obsidian:** Edit MD file directly, plugin auto-syncs to Notion
2. **From Canvas:** Move node, change color → affects visual only
3. **From Notion:** Bi-directional sync updates MD frontmatter and body

### Delete Accomplishment
1. Delete MD file from vault
2. Plugin detects deletion, archives Notion page
3. Canvas node becomes orphaned (file not found) - user removes manually

### Create/Update Dependency
1. User draws arrow from node A to node B on canvas
2. Plugin reads edges, maps node IDs to accomplishment IDs
3. Updates `depends_on` array in target's frontmatter
4. Syncs to Notion as relation

---

## MCP Integration

### Recommended MCP Approach: File-Based

The plugin exports a JSON file containing the complete project graph:

```json
{
  "project": "My Project",
  "canvasPath": "projects/my-project.canvas",
  "exportedAt": "2024-01-15T10:00:00.000Z",
  "accomplishments": [
    {
      "id": "ACC-001",
      "title": "Setup Project",
      "status": "Completed",
      "inProgress": false,
      "effort": "Small",
      "priority": "High",
      "timeEstimate": 4,
      "notionPageId": "abc123",
      "vaultPath": "accomplishments/Setup Project.md",
      "dependsOn": [],
      "blocks": ["ACC-002", "ACC-003"],
      "outcome": "Development environment ready",
      "acceptanceCriteria": ["Node.js installed", "Dependencies installed"],
      "tasks": [
        {"name": "Install Node", "estimate": 1, "status": "done"},
        {"name": "Install deps", "estimate": 1, "status": "done"}
      ]
    }
  ],
  "dependencyGraph": {
    "ACC-001": ["ACC-002", "ACC-003"],
    "ACC-002": ["ACC-004"]
  },
  "criticalPath": ["ACC-001", "ACC-002", "ACC-004"],
  "blockedItems": ["ACC-003"],
  "readyToStart": ["ACC-005", "ACC-006"]
}
```

### MCP Operations

| Operation | Implementation |
|-----------|----------------|
| **List accomplishments** | Read JSON export or parse canvas + MD files |
| **Get accomplishment** | Read specific MD file by ID or path |
| **Update status** | Modify frontmatter in MD file |
| **Update time estimate** | Modify frontmatter + recalculate totals |
| **Add dependency** | Add edge to canvas JSON, update target's `depends_on` |
| **Remove dependency** | Remove edge from canvas, update frontmatter |
| **Get blocked items** | Query `dependencyGraph` for items with incomplete deps |
| **Get critical path** | Compute longest chain through dependency graph |
| **Get ready to start** | Find items with all dependencies completed |

### File Paths for MCP
```
Read:
  - {canvas}.canvas          → Project structure and dependencies
  - accomplishments/*.md     → Individual accomplishment details
  - {canvas}-project.json    → Aggregated export (if generated)

Write:
  - accomplishments/*.md     → Update frontmatter or body
  - {canvas}.canvas          → Add/remove edges (dependencies)
```

---

## Status Mapping

| Obsidian Status | Notion Status | Canvas Color |
|-----------------|---------------|--------------|
| Not Started | todo | Effort color |
| In Progress | in_progress | Effort color (or red if `inProgress: true`) |
| Completed | done | Effort color |
| Blocked | blocked | Effort color |

## Effort → Color Mapping (Configurable)

| Effort | Default Color |
|--------|---------------|
| Small | 4 (green) |
| Medium | 5 (cyan) |
| Large | 6 (purple) |

---

## Sync Behavior

### Obsidian → Notion
- **On convert:** Sync new accomplishment to Notion
- **On MD save:** Auto-sync changes (debounced)
- **On batch sync:** Sync all canvas notes + dependencies

### Notion → Obsidian
- **Polling:** Every 5 minutes check for Notion changes
- **Update:** Overwrite MD frontmatter and body from Notion
- **Conflict:** Last-write-wins (no conflict resolution)

### Deletion
- **Obsidian delete:** Archives Notion page
- **Notion archive:** Does not delete Obsidian file

