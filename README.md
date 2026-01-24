# Obsidian Project Management MCP Server

An MCP (Model Context Protocol) server for AI-native project management in Obsidian. Enables AI assistants to create, update, search, and manage project entities stored as markdown files with automatic relationship tracking.

## What This Does

This MCP server lets AI assistants:
- **Manage project entities** — create, update, and track milestones, stories, tasks, decisions, documents, and features
- **Handle dependencies** — define relationships between entities with automatic bidirectional sync
- **Track progress** — see project status, workstream health, and feature coverage
- **Navigate hierarchies** — traverse parent-child relationships and dependency graphs
- **Batch operations** — efficient bulk create/update/archive with dry-run preview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Your Workflow                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────┐      ┌──────────────┐      ┌──────────┐            │
│   │ Obsidian │◄────►│  MCP Server  │◄────►│    AI    │            │
│   │  Vault   │      │  (this repo) │      │ Assistant│            │
│   └──────────┘      └──────────────┘      └──────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

- Node.js 18 or later
- An Obsidian vault

### Install from Source

```bash
git clone <repository-url>
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
├── features/                 # Feature files (F-xxx.md)
├── archive/                  # Archived entities (by type)
│   ├── milestone/
│   ├── story/
│   ├── task/
│   └── ...
├── projects/
│   └── main.canvas           # Your project canvas
└── workspaces.json           # Workspace configuration (auto-created on first run)
```

### Configure Your AI Assistant

Add the MCP server to your AI client's configuration.

**For Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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
| `DEFAULT_CANVAS` | No | Path to your main project canvas file (relative to vault) |

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

Feature (F-xxx)     ─── product features with coverage tracking
Decision (DEC-xxx)  ─── captured choices, can affect other entities
Document (DOC-xxx)  ─── specs/ADRs, can be implemented by stories
```

### Entity Types

| Type | ID Format | Key Fields |
|------|-----------|------------|
| **Milestone** | `M-001` | `target_date`, `owner`, `priority` |
| **Story** | `S-001` | `parent` (milestone), `priority`, `acceptance_criteria` |
| **Task** | `T-001` | `parent` (story), `estimate_hrs`, `assignee` |
| **Decision** | `DEC-001` | `decided_by`, `decided_on`, `affects`, `supersedes` |
| **Document** | `DOC-001` | `doc_type`, `version`, `implemented_by` |
| **Feature** | `F-001` | `tier`, `phase`, `documented_by`, `implemented_by` |

### Entity Status

| Entity | Statuses |
|--------|----------|
| Milestone, Story | `Not Started`, `In Progress`, `Completed`, `Blocked` |
| Task | `Open`, `InProgress`, `Complete`, `OnHold` |
| Decision | `Pending`, `Decided`, `Superseded` |
| Document | `Draft`, `Review`, `Approved`, `Superseded` |
| Feature | `Planned`, `In Progress`, `Complete`, `Deferred` |

### Relationships (Auto-Synced)

All relationships are bidirectional and automatically synchronized:

| Relationship | Forward Field | Reverse Field |
|--------------|---------------|---------------|
| Hierarchy | `parent` | `children` |
| Dependency | `depends_on` | `blocks` |
| Implementation | `implements` | `implemented_by` |
| Supersession | `supersedes` | `superseded_by` |
| Documentation | `documents` | `documented_by` |

### Workstreams

Entities are organized by workstream. Values are automatically normalized:
- `infrastructure`, `infra` → `infra`
- `eng`, `engineering` → `engineering`
- `biz`, `business` → `business`
- `ops`, `operations` → `operations`
- `r&d`, `rnd`, `research` → `research`
- `ux`, `ui`, `design` → `design`
- `mktg`, `marketing` → `marketing`

---

## Available Tools

The MCP server provides 15 tools organized by function:

### Entity Management

| Tool | Description |
|------|-------------|
| `create_entity` | Create a new entity (milestone, story, task, decision, document, or feature) |
| `update_entity` | Update fields, status, relationships, or archive/restore. Returns before/after diff. |

### Batch Operations

| Tool | Description |
|------|-------------|
| `batch_update` | Bulk create/update/archive with `dry_run` preview and `include_entities` option |

### Project Understanding

| Tool | Description |
|------|-------------|
| `get_project_overview` | High-level project status with workstream filtering |
| `analyze_project_state` | Deep analysis with blockers and recommendations |
| `get_feature_coverage` | Feature implementation/documentation coverage with `summary_only` option |

### Search & Navigation

| Tool | Description |
|------|-------------|
| `search_entities` | Full-text search, list with filters, or navigate hierarchy |
| `get_entity` | Get single entity with selective field retrieval |
| `get_entities` | Bulk fetch multiple entities (~75% token savings) |

### Document Management

| Tool | Description |
|------|-------------|
| `manage_documents` | Decision history, versioning, freshness checks |

### Maintenance

| Tool | Description |
|------|-------------|
| `reconcile_relationships` | Fix inconsistent bidirectional relationships |
| `get_schema` | Get entity schema information |

### Utility Tools

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

### Features
> "What's the feature coverage for Phase 2?"
> "Which features are missing documentation?"
> "Show me F-001's implementation status"

### Documents
> "What workspaces are available?"
> "List files in the docs workspace"
> "Read the architecture document"

---

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck
```

### Project Structure

```
src/
├── index.ts              # MCP server entry point
├── models/
│   └── v2-types.ts       # Entity type definitions
├── services/v2/
│   ├── entity-parser.ts      # Parse markdown to entities
│   ├── entity-serializer.ts  # Serialize entities to markdown
│   ├── entity-validator.ts   # Validate entity data
│   ├── index-manager.ts      # Entity indexing
│   ├── lifecycle-manager.ts  # Status transitions
│   ├── archive-manager.ts    # Archive/restore
│   ├── workstream-normalizer.ts  # Workstream normalization
│   ├── cycle-detector.ts     # Dependency cycle detection
│   └── v2-runtime.ts         # Main runtime
└── tools/
    ├── index.ts              # Tool definitions
    ├── entity-management-tools.ts
    ├── batch-operations-tools.ts
    ├── project-understanding-tools.ts
    ├── search-navigation-tools.ts
    └── decision-document-tools.ts
```

---

## License

MIT
