#!/usr/bin/env python3
"""
Fix malformed multi-line YAML arrays in vault files.

Fixes patterns like:
depends_on: []
  - M-002

To:
depends_on: [M-002]
"""

import os
import re
from pathlib import Path
from typing import List, Tuple


VAULT_PATH = "/Users/marc-ostan/Obsidian/OstanLabs/obsidian_notion_planning_system/obsidian-vault/Projects/AgentPlatform"


def fix_file(file_path: str, dry_run: bool = True) -> Tuple[bool, List[str]]:
    """Fix a single file. Returns (was_changed, list of changes)."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    changes = []
    
    # Pattern to match: field: []\n  - value (possibly multiple)
    # This captures the field name, then collects all the - items that follow
    pattern = r'^(\s*)(depends_on|blocked_by|implements|enables|implemented_by):\s*\[\]\n((?:\s+-\s+[^\n]+\n?)+)'
    
    def replace_multiline(match):
        indent = match.group(1)
        field = match.group(2)
        items_block = match.group(3)
        
        # Extract items from the block
        items = re.findall(r'-\s+([^\n]+)', items_block)
        items = [item.strip() for item in items]
        
        # Format as proper YAML array
        if items:
            new_value = '[' + ', '.join(items) + ']'
        else:
            new_value = '[]'
        
        changes.append(f"  Fixed: {field}: [] + items -> {field}: {new_value}")
        return f"{indent}{field}: {new_value}\n"
    
    content = re.sub(pattern, replace_multiline, content, flags=re.MULTILINE)
    
    was_changed = content != original_content
    
    if was_changed and not dry_run:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
    
    return was_changed, changes


def main():
    """Main entry point."""
    import argparse
    parser = argparse.ArgumentParser(description='Fix multi-line YAML arrays in vault files')
    parser.add_argument('--apply', action='store_true', help='Apply fixes (default is dry run)')
    args = parser.parse_args()
    
    dry_run = not args.apply
    
    print("=" * 60)
    print("Multi-line YAML Fixer")
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

