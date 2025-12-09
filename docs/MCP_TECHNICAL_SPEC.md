# Obsidian Accomplishments MCP Server - Technical Specification

## Overview

An MCP (Model Context Protocol) server that provides CRUD operations for Obsidian accomplishment files and their associated canvas representations. The server abstracts away file structure details, allowing LLMs to work with accomplishments as logical entities.

## Configuration

Settings are provided via MCP server configuration (not runtime tools):

```json
{
  "mcpServers": {
    "obsidian-accomplishments": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": {
        "VAULT_PATH": "/path/to/obsidian/vault",
        "ACCOMPLISHMENTS_FOLDER": "accomplishments",
        "DEFAULT_CANVAS": "projects/main.canvas",
        "CONTEXT_DOCS_FOLDER": "docs"
      }
    }
  }
}
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VAULT_PATH` | Yes | Absolute path to Obsidian vault root |
| `ACCOMPLISHMENTS_FOLDER` | Yes | Folder for accomplishment MD files (relative to vault) |
| `DEFAULT_CANVAS` | Yes | Default canvas file path (relative to vault) |
| `CONTEXT_DOCS_FOLDER` | No | Additional folder for context documents (relative to vault). All MD files in this folder are treated as context docs. |

---

## Data Models

### Accomplishment

**Frontmatter Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Always `"accomplishment"` |
| `title` | string | Yes | Display name |
| `id` | string | Yes | Unique identifier, format: `ACC-{number}` |
| `effort` | enum | Yes | `"Business"` \| `"Infra"` \| `"Engineering"` \| `"Research"` |
| `status` | enum | Yes | `"Not Started"` \| `"In Progress"` \| `"Completed"` \| `"Blocked"` |
| `priority` | enum | Yes | `"Low"` \| `"Medium"` \| `"High"` \| `"Critical"` |
| `inProgress` | boolean | Yes | Visual flag for active work (red border in Obsidian) |
| `depends_on` | string[] | Yes | Array of accomplishment IDs this depends on |
| `created_by_plugin` | boolean | Yes | Always `true` when created by MCP |
| `collapsed_height` | number | Yes | Canvas node collapsed height |
| `expanded_height` | number | Yes | Canvas node expanded height |
| `expanded_width` | number | Yes | Canvas node expanded width |
| `created` | string | Yes | ISO 8601 timestamp |
| `updated` | string | Yes | ISO 8601 timestamp |
| `canvas_source` | string | Yes | Path to parent canvas file |
| `vault_path` | string | Yes | Path to this MD file |
| `notion_page_id` | string | No | Notion page ID (managed by Obsidian plugin) |

**Body Sections:**

| Section | Description |
|---------|-------------|
| `# {title} (Accomplishment)` | H1 header with title |
| `## Outcome` | Final state when complete |
| `## Acceptance Criteria` | Checkbox list of criteria |
| `## Tasks` | Task subsections (see Task model) |
| `## Notes` | Free-form notes |

### Task

Tasks are subsections within the `## Tasks` section of an accomplishment.

**Task Format:**
```markdown
### Task {number}: {name}
- **Goal:** {goal}
- **Description:** {description}
- **Technical Notes:** {technical_notes}
- **Estimate:** {hours}h
- **Status:** {status}
- **Notes:** {notes}
```

**Task Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `number` | number | Yes | Task number (1, 2, 3...) |
| `name` | string | Yes | Task name |
| `goal` | string | Yes | What the task achieves |
| `description` | string | Yes | Task details |
| `technical_notes` | string | No | Implementation specifics |
| `estimate` | number | No | Hours estimate |
| `status` | enum | Yes | `"Open"` \| `"InProgress"` \| `"Complete"` \| `"OnHold"` |
| `notes` | string | No | Additional notes |

**Task ID Format:** `{accomplishment_id}:Task {number}:{name}`
- Example: `ACC-001:Task 1:Setup Environment`

### Canvas Node

