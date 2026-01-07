# ID Generation Fix: Implementation Plan

**Date**: 2025-12-25  
**Issue**: MCP's in-memory index can be stale, causing ID collisions with Plugin  
**Solution**: Change MCP to scan vault files directly (like Plugin does)  
**Effort**: 3 hours  
**Risk**: Low

---

## PROBLEM SUMMARY

### Current Behavior (Problematic)

**MCP** (`obsidian_mcp/src/services/v2/v2-runtime.ts`):
```typescript
private getHighestIdForType(type: EntityType): number {
  const allMetadata = this.index.getAll();  // ⚠️ Uses in-memory index
  // ... scans index for highest ID
}
```

**Issue**: Index is only updated when:
- MCP starts (initial vault scan)
- MCP creates/modifies entities
- **NOT** when Plugin creates entities

**Collision Scenario**:
```
1. MCP starts → index has S-001, S-002
2. User creates S-003 via Plugin
3. MCP index still shows S-001, S-002 (stale!)
4. AI calls create_entity → MCP generates S-003
5. ❌ COLLISION: Both created S-003
```

### Target Behavior (Fixed)

**MCP** (after fix):
```typescript
private async getHighestIdForType(type: EntityType): Promise<number> {
  // Scan vault files directly (always current)
  const folders = this.pathResolver.getAllAbsoluteEntityFolders();
  // ... scan files for highest ID
}
```

**Result**: Always accurate, no stale data, no collisions

---

## CHANGES REQUIRED

### File 1: `obsidian_mcp/src/services/v2/v2-runtime.ts`

**Location**: Lines 549-587

#### Change 1.1: Make `getHighestIdForType()` async and scan vault

**Current** (lines 549-570):
```typescript
private getHighestIdForType(type: EntityType): number {
  const prefix = this.idPrefixes.get(type);
  if (!prefix) return 0;

  let highest = 0;
  const allMetadata = this.index.getAll();  // ⚠️ PROBLEM: Uses stale index

  for (const metadata of allMetadata) {
    if (metadata.type !== type) continue;
    const match = metadata.id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > highest) {
        highest = num;
      }
    }
  }

  return highest;
}
```

**New** (replace entire function):
```typescript
/**
 * Get the highest ID number for a given entity type by scanning vault files.
 * This ensures we never generate duplicate IDs even if entities were created
 * by the Obsidian plugin while the MCP server was running.
 * 
 * NOTE: This scans the vault on every call to guarantee accuracy.
 * The index may be stale if the plugin creates entities.
 */
private async getHighestIdForType(type: EntityType): Promise<number> {
  const prefix = this.idPrefixes.get(type);
  if (!prefix) return 0;

  let highest = 0;
  const folders = this.pathResolver.getAllAbsoluteEntityFolders();

  for (const folder of folders) {
    try {
      const files = await this.getAllMarkdownFilesInFolder(folder);
      
      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const vaultPath = this.pathResolver.toVaultPath(filePath);
          const result = this.parser.parse(content, vaultPath);
          
          // Only consider entities of the target type
          if (result.entity.type === type) {
            // Extract numeric part from ID (e.g., "S-042" -> 42)
            const match = result.entity.id.match(new RegExp(`^${prefix}-(\\d+)$`));
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > highest) {
                highest = num;
              }
            }
          }
        } catch (err) {
          // Skip files that can't be parsed (not entities)
          continue;
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error(`[V2Runtime] Error scanning folder ${folder}:`, err);
      }
    }
  }

  return highest;
}
```

#### Change 1.2: Add helper method `getAllMarkdownFilesInFolder()`

**Location**: Add after `getHighestIdForType()` (around line 590)

**New method**:
```typescript
/**
 * Get all markdown files in a folder (recursively)
 */
private async getAllMarkdownFilesInFolder(folder: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(folder, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subFiles = await this.getAllMarkdownFilesInFolder(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.error(`[V2Runtime] Error reading folder ${folder}:`, err);
    }
  }
  
  return files;
}
```

#### Change 1.3: Update `getNextId()` to await async call

**Current** (lines 572-587):
```typescript
async getNextId(type: EntityType): Promise<EntityId> {
  const highest = this.getHighestIdForType(type);  // ⚠️ Not awaited
  const next = highest + 1;
  // ...
}
```

