# Obsidian MCP Server

An MCP (Model Context Protocol) server that enables AI assistants to manage structured project accomplishments in Obsidian. Works alongside the [Canvas Structured Items Plugin](https://bitbucket.org/ostanmarc/obsidian-canvas-structured-items/src/master/) for visual project management.

## What This Does

This MCP server lets AI assistants:
- **Manage accomplishments** — create, update, and track work items with outcomes, acceptance criteria, and tasks
- **Handle dependencies** — define what blocks what, find blocked items, and identify what's ready to start
- **Track progress** — see project status, current work, and completion statistics
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
├── accomplishments/          # Accomplishment markdown files
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
        "ACCOMPLISHMENTS_FOLDER": "accomplishments",
        "DEFAULT_CANVAS": "projects/main.canvas"
      }
    }
  }
}
```

Using global install:
```json
{
  "mcpServers": {
    "obsidian": {
      "command": "obsidian-accomplishments-mcp",
      "env": {
        "VAULT_PATH": "/absolute/path/to/your/obsidian/vault",
        "ACCOMPLISHMENTS_FOLDER": "accomplishments",
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
        "ACCOMPLISHMENTS_FOLDER": "accomplishments",
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
| `ACCOMPLISHMENTS_FOLDER` | Yes | Folder for accomplishment files (relative to vault) |
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

Each workspace is a named folder containing markdown files that the AI can read and write.

---

## Core Concepts

### Accomplishments

An **accomplishment** is the atomic unit of work. Each accomplishment has:

- **Title** — A clear name for the work item
- **Outcome** — What will be true when this is done
- **Acceptance Criteria** — Checkboxes defining completion
- **Tasks** — Specific steps to achieve the outcome
- **Dependencies** — Other accomplishments that must finish first
- **Status** — Not Started, In Progress, Completed, or Blocked
- **Effort Type** — Business, Engineering, Infra, or Research
- **Priority** — Low, Medium, High, or Critical

Example accomplishment file:

```markdown
---
type: accomplishment
title: User Authentication
id: ACC-001
effort: Engineering
status: In Progress
priority: High
inProgress: true
depends_on: ["ACC-000"]
---

# User Authentication (Accomplishment)

## Outcome
Users can securely log in and maintain sessions.

## Acceptance Criteria
- [ ] Login form validates credentials
- [ ] Sessions persist across browser refreshes
- [ ] Logout clears session completely

## Tasks

### Task 1: Design Auth Flow
- **Goal:** Document the authentication sequence
- **Estimate:** 2h
- **Status:** Complete

### Task 2: Implement Login API
- **Goal:** Create backend authentication endpoint
- **Estimate:** 4h
- **Status:** InProgress
```

### Canvas as Project Board

The `.canvas` file provides a visual project view:

- **Nodes** = Accomplishments (colored by effort type)
- **Arrows** = Dependencies (A → B means "B depends on A")
- **Position** = Workflow stage (left-to-right progression)
- **Red border** = Currently being worked on (`inProgress: true`)

### Workspaces

Workspaces are named document collections that the AI can access. Configure them in `workspaces.json` to give the AI access to:
- Project documentation
- Meeting notes
- Reference materials
- Any other markdown files

---

## Available Tools

The MCP server provides 14 tools organized by function:

### Accomplishment Management

| Tool | Description |
|------|-------------|
| `manage_accomplishment` | Create, update, or delete accomplishments |
| `get_accomplishment` | Get full details of a specific accomplishment |
| `list_accomplishments` | List all accomplishments with optional status filter |

### Task Management

| Tool | Description |
|------|-------------|
| `manage_task` | Add, update, or remove tasks within an accomplishment |
| `set_work_focus` | Set which accomplishment/task is currently being worked on |

### Dependency Management

| Tool | Description |
|------|-------------|
| `manage_dependency` | Add or remove dependencies between accomplishments |

### Project Status

| Tool | Description |
|------|-------------|
| `get_project_status` | Get project statistics and overview |
| `get_current_work` | Get items marked as in-progress |
| `get_blocked_items` | Get items waiting on incomplete dependencies |
| `get_ready_to_start` | Get items with all dependencies complete |

### Document Management

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
> "Show me what's currently in progress"
> "What items are blocked?"
> "What can I start working on?"

### Managing Accomplishments
> "Create an accomplishment for building the payment system"
> "Mark ACC-001 as complete"
> "Set ACC-005 as my current focus"
> "What are the details of ACC-003?"

### Managing Tasks
> "Add a task to ACC-003 for writing unit tests"
> "Mark task 2 of ACC-001 as complete"
> "What tasks are left on ACC-002?"

### Dependencies
> "ACC-004 depends on ACC-002 and ACC-003"
> "Remove the dependency from ACC-005 to ACC-001"
> "What's blocking ACC-006?"

### Documents
> "What workspaces are available?"
> "List files in the docs workspace"
> "Read the architecture document"
> "Add a section about API design to the architecture doc"
> "Create a new meeting notes document"

---

## Notion Sync (Optional)

The [Canvas Structured Items Plugin](https://bitbucket.org/ostanmarc/obsidian-canvas-structured-items/src/master/) can sync accomplishments to Notion:

1. Configure Notion API key and database ID in the plugin settings
2. Accomplishments sync automatically when saved
3. Dependencies become Notion relations
4. Two-way sync keeps both systems updated

This lets your team see project status in Notion while you manage everything from Obsidian.

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

