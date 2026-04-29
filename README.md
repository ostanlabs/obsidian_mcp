# Obsidian Project Management MCP Server

[![npm version](https://img.shields.io/npm/v/obsidian-accomplishments-mcp.svg)](https://www.npmjs.com/package/obsidian-accomplishments-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Current Version:** v0.2.21

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
│   ┌──────────┐      ┌──────────────┐      ┌──────────┐              │
│   │ Obsidian │◄────►│  MCP Server  │◄────►│    AI    │              │
│   │  Vault   │      │  (this repo) │      │ Assistant│              │
│   └──────────┘      └──────────────┘      └──────────┘              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

- Node.js 18 or later
- An Obsidian vault

### Configure Your AI Assistant

Add the MCP server to your AI client's configuration. No separate installation needed - npx handles it automatically.

**Latest Version:** v0.2.21

**For Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "obsidian-accomplishments-mcp"],
      "env": {
        "VAULT_PATH": "/absolute/path/to/your/obsidian/vault",
        "DEFAULT_CANVAS": "projects/main.canvas"
      }
    }
  }
}
```

**With Semantic Search (optional):**

To enable hybrid vector + keyword search, add the `--semantic-search` flag:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "obsidian-accomplishments-mcp", "--semantic-search"],
      "env": {
        "VAULT_PATH": "/absolute/path/to/your/obsidian/vault",
        "DEFAULT_CANVAS": "projects/main.canvas"
      }
    }
  }
}
```

> **Note:** Semantic search requires downloading the BGE-M3 ONNX model (~2.3 GB) on first use. The model is stored at `~/.msrl/models/bge-m3` and only needs to be downloaded once.

| Variable | Required | Description |
|----------|----------|-------------|
| `VAULT_PATH` | Yes | Absolute path to your Obsidian vault |
| `DEFAULT_CANVAS` | No | Path to your main project canvas file (relative to vault) |

| Flag | Description |
|------|-------------|
| `--semantic-search` | Enable hybrid vector + keyword search. Downloads model on first use (~2.3 GB). |
| `--version`, `-v` | Print version and exit |

### Vault Structure

