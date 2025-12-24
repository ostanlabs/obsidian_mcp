#!/usr/bin/env python3
"""
Fix corrupted YAML in vault files.

Issues to fix:
1. Double-serialized arrays like: "[\"[\", \", \",\", \" \", M, -, \"0\", \"2\", \"]\", M-002]"
2. Bracket-wrapped references like: "[S-003]" instead of [S-003]
3. Malformed array syntax
"""

import os
import re
from pathlib import Path
from typing import Optional, List, Tuple


VAULT_PATH = "/Users/marc-ostan/Obsidian/OstanLabs/obsidian_notion_planning_system/obsidian-vault/Projects/AgentPlatform"

# Fields that should be arrays of entity IDs
ARRAY_FIELDS = ['depends_on', 'blocked_by', 'implements', 'enables', 'implemented_by']


def extract_entity_ids(value: str) -> List[str]:
    """Extract valid entity IDs from a potentially corrupted value."""
    # Pattern for valid entity IDs
    id_pattern = r'(M-\d{3}|S-\d{3}|T-\d{3}|DEC-\d{3}|DOC-\d{3})'
    
    # Find all valid IDs in the string
    ids = re.findall(id_pattern, value)
    
    # Remove duplicates while preserving order
    seen = set()
    unique_ids = []
    for id in ids:
        if id not in seen:
            seen.add(id)
            unique_ids.append(id)
    
    return unique_ids


def fix_array_field(line: str) -> Tuple[str, bool]:
    """Fix a single array field line. Returns (fixed_line, was_changed)."""
    # Match field: value pattern
    match = re.match(r'^(\s*)(depends_on|blocked_by|implements|enables|implemented_by):\s*(.*)$', line)
    if not match:
        return line, False
    
    indent = match.group(1)
    field = match.group(2)
    value = match.group(3).strip()
    
    # Skip if already empty array
    if value == '[]':
        return line, False
    
    # Skip if already properly formatted
    if re.match(r'^\[([A-Z]+-\d{3}(,\s*[A-Z]+-\d{3})*)\]$', value):
        return line, False
    
    # Extract valid entity IDs
    ids = extract_entity_ids(value)
    
    # Format as proper YAML array
    if ids:
        new_value = '[' + ', '.join(ids) + ']'
    else:
        new_value = '[]'
    
    new_line = f"{indent}{field}: {new_value}"
    
    return new_line, new_line != line


def fix_file(file_path: str, dry_run: bool = True) -> Tuple[bool, List[str]]:
    """Fix a single file. Returns (was_changed, list of changes)."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    changes = []
    new_lines = []
    in_frontmatter = False
    frontmatter_count = 0
    
    for i, line in enumerate(lines):
        if line.strip() == '---':
            frontmatter_count += 1
            in_frontmatter = frontmatter_count == 1
            new_lines.append(line)
            continue
        
        if in_frontmatter and frontmatter_count == 1:
            new_line, was_changed = fix_array_field(line)
            if was_changed:
                changes.append(f"  Line {i+1}: {line.strip()} -> {new_line.strip()}")
            new_lines.append(new_line)
        else:
            new_lines.append(line)
    
    if changes and not dry_run:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines))
    
    return bool(changes), changes


def main():
    """Main entry point."""
    import argparse
    parser = argparse.ArgumentParser(description='Fix corrupted YAML in vault files')
    parser.add_argument('--apply', action='store_true', help='Apply fixes (default is dry run)')
    args = parser.parse_args()
    
    dry_run = not args.apply
    
    print("=" * 60)
    print("Vault YAML Fixer")
    print("=" * 60)
    print(f"\nVault: {VAULT_PATH}")
    print(f"Mode: {'DRY RUN' if dry_run else 'APPLYING FIXES'}")
    
    folders = ['milestones', 'stories', 'tasks', 'decisions', 'documents']
    total_files = 0
    files_with_changes = 0
    
    for folder in folders:
        folder_path = Path(VAULT_PATH) / folder
        if not folder_path.exists():
            continue
        
        print(f"\n📁 {folder}/")
        
        for file_path in sorted(folder_path.glob('**/*.md')):
            total_files += 1
            was_changed, changes = fix_file(str(file_path), dry_run)
            
            if was_changed:
                files_with_changes += 1
                print(f"  {'Would fix' if dry_run else 'Fixed'}: {file_path.name}")
                for change in changes:
                    print(f"    {change}")
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Total files scanned: {total_files}")
    print(f"Files {'needing' if dry_run else 'with'} fixes: {files_with_changes}")
    
    if dry_run and files_with_changes > 0:
        print(f"\nRun with --apply to apply fixes")


if __name__ == '__main__':
    main()