```json
{
  "id": "string",
  "type": "file",
  "file": "accomplishments/Title.md",
  "x": 0,
  "y": 0,
  "width": 400,
  "height": 300,
  "color": "3"
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

## Enums

```typescript
type AccomplishmentStatus = "Not Started" | "In Progress" | "Completed" | "Blocked";
type TaskStatus = "Open" | "InProgress" | "Complete" | "OnHold";
type Effort = "Business" | "Infra" | "Engineering" | "Research";
type Priority = "Low" | "Medium" | "High" | "Critical";
```

---

## Tools Specification

### 1. manage_accomplishment

**Purpose:** Create, update, or delete accomplishments.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `operation` | enum | Yes | `"create"` \| `"update"` \| `"delete"` |
| `id` | string | For update/delete | Accomplishment ID (e.g., `ACC-001`) |
| `data` | object | For create, optional for update | Accomplishment data |

**Data Object (for create/update):**

| Field | Type | Required (create) | Description |
|-------|------|-------------------|-------------|
| `title` | string | Yes | Accomplishment title |
| `effort` | enum | Yes | Effort type |
| `priority` | enum | No (default: "High") | Priority level |
| `status` | enum | No (default: "Not Started") | Status |
| `outcome` | string | No | Outcome description |
| `acceptance_criteria` | string[] | No | List of criteria |
| `depends_on` | string[] | No | IDs of dependencies |
| `canvas_source` | string | No | Canvas file (default: DEFAULT_CANVAS) |

**Behavior:**

- **create:**
  1. Generate next available ID by scanning canvas for existing `ACC-{n}` patterns
  2. Create MD file from template at `{ACCOMPLISHMENTS_FOLDER}/{title}.md`
  3. Add node to canvas with calculated position (see Positioning Algorithm)
  4. If `depends_on` provided, add edges to canvas and update frontmatter
  5. Return created accomplishment

- **update:**
  1. Read existing MD file
  2. Update frontmatter and/or body sections
  3. Update `updated` timestamp
  4. Return updated accomplishment

- **delete:**
  1. Remove MD file
  2. Remove node from canvas
  3. Remove all edges referencing this node
  4. Update `depends_on` in other accomplishments that referenced this one
  5. Return success confirmation

**Returns:** Accomplishment object or success confirmation.

---

### 2. manage_dependency

**Purpose:** Add or remove dependencies between accomplishments.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `operation` | enum | Yes | `"add"` \| `"remove"` |
| `blocker_id` | string | Yes | ID of blocking accomplishment |
| `blocked_id` | string | Yes | ID of blocked accomplishment |

**Behavior:**

- **add:**
  1. Validate both accomplishments exist
  2. Check for circular dependency
  3. Add edge to canvas (blocker → blocked)
  4. Add `blocker_id` to blocked accomplishment's `depends_on` array
  5. Reposition blocked node based on updated dependencies (see Positioning Algorithm)

- **remove:**
  1. Remove edge from canvas
  2. Remove `blocker_id` from blocked accomplishment's `depends_on` array

**Returns:** Updated dependency information including new position.

---

### 3. manage_task

**Purpose:** Add, update, or remove tasks within an accomplishment.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `operation` | enum | Yes | `"add"` \| `"update"` \| `"remove"` |
| `accomplishment_id` | string | Yes | Parent accomplishment ID |
| `task_id` | string | For update/remove | Task ID (e.g., `ACC-001:Task 1:Setup`) |
| `data` | object | For add, optional for update | Task data |

**Data Object:**

| Field | Type | Required (add) | Description |
|-------|------|----------------|-------------|
| `name` | string | Yes | Task name |
| `goal` | string | Yes | Task goal |
| `description` | string | No | Task details |
| `technical_notes` | string | No | Implementation notes |
| `estimate` | number | No | Hours estimate |
| `status` | enum | No (default: "Open") | Task status |
| `notes` | string | No | Additional notes |

**Behavior:**

- **add:**
  1. Parse accomplishment MD file
  2. Find `## Tasks` section
  3. Determine next task number
  4. Append new task subsection
  5. Update accomplishment `updated` timestamp

- **update:**
  1. Parse accomplishment MD file
  2. Find task by ID (match `### Task {n}: {name}`)
  3. Update specified fields
  4. Update accomplishment `updated` timestamp

- **remove:**
  1. Parse accomplishment MD file
  2. Remove task subsection
  3. Renumber remaining tasks
  4. Update accomplishment `updated` timestamp

**Returns:** Updated task or accomplishment.

---

### 4. set_work_focus

**Purpose:** Set accomplishment's `inProgress` flag and/or task status.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `accomplishment_id` | string | Yes | Accomplishment ID |
| `in_progress` | boolean | No | Set accomplishment's inProgress flag |
| `task_id` | string | No | Target task ID |
| `task_status` | enum | No | New task status |

**Behavior:**

1. If `task_id` and `task_status` provided:
   - Update task status
   - If `task_status` is `"InProgress"`, auto-set accomplishment `inProgress: true`
   
