# Changelog

All notable changes to the Obsidian Project Management MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.18] - 2026-02-28

### 📚 Documentation Release

- **Comprehensive Documentation**: Complete documentation overhaul with 11 new guides in obsidian_docs
- **README Updates**: Updated README with all 27 tools, version badges, and comprehensive feature documentation
- **MSRL Semantic Search**: Added comprehensive semantic search documentation
- **Feature Coverage**: Documented get_feature_coverage tool and workflow
- **Workspace Management**: Complete guide for multi-vault organization (26 tests confirmed)
- **Archive Structure**: Documented flat archive structure and workflows
- **Migration Notes**: Added schema change documentation (Decision.blocks→affects, Story.effort→workstream)
- **Tool Reference**: Complete reference for all 27 MCP tools
- **Version Badges**: Added version badges and release information

### 🔧 Improvements

- **Documentation Links**: Added prominent links to obsidian_docs comprehensive documentation
- **Installation Guide**: Updated with latest version information
- **Tool Categories**: Reorganized tools into clear categories (CRUD, Search, Analysis, Bulk, Workspace, Canvas, Utility)

### 🛠️ Tools Documented

#### CRUD Operations (5 tools)
- `create_entity` - Create new entities
- `read_entity` - Read entity data
- `update_entity` - Update entity fields
- `delete_entity` - Delete entities
- `list_entities` - List all entities

#### Search & Navigation (2 tools)
- `search_docs` - MSRL semantic search
- `msrl_status` - Check search index status

#### Project Understanding (3 tools)
- `get_feature_coverage` - Feature implementation/test/doc status
- `get_dependency_analysis` - Dependency graph analysis
- `get_project_metrics` - Project health metrics

#### Batch Operations (4 tools)
- `bulk_create_entities` - Bulk entity creation
- `bulk_update_entities` - Bulk entity updates
- `bulk_archive_entities` - Bulk archival
- `bulk_restore_entities` - Bulk restoration

#### Workspace Management (5 tools)
- `list_workspaces` - List configured workspaces
- `manage_workspaces` - Add/update/remove workspaces
- `list_files` - List workspace files
- `read_docs` - Read workspace documents
- `update_doc` - Create/update/delete documents

#### Canvas Operations (2 tools)
- `populate_canvas` - Populate canvas from vault
- `refresh_canvas` - Refresh canvas layout

#### Utility Tools (4 tools)
- `validate_entity` - Validate entity data
- `export_project_data` - Export project data
- `reconcile_relationships` - Fix relationship inconsistencies
- `get_schema` - Get entity schema information

---

## [0.2.0] - 2026-01-15

### ✨ Major Features

- **MSRL Semantic Search**: Hybrid vector + keyword search across vault
- **Feature Coverage**: Track implementation/test/doc status
- **Workspace Management**: Multi-vault document organization
- **Bulk Operations**: Efficient batch create/update/archive with dry-run
- **Canvas Operations**: Populate and refresh canvas from MCP

### 🔧 Improvements

- **Relationship Reconciliation**: Automatic bidirectional sync for 6 relationship types
- **Workstream Normalization**: Auto-normalize workstream names
- **Archive Structure**: Flat archive organization by entity type
- **Schema Validation**: Comprehensive entity validation

---

## [0.1.0] - 2025-12-24

### 🎉 Initial Release

- **Entity Management**: Create, read, update, delete entities
- **6 Entity Types**: Milestone, Story, Task, Decision, Document, Feature
- **Relationship Tracking**: Parent-child, dependencies, implementations
- **MCP Protocol**: Full MCP server implementation
- **Claude Integration**: Works with Claude Desktop and Cursor

---

For detailed documentation, see [obsidian_docs](../obsidian_docs).

