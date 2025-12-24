#!/usr/bin/env python3
"""
Vault Validation Script

Validates entity relationships in an Obsidian vault against the defined rules:
- Decisions can only enable: documents, stories, tasks (NOT milestones)
- Documents can only be implemented_by: stories, tasks (NOT milestones)
- Stories/Tasks can only implement: documents
- depends_on constraints by entity type

Also validates that all referenced entity IDs exist.
"""

import os
import re
import json
import yaml
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Set, Optional, Any, Tuple
from collections import defaultdict


# =============================================================================
# Configuration
# =============================================================================

VAULT_PATH = "/Users/marc-ostan/Obsidian/OstanLabs/obsidian_notion_planning_system/obsidian-vault/Projects/AgentPlatform"
CANVAS_FILE = "AgentPlatform_backup_test.canvas"

# Entity type prefixes
ENTITY_PREFIXES = {
    'M-': 'milestone',
    'S-': 'story',
    'T-': 'task',
    'DEC-': 'decision',
    'DOC-': 'document',
}

# Relationship constraints
DECISION_ENABLES_VALID_TYPES = {'document', 'story', 'task'}
DOCUMENT_IMPLEMENTED_BY_VALID_TYPES = {'story', 'task'}
IMPLEMENTS_VALID_TYPES = {'document'}
DEPENDS_ON_VALID_TYPES = {
    'milestone': {'milestone', 'decision'},
    'story': {'story', 'decision', 'document'},
    'task': {'task', 'decision'},
    'decision': {'decision'},
    'document': {'document', 'decision'},
}


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class Entity:
    id: str
    type: str
    title: str
    status: str
    file_path: str
    parent: Optional[str] = None
    depends_on: List[str] = field(default_factory=list)
    blocked_by: List[str] = field(default_factory=list)
    implements: List[str] = field(default_factory=list)
    enables: List[str] = field(default_factory=list)
    implemented_by: List[str] = field(default_factory=list)
    supersedes: Optional[str] = None
    raw_frontmatter: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ValidationError:
    entity_id: str
    field: str
    message: str
    severity: str  # 'error' or 'warning'
    file_path: str


# =============================================================================
# Helper Functions
# =============================================================================

def get_entity_type_from_id(entity_id: str) -> Optional[str]:
    """Get entity type from ID prefix."""
    for prefix, entity_type in ENTITY_PREFIXES.items():
        if entity_id.startswith(prefix):
            return entity_type
    return None


def parse_frontmatter(content: str) -> Tuple[Dict[str, Any], str]:
    """Parse YAML frontmatter from markdown content."""
    if not content.startswith('---'):
        return {}, content

    # Find the closing ---
    end_match = re.search(r'\n---\n', content[3:])
    if not end_match:
        return {}, content

    yaml_content = content[3:end_match.start() + 3]
    body = content[end_match.end() + 3:]

    try:
        frontmatter = yaml.safe_load(yaml_content) or {}
        return frontmatter, body
    except yaml.YAMLError as e:
        print(f"YAML parse error: {e}")
        return {}, content


def parse_list_field(value: Any) -> List[str]:
    """Parse a field that could be a list or single value."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v]
    if isinstance(value, str):
        # Handle comma-separated or single value
        if ',' in value:
            return [v.strip() for v in value.split(',') if v.strip()]
        return [value] if value else []
    return []


def load_entity_from_file(file_path: str) -> Optional[Entity]:
    """Load an entity from a markdown file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        frontmatter, _ = parse_frontmatter(content)
        if not frontmatter:
            return None

        entity_id = frontmatter.get('id', '')
        if not entity_id:
            return None

        entity_type = get_entity_type_from_id(entity_id)
        if not entity_type:
            return None

        return Entity(
            id=entity_id,
            type=entity_type,
            title=frontmatter.get('title', ''),
            status=frontmatter.get('status', ''),
            file_path=file_path,
            parent=frontmatter.get('parent') or frontmatter.get('milestone'),
            depends_on=parse_list_field(frontmatter.get('depends_on')),
            blocked_by=parse_list_field(frontmatter.get('blocked_by')),
            implements=parse_list_field(frontmatter.get('implements')),
            enables=parse_list_field(frontmatter.get('enables')),
            implemented_by=parse_list_field(frontmatter.get('implemented_by')),
            supersedes=frontmatter.get('supersedes'),
            raw_frontmatter=frontmatter,
        )
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return None


