# Fix: Feature-Document Relationship Fields Not Returned by API

**Issue ID:** OBSIDIAN-MCP-001  
**Priority:** High  
**Type:** Bug Fix  
**Affected Version:** Current  

---

## Problem Statement

The `documents` field on Document entities and `documented_by` field on Feature entities are correctly persisted to markdown files but are NOT being returned by the MCP API. This breaks the `get_feature_coverage` tool which relies on these fields to calculate documentation coverage.

### Evidence

**File contents (correct):**
```yaml
# DOC-021 (MCP_Frontend_Specification.md)
---
id: DOC-021
type: document
documents: [F-001]  # ✅ Saved correctly
---

# F-001 (MCP_Frontend.md)
---
id: F-001
type: feature
documented_by: [DOC-021]  # ✅ Saved correctly
---
```

**API response (missing fields):**
```json
// get_entity id=DOC-021
{
  "id": "DOC-021",
  "type": "document",
  "title": "MCP Frontend Specification"
  // ❌ Missing: "documents" field
}

// get_entity id=F-001
{
  "id": "F-001", 
  "type": "feature",
  "title": "MCP Frontend"
  // ❌ Missing: "documented_by" field
}
```

**Impact:**
```json
// get_feature_coverage returns:
{
  "documentation": {
    "specs": [],      // ❌ Should be ["DOC-021"]
    "coverage": "none" // ❌ Should be "partial" or "full"
  }
}
```

---

## Root Cause Analysis

The issue is likely in one of these locations:

### 1. Entity Parser (`src/services/v2/entity-parser.ts`)

The parser may not be extracting `documents` and `documented_by` fields from the YAML frontmatter.

**Check:** Does `parseDocument()` extract the `documents` field?
**Check:** Does `parseFeature()` extract the `documented_by` field?

### 2. Entity Serializer (`src/services/v2/entity-serializer.ts`)

The serializer may not be including these fields when converting entities to API responses.

**Check:** Are `documents` and `documented_by` included in the serialized output?

### 3. Index Manager (`src/services/v2/index-manager.ts`)

The index might not be storing/returning these relationship fields.

**Check:** Does the entity metadata include these fields?

### 4. get_entity Tool (`src/tools/entity-management-tools.ts`)

The tool may be filtering out these fields from the response.

**Check:** Is there a field whitelist that excludes `documents`/`documented_by`?

---

## Type Definitions (Reference)

From `src/models/v2-types.ts`:

```typescript
// Document entity
export interface Document extends EntityBase {
  type: 'document';
  id: DocumentId;
  // ... other fields ...
  
  /** Features this document describes (syncs to Feature.documented_by) */
  documents?: FeatureId[];
}

// Feature entity  
export interface Feature extends EntityBase {
  type: 'feature';
  id: FeatureId;
  // ... other fields ...
  
  /** Documents that describe this feature (auto-synced from Document.documents) */
  documented_by?: DocumentId[];
}
```

---

## Required Changes

### Task 1: Update Entity Parser

**File:** `src/services/v2/entity-parser.ts`

Ensure `parseDocument()` extracts `documents` field:
```typescript
function parseDocument(frontmatter: any, content: string): Document {
  return {
    // ... existing fields ...
    documents: frontmatter.documents || [],  // Add this
  };
}
```

Ensure `parseFeature()` extracts `documented_by` field:
```typescript
function parseFeature(frontmatter: any, content: string): Feature {
  return {
    // ... existing fields ...
    documented_by: frontmatter.documented_by || [],  // Add this
  };
}
```

### Task 2: Update Entity Serializer (if needed)

**File:** `src/services/v2/entity-serializer.ts`

Ensure these fields are included in serialization:
```typescript
function serializeDocument(doc: Document): Record<string, any> {
  return {
    // ... existing fields ...
    documents: doc.documents,  // Ensure included
  };
}

function serializeFeature(feature: Feature): Record<string, any> {
  return {
    // ... existing fields ...
    documented_by: feature.documented_by,  // Ensure included
  };
}
```