The server will create entities in these folders (create them if they don't exist):

```
your-vault/
├── milestones/               # M-xxx.md
├── stories/                  # S-xxx.md
├── tasks/                    # T-xxx.md
├── decisions/                # DEC-xxx.md
├── documents/                # DOC-xxx.md
├── features/                 # F-xxx.md
└── archive/                  # Archived entities
```

### Configure Workspaces

Workspaces define document collections that the AI can access. You can configure them in two ways:

**Option 1: Ask the AI** (recommended)
> "Add a workspace called 'docs' pointing to /path/to/my/docs folder"
> "Add a notes workspace for my meeting notes at /path/to/notes"

**Option 2: Edit manually**

On first run, the server creates a `workspaces.json` file in your vault:

```json
{
  "docs": {
    "path": "/absolute/path/to/your/vault/docs",
    "description": "Project documentation and reference materials"
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

### MSRL Semantic Search

Search your entire vault using hybrid vector + keyword search.

> **Requires:** Start the server with `--semantic-search` flag to enable.

**Features:**
- **Hybrid search** - Combines vector embeddings with keyword matching
- **Auto-download** - BGE-M3 model (~2.3 GB) downloaded automatically on first use
- **Fast indexing** - Automatic index updates on document changes
- **Relevance ranking** - Results ranked by semantic similarity

**Model Storage:**
The ONNX model is stored at `~/.msrl/models/bge-m3` and shared across all vaults.

**Tools (only available with `--semantic-search`):**
- `search_docs` - Semantic search across workspace documents
- `msrl_status` - Check semantic search index status
- `search_entities` with `semantic: true` - Hybrid search for entities

**Example queries:**
> "Search for all documents about authentication"
> "Find references to database design decisions"
> "Show me documentation about API endpoints"

See [Semantic Search Guide](../obsidian_docs/docs/user-guide/semantic-search.md) for setup and advanced usage.

### Archive Structure

Archived entities are organized in a flat structure by type:

```
archive/
├── milestones/
├── stories/
├── tasks/
├── decisions/
├── documents/
└── features/
```

Entities with `status: archived` are automatically moved to the appropriate folder and excluded from canvas and searches.

See [Archive Structure Guide](../obsidian_docs/docs/user-guide/archive-structure.md) for workflows.

---

## Migration Notes

### Recent Schema Changes

**Decision Relationships:**
- ✅ Use `affects` field (new)
- ❌ `blocks` field is deprecated

**Story Workstreams:**
- ✅ Use `workstream` field (new)
- ❌ `effort` field is deprecated (auto-migrated)

**CSS Classes:**
- ✅ Use `canvas-workstream-*` pattern (new)
- ❌ `canvas-effort-*` pattern is deprecated

See [Entity Schemas](../obsidian_docs/docs/reference/entity-schemas.md) for complete schema documentation.

---

## Available Tools

The MCP server provides 27 tools organized by function:

### Entity Management

| Tool | Description |
|------|-------------|
| `create_entity` | Create a new entity (milestone, story, task, decision, document, or feature) |
| `update_entity` | Update fields, status, relationships, or archive/restore. Returns before/after diff. |

### Batch Operations

| Tool | Description |
|------|-------------|
| `batch_update` | Bulk create/update/archive with `dry_run` preview and `include_entities` option |
| `bulk_create_entities` | Create multiple entities in one operation with relationship setup |
| `bulk_archive_entities` | Archive multiple entities with cascade option for children |
| `bulk_restore_entities` | Restore multiple entities from archive with relationship preservation |

### Project Understanding

| Tool | Description |
|------|-------------|
| `get_project_overview` | High-level project status with workstream filtering |
| `analyze_project_state` | Deep analysis with blockers and recommendations |
| `get_feature_coverage` | Feature implementation/test/documentation coverage with `summary_only` option |
| `get_dependency_analysis` | Analyze dependency graphs, detect cycles, and identify critical paths |
| `get_project_metrics` | Project-wide metrics and statistics (velocity, completion rates, etc.) |

### Search & Navigation

| Tool | Description |
|------|-------------|
| `search_entities` | Full-text search, list with filters, or navigate hierarchy |
| `get_entity` | Get single entity with selective field retrieval |
| `get_entities` | Bulk fetch multiple entities (~75% token savings) |
| `search_docs` | Semantic search across workspace documents using MSRL hybrid search |
| `msrl_status` | Check MSRL semantic search index status |

### Document Management

| Tool | Description |
|------|-------------|
| `manage_documents` | Decision history, versioning, freshness checks |

### Canvas Operations

| Tool | Description |
|------|-------------|
| `populate_canvas` | Populate canvas from vault entities with layout options |
| `refresh_canvas` | Refresh canvas layout and styling |

### Maintenance

| Tool | Description |
|------|-------------|
| `reconcile_relationships` | Fix inconsistent bidirectional relationships |
| `get_schema` | Get entity schema information |

### Workspace Management

| Tool | Description |
|------|-------------|
| `list_workspaces` | List all configured workspaces |
| `manage_workspaces` | Add, update, or remove workspaces from configuration |
| `list_files` | List all markdown files in a workspace |
| `read_docs` | Read a document from a workspace |
| `update_doc` | Create, update, or delete documents in a workspace |

### Utility Tools

| Tool | Description |
|------|-------------|
| `validate_entity` | Validate entity data against schema with detailed error messages |
| `export_project_data` | Export project data in various formats (JSON, CSV, Markdown) |

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

## Documentation

For comprehensive documentation, see the [obsidian_docs](../obsidian_docs) repository:

### Quick Links

- **[Quick Start Guide](../obsidian_docs/guides/QUICK_START.md)** - Get started in 15 minutes
- **[User Guide](../obsidian_docs/guides/USER_GUIDE.md)** - Complete workflows and features
- **[MCP Tools Reference](../obsidian_docs/docs/reference/mcp-tools-complete.md)** - All 27 tools documented
- **[Entity Schemas](../obsidian_docs/docs/reference/entity-schemas.md)** - Complete entity definitions

### Feature Guides

- [Semantic Search](../obsidian_docs/docs/user-guide/semantic-search.md) - MSRL hybrid search
- [Feature Coverage](../obsidian_docs/docs/user-guide/feature-coverage.md) - Track implementation status
- [Workspace Management](../obsidian_docs/docs/user-guide/workspace-management.md) - Multi-vault organization
- [Relationship Reconciliation](../obsidian_docs/docs/user-guide/relationship-reconciliation.md) - Data integrity
- [Archive Structure](../obsidian_docs/docs/user-guide/archive-structure.md) - Archive workflows
- [Workstream Normalization](../obsidian_docs/docs/user-guide/workstream-normalization.md) - Auto-normalization

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
