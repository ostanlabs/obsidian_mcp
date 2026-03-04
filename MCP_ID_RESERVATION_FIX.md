cl# MCP Server Fix: Entity ID Reservation via client_id

## Problem

When creating entities via the `entities` batch tool or the `entity` create tool, the
`client_id` field is treated purely as a local idempotency key — it is used to correlate
the response back to the request, but it has no effect on which ID the server actually
assigns to the new entity.

The server always assigns IDs by scanning the vault for all existing entities of the
same prefix (T-, S-, M-, DEC-, F-, DOC-), finding the highest number, and incrementing
by 1. The requested `client_id` value is ignored for ID assignment purposes.

### Why this matters for AI agents

When an AI agent (Claude) creates entities in a session, it:

1. Checks the current highest ID at the start of a planning sequence (e.g. sees T-690 is
   the highest task)
2. Plans a batch of new entities and assigns them logical IDs in prose and documentation
   (T-691, T-692, T-693 ...)
3. Calls the batch create tool with `client_id: "T-691"` etc.
4. Receives back `"id": "T-694"` because T-691, T-692, T-693 were created by other
   operations earlier in the session or already existed in archived/other-workstream files

This forces the agent to:
- Do a correction pass after every batch to read back actual assigned IDs
- Re-scan all documentation and specs already written with the wrong IDs
- Note discrepancies explicitly to avoid broken cross-references

This costs tokens, introduces error surface, and breaks the natural planning flow where
the agent reasons about IDs before creating entities.

### Concrete example from a real session

Agent checks high-water mark: highest task is T-690.
Agent plans: T-691 (retire ExecutionStore), T-692 (CLI commands), T-693 (bootstrap prompt).
Agent writes spec referencing T-691, T-692, T-693.
Agent calls batch create with client_id "T-691", "T-692", "T-693".
Server responds: actual IDs are T-694, T-695, T-696.
Agent must now re-read all written documentation and fix every reference.

---

## How IDs are currently assigned (observed behaviour)

From vault file inspection, each entity is stored as a markdown file with YAML frontmatter:

```yaml
---
id: T-694
type: task
title: "Retire ExecutionStore: route /api/v1/executions to TelemetryStore"
workstream: engineering
status: Not Started
---
```

Files are named by title slug, not by ID. The ID lives only in the frontmatter.

The server maintains an in-memory index. On startup (and after file changes), it scans
all markdown files, reads the `id` field from frontmatter, and tracks the maximum number
seen per prefix. New entities are assigned `max_seen + 1`.

---

## Required Fix

### Behaviour change

When a `client_id` value is provided that matches the entity ID format for that type
(e.g. `T-\d+` for tasks, `S-\d+` for stories, `M-\d+` for milestones, `DEC-\d+` for
decisions, `F-\d+` for features, `DOC-\d+` for documents), treat it as a **requested
ID** rather than a pure idempotency key:

1. Check whether the requested ID already exists in the index.
2. If the slot is **free**: assign the requested ID to the new entity.
3. If the slot is **taken**: fall back to `max + 1` as today, and include a
   `"id_conflict": true` and `"requested_id": "T-691"` field in the response so the
   caller knows the reservation failed.

If `client_id` does not match the entity ID format (e.g. it's a UUID or an arbitrary
string like `"new-task-1"`), treat it as a pure idempotency key with no ID reservation
semantics — existing behaviour unchanged.

### Idempotency is preserved

The idempotency guarantee must be preserved. If the same `client_id` is submitted again
(retry), and an entity with that `client_id` was already created, the server should
return the existing entity rather than creating a duplicate — exactly as today. The ID
reservation change only affects the *first* creation, not retries.

### Response contract

Success (slot was free, requested ID assigned):
```json
{
  "client_id": "T-691",
  "status": "ok",
  "id": "T-691"
}
```

