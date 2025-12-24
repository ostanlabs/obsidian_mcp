# Obsidian MCP Server

An MCP (Model Context Protocol) server that enables AI assistants to manage hierarchical project entities in Obsidian. Works alongside the [Canvas Structured Items Plugin](https://bitbucket.org/ostanmarc/obsidian-canvas-structured-items/src/master/) for visual project management.

## What This Does

This MCP server lets AI assistants:
- **Manage project entities** — create, update, and track milestones, stories, tasks, decisions, and documents
- **Handle dependencies** — define relationships between entities, find blocked items, and identify what's ready to start
- **Track progress** — see project status, workstream health, and completion statistics
- **Navigate hierarchies** — traverse parent-child relationships and dependency graphs
- **Read and write documents** — access reference materials organized in workspaces

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Your Workflow                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────┐      ┌──────────────┐      ┌──────────┐            │
│   │ Obsidian │◄────►│  MCP Server  │◄────►│    AI    │            │
│   │  Canvas  │      │  (this repo) │      │ Assistant│            │
│   └────┬─────┘      └──────────────┘      └──────────┘            │
│        │                                                           │
│        ▼                                                           │
│   ┌──────────┐      ┌──────────────┐                              │
│   │  Plugin  │─────►│    Notion    │  (optional sync)             │
│   └──────────┘      └──────────────┘                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

- Node.js 18 or later
- An Obsidian vault
- The [Canvas Structured Items Plugin](https://bitbucket.org/ostanmarc/obsidian-canvas-structured-items/src/master/) installed in your vault

### Option 1: Install from npm (Recommended)

```bash
npm install -g obsidian-accomplishments-mcp
```

Or run directly with npx:

```bash
npx obsidian-accomplishments-mcp
```

### Option 2: Install from Source

```bash
git clone https://github.com/ostanlabs/obsidian_mcp.git
cd obsidian_mcp
npm install
npm run build
```

### Set Up Your Vault

Create the required folder structure in your Obsidian vault:

```
your-vault/
├── milestones/               # Milestone files (M-xxx.md)
├── stories/                  # Story files (S-xxx.md)
├── tasks/                    # Task files (T-xxx.md)
├── decisions/                # Decision files (DEC-xxx.md)
├── documents/                # Document files (DOC-xxx.md)
├── archive/                  # Archived entities
├── projects/
│   └── main.canvas           # Your project canvas
└── workspaces.json           # Workspace configuration (auto-created on first run)
```

### Configure Your AI Assistant

Add the MCP server to your AI client's configuration.

**For Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

Using npx (recommended):
```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "obsidian-accomplishments-mcp@latest"],
      "env": {
        "VAULT_PATH": "/absolute/path/to/your/obsidian/vault",
        "DEFAULT_CANVAS": "projects/main.canvas"
      }
    }
  }
}
```

Using local install:
```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/path/to/obsidian_mcp/dist/index.js"],
      "env": {
        "VAULT_PATH": "/absolute/path/to/your/obsidian/vault",
        "DEFAULT_CANVAS": "projects/main.canvas"
      }
    }
  }
}
```

#### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VAULT_PATH` | Yes | Absolute path to your Obsidian vault |
| `DEFAULT_CANVAS` | Yes | Path to your main project canvas file (relative to vault) |

### Configure Workspaces

On first run, the server creates a `workspaces.json` file in your vault. Edit this file to define document workspaces that the AI can access:

```json
{
  "docs": {
    "path": "/absolute/path/to/your/vault/docs",
    "description": "Project documentation and reference materials"
  },
  "notes": {
    "path": "/absolute/path/to/your/vault/notes",
    "description": "Meeting notes and daily logs"
  }
}
```

---

## Core Concepts

### Entity Hierarchy

The system uses a hierarchical entity model:

```
Milestone (M-xxx)
└── Story (S-xxx)
    └── Task (T-xxx)

Decision (DEC-xxx)  ─── can enable/supersede other entities
Document (DOC-xxx)  ─── can be implemented by stories
```

### Entity Types

| Type | ID Format | Description |
|------|-----------|-------------|
| **Milestone** | `M-001` | High-level project goals with target dates |
| **Story** | `S-001` | Deliverable work items under milestones |
| **Task** | `T-001` | Specific work items under stories |
| **Decision** | `DEC-001` | Architectural/design decisions with rationale |
| **Document** | `DOC-001` | Specifications, designs, and reference docs |

### Entity Status

All entities follow a consistent status model:

| Status | Description |
|--------|-------------|
| `not_started` | Work hasn't begun |
| `in_progress` | Currently being worked on |
| `completed` | Work is finished |
| `blocked` | Waiting on dependencies |
| `cancelled` | No longer needed |

Decisions have additional statuses: `pending`, `decided`, `superseded`

### Workstreams

Entities can be organized by workstream (e.g., `engineering`, `business`, `infra`, `research`). This enables:
- Filtering by team/domain
- Workstream-specific status views
- Visual grouping on canvas

### Canvas Integration

The `.canvas` file provides a visual project view:

- **Nodes** = Entities (styled by CSS classes)
- **Arrows** = Dependencies and relationships
- **Position** = Auto-layout by dependency depth and workstream
- **CSS Classes** = Visual differentiation by type, status, priority, workstream

---

## Available Tools

The MCP server provides 29 tools organized by function:

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

## Usage Examples

Once configured, ask your AI assistant things like:

### Project Overview
> "What's the status of my project?"
> "Show me the engineering workstream status"
> "What items are blocked?"
> "Analyze the project and identify risks"

### Managing Entities
> "Create a milestone for Q1 launch with target date March 31"
> "Create a story under M-001 for user authentication"
> "Add a task to S-003 for writing unit tests"
> "Mark T-005 as completed"

### Dependencies
> "S-004 depends on S-002 and S-003"
> "What's blocking S-006?"
> "Show me the dependency graph for M-001"

### Decisions & Documents
> "Create a decision about using PostgreSQL vs MongoDB"
> "What decisions have been made about authentication?"
> "Create a spec document for the API design"
> "Is DOC-003 up to date with recent decisions?"

### Implementation
> "What stories are ready for implementation?"
> "Generate an implementation package for S-005"
> "Is the spec for S-003 complete enough to implement?"

### Documents
> "What workspaces are available?"
> "List files in the docs workspace"
> "Read the architecture document"

---

## Development

```bash
# Build the project
npm run build

# Watch mode for development
npm run dev

# Run tests
npm test
```

The server communicates via MCP protocol over stdio. Test by configuring it in an MCP-compatible client.

---

## Technical Reference

For detailed API specifications, data models, and implementation details, see [Technical Specification](docs/MCP_TECHNICAL_SPEC.md).

---

## License

MIT