# =============================================================================
# Vault Loader
# =============================================================================

class VaultLoader:
    """Loads all entities from a vault."""

    def __init__(self, vault_path: str):
        self.vault_path = Path(vault_path)
        self.entities: Dict[str, Entity] = {}
        self.duplicates: Dict[str, List[str]] = defaultdict(list)

    def load(self) -> Dict[str, Entity]:
        """Load all entities from the vault."""
        folders = ['milestones', 'stories', 'tasks', 'decisions', 'documents']

        for folder in folders:
            folder_path = self.vault_path / folder
            if folder_path.exists():
                self._load_folder(folder_path)

        return self.entities

    def _load_folder(self, folder_path: Path):
        """Load all entities from a folder."""
        for file_path in folder_path.glob('**/*.md'):
            entity = load_entity_from_file(str(file_path))
            if entity:
                if entity.id in self.entities:
                    self.duplicates[entity.id].append(str(file_path))
                    if len(self.duplicates[entity.id]) == 1:
                        self.duplicates[entity.id].insert(0, self.entities[entity.id].file_path)
                else:
                    self.entities[entity.id] = entity


# =============================================================================
# Validator
# =============================================================================

class VaultValidator:
    """Validates entity relationships in a vault."""

    def __init__(self, entities: Dict[str, Entity]):
        self.entities = entities
        self.errors: List[ValidationError] = []

    def validate_all(self) -> List[ValidationError]:
        """Run all validations."""
        self.errors = []

        for entity in self.entities.values():
            self._validate_entity(entity)

        return self.errors

    def _validate_entity(self, entity: Entity):
        """Validate a single entity."""
        self._validate_references_exist(entity)
        self._validate_decision_enables(entity)
        self._validate_document_implemented_by(entity)
        self._validate_implements(entity)
        self._validate_depends_on(entity)
        self._validate_parent_type(entity)

    def _validate_references_exist(self, entity: Entity):
        """Validate all referenced IDs exist."""
        # Check depends_on
        for dep_id in entity.depends_on:
            if dep_id not in self.entities:
                self.errors.append(ValidationError(
                    entity_id=entity.id,
                    field='depends_on',
                    message=f"Referenced entity '{dep_id}' not found",
                    severity='error',
                    file_path=entity.file_path,
                ))

        # Check blocked_by
        for blocker_id in entity.blocked_by:
            if blocker_id not in self.entities:
                self.errors.append(ValidationError(
                    entity_id=entity.id,
                    field='blocked_by',
                    message=f"Referenced entity '{blocker_id}' not found",
                    severity='warning',
                    file_path=entity.file_path,
                ))

        # Check implements
        for impl_id in entity.implements:
            if impl_id not in self.entities:
                self.errors.append(ValidationError(
                    entity_id=entity.id,
                    field='implements',
                    message=f"Referenced document '{impl_id}' not found",
                    severity='error',
                    file_path=entity.file_path,
                ))

        # Check enables (for decisions)
        for enabled_id in entity.enables:
            if enabled_id not in self.entities:
                self.errors.append(ValidationError(
                    entity_id=entity.id,
                    field='enables',
                    message=f"Referenced entity '{enabled_id}' not found",
                    severity='error',
                    file_path=entity.file_path,
                ))

        # Check implemented_by (for documents)
        for impl_by_id in entity.implemented_by:
            if impl_by_id not in self.entities:
                self.errors.append(ValidationError(
                    entity_id=entity.id,
                    field='implemented_by',
                    message=f"Referenced entity '{impl_by_id}' not found",
                    severity='error',
                    file_path=entity.file_path,
                ))

        # Check parent
        if entity.parent and entity.parent not in self.entities:
            self.errors.append(ValidationError(
                entity_id=entity.id,
                field='parent',
                message=f"Parent entity '{entity.parent}' not found",
                severity='error',
                file_path=entity.file_path,
            ))

        # Check supersedes
        if entity.supersedes and entity.supersedes not in self.entities:
            self.errors.append(ValidationError(
                entity_id=entity.id,
                field='supersedes',
                message=f"Superseded entity '{entity.supersedes}' not found",
                severity='error',
                file_path=entity.file_path,
            ))

    def _validate_decision_enables(self, entity: Entity):
        """Validate Decision.enables targets only valid entity types."""
        if entity.type != 'decision':
            return

        for enabled_id in entity.enables:
            enabled = self.entities.get(enabled_id)
            if enabled and enabled.type not in DECISION_ENABLES_VALID_TYPES:
                self.errors.append(ValidationError(
                    entity_id=entity.id,
                    field='enables',
                    message=f"Decision cannot enable {enabled.type} '{enabled_id}'. Valid types: {', '.join(DECISION_ENABLES_VALID_TYPES)}",
                    severity='error',
                    file_path=entity.file_path,
                ))

    def _validate_document_implemented_by(self, entity: Entity):
        """Validate Document.implemented_by targets only valid entity types."""
        if entity.type != 'document':
            return

        for impl_by_id in entity.implemented_by:
            impl_by = self.entities.get(impl_by_id)
            if impl_by and impl_by.type not in DOCUMENT_IMPLEMENTED_BY_VALID_TYPES:
                self.errors.append(ValidationError(
                    entity_id=entity.id,
                    field='implemented_by',
                    message=f"Document cannot be implemented by {impl_by.type} '{impl_by_id}'. Valid types: {', '.join(DOCUMENT_IMPLEMENTED_BY_VALID_TYPES)}",
                    severity='error',
                    file_path=entity.file_path,
                ))

    def _validate_implements(self, entity: Entity):
        """Validate implements field targets only documents."""
        if entity.type not in ('story', 'task', 'milestone'):
            return

        for impl_id in entity.implements:
            impl = self.entities.get(impl_id)
            if impl and impl.type not in IMPLEMENTS_VALID_TYPES:
                self.errors.append(ValidationError(
                    entity_id=entity.id,
                    field='implements',
                    message=f"{entity.type} cannot implement {impl.type} '{impl_id}'. Valid types: {', '.join(IMPLEMENTS_VALID_TYPES)}",
                    severity='error',
                    file_path=entity.file_path,
                ))

    def _validate_depends_on(self, entity: Entity):
        """Validate depends_on field targets only valid entity types."""
        valid_types = DEPENDS_ON_VALID_TYPES.get(entity.type, set())

        for dep_id in entity.depends_on:
            dep = self.entities.get(dep_id)
            if dep and dep.type not in valid_types:
                self.errors.append(ValidationError(
                    entity_id=entity.id,
                    field='depends_on',
                    message=f"{entity.type} cannot depend on {dep.type} '{dep_id}'. Valid types: {', '.join(valid_types)}",
                    severity='error',
                    file_path=entity.file_path,
                ))

    def _validate_parent_type(self, entity: Entity):
        """Validate parent type constraints."""
        if not entity.parent:
            return

        parent = self.entities.get(entity.parent)
        if not parent:
            return  # Already reported in references_exist

        expected_parent_types = {
            'story': 'milestone',
            'task': 'story',
        }

        expected = expected_parent_types.get(entity.type)
        if expected and parent.type != expected:
            self.errors.append(ValidationError(
                entity_id=entity.id,
                field='parent',
                message=f"Invalid parent type: expected '{expected}', got '{parent.type}'",
                severity='error',
                file_path=entity.file_path,
            ))



