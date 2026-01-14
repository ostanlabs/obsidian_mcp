# Fix: Feature Phase Field Not Filtering Correctly in API

**Issue ID:** OBSIDIAN-MCP-002  
**Priority:** Medium  
**Type:** Bug Fix  
**Affected Version:** Current  
**Related:** OBSIDIAN-MCP-001 (documented_by field issue)

---

## Problem Statement

The `phase` field on Feature entities is correctly persisted to markdown files but the `get_feature_coverage` API does not correctly filter by phase. When calling `get_feature_coverage` with a `phase` parameter, it returns empty results even though features with that phase exist.

### Evidence

**File contents (correct):**
```yaml
# F-021 (RBACABAC.md)
---
id: F-021
type: feature
title: RBAC/ABAC
tier: Premium
phase: "4"
---

# F-030 (Pattern_Mining.md)
---
id: F-030
type: feature
title: Pattern Mining
tier: Premium
phase: "5"
---

# F-011 (Self-Configuration_MCP_Tools.md)
---
id: F-011
type: feature
title: Self-Configuration MCP Tools
tier: OSS
phase: "1"
---
```

**API response (fails to filter):**
```json
// get_feature_coverage phase=4
{
  "features": [],  // ❌ Should return 12 features with phase "4"
  "summary": {
    "total": 0     // ❌ Should be 12
  }
}

// get_feature_coverage (no filter) - returns all 45 features
// But phase field shows "MVP" for all instead of actual values
```

**Impact:**
- Cannot query features by implementation phase
- Phase-based roadmap views are broken
- Planning queries like "what's in Phase 4" don't work

---

## Root Cause Analysis

The issue is likely in one or more of these locations:

### 1. Entity Parser (`src/services/v2/entity-parser.ts`)

The parser may not be extracting the `phase` field correctly, or may be defaulting to "MVP".

**Check:** Does `parseFeature()` extract the `phase` field from frontmatter?
```typescript
function parseFeature(frontmatter: any, content: string): Feature {
  return {
    // ...
    phase: frontmatter.phase || 'MVP',  // Is this defaulting incorrectly?
  };
}
```

### 2. Feature Coverage Tool (`src/tools/project-understanding-tools.ts`)

The `getFeatureCoverage` function may not be filtering correctly.

**Check:** Is the phase comparison working?
```typescript
// In getFeatureCoverage
const features = await deps.getAllFeatures({
  tier,
  phase,  // Is this being passed correctly?
  includeDeferred: true,
});
```

### 3. getAllFeatures Implementation

The dependency function may not be filtering by phase.

**Check:** Does `getAllFeatures` actually filter by phase parameter?

### 4. Type Mismatch

The phase might be stored as a string (`"4"`) but compared as a different type.

**Check:** Is there a type mismatch between stored value and filter value?
```typescript
// Stored in file: phase: "4" (string with quotes)
// Filter value: phase: 4 (might be passed as number)
// Comparison: "4" === 4 → false
```

---

## Type Definitions (Reference)

From `src/models/v2-types.ts`:

```typescript
/** Feature phase values */
export type FeaturePhase = 'MVP' | '0' | '1' | '2' | '3' | '4' | '5';

export interface Feature extends EntityBase {
  type: 'feature';
  id: FeatureId;
  
  /** Implementation phase */
  phase: FeaturePhase;
  
  // ... other fields
}
```

From `src/tools/tool-types.ts`:

```typescript
export interface GetFeatureCoverageInput {
  phase?: string;  // Should match FeaturePhase
  tier?: string;
  include_tests?: boolean;
}
```

---

## Required Changes

### Task 1: Verify Entity Parser

**File:** `src/services/v2/entity-parser.ts`

Ensure `parseFeature()` correctly extracts phase:
```typescript
function parseFeature(frontmatter: any, content: string): Feature {
  return {
    // ... existing fields ...
    phase: frontmatter.phase || 'MVP',  // Ensure this reads the actual value
  };
}
```

### Task 2: Fix Phase Filtering in getAllFeatures

**File:** Likely in `src/services/v2/index-service.ts` or similar

Ensure phase filtering uses string comparison:
```typescript
async getAllFeatures(options?: { tier?: string; phase?: string }) {
  let features = await this.getEntitiesByType('feature');
  
  if (options?.phase) {
    // Ensure string comparison
    features = features.filter(f => String(f.phase) === String(options.phase));
  }
  
  if (options?.tier) {
    features = features.filter(f => f.tier === options.tier);
  }
  
  return features;
}
```

### Task 3: Verify get_feature_coverage Tool

**File:** `src/tools/project-understanding-tools.ts`

