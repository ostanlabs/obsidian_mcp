# Obsidian Structured Notes MCP Server

An MCP (Model Context Protocol) server that enables AI assistants to manage structured project accomplishments in Obsidian. Works alongside the [Canvas Structured Items Plugin](https://bitbucket.org/ostanmarc/obsidian-canvas-structured-items/src/master/) for visual project management and Notion synchronization.

## 🎯 What This Does

This system lets you:
- **Plan projects visually** using Obsidian's canvas feature
- **Break work into accomplishments** - atomic units with outcomes, acceptance criteria, and tasks
- **Track dependencies** between accomplishments (arrows on canvas)
- **Let AI assistants help** manage your project through natural conversation
- **Sync to Notion** for team visibility and mobile access

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Your Workflow                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────┐      ┌──────────────┐      ┌──────────┐             │
│   │ Obsidian │◄────►│  MCP Server  │◄────►│    AI    │             │
│   │  Canvas  │      │  (this repo) │      │ Assistant│             │
│   └────┬─────┘      └──────────────┘      └──────────┘             │
│        │                                                            │
│        ▼                                                            │
│   ┌──────────┐      ┌──────────────┐                               │
│   │  Plugin  │─────►│    Notion    │  (optional sync)              │
│   └──────────┘      └──────────────┘                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### 1. Install the Obsidian Plugin

First, install the [Canvas Structured Items Plugin](https://bitbucket.org/ostanmarc/obsidian-canvas-structured-items/src/master/) in your Obsidian vault. This plugin:
- Converts canvas text nodes into structured accomplishment files
- Manages the visual canvas layout
- Syncs accomplishments to Notion (optional)

### 2. Set Up This MCP Server

```bash
# Clone the repository
git clone git@bitbucket.org:ostanmarc/obsidian-structured-notes-mcp.git
cd obsidian-structured-notes-mcp

# Install dependencies
npm install

# Build
npm run build
```

### 3. Configure Your AI Assistant

Add to your MCP client configuration (e.g., Claude Desktop, Cursor):

```json
{
  "mcpServers": {
    "obsidian-accomplishments": {
      "command": "node",
      "args": ["/path/to/obsidian-structured-notes-mcp/dist/index.js"],
      "env": {
        "VAULT_PATH": "/path/to/your/obsidian/vault",
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
| `VAULT_PATH` | Yes | Absolute path to your Obsidian vault |
| `ACCOMPLISHMENTS_FOLDER` | Yes | Folder for accomplishment files (relative to vault) |
| `DEFAULT_CANVAS` | Yes | Your main project canvas file |
| `CONTEXT_DOCS_FOLDER` | No | Folder for reference documents the AI can read/write |

### 4. Set Up Your Vault Structure

```
your-vault/
├── accomplishments/          # Accomplishment markdown files
│   ├── Setup Project.md
│   └── Build Feature.md
├── projects/
│   └── main.canvas           # Visual project board
├── docs/                     # Context documents (optional)
│   └── architecture.md
└── templates/
    └── accomplishment.md     # Template for new accomplishments
```

## 📋 Core Concepts

### Accomplishments

An **accomplishment** is the atomic unit of work. Each one has:

- **Outcome**: What will be true when this is done
- **Acceptance Criteria**: How you know it's complete
- **Tasks**: Specific steps to achieve it
- **Dependencies**: Other accomplishments that must finish first

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

The `.canvas` file is your visual project view:

- **Nodes** = Accomplishments (colored by effort type)
- **Arrows** = Dependencies (A → B means "B depends on A")
- **Position** = Workflow stage (left-to-right progression)
- **Red border** = Currently being worked on (`inProgress: true`)

### Effort Types (Color-Coded)

| Effort | Description | Use For |
|--------|-------------|---------|
| **Business** | Business logic, product features | User-facing functionality |
| **Engineering** | Technical implementation | Architecture, refactoring |
| **Infra** | Infrastructure, DevOps | CI/CD, deployment, tooling |
| **Research** | Investigation, prototyping | Spikes, learning, POCs |

## 🤖 What Your AI Can Do

Once configured, ask your AI assistant things like:

### Project Overview
> "What's the status of my project?"
> "Show me what's currently in progress"
> "What items are blocked?"

### Managing Work
> "Create an accomplishment for building the payment system"
> "Add a task to ACC-003 for writing unit tests"
> "Mark ACC-001 as complete"
> "Set ACC-005 as my current focus"

### Dependencies
> "ACC-004 depends on ACC-002 and ACC-003"
> "What can I start working on now?"
> "Show me the critical path"

### Context Documents
> "Read the architecture doc"
> "Add a section about API design to the architecture doc"
> "Create a new doc for meeting notes"

## 🔧 Available Tools (12 total)

| Tool | Purpose |
|------|---------|
| `manage_accomplishment` | Create, update, delete accomplishments |
| `manage_task` | Add, update, remove tasks within accomplishments |
| `manage_dependency` | Add or remove dependencies between accomplishments |
| `set_work_focus` | Set which accomplishment/task is currently being worked on |
| `get_accomplishment` | Get detailed info about a specific accomplishment |
| `list_accomplishments` | List all accomplishments with optional filters |
| `get_current_work` | Get items marked as in-progress |
| `get_blocked_items` | Get items waiting on dependencies |
| `get_ready_to_start` | Get items with all dependencies complete |
| `get_project_status` | Get project statistics and overview |
| `read_docs` | Read context documents |
| `update_doc` | Create, update, or delete context documents |

## 🔄 Notion Sync (via Plugin)

The [Canvas Structured Items Plugin](https://bitbucket.org/ostanmarc/obsidian-canvas-structured-items/src/master/) handles Notion synchronization:

1. **Configure Notion** in the plugin settings with your API key and database ID
2. **Sync accomplishments** from Obsidian to Notion automatically
3. **Dependencies** become Notion relations
4. **Two-way sync** keeps both systems in sync

This lets your team see project status in Notion while you manage everything from Obsidian.

## 📚 Documentation

- [Technical Specification](docs/MCP_TECHNICAL_SPEC.md) - Detailed API and data model reference
- [Plugin Design](docs/PLUGIN_DESIGN.md) - How the Obsidian plugin works
- [Accomplishment Template](docs/canvas-accomplishment-template.md) - Template for new accomplishments

## 🛠 Development

```bash
# Build
npm run build

# Watch mode
npm run watch

# The server runs via MCP protocol (stdio)
# Test by configuring in an MCP client
```

## License

MIT