# =============================================================================
# Canvas Validator
# =============================================================================

class CanvasValidator:
    """Validates canvas file against entity data."""

    def __init__(self, canvas_path: str, entities: Dict[str, Entity]):
        self.canvas_path = canvas_path
        self.entities = entities
        self.errors: List[ValidationError] = []

    def validate(self) -> List[ValidationError]:
        """Validate the canvas file."""
        self.errors = []

        try:
            with open(self.canvas_path, 'r', encoding='utf-8') as f:
                canvas_data = json.load(f)
        except Exception as e:
            self.errors.append(ValidationError(
                entity_id='canvas',
                field='file',
                message=f"Failed to load canvas: {e}",
                severity='error',
                file_path=self.canvas_path,
            ))
            return self.errors

        nodes = canvas_data.get('nodes', [])
        edges = canvas_data.get('edges', [])

        # Validate nodes reference existing entities
        node_ids = set()
        for node in nodes:
            if node.get('type') == 'file':
                file_path = node.get('file', '')
                # Extract entity ID from file path
                entity_id = self._extract_entity_id_from_path(file_path)
                if entity_id:
                    node_ids.add(entity_id)
                    if entity_id not in self.entities:
                        self.errors.append(ValidationError(
                            entity_id=entity_id,
                            field='canvas_node',
                            message=f"Canvas references non-existent entity '{entity_id}'",
                            severity='warning',
                            file_path=self.canvas_path,
                        ))

        # Validate edges reference valid nodes
        for edge in edges:
            from_node = edge.get('fromNode', '')
            to_node = edge.get('toNode', '')
            # Note: edges reference node IDs, not entity IDs
            # This is a basic check - more detailed validation would need node ID mapping

        return self.errors

    def _extract_entity_id_from_path(self, file_path: str) -> Optional[str]:
        """Extract entity ID from a file path."""
        # File paths look like: Projects/AgentPlatform/milestones/M-001.md
        filename = Path(file_path).stem
        for prefix in ENTITY_PREFIXES.keys():
            if filename.startswith(prefix):
                return filename
        return None