2. If `in_progress` provided:
   - Set accomplishment's `inProgress` field
   
3. Update `updated` timestamp

**Returns:** Updated accomplishment with task info.

---

### 5. get_accomplishment

**Purpose:** Get full details of a single accomplishment.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Accomplishment ID |

**Returns:** Full accomplishment object including:
- All frontmatter fields
- Parsed outcome
- Parsed acceptance criteria
- Parsed tasks with all fields
- Notes section
- Computed fields: `is_blocked` (has incomplete dependencies)

---

### 6. list_accomplishments

**Purpose:** List accomplishments with optional filtering.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `status` | string | No | Filter by status |
| `canvas_source` | string | No | Filter by canvas file |

**Returns:** Array of accomplishment summaries:
- `id`, `title`, `status`, `priority`, `effort`
- `inProgress`, `is_blocked`, `depends_on`
- `task_count`, `completed_task_count`

---

### 7. get_current_work

**Purpose:** Get all items currently being worked on.

**Parameters:** None

**Returns:**
```json
{
  "accomplishments": [
    {
      "id": "ACC-001",
      "title": "...",
      "inProgress": true,
      "tasks": [
        { "task_id": "ACC-001:Task 1:Name", "name": "...", "status": "InProgress" }
      ]
    }
  ]
}
```

---

### 8. get_blocked_items

**Purpose:** Get accomplishments blocked by incomplete dependencies.

**Parameters:** None

**Returns:** Array of accomplishment summaries with `blocking_items` field showing which dependencies are incomplete.

---

### 9. get_ready_to_start

**Purpose:** Get accomplishments ready to begin work.

**Parameters:** None

**Criteria:**
- `status` is `"Not Started"`
- All items in `depends_on` have `status: "Completed"`
- OR `depends_on` is empty

**Returns:** Array of accomplishment summaries.

---

### 10. get_project_status

**Purpose:** Get project overview and statistics.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `canvas_source` | string | No | Canvas file (default: DEFAULT_CANVAS) |

**Returns:**
```json
{
  "canvas_source": "projects/main.canvas",
  "total_accomplishments": 10,
  "by_status": {
    "Not Started": 3,
    "In Progress": 4,
    "Completed": 2,
    "Blocked": 1
  },
  "by_effort": {
    "Business": 2,
    "Engineering": 5,
    "Infra": 2,
    "Research": 1
  },
  "blocked_count": 2,
  "ready_to_start_count": 3,
  "in_progress_count": 1,
  "total_tasks": 25,
  "completed_tasks": 10
}
```

---

### 11. read_docs

**Purpose:** Read context documents. Context documents come from two sources:
1. MD files in the canvas folder that are NOT referenced by the canvas
2. All MD files in `CONTEXT_DOCS_FOLDER` (if configured) - these are prefixed with `context:`

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `doc_name` | string | No | Document filename. Prefix with `context:` for context folder docs. If not provided, returns all context documents. |
| `from_line` | integer | No | Start line (0-based, inclusive). Only used when `doc_name` is provided. |
| `to_line` | integer | No | End line (0-based, exclusive). Only used when `doc_name` is provided. |
| `canvas_source` | string | No | Canvas file (default: DEFAULT_CANVAS). Used to determine canvas folder docs. |

**Returns (single doc):**
```json
{
  "doc_name": "notes.md",
  "content": "# Notes\n\nSome content...",
  "line_count": 15,
  "range": { "from_line": 0, "to_line": 15 }
}
```

**Returns (all docs):**
```json
{
  "documents": {
    "notes.md": "# Notes\n...",
    "context:reference.md": "# Reference\n..."
  },
  "document_count": 2,
  "document_names": ["notes.md", "context:reference.md"]
}
```

---

### 12. update_doc