Conflict (slot was taken, fallback ID assigned):
```json
{
  "client_id": "T-691",
  "status": "ok",
  "id": "T-694",
  "id_conflict": true,
  "requested_id": "T-691"
}
```

Retry / idempotent hit (entity already exists with this client_id):
```json
{
  "client_id": "T-691",
  "status": "ok",
  "id": "T-691",
  "idempotent": true
}
```

---

## ID Format Patterns (for the regex check)

| Entity type | Prefix | Pattern |
|-------------|--------|---------|
| task | T- | `^T-\d+$` |
| story | S- | `^S-\d+$` |
| milestone | M- | `^M-\d+$` |
| decision | DEC- | `^DEC-\d+$` |
| feature | F- | `^F-\d+$` |
| document | DOC- | `^DOC-\d+$` |

A `client_id` that matches the pattern for the entity type being created is treated as
a requested ID. A `client_id` that matches a *different* type's pattern (e.g. passing
`"S-001"` when creating a task) should fall back to normal idempotency behaviour —
do not cross-assign IDs between types.

---

## What does NOT need to change

- The `entity` single-create tool: same logic applies — if `client_id` matches the
  entity type's pattern and the slot is free, use it.
- The index rebuild and file watcher: no change needed. The index already scans `id`
  from frontmatter; it will naturally pick up the reserved ID.
- The max-tracking logic: still needed as the fallback. Only the assignment step changes.
- Vault file naming: files are still named by title slug, not by ID. No change.
- Archived entity IDs: archived entities still hold their ID in the index and block
  that slot. Requesting an archived entity's ID should be treated as a conflict.

---

## Acceptance Criteria

1. `client_id: "T-691"` on a batch create, when T-691 does not exist in the vault,
   results in an entity with `id: T-691` in the frontmatter.
2. `client_id: "T-691"` when T-691 already exists results in `id_conflict: true` in
   the response and a new entity assigned the next available ID.
3. `client_id: "my-local-ref"` (non-matching format) continues to work as a pure
   idempotency key with no ID reservation — no behaviour change.
4. Submitting the same `client_id` twice creates only one entity (idempotency preserved).
5. The high-water mark tracker updates correctly after a reservation — if T-691 is
   reserved and the previous max was T-690, the next auto-assigned ID is T-692 (not
   T-691 again).
6. Requesting `S-001` when creating a task (type mismatch) falls back to normal
   auto-assignment with no cross-type ID assignment.

---

## Implementation Review Questions

_The following questions were raised during implementation review. Please clarify or
confirm so implementation can proceed._

### Q1: `entity` Tool Schema Change

The spec mentions (line 147-148) that the `entity` single-create tool should have the
same ID reservation logic. However, the current `EntityInput` interface **does not have
a `client_id` field** — only the batch tool has it.

**Question**: Should we add `client_id?: string` to the `entity` tool's input schema?
This would be a breaking schema change for the MCP tool definition.

**Proposed**: Yes, add `client_id` to `EntityInput` for consistency.

**DECISION: No — out of scope for this fix.**

The `entity` single-create tool is not used by Claude in normal planning sessions — the
`entities` batch tool is the primary creation surface. Adding `client_id` to `EntityInput`
is a schema change that requires documentation, testing, and MCP tool definition updates,
for a tool that doesn't have the problem in the first place. Do not add it. The ID
reservation logic applies only to the `entities` batch tool where `client_id` already
exists as a first-class field. Revisit if single-entity creation becomes a common pattern.

---

### Q2: Cross-Request Idempotency Scope

The spec mentions (lines 88-91) that retrying the same `client_id` should return the
existing entity. However, `client_id` is currently only tracked **within a single batch
call** (in-memory `Set`). It is not persisted anywhere.

**Scenario**:
- Request 1: `client_id: "T-691"` → creates T-691
- Request 2 (separate API call): `client_id: "T-691"` → what happens?

**Current behavior**: Request 2 would see T-691 exists and return `id_conflict: true`
with a fallback ID, because we have no way to know that Request 2's `client_id` matches
Request 1's `client_id`.

