# Obsidian MCP Server - Technical Specification

## Overview

An MCP (Model Context Protocol) server that provides CRUD operations for hierarchical project entities in Obsidian. The server manages milestones, stories, tasks, decisions, and documents with their associated canvas representations, allowing AI assistants to work with project entities as logical objects.

## Configuration

Settings are provided via MCP server configuration:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": {
        "VAULT_PATH": "/path/to/obsidian/vault",
        "DEFAULT_CANVAS": "projects/main.canvas"
      }
    }
  }
}
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VAULT_PATH` | Yes | Absolute path to Obsidian vault containing entity folders |
| `DEFAULT_CANVAS` | Yes | Default canvas file path (relative to vault) |

### Workspaces Configuration

Document workspaces are configured via `workspaces.json` in the vault root. This file is auto-created on first run:

```json
{
  "docs": {
    "path": "/absolute/path/to/vault/docs",
    "description": "Project documentation and reference materials"
  },
  "notes": {
    "path": "/absolute/path/to/vault/notes",
    "description": "Meeting notes and daily logs"
  }
}
```

Each workspace entry requires:
- `path`: Absolute path to the folder containing markdown files
- `description`: Human-readable description of the workspace contents

---

## Vault Structure

The server expects the following folder structure in the vault:

```
your-vault/
├── milestones/           # Milestone files (M-xxx.md)
├── stories/              # Story files (S-xxx.md)
├── tasks/                # Task files (T-xxx.md)
├── decisions/            # Decision files (DEC-xxx.md)
├── documents/            # Document files (DOC-xxx.md)
├── archive/              # Archived entities
├── projects/
│   └── main.canvas       # Project canvas
└── workspaces.json       # Workspace configuration
```

---

## Data Models

### Entity Types

| Type | ID Format | Description |
|------|-----------|-------------|
| **Milestone** | `M-001` | High-level project goals with target dates |
| **Story** | `S-001` | Deliverable work items under milestones |
| **Task** | `T-001` | Specific work items under stories |
| **Decision** | `DEC-001` | Architectural/design decisions with rationale |
| **Document** | `DOC-001` | Specifications, designs, and reference docs |

### Entity Status

| Status | Description |
|--------|-------------|
| `not_started` | Work hasn't begun |
| `in_progress` | Currently being worked on |
| `completed` | Work is finished |
| `blocked` | Waiting on dependencies |
| `cancelled` | No longer needed |

Decisions have additional statuses: `pending`, `decided`, `superseded`

### Entity Hierarchy

```
Milestone (M-xxx)
└── Story (S-xxx)
    └── Task (T-xxx)