Ensure phase parameter is passed through:
```typescript
export async function getFeatureCoverage(
  input: GetFeatureCoverageInput,
  deps: FeatureCoverageDependencies
): Promise<GetFeatureCoverageOutput> {
  const { phase, tier, include_tests } = input;

  const features = await deps.getAllFeatures({
    tier,
    phase,  // Verify this is being used
    includeDeferred: true,
  });
  
  // ... rest of function
}
```

### Task 4: Return Phase in Response

Ensure the phase field is included in the feature coverage response:
```typescript
const coverageItem: FeatureCoverageItem = {
  id: feature.id,
  title: feature.title,
  tier: feature.tier || 'OSS',
  phase: feature.phase || 'MVP',  // Ensure actual value is returned
  status: feature.status,
  // ... rest of fields
};
```

---

## Test Cases

### Test 1: Phase Field Parsing
```typescript
it('should parse phase field from Feature', async () => {
  // Feature with phase "4" in file
  const feature = await getEntity('F-021');
  expect(feature.phase).toBe('4');
});
```

### Test 2: Filter by Phase
```typescript
it('should filter features by phase', async () => {
  const coverage = await getFeatureCoverage({ phase: '4' });
  
  expect(coverage.features.length).toBeGreaterThan(0);
  expect(coverage.features.every(f => f.phase === '4')).toBe(true);
});
```

### Test 3: All Phase Values
```typescript
it('should return correct phase for all features', async () => {
  const coverage = await getFeatureCoverage({});
  
  const phase4Features = coverage.features.filter(f => f.phase === '4');
  const phase5Features = coverage.features.filter(f => f.phase === '5');
  
  expect(phase4Features.length).toBe(12);  // F-021 to F-029, F-034 to F-036
  expect(phase5Features.length).toBe(9);   // F-030 to F-033, F-037 to F-041
});
```

### Test 4: Phase Values Match Files
```typescript
it('should return phase values matching file contents', async () => {
  const f011 = await getEntity('F-011');
  const f021 = await getEntity('F-021');
  const f030 = await getEntity('F-030');
  
  expect(f011.phase).toBe('1');
  expect(f021.phase).toBe('4');
  expect(f030.phase).toBe('5');
});
```

---

## Expected Phase Distribution

After fix, `get_feature_coverage` should return:

| Phase | Count | Feature IDs |
|-------|-------|-------------|
| MVP | 17 | F-001 to F-010, F-013 to F-016, F-020, F-043 to F-045 |
| 1 | 1 | F-011 |
| 2 | 1 | F-012 |
| 3 | 4 | F-017, F-018, F-019, F-042 |
| 4 | 12 | F-021 to F-029, F-034 to F-036 |
| 5 | 10 | F-030 to F-033, F-037 to F-041 |
| **Total** | **45** | |

---

## Verification Steps

After implementing fixes:

1. **Restart MCP server** to reload changes

2. **Test phase parsing:**
   ```
   get_entity id=F-021 fields=["id","title","phase"]
   # Expected: phase: "4"
   
   get_entity id=F-030 fields=["id","title","phase"]
   # Expected: phase: "5"
   ```

3. **Test phase filtering:**
   ```
   get_feature_coverage phase=4
   # Expected: 12 features returned
   
   get_feature_coverage phase=5
   # Expected: 10 features returned
   ```

4. **Test unfiltered returns correct phases:**
   ```
   get_feature_coverage
   # Expected: Each feature shows its actual phase, not "MVP" for all
   ```

5. **Run existing tests:**
   ```bash
   npm test
   ```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/services/v2/entity-parser.ts` | Verify phase extraction |
| `src/services/v2/index-service.ts` | Fix phase filtering in getAllFeatures |
| `src/tools/project-understanding-tools.ts` | Verify phase passthrough and response |
| `src/tools/project-understanding-tools.test.ts` | Add test cases |

---

## Acceptance Criteria

- [x] `get_entity` returns correct `phase` field for Feature entities
- [x] `get_feature_coverage` without filter returns actual phase values (not all "MVP")
- [x] `get_feature_coverage phase=4` returns only Phase 4 features
- [x] `get_feature_coverage phase=5` returns only Phase 5 features
- [x] All existing tests pass
- [x] New test cases pass

---

## Implementation Status: ✅ COMPLETE

**Completed:** 2026-01-14

The fix was implemented in `src/services/v2/v2-runtime.ts` in the `getAllFeatures()` method:

```typescript
if (options?.phase) {
  // Use String() to ensure consistent comparison (phase might be passed as number)
  const phaseStr = String(options.phase);
  features = features.filter(f => f.phase === phaseStr);
}
```

The phase field is correctly:
1. Parsed from frontmatter in `entity-parser.ts`
2. Filtered in `getAllFeatures()` with string comparison
3. Passed through in `getFeatureCoverage()` tool
4. Returned in the coverage response