**Question**: Is within-batch idempotency sufficient, or do we need cross-request
idempotency (which would require persisting `client_id` → `EntityId` mappings)?

**Proposed**: Within-batch idempotency is sufficient. Cross-request "retries" where
`client_id` matches an existing ID pattern will be treated as conflicts (since we
cannot verify it's the same caller).

**DECISION: Confirm proposed — within-batch idempotency only.**

Cross-request idempotency would require a persistent `client_id → EntityId` store that
survives across MCP server restarts, which is significant complexity for an edge case
that never occurs in practice. Claude submits a batch once per planning session and does
not retry individual operations across separate calls. Within-batch deduplication (the
existing `processedClientIds` Set) is the only scenario that actually matters. Do not
add persistent `client_id` storage.

---

### Q3: Conflict vs Idempotent Disambiguation

Related to Q2: If `client_id: "T-691"` is submitted and T-691 already exists in the
vault (created by a previous request or by the Obsidian plugin), should the response be:

- **Option A**: `id_conflict: true` with a new fallback ID assigned
- **Option B**: `idempotent: true` returning the existing T-691 entity

The spec shows both response types but doesn't clarify how to distinguish them when
we don't have persistent `client_id` tracking.

**Proposed**: Option A — treat as conflict. The `idempotent: true` response is only
returned for duplicate `client_id` values **within the same batch request**.

**DECISION: Confirm Option A — always treat cross-request matches as conflicts.**

The two cases are semantically different:
- `idempotent: true` means "you already did this in this batch, here is the entity you
  created" — the caller knows they're retrying the same operation.
- `id_conflict: true` means "the slot you wanted was taken, here is a different ID" —
  the caller knows they need to update their references.

Since we cannot reliably distinguish a genuine retry from a slot collision without
persistent storage, always returning `id_conflict: true` for cross-request cases is
the safer and clearer signal. The caller (Claude) handles both by reading the actual
`id` from the response — the distinction matters for observability/logging but not for
correctness.

---

### Q4: Response Contract for `entity` Tool

The `EntityCreateOutput` interface currently has:
```typescript
interface EntityCreateOutput {
  id: EntityId;
  entity?: EntityFull | Partial<EntityFull>;
  dependencies_created: number;
  canvas_node_added: boolean;
  messages?: string[];
}
```

**Question**: Should we add the same conflict/idempotency fields to `EntityCreateOutput`?
```typescript
id_conflict?: boolean;
requested_id?: EntityId;
idempotent?: boolean;
```

**Proposed**: Yes, add these fields for consistency with `BatchOpResult`.

**DECISION: No — skip `EntityCreateOutput`, only change `BatchOpResult`.**

Following from Q1: the `entity` single-create tool is out of scope for this fix and
should not get the ID reservation behaviour. Therefore adding these fields to
`EntityCreateOutput` would be dead code — the fields would never be populated since
the reservation logic won't run for that path. Only `BatchOpResult` needs the three
new optional fields (`id_conflict`, `requested_id`, `idempotent`). Keep the change
minimal and consistent with the scope decision in Q1.

---

### Confirmed Implementation Plan

All questions resolved. Proceed with:

1. ~~Add `client_id?: string` to `EntityInput` interface~~ — **out of scope (Q1)**
2. Add `id_conflict?`, `requested_id?`, `idempotent?` to **`BatchOpResult` only** — not `EntityCreateOutput` (Q4)
3. Create helper function `isValidIdForType(clientId: string, entityType: EntityType): boolean`
4. Modify `getBatchOperationsDeps().createEntity` to accept optional `requestedId`
5. Implement ID reservation logic: check if slot is free, use requested ID or fallback
6. Within-batch idempotency only — no persistent `client_id` storage (Q2)
7. Cross-request submissions with matching ID patterns always return `id_conflict: true` (Q3)