Decision (DEC-xxx)  ─── can enable/supersede other entities
Document (DOC-xxx)  ─── can be implemented by stories
```

### Common Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (e.g., `M-001`, `S-002`) |
| `title` | string | Yes | Display name |
| `status` | enum | Yes | Entity status |
| `workstream` | string | Yes | Workstream identifier (e.g., `engineering`, `business`) |
| `priority` | enum | No | `Low` \| `Medium` \| `High` \| `Critical` |
| `depends_on` | string[] | No | IDs of entities this depends on |
| `created` | string | Yes | ISO 8601 timestamp |
| `updated` | string | Yes | ISO 8601 timestamp |

### Canvas Node

```json
{
  "id": "string",
  "type": "file",
  "file": "milestones/M-001 Title.md",
  "x": 0,
  "y": 0,
  "width": 400,
  "height": 300
}
```

### Canvas Edge (Dependency)

```json
{
  "id": "string",
  "fromNode": "nodeId1",
  "toNode": "nodeId2",
  "fromSide": "right",
  "toSide": "left"
}
```

**Convention:** Edge from A → B means "A blocks B" (B depends on A).

---

## Tools Specification

The MCP server provides 29 tools organized into categories:

### Entity Management (6 tools)

| Tool | Description |
|------|-------------|
| `create_entity` | Create a new entity (milestone, story, task, decision, or document) |
| `update_entity` | Update entity fields, add/remove dependencies |
| `update_entity_status` | Change entity status with validation |
| `archive_entity` | Archive an entity (moves to archive folder) |
| `archive_milestone` | Archive a milestone and all its children |
| `restore_from_archive` | Restore an archived entity |

### Batch Operations (3 tools)

| Tool | Description |
|------|-------------|
| `batch_operations` | Create multiple entities with dependencies in one call |
| `batch_update_status` | Update status of multiple entities |
| `batch_archive` | Archive multiple entities |

### Project Understanding (3 tools)

| Tool | Description |
|------|-------------|
| `get_project_overview` | High-level project status with counts and health metrics |
| `get_workstream_status` | Status breakdown for a specific workstream |
| `analyze_project_state` | Deep analysis with blockers, risks, and suggestions |

### Search & Navigation (4 tools)

| Tool | Description |
|------|-------------|
| `search_entities` | Full-text search with filters (type, status, workstream) |
| `get_entity_summary` | Quick entity overview (id, title, status, parent) |
| `get_entity_full` | Complete entity with all relationships and content |
| `navigate_hierarchy` | Traverse entity relationships (parent, children, dependencies) |

### Decision & Document Management (5 tools)

| Tool | Description |
|------|-------------|
| `create_decision` | Create a decision record with context and rationale |
| `get_decision_history` | Get decision history for a topic |
| `supersede_document` | Create new document version based on decision |
| `get_document_history` | Get document version history |
| `check_document_freshness` | Check if document is up-to-date with decisions |

### Implementation Handoff (3 tools)

| Tool | Description |
|------|-------------|
| `get_ready_for_implementation` | Find stories/specs ready to implement |
| `generate_implementation_package` | Create implementation context package |
| `validate_spec_completeness` | Check if spec is ready for implementation |

### Canvas Layout (1 tool)

| Tool | Description |
|------|-------------|
| `auto_layout_canvas` | Reposition nodes using dependency-driven horizontal flow with workstream lanes |

### Utility Tools (4 tools)

| Tool | Description |
|------|-------------|
| `list_workspaces` | List all configured workspaces |
| `list_files` | List all markdown files in a workspace |
| `read_docs` | Read a document from a workspace |
| `update_doc` | Create, update, or delete documents in a workspace |

---

### Utility Tools Detail

#### list_workspaces

**Purpose:** List all configured workspaces with their descriptions.

**Parameters:** None

**Returns:**
```json
{
  "workspaces": [
    { "name": "docs", "description": "Project documentation and reference materials" },
    { "name": "notes", "description": "Meeting notes and daily logs" }
  ],
  "count": 2,
  "config_last_changed": "2024-01-15T10:30:00Z"
}
```

---

#### list_files

**Purpose:** List all markdown files in a workspace, including files in subfolders.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace` | string | Yes | Name of the workspace to list files from |

**Returns:**
```json
{
  "workspace": "docs",
  "workspace_description": "Project documentation and reference materials",
  "files": [
    { "name": "architecture.md", "last_changed": "2024-01-15T10:30:00Z" },
    { "name": "api/endpoints.md", "last_changed": "2024-01-14T09:00:00Z" }
  ],
  "count": 2
}
```

---

#### read_docs

**Purpose:** Read a document from a workspace.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace` | string | Yes | Name of the workspace to read from |
| `doc_name` | string | Yes | Document filename (with or without .md extension) |
| `from_line` | integer | No | Start line (0-based, inclusive) |
| `to_line` | integer | No | End line (0-based, exclusive) |

**Returns:**
```json
{
  "workspace": "docs",
  "workspace_description": "Project documentation and reference materials",
  "doc_name": "architecture.md",
  "content": "# Architecture\n\nThis document describes...",
  "line_count": 150,
  "last_changed": "2024-01-15T10:30:00Z",
  "range": { "from_line": 0, "to_line": 150 }
}
```

---

#### update_doc

**Purpose:** Create, update, or delete documents in a workspace.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace` | string | Yes | Name of the workspace |
| `name` | string | Yes | Document filename (with or without .md extension) |
| `operation` | enum | Yes | `"create"` \| `"replace"` \| `"delete"` \| `"insert_at"` \| `"replace_at"` |
| `content` | string | Conditional | Required for create, replace, insert_at, replace_at. Not needed for delete. |
| `start_line` | integer | Conditional | Required for insert_at and replace_at. 0-based line number. |
| `end_line` | integer | Conditional | Required for replace_at. 0-based, exclusive. |