### Task 3: Update get_entity Tool

**File:** `src/tools/entity-management-tools.ts`

Add `documents` and `documented_by` to the allowed fields list if there's a whitelist:
```typescript
const ALLOWED_FIELDS = [
  // ... existing fields ...
  'documents',      // Add for Document
  'documented_by',  // Add for Feature
];
```

### Task 4: Verify get_feature_coverage

**File:** `src/tools/project-understanding-tools.ts`

The `getFeatureCoverage` function already has correct logic:
```typescript
// This should work once fields are returned
for (const doc of allDocs) {
  if (doc.documents && doc.documents.length > 0) {
    for (const featureId of doc.documents) {
      // ... builds docsByFeature map
    }
  }
}
```

Verify this logic works after parser/serializer fixes.

---

## Test Cases

### Test 1: Document.documents Field Parsing
```typescript
it('should parse documents field from Document', async () => {
  // Create document with documents field
  await createDocument({
    title: 'Test Spec',
    documents: ['F-001']
  });
  
  const doc = await getEntity('DOC-XXX');
  expect(doc.documents).toEqual(['F-001']);
});
```

### Test 2: Feature.documented_by Field Parsing
```typescript
it('should parse documented_by field from Feature', async () => {
  // Create feature with documented_by field
  await createFeature({
    title: 'Test Feature',
    documented_by: ['DOC-001']
  });
  
  const feature = await getEntity('F-XXX');
  expect(feature.documented_by).toEqual(['DOC-001']);
});
```

### Test 3: Bidirectional Sync
```typescript
it('should sync documents <-> documented_by', async () => {
  // Update document to reference feature
  await updateEntity('DOC-001', { documents: ['F-001'] });
  
  // Verify feature has documented_by
  const feature = await getEntity('F-001');
  expect(feature.documented_by).toContain('DOC-001');
});
```

### Test 4: Feature Coverage Includes Documentation
```typescript
it('should include documentation in feature coverage', async () => {
  // Setup: Document references Feature
  await updateEntity('DOC-021', { documents: ['F-001'] });
  
  const coverage = await getFeatureCoverage({ tier: 'OSS' });
  const f001 = coverage.features.find(f => f.id === 'F-001');
  
  expect(f001.documentation.specs).toContain('DOC-021');
  expect(f001.documentation.coverage).not.toBe('none');
});
```

---

## Verification Steps

After implementing fixes:

1. **Restart MCP server** to reload changes

2. **Test field parsing:**
   ```
   get_entity id=DOC-021 fields=["id","title","documents"]
   # Expected: documents: ["F-001"]
   
   get_entity id=F-001 fields=["id","title","documented_by"]
   # Expected: documented_by: ["DOC-021"]
   ```

3. **Test feature coverage:**
   ```
   get_feature_coverage tier=OSS
   # Expected: F-001 shows documentation.specs: ["DOC-021"]
   ```

4. **Run existing tests:**
   ```bash
   npm test
   ```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/services/v2/entity-parser.ts` | Add `documents` to parseDocument, `documented_by` to parseFeature |
| `src/services/v2/entity-serializer.ts` | Ensure fields are serialized |
| `src/tools/entity-management-tools.ts` | Add fields to allowed list (if whitelist exists) |
| `src/services/v2/entity-parser.test.ts` | Add test cases |
| `src/tools/project-understanding-tools.ts` | Verify logic (likely no changes needed) |

---

## Acceptance Criteria

- [ ] `get_entity` returns `documents` field for Document entities
- [ ] `get_entity` returns `documented_by` field for Feature entities  
- [ ] `get_feature_coverage` correctly shows documentation coverage
- [ ] Bidirectional sync works (update one side, other side reflects)
- [ ] All existing tests pass
- [ ] New test cases pass
