# ID Generation Fix: Quick Reference

**TL;DR**: Change MCP to scan vault files instead of using in-memory index

---

## The Problem

```
MCP index is stale → generates duplicate IDs when Plugin creates entities
```

## The Solution

```
MCP scans vault files directly → always sees latest entities → no duplicates
```

---

## Changes at a Glance

### File: `obsidian_mcp/src/services/v2/v2-runtime.ts`

#### 1. Make `getHighestIdForType()` scan vault (line 549)

**Before**:
```typescript
private getHighestIdForType(type: EntityType): number {
  const allMetadata = this.index.getAll();  // ❌ Stale index
  // ...
}
```

**After**:
```typescript
private async getHighestIdForType(type: EntityType): Promise<number> {
  const folders = this.pathResolver.getAllAbsoluteEntityFolders();
  // Scan all markdown files in folders
  // ...
}
```

#### 2. Add helper method (line ~590)

```typescript
private async getAllMarkdownFilesInFolder(folder: string): Promise<string[]> {
  // Recursively get all .md files
}
```

#### 3. Update `getNextId()` (line 576)

**Before**:
```typescript
const highest = this.getHighestIdForType(type);
```

**After**:
```typescript
const highest = await this.getHighestIdForType(type);
```

#### 4. Make `generateId()` async (line 1071)

**Before**:
```typescript
generateId(type: 'decision' | 'document'): EntityId {
  const highest = this.getHighestIdForType(type);
}
```

**After**:
```typescript
async generateId(type: 'decision' | 'document'): Promise<EntityId> {
  const highest = await this.getHighestIdForType(type);
}
```

#### 5. Update dependency (line 1278)

**Before**:
```typescript
generateId: (type) => this.generateId(type),
```

**After**:
```typescript
generateId: async (type) => await this.generateId(type),
```

---

## Testing Checklist

- [ ] Build: `npm run build`
- [ ] Create entity via MCP → verify ID
- [ ] Create entity via Plugin → verify ID
- [ ] Create via Plugin, then MCP → verify no collision
- [ ] Create via MCP, then Plugin → verify no collision
- [ ] Performance: <100ms per ID generation

---

## Implementation Steps

```bash
# 1. Navigate to MCP directory
cd obsidian_mcp

# 2. Make changes to src/services/v2/v2-runtime.ts
# (See detailed plan in ID_GENERATION_FIX_PLAN.md)

# 3. Build
npm run build

# 4. Test
node build/index.js

# 5. Verify no collisions
# (Create entities via both Plugin and MCP)
```

---

## Rollback

```bash
git checkout HEAD -- src/services/v2/v2-runtime.ts
npm run build
```

---

**Full Details**: See `ID_GENERATION_FIX_PLAN.md`