**Operations:**
- `create`: Create new document (error if exists)
- `replace`: Replace entire content (error if not exists)
- `delete`: Delete document (error if not exists)
- `insert_at`: Insert content starting at `start_line`. Existing content shifts down.
- `replace_at`: Replace lines from `start_line` to `end_line` (exclusive) with new content.

**Returns:**
```json
{
  "success": true,
  "operation": "insert_at",
  "workspace": "docs",
  "workspace_description": "Project documentation and reference materials",
  "doc_name": "notes.md",
  "message": "Inserted 5 line(s) at line 10 in document: notes.md",
  "line_count": 5,
  "affected_range": { "start_line": 10, "end_line": 15 }
}
```

---

## Canvas Layout Algorithm

The `auto_layout_canvas` tool repositions nodes using dependency-driven horizontal flow with workstream lanes:

### Layout Configuration

```typescript
interface LayoutConfig {
  stageSpacing: number;   // Horizontal spacing between dependency stages (default: 400)
  itemSpacing: number;    // Vertical spacing between items in same lane (default: 120)
  lanePadding: number;    // Padding between workstream lanes (default: 50)
  startX: number;         // Starting X position (default: 0)
  startY: number;         // Starting Y position (default: 0)
}
```

### Algorithm

1. **Calculate Dependency Depth (X-axis):**
   - Nodes with no incoming edges are at depth 0 (leftmost)
   - Each node's depth = max(depth of dependencies) + 1
   - X position = startX + (depth * stageSpacing)

2. **Assign Workstream Lanes (Y-axis):**
   - Group nodes by workstream
   - Each workstream gets a horizontal lane
   - Nodes within a lane are stacked vertically with itemSpacing

3. **Reposition Nodes:**
   - Update node positions in canvas JSON
   - Preserve existing edges

---

## ID Generation

```typescript
function generateEntityId(type: EntityType, existingIds: string[]): string {
  const prefix = {
    milestone: 'M',
    story: 'S',
    task: 'T',
    decision: 'DEC',
    document: 'DOC'
  }[type];

  const numbers = existingIds
    .filter(id => id.startsWith(prefix + '-'))
    .map(id => parseInt(id.replace(prefix + '-', ''), 10))
    .filter(n => !isNaN(n));

  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `${prefix}-${String(maxNumber + 1).padStart(3, '0')}`;
}
```

---

## File Operations

### Reading Entity
1. Read MD file content
2. Parse YAML frontmatter (between `---` markers)
3. Parse body sections by H2 headers
4. Extract acceptance criteria, notes, etc.

### Writing Entity
1. Serialize frontmatter to YAML
2. Reconstruct body with sections
3. Write atomically (write to temp, then rename)

### Canvas Operations
1. Read canvas JSON
2. Parse nodes and edges arrays
3. Modify as needed
4. Write atomically

---

## Error Handling

| Error | Code | Description |
|-------|------|-------------|
| `ENTITY_NOT_FOUND` | 404 | Entity ID does not exist |
| `WORKSPACE_NOT_FOUND` | 404 | Workspace name not in workspaces.json |
| `DUPLICATE_ID` | 409 | Attempted to create with existing ID |
| `CIRCULAR_DEPENDENCY` | 400 | Dependency would create cycle |
| `INVALID_STATUS` | 400 | Invalid status value |
| `CANVAS_NOT_FOUND` | 404 | Canvas file does not exist |
| `PARSE_ERROR` | 500 | Failed to parse MD or canvas file |
| `WRITE_ERROR` | 500 | Failed to write file |

---

## Implementation Notes

1. **Lazy Initialization:** Runtime initializes on first tool call, not at server startup
2. **In-Memory Index:** Entities are indexed in memory for fast lookups
3. **File Watching:** Not required - assumes Obsidian is not in use during MCP operations
4. **Notion Sync:** Not handled by MCP - Obsidian plugin manages Notion integration
5. **Atomicity:** Use write-to-temp-then-rename for safe file updates
6. **Encoding:** All files are UTF-8
7. **Line Endings:** Use LF (`\n`) for consistency