# =============================================================================
# Main
# =============================================================================

def print_errors(errors: List[ValidationError], title: str):
    """Print validation errors grouped by severity."""
    if not errors:
        print(f"\n✅ {title}: No issues found")
        return

    error_count = sum(1 for e in errors if e.severity == 'error')
    warning_count = sum(1 for e in errors if e.severity == 'warning')

    print(f"\n{'❌' if error_count else '⚠️'} {title}: {error_count} errors, {warning_count} warnings")

    # Group by entity
    by_entity: Dict[str, List[ValidationError]] = defaultdict(list)
    for error in errors:
        by_entity[error.entity_id].append(error)

    for entity_id, entity_errors in sorted(by_entity.items()):
        print(f"\n  {entity_id}:")
        for error in entity_errors:
            icon = "❌" if error.severity == 'error' else "⚠️"
            print(f"    {icon} [{error.field}] {error.message}")


def main():
    """Main entry point."""
    print("=" * 60)
    print("Vault Validation Script")
    print("=" * 60)
    print(f"\nVault: {VAULT_PATH}")

    # Load entities
    print("\n📂 Loading entities...")
    loader = VaultLoader(VAULT_PATH)
    entities = loader.load()
    print(f"   Loaded {len(entities)} entities")

    # Report duplicates
    if loader.duplicates:
        print(f"\n⚠️  Found {len(loader.duplicates)} duplicate IDs:")
        for entity_id, paths in loader.duplicates.items():
            print(f"   {entity_id}:")
            for path in paths:
                print(f"     - {path}")

    # Count by type
    by_type: Dict[str, int] = defaultdict(int)
    for entity in entities.values():
        by_type[entity.type] += 1
    print("\n   By type:")
    for entity_type, count in sorted(by_type.items()):
        print(f"     {entity_type}: {count}")

    # Validate relationships
    print("\n🔍 Validating relationships...")
    validator = VaultValidator(entities)
    errors = validator.validate_all()
    print_errors(errors, "Relationship Validation")

    # Validate canvas
    canvas_path = os.path.join(VAULT_PATH, CANVAS_FILE)
    if os.path.exists(canvas_path):
        print(f"\n🎨 Validating canvas: {CANVAS_FILE}")
        canvas_validator = CanvasValidator(canvas_path, entities)
        canvas_errors = canvas_validator.validate()
        print_errors(canvas_errors, "Canvas Validation")
    else:
        print(f"\n⚠️  Canvas file not found: {canvas_path}")

    # Summary
    total_errors = sum(1 for e in errors if e.severity == 'error')
    total_warnings = sum(1 for e in errors if e.severity == 'warning')

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Total entities: {len(entities)}")
    print(f"Duplicate IDs: {len(loader.duplicates)}")
    print(f"Validation errors: {total_errors}")
    print(f"Validation warnings: {total_warnings}")

    if total_errors > 0:
        print("\n❌ Validation FAILED")
        return 1
    elif total_warnings > 0:
        print("\n⚠️  Validation passed with warnings")
        return 0
    else:
        print("\n✅ Validation PASSED")
        return 0


if __name__ == '__main__':
    exit(main())