**New** (replace line 576):
```typescript
async getNextId(type: EntityType): Promise<EntityId> {
  // Scan vault to find highest ID (always current, never stale)
  const highest = await this.getHighestIdForType(type);  // ✅ Now awaited
  const next = highest + 1;

  const prefix = this.idPrefixes.get(type);
  if (!prefix) {
    throw new Error(`Unknown entity type: ${type}`);
  }

  // Zero-pad to 3 digits (e.g., S-001, M-012, T-123)
  const padded = String(next).padStart(3, '0');
  return `${prefix}-${padded}` as EntityId;
}
```

#### Change 1.4: Update `generateId()` method (for decisions/documents)

**Location**: Lines 1070-1086

**Current**:
```typescript
generateId(type: 'decision' | 'document'): EntityId {
  const highest = this.getHighestIdForType(type);  // ⚠️ Not awaited
  // ...
}
```

**New**:
```typescript
async generateId(type: 'decision' | 'document'): Promise<EntityId> {
  // Scan vault to find highest ID (always current, never stale)
  const highest = await this.getHighestIdForType(type);  // ✅ Now awaited
  const next = highest + 1;

  const prefix = this.idPrefixes.get(type);
  if (!prefix) {
    throw new Error(`Unknown entity type: ${type}`);
  }

  const padded = String(next).padStart(3, '0');
  return `${prefix}-${padded}` as EntityId;
}
```

#### Change 1.5: Update callers of `generateId()` to await

**Location**: Line 1278 (in `getDecisionDocumentDeps()`)

**Current**:
```typescript
generateId: (type) => this.generateId(type),
```

**New**:
```typescript
generateId: async (type) => await this.generateId(type),
```

---

## SUMMARY OF CHANGES

### Files Modified: 1
- `obsidian_mcp/src/services/v2/v2-runtime.ts`

### Changes:
1. ✅ Make `getHighestIdForType()` async and scan vault files instead of index
2. ✅ Add `getAllMarkdownFilesInFolder()` helper method
3. ✅ Update `getNextId()` to await the async call
4. ✅ Update `generateId()` to be async and await the call
5. ✅ Update `generateId` dependency to be async

### Lines Changed: ~100 lines
- Lines 549-570: Replace `getHighestIdForType()` (~60 lines)
- Line ~590: Add `getAllMarkdownFilesInFolder()` (~30 lines)
- Line 576: Add `await` keyword
- Lines 1070-1086: Make `generateId()` async
- Line 1278: Make dependency async

---

## TESTING PLAN

### Test 1: Basic ID Generation
```bash
# Start MCP server
cd obsidian_mcp
npm run build
node build/index.js

# In another terminal, test via MCP client
# Create entity → verify ID is S-001
# Create another → verify ID is S-002
```

### Test 2: Plugin + MCP Concurrent Usage
```bash
# 1. Start MCP server
# 2. Open Obsidian with Plugin
# 3. Create entity via Plugin → S-001
# 4. Create entity via MCP → should be S-002 (not S-001!)
# 5. Create entity via Plugin → S-003
# 6. Create entity via MCP → should be S-004 (not S-003!)
```

### Test 3: Performance
```bash
# Measure ID generation time
# Should be <100ms even with 1000 entities
```

### Test 4: Edge Cases
```bash
# Empty vault → should generate M-001
# Gaps in IDs (M-001, M-003) → should generate M-004
# Mixed types → should track separately
```

---

## ROLLBACK PLAN

If issues occur, revert to index-based approach:

```bash
git diff HEAD~1 obsidian_mcp/src/services/v2/v2-runtime.ts
git checkout HEAD~1 -- obsidian_mcp/src/services/v2/v2-runtime.ts
npm run build
```

---

## PERFORMANCE CONSIDERATIONS

### Before (Index-based)
- **Time**: O(n) where n = entities of target type in index
- **I/O**: 0 (in-memory)
- **Speed**: ~1ms

### After (Vault scanning)
- **Time**: O(n) where n = markdown files in entity folders
- **I/O**: Read all markdown files
- **Speed**: ~50-100ms (depends on vault size)

### Optimization Opportunities (Future)
1. **Cache results** for 1 second (reduce repeated scans)
2. **File watching** to keep index updated
3. **Parallel file reading** (Promise.all)

---

## NEXT STEPS

1. ✅ Review this plan
2. ⏳ Implement changes
3. ⏳ Run tests
4. ⏳ Update MCP_IMPLEMENTATION_SPEC.md (mark Phase 1.1 as complete)
5. ⏳ Monitor for collisions in production

---

**Status**: Ready for implementation  
**Estimated Time**: 3 hours  
**Risk Level**: Low