**Purpose:** Create, update, or delete context documents.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Document filename. Prefix with `context:` for context folder docs. |
| `operation` | enum | Yes | `"create"` \| `"replace"` \| `"delete"` \| `"insert_at"` \| `"replace_at"` |
| `content` | string | Conditional | Required for create, replace, insert_at, replace_at. Not needed for delete. |
| `start_line` | integer | Conditional | Required for insert_at and replace_at. 0-based line number. |
| `end_line` | integer | Conditional | Required for replace_at. 0-based, exclusive. |
| `canvas_source` | string | No | Canvas file (default: DEFAULT_CANVAS). Only used for canvas folder docs. |

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
  "doc_name": "notes.md",
  "message": "Inserted 5 line(s) at line 10 in document: notes.md",
  "line_count": 5,
  "affected_range": { "start_line": 10, "end_line": 15 }
}
```

---

### 13. sync_dependencies

**Purpose:** Sync all dependencies from canvas edges to accomplishment frontmatter. Reads all edges from the canvas and updates the `depends_on` array in each accomplishment's MD file to match.

**Use cases:**
- Initialize dependencies after manually drawing arrows on canvas
- Fix sync issues between canvas edges and MD files
- Batch update all accomplishments after importing a canvas

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `canvas_source` | string | No | Canvas file (default: DEFAULT_CANVAS) |

**Returns:**
```json
{
  "success": true,
  "canvas_source": "projects/main.canvas",
  "total_accomplishments": 10,
  "updated_count": 3,
  "updates": [
    {
      "id": "ACC-002",
      "title": "Build Feature",
      "old_depends_on": [],
      "new_depends_on": ["ACC-001"]
    },
    {
      "id": "ACC-003",
      "title": "Write Tests",
      "old_depends_on": ["ACC-001"],
      "new_depends_on": ["ACC-001", "ACC-002"]
    }
  ],
  "errors": []
}
```

---

## Positioning Algorithm

When creating accomplishments or adding dependencies, nodes are positioned on the canvas using this algorithm:

### Constants
```typescript
const NODE_WIDTH = 400;
const NODE_HEIGHT = 300;
const HORIZONTAL_GAP = 100;
const VERTICAL_GAP = 50;
const START_X = 0;
const START_Y = 0;
```

### Algorithm

```typescript
function calculatePosition(accomplishment, canvas): { x: number, y: number } {
  const dependsOn = accomplishment.depends_on || [];
  
  if (dependsOn.length === 0) {
    // No dependencies: place in leftmost column
    const leftColumnNodes = getNodesWithNoDependencies(canvas);
    const maxY = Math.max(...leftColumnNodes.map(n => n.y + n.height), START_Y);
    return { x: START_X, y: maxY + VERTICAL_GAP };
  }
  
  // Has dependencies: place to the right of blockers
  const blockerNodes = dependsOn.map(id => getNodeByAccomplishmentId(canvas, id));
  
  const maxBlockerX = Math.max(...blockerNodes.map(n => n.x + n.width));
  const avgBlockerY = average(blockerNodes.map(n => n.y));
  
  const newX = maxBlockerX + HORIZONTAL_GAP;
  
  // Check for collisions and offset vertically if needed
  const existingAtX = getNodesInColumn(canvas, newX, NODE_WIDTH);
  const newY = findAvailableY(existingAtX, avgBlockerY, NODE_HEIGHT, VERTICAL_GAP);
  
  return { x: newX, y: newY };
}
```

---

## ID Generation

```typescript
function generateAccomplishmentId(canvas): string {
  const existingIds = getAllAccomplishmentIds(canvas);
  const numbers = existingIds
    .map(id => parseInt(id.replace('ACC-', ''), 10))
    .filter(n => !isNaN(n));
  
  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `ACC-${String(maxNumber + 1).padStart(3, '0')}`;
}
```

---

## File Operations

### Reading Accomplishment
1. Read MD file content
2. Parse YAML frontmatter (between `---` markers)
3. Parse body sections by H2 headers
4. Parse tasks by H3 headers within Tasks section

### Writing Accomplishment
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
| `ACCOMPLISHMENT_NOT_FOUND` | 404 | Accomplishment ID does not exist |
| `TASK_NOT_FOUND` | 404 | Task ID does not exist |
| `DUPLICATE_ID` | 409 | Attempted to create with existing ID |
| `CIRCULAR_DEPENDENCY` | 400 | Dependency would create cycle |
| `INVALID_STATUS` | 400 | Invalid status value |
| `CANVAS_NOT_FOUND` | 404 | Canvas file does not exist |
| `PARSE_ERROR` | 500 | Failed to parse MD or canvas file |
| `WRITE_ERROR` | 500 | Failed to write file |

---

## Implementation Notes

1. **File Watching:** Not required - assumes Obsidian is not in use during MCP operations
2. **Notion Sync:** Not handled by MCP - Obsidian plugin manages Notion integration
3. **Atomicity:** Use write-to-temp-then-rename for safe file updates
4. **Encoding:** All files are UTF-8
5. **Line Endings:** Use LF (`\n`) for consistency

