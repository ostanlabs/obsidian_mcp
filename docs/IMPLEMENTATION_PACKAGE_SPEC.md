# Implementation Package Specification

> **Version:** 2.0
> **Date:** December 2024
> **Scope:** MCP Server - `generate_implementation_package()` Tool
> **Status:** Implementation Spec

---

## Overview

When handing work to an implementing agent (like Claude Code), we need to provide exactly the right amount of context: enough to complete the task, but not so much that it overwhelms the context window or causes confusion. This document specifies the algorithm and format for generating implementation packages.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Package Structure](#package-structure)
3. [Generation Algorithm](#generation-algorithm)
4. [Context Resolution](#context-resolution)
5. [Content Extraction](#content-extraction)
6. [Size Management](#size-management)
7. [Tool Interface](#tool-interface)
8. [Examples](#examples)

---

## Design Principles

### Include

| Content Type | Rationale |
|--------------|-----------|
| Primary spec | The thing being implemented |
| Required context docs | Referenced specs that are essential |
| Relevant decisions | Choices that constrain implementation |
| Acceptance criteria | How to know when done |
| Technical constraints | Non-functional requirements |

### Exclude

| Content Type | Rationale |
|--------------|-----------|
| Other specs | Noise, not relevant to this task |
| Project status | Implementing agent doesn't need to know velocity |
| Historical decisions | Only current state matters |
| Organizational info | Workstreams, ownership, etc. |
| Full reference docs | Summary is sufficient |

### Principles

1. **Minimal Viable Context**: Include only what's needed to implement
2. **No Ambiguity**: Resolve all references to concrete content
3. **Self-Contained**: Package should work without additional queries
4. **Prioritized**: Most important content first (for truncation)
5. **Structured**: Clear sections for different content types

---

## Package Structure

```typescript
interface ImplementationPackage {
  // === METADATA ===
  generated_at: ISODateTime;
  target_entity: EntitySummary;
  
  // === PRIMARY CONTENT ===
  primary_spec: {
    id: string;
    title: string;
    full_content: string;           // Complete markdown content
    acceptance_criteria: string[];  // Extracted for easy reference
  };
  
  // === REQUIRED CONTEXT ===
  required_context: RequiredContextDoc[];
  
  // === REFERENCE LINKS ===
  reference_links: ReferenceSummary[];
  
  // === DECISIONS ===
  relevant_decisions: DecisionSummary[];
  
  // === CONSTRAINTS ===
  constraints: {
    technical: string[];
    security: string[];
    performance: string[];
    compatibility: string[];
  };
  
  // === OPEN ITEMS ===
  open_items: OpenItem[];
  
  // === RELATED SYSTEMS ===
  related_systems: string[];        // Names only, for awareness
  
  // === SIZE INFO ===
  package_stats: {
    total_tokens_estimate: number;
    primary_spec_tokens: number;
    required_context_tokens: number;
    decisions_tokens: number;
    truncated: boolean;
    truncation_reason?: string;
  };
}

interface RequiredContextDoc {
  id: string;
  title: string;
  doc_type: DocumentType;
  relevance: string;                // Why this is needed
  full_content: string;             // Complete markdown content
}

interface ReferenceSummary {
  id: string;
  title: string;
  doc_type: DocumentType;
  summary: string;                  // 2-3 sentence summary
  vault_path: string;               // For retrieval if needed
}

interface DecisionSummary {
  id: string;
  title: string;
  decision: string;                 // The actual decision made
  relevance: string;                // Why this affects implementation
  rationale_summary?: string;       // Brief rationale
}

interface OpenItem {
  description: string;
  severity: 'blocker' | 'warning' | 'info';
  suggested_action?: string;
}
```

---

## Generation Algorithm

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    generate_implementation_package()             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. VALIDATE INPUT                                                │
│    • Entity exists                                               │
│    • Entity is implementable (Document or Story)                │
│    • Entity is in valid state (Approved/Ready)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. LOAD PRIMARY SPEC                                            │
│    • Read full markdown content                                 │
│    • Extract frontmatter                                        │
│    • Extract acceptance criteria                                │
│    • Extract constraints sections                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. RESOLVE CONTEXT                                              │
│    • Get implementation_context from frontmatter                │
│    • Categorize: required vs reference                          │
│    • Load required docs (full content)                          │
│    • Generate summaries for reference docs                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. GATHER DECISIONS                                             │
│    • Find decisions that enable this entity                     │
│    • Find decisions referenced in spec                          │
│    • Filter to relevant (exclude superseded)                    │
│    • Extract decision + rationale summary                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. CHECK OPEN ITEMS                                             │
│    • Scan for TODO/FIXME in spec                                │
│    • Check for unresolved questions                             │
│    • Check for pending decisions that affect this               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. MANAGE SIZE                                                  │
│    • Estimate total tokens                                      │
│    • If over budget: truncate reference docs                    │
│    • If still over: summarize required docs                     │
│    • Record truncation info                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. ASSEMBLE PACKAGE                                             │
│    • Structure all content                                      │
│    • Add metadata                                               │
│    • Compute stats                                              │
│    • Return package                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
async function generateImplementationPackage(
  entityId: EntityId,
  options?: {
    max_tokens?: number;           // Default: 50000
    include_rationale?: boolean;   // Include decision rationale
    skip_validation?: boolean;     // Skip readiness checks
  }
): Promise<ImplementationPackage> {
  const maxTokens = options?.max_tokens ?? 50000;
  
  // 1. VALIDATE INPUT
  const metadata = index.primary.get(entityId);
  if (!metadata) {
    throw new Error(`Entity not found: ${entityId}`);
  }
  
  if (!isImplementable(metadata)) {
    throw new Error(`Entity ${entityId} is not implementable (must be Document or Story)`);
  }
  
  if (!options?.skip_validation && !isReadyForImplementation(metadata)) {
    throw new Error(`Entity ${entityId} is not ready for implementation (status: ${metadata.status})`);
  }
  
  // 2. LOAD PRIMARY SPEC
  const primaryContent = await loadFullContent(metadata.vault_path);
  const primaryFrontmatter = parseFrontmatter(primaryContent);
  const acceptanceCriteria = extractAcceptanceCriteria(primaryContent);
  const constraints = extractConstraints(primaryContent);
  
  // 3. RESOLVE CONTEXT
  const implContext = primaryFrontmatter.implementation_context ?? {
    required: [],
    reference: [],
    assumes: [],
  };
  
  const requiredDocs = await resolveRequiredContext(implContext.required);
  const referenceDocs = await resolveReferenceContext(implContext.reference);
  const relatedSystems = implContext.assumes ?? [];
  
  // 4. GATHER DECISIONS
  const relevantDecisions = await gatherRelevantDecisions(entityId, primaryContent);
  
  // 5. CHECK OPEN ITEMS
  const openItems = await checkOpenItems(entityId, primaryContent);
  
  // 6. MANAGE SIZE
  const { 
    finalRequiredDocs, 
    finalReferenceDocs, 
    finalDecisions,
    truncated,
    truncationReason 
  } = await manageSize(
    primaryContent,
    requiredDocs,
    referenceDocs,
    relevantDecisions,
    maxTokens
  );
  
  // 7. ASSEMBLE PACKAGE
  const package_: ImplementationPackage = {
    generated_at: new Date().toISOString(),
    target_entity: toEntitySummary(metadata),
    
    primary_spec: {
      id: metadata.id,
      title: metadata.title,
      full_content: primaryContent,
      acceptance_criteria: acceptanceCriteria,
    },
    
    required_context: finalRequiredDocs,
    reference_links: finalReferenceDocs,
    relevant_decisions: finalDecisions,
    
    constraints: constraints,
    open_items: openItems,
    related_systems: relatedSystems,
    
    package_stats: computeStats(
      primaryContent,
      finalRequiredDocs,
      finalReferenceDocs,
      finalDecisions,
      truncated,
      truncationReason
    ),
  };
  
  return package_;
}

// Helper: Check if entity type is implementable
function isImplementable(metadata: EntityMetadata): boolean {
  return metadata.type === 'document' || metadata.type === 'story';
}

// Helper: Check if entity is ready for implementation
function isReadyForImplementation(metadata: EntityMetadata): boolean {
  if (metadata.type === 'document') {
    return metadata.status === 'Approved';
  }
  if (metadata.type === 'story') {
    return metadata.status === 'Not Started' || metadata.status === 'In Progress';
  }
  return false;
}
```

---

## Context Resolution

### Required Context Algorithm

Required context docs must be included in full. They are essential for understanding the primary spec.

```typescript
async function resolveRequiredContext(
  requiredIds: DocumentId[]
): Promise<RequiredContextDoc[]> {
  const docs: RequiredContextDoc[] = [];
  
  for (const docId of requiredIds) {
    const metadata = index.primary.get(docId);
    if (!metadata) {
      // Missing dependency - record as warning
      continue;
    }
    
    const content = await loadFullContent(metadata.vault_path);
    const frontmatter = parseFrontmatter(content);
    
    docs.push({
      id: docId,
      title: metadata.title,
      doc_type: frontmatter.doc_type ?? 'spec',
      relevance: determineRelevance(docId, metadata),
      full_content: content,
    });
  }
  
  return docs;
}

function determineRelevance(docId: DocumentId, metadata: EntityMetadata): string {
  // Heuristic based on doc type and title
  const docType = (metadata as any).doc_type;
  
  switch (docType) {
    case 'spec':
      return `Technical specification that defines the interface/contract this implementation must satisfy`;
    case 'adr':
      return `Architecture decision that constrains how this should be implemented`;
    case 'guide':
      return `Implementation guide with patterns and conventions to follow`;
    default:
      return `Required context document`;
  }
}
```

### Reference Context Algorithm

Reference docs are summarized, not included in full. They provide additional context but aren't essential.

```typescript
async function resolveReferenceContext(
  referenceIds: DocumentId[]
): Promise<ReferenceSummary[]> {
  const summaries: ReferenceSummary[] = [];
  
  for (const docId of referenceIds) {
    const metadata = index.primary.get(docId);
    if (!metadata) continue;
    
    const content = await loadFullContent(metadata.vault_path);
    const summary = generateSummary(content, metadata.title);
    
    summaries.push({
      id: docId,
      title: metadata.title,
      doc_type: (metadata as any).doc_type ?? 'spec',
      summary: summary,
      vault_path: metadata.vault_path,
    });
  }
  
  return summaries;
}

function generateSummary(content: string, title: string): string {
  // Extract first paragraph after frontmatter
  const bodyStart = content.indexOf('---', 4);  // Skip opening ---
  if (bodyStart === -1) return `Document: ${title}`;
  
  const body = content.slice(bodyStart + 3).trim();
  
  // Find first substantial paragraph
  const paragraphs = body.split(/\n\n+/);
  for (const para of paragraphs) {
    const cleaned = para.replace(/^#+\s+.*$/m, '').trim();
    if (cleaned.length > 50 && !cleaned.startsWith('-') && !cleaned.startsWith('|')) {
      // Truncate to ~200 chars
      if (cleaned.length > 200) {
        return cleaned.slice(0, 197) + '...';
      }
      return cleaned;
    }
  }
  
  return `Document: ${title}`;
}
```

### Decision Resolution

```typescript
async function gatherRelevantDecisions(
  entityId: EntityId,
  primaryContent: string
): Promise<DecisionSummary[]> {
  const decisions: DecisionSummary[] = [];
  const seen = new Set<DecisionId>();
  
  // 1. Decisions that enable this entity
  const enabledBy = index.graph.enabled_by.get(entityId) ?? new Set();
  for (const decId of enabledBy) {
    if (seen.has(decId)) continue;
    seen.add(decId);
    
    const decision = await loadDecision(decId);
    if (decision && decision.status === 'Decided') {
      decisions.push({
        id: decId,
        title: decision.title,
        decision: decision.decision,
        relevance: 'This decision directly enables this work',
        rationale_summary: summarizeRationale(decision.rationale),
      });
    }
  }
  
  // 2. Decisions referenced in the spec content
  const referencedIds = extractDecisionReferences(primaryContent);
  for (const decId of referencedIds) {
    if (seen.has(decId)) continue;
    seen.add(decId);
    
    const decision = await loadDecision(decId);
    if (decision && decision.status === 'Decided') {
      decisions.push({
        id: decId,
        title: decision.title,
        decision: decision.decision,
        relevance: 'Referenced in the specification',
        rationale_summary: summarizeRationale(decision.rationale),
      });
    }
  }
  
  // 3. Decisions from required context docs
  // (Decisions that enabled those docs)
  const frontmatter = parseFrontmatter(primaryContent);
  for (const reqDocId of frontmatter.implementation_context?.required ?? []) {
    const reqEnabledBy = index.graph.enabled_by.get(reqDocId) ?? new Set();
    for (const decId of reqEnabledBy) {
      if (seen.has(decId)) continue;
      seen.add(decId);
      
      const decision = await loadDecision(decId);
      if (decision && decision.status === 'Decided') {
        decisions.push({
          id: decId,
          title: decision.title,
          decision: decision.decision,
          relevance: `Decision for required context ${reqDocId}`,
          rationale_summary: summarizeRationale(decision.rationale),
        });
      }
    }
  }
  
  return decisions;
}

function extractDecisionReferences(content: string): DecisionId[] {
  const pattern = /DEC-\d+/g;
  const matches = content.match(pattern) ?? [];
  return [...new Set(matches)] as DecisionId[];
}

function summarizeRationale(rationale: string): string {
  // First sentence or first 150 chars
  const firstSentence = rationale.match(/^[^.!?]+[.!?]/);
  if (firstSentence && firstSentence[0].length <= 150) {
    return firstSentence[0];
  }
  if (rationale.length <= 150) {
    return rationale;
  }
  return rationale.slice(0, 147) + '...';
}
```

---

## Content Extraction

### Acceptance Criteria Extraction

```typescript
function extractAcceptanceCriteria(content: string): string[] {
  const criteria: string[] = [];
  
  // Pattern 1: Frontmatter array
  const frontmatter = parseFrontmatter(content);
  if (Array.isArray(frontmatter.acceptance_criteria)) {
    criteria.push(...frontmatter.acceptance_criteria);
  }
  
  // Pattern 2: Markdown section with checkboxes
  const acSection = extractSection(content, 'Acceptance Criteria');
  if (acSection) {
    const checkboxes = acSection.match(/- \[[ x]\] .+/g) ?? [];
    for (const checkbox of checkboxes) {
      const text = checkbox.replace(/- \[[ x]\] /, '').trim();
      if (!criteria.includes(text)) {
        criteria.push(text);
      }
    }
  }
  
  // Pattern 3: Numbered list in AC section
  if (acSection) {
    const numbered = acSection.match(/^\d+\. .+$/gm) ?? [];
    for (const item of numbered) {
      const text = item.replace(/^\d+\. /, '').trim();
      if (!criteria.includes(text)) {
        criteria.push(text);
      }
    }
  }
  
  return criteria;
}

function extractSection(content: string, heading: string): string | null {
  // Find section by heading (case-insensitive)
  const headingPattern = new RegExp(`^#+\\s+${heading}\\s*$`, 'mi');
  const match = content.match(headingPattern);
  
  if (!match || match.index === undefined) return null;
  
  const start = match.index + match[0].length;
  
  // Find next heading of same or higher level
  const level = match[0].match(/^#+/)![0].length;
  const nextHeadingPattern = new RegExp(`^#{1,${level}}\\s+`, 'm');
  const rest = content.slice(start);
  const nextMatch = rest.match(nextHeadingPattern);
  
  const end = nextMatch?.index ?? rest.length;
  return rest.slice(0, end).trim();
}
```

### Constraints Extraction

```typescript
interface Constraints {
  technical: string[];
  security: string[];
  performance: string[];
  compatibility: string[];
}

function extractConstraints(content: string): Constraints {
  const constraints: Constraints = {
    technical: [],
    security: [],
    performance: [],
    compatibility: [],
  };
  
  // Look for constraints/requirements sections
  const sections = [
    { name: 'Technical', key: 'technical' as const },
    { name: 'Technical Constraints', key: 'technical' as const },
    { name: 'Security', key: 'security' as const },
    { name: 'Security Requirements', key: 'security' as const },
    { name: 'Performance', key: 'performance' as const },
    { name: 'Performance Requirements', key: 'performance' as const },
    { name: 'Compatibility', key: 'compatibility' as const },
    { name: 'Non-Functional Requirements', key: 'technical' as const },
  ];
  
  for (const { name, key } of sections) {
    const section = extractSection(content, name);
    if (section) {
      const items = extractListItems(section);
      constraints[key].push(...items);
    }
  }
  
  // Deduplicate
  for (const key of Object.keys(constraints) as (keyof Constraints)[]) {
    constraints[key] = [...new Set(constraints[key])];
  }
  
  return constraints;
}

function extractListItems(section: string): string[] {
  const items: string[] = [];
  
  // Bullet points
  const bullets = section.match(/^[-*] .+$/gm) ?? [];
  for (const bullet of bullets) {
    items.push(bullet.replace(/^[-*] /, '').trim());
  }
  
  // Numbered list
  const numbered = section.match(/^\d+\. .+$/gm) ?? [];
  for (const item of numbered) {
    items.push(item.replace(/^\d+\. /, '').trim());
  }
  
  return items;
}
```

### Open Items Detection

```typescript
async function checkOpenItems(
  entityId: EntityId,
  content: string
): Promise<OpenItem[]> {
  const items: OpenItem[] = [];
  
  // 1. TODO/FIXME comments
  const todoPattern = /(?:TODO|FIXME|XXX|HACK):\s*(.+)$/gm;
  let match;
  while ((match = todoPattern.exec(content)) !== null) {
    items.push({
      description: match[1].trim(),
      severity: match[0].startsWith('FIXME') ? 'warning' : 'info',
      suggested_action: 'Resolve before implementation',
    });
  }
  
  // 2. Open Questions section
  const questionsSection = extractSection(content, 'Open Questions');
  if (questionsSection && questionsSection.trim().length > 0) {
    const questions = extractListItems(questionsSection);
    for (const q of questions) {
      items.push({
        description: `Open question: ${q}`,
        severity: 'warning',
        suggested_action: 'Get answer before proceeding',
      });
    }
  }
  
  // 3. Pending decisions that affect this
  const pendingDecisions = await findPendingDecisionsThatAffect(entityId);
  for (const dec of pendingDecisions) {
    items.push({
      description: `Pending decision: ${dec.title} (${dec.id})`,
      severity: 'blocker',
      suggested_action: 'Wait for decision before implementing',
    });
  }
  
  // 4. Unresolved dependencies
  const blockers = index.graph.getBlockedBy(entityId);
  for (const blockerId of blockers) {
    const blocker = index.primary.get(blockerId);
    if (blocker && !isComplete(blocker.status)) {
      items.push({
        description: `Blocked by: ${blocker.title} (${blockerId})`,
        severity: 'blocker',
        suggested_action: `Complete ${blockerId} first`,
      });
    }
  }
  
  return items;
}

async function findPendingDecisionsThatAffect(entityId: EntityId): Promise<EntityMetadata[]> {
  // Find decisions that:
  // 1. Are in Pending status
  // 2. Have this entity in their enables list
  // 3. Or affect documents that this entity implements
  
  const pending: EntityMetadata[] = [];
  const pendingDecisions = index.secondary.query({
    type: 'decision',
    status: 'Pending',
  });
  
  for (const decId of pendingDecisions) {
    const dec = index.primary.get(decId);
    if (!dec) continue;
    
    const enables = index.graph.enables.get(decId as DecisionId) ?? new Set();
    if (enables.has(entityId)) {
      pending.push(dec);
    }
  }
  
  return pending;
}
```

---

## Size Management

### Token Estimation

```typescript
const CHARS_PER_TOKEN = 4;  // Rough estimate

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function computePackageTokens(
  primaryContent: string,
  requiredDocs: RequiredContextDoc[],
  referenceDocs: ReferenceSummary[],
  decisions: DecisionSummary[]
): number {
  let total = 0;
  
  // Primary spec
  total += estimateTokens(primaryContent);
  
  // Required context
  for (const doc of requiredDocs) {
    total += estimateTokens(doc.full_content);
    total += estimateTokens(doc.title + doc.relevance);
  }
  
  // Reference summaries
  for (const ref of referenceDocs) {
    total += estimateTokens(ref.summary + ref.title);
  }
  
  // Decisions
  for (const dec of decisions) {
    total += estimateTokens(dec.decision + dec.title + (dec.rationale_summary ?? ''));
  }
  
  // Overhead for structure/formatting
  total += 500;
  
  return total;
}
```

### Truncation Strategy

```typescript
interface SizeManagementResult {
  finalRequiredDocs: RequiredContextDoc[];
  finalReferenceDocs: ReferenceSummary[];
  finalDecisions: DecisionSummary[];
  truncated: boolean;
  truncationReason?: string;
}

async function manageSize(
  primaryContent: string,
  requiredDocs: RequiredContextDoc[],
  referenceDocs: ReferenceSummary[],
  decisions: DecisionSummary[],
  maxTokens: number
): Promise<SizeManagementResult> {
  const primaryTokens = estimateTokens(primaryContent);
  
  // Primary spec is always included
  if (primaryTokens > maxTokens * 0.8) {
    // Primary spec alone is too big - warn but include anyway
    return {
      finalRequiredDocs: [],
      finalReferenceDocs: [],
      finalDecisions: decisions.slice(0, 3),  // Keep top 3 decisions
      truncated: true,
      truncationReason: 'Primary spec exceeds 80% of token budget',
    };
  }
  
  let remaining = maxTokens - primaryTokens - 500;  // Reserve for structure
  
  // 1. Required docs are high priority - include full
  const finalRequiredDocs: RequiredContextDoc[] = [];
  for (const doc of requiredDocs) {
    const tokens = estimateTokens(doc.full_content);
    if (tokens <= remaining) {
      finalRequiredDocs.push(doc);
      remaining -= tokens;
    } else {
      // Try to summarize instead
      const summarized = await summarizeDocument(doc);
      const summaryTokens = estimateTokens(summarized.full_content);
      if (summaryTokens <= remaining) {
        finalRequiredDocs.push(summarized);
        remaining -= summaryTokens;
      }
    }
  }
  
  // 2. Decisions are medium priority
  const finalDecisions: DecisionSummary[] = [];
  for (const dec of decisions) {
    const tokens = estimateTokens(dec.decision + dec.title + (dec.rationale_summary ?? ''));
    if (tokens <= remaining) {
      finalDecisions.push(dec);
      remaining -= tokens;
    }
  }
  
  // 3. Reference docs are low priority
  const finalReferenceDocs: ReferenceSummary[] = [];
  for (const ref of referenceDocs) {
    const tokens = estimateTokens(ref.summary + ref.title);
    if (tokens <= remaining) {
      finalReferenceDocs.push(ref);
      remaining -= tokens;
    }
  }
  
  const truncated = 
    finalRequiredDocs.length < requiredDocs.length ||
    finalDecisions.length < decisions.length ||
    finalReferenceDocs.length < referenceDocs.length;
  
  return {
    finalRequiredDocs,
    finalReferenceDocs,
    finalDecisions,
    truncated,
    truncationReason: truncated ? 
      `Content truncated to fit ${maxTokens} token budget` : undefined,
  };
}

async function summarizeDocument(doc: RequiredContextDoc): Promise<RequiredContextDoc> {
  // Extract key sections only
  const sections = ['Overview', 'Requirements', 'API', 'Interface', 'Contract'];
  let summarized = '';
  
  for (const section of sections) {
    const content = extractSection(doc.full_content, section);
    if (content) {
      summarized += `## ${section}\n\n${content}\n\n`;
    }
  }
  
  if (summarized.length === 0) {
    // Fallback: first 2000 chars
    summarized = doc.full_content.slice(0, 2000);
    if (doc.full_content.length > 2000) {
      summarized += '\n\n[Content truncated...]';
    }
  }
  
  return {
    ...doc,
    full_content: summarized,
  };
}
```

---

## Tool Interface

### MCP Tool Definition

```typescript
const generateImplementationPackageTool = {
  name: 'generate_implementation_package',
  description: `Generate a self-contained implementation package for an entity.

Includes:
- Full primary spec content
- Required context documents (full content)
- Reference document summaries
- Relevant decisions
- Acceptance criteria (extracted)
- Technical constraints
- Open items/blockers

Use this before handing work to an implementing agent to provide exactly the right context.`,
  
  parameters: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'string',
        description: 'ID of the entity to generate package for (DOC-xxx or S-xxx)',
      },
      max_tokens: {
        type: 'number',
        description: 'Maximum tokens for the package (default: 50000)',
        default: 50000,
      },
      include_rationale: {
        type: 'boolean',
        description: 'Include decision rationale summaries (default: true)',
        default: true,
      },
      skip_validation: {
        type: 'boolean',
        description: 'Skip readiness validation (default: false)',
        default: false,
      },
    },
    required: ['entity_id'],
  },
};
```

### Response Format

```typescript
interface GenerateImplementationPackageResponse {
  success: boolean;
  package?: ImplementationPackage;
  error?: string;
  warnings?: string[];
}

// Example successful response
{
  success: true,
  package: {
    generated_at: "2024-12-17T10:30:00Z",
    target_entity: {
      id: "DOC-005",
      type: "document",
      title: "Premium Features Technical Spec",
      status: "Approved",
      workstream: "engineering"
    },
    primary_spec: {
      id: "DOC-005",
      title: "Premium Features Technical Spec",
      full_content: "---\nid: DOC-005\n...",
      acceptance_criteria: [
        "Premium endpoints protected",
        "Subscription state synced with Stripe",
        "Feature flags respect subscription tier"
      ]
    },
    required_context: [
      {
        id: "DOC-001",
        title: "Authentication Spec",
        doc_type: "spec",
        relevance: "Technical specification that defines the auth interface",
        full_content: "..."
      }
    ],
    reference_links: [
      {
        id: "DOC-002",
        title: "API Design Guidelines",
        doc_type: "guide",
        summary: "Standard REST conventions including...",
        vault_path: "accomplishments/documents/DOC-002_API_Guidelines.md"
      }
    ],
    relevant_decisions: [
      {
        id: "DEC-001",
        title: "Premium Feature Set Definition",
        decision: "Premium tier includes: Advanced Analytics, Team Collaboration, Priority Support",
        relevance: "This decision directly enables this work",
        rationale_summary: "Market research shows these features have highest willingness-to-pay"
      }
    ],
    constraints: {
      technical: ["Must use existing auth system", "TypeScript only"],
      security: ["PCI compliance for payment data"],
      performance: ["API response < 200ms p99"],
      compatibility: ["Support Node 18+"]
    },
    open_items: [],
    related_systems: ["AUTH-SPEC", "BILLING-SERVICE"],
    package_stats: {
      total_tokens_estimate: 12500,
      primary_spec_tokens: 8000,
      required_context_tokens: 3500,
      decisions_tokens: 500,
      truncated: false
    }
  },
  warnings: []
}
```

---

## Examples

### Example 1: Complete Package

```typescript
// Request
await mcp.call('generate_implementation_package', {
  entity_id: 'DOC-005',
});

// Response includes:
// - Full DOC-005 content
// - Full DOC-001 (Auth Spec) - required
// - Summary of DOC-002 (API Guidelines) - reference
// - DEC-001 (Premium Features decision)
// - All acceptance criteria extracted
// - No open items (ready to implement)
```

### Example 2: Package with Blockers

```typescript
// Request
await mcp.call('generate_implementation_package', {
  entity_id: 'S-015',
  skip_validation: true,  // Include even if blocked
});

// Response includes open_items:
[
  {
    description: "Blocked by: Complete Auth Refactor (S-012)",
    severity: "blocker",
    suggested_action: "Complete S-012 first"
  },
  {
    description: "Pending decision: API Versioning Strategy (DEC-018)",
    severity: "blocker",
    suggested_action: "Wait for decision before implementing"
  }
]
```

### Example 3: Truncated Package

```typescript
// Request (low token budget)
await mcp.call('generate_implementation_package', {
  entity_id: 'DOC-010',
  max_tokens: 10000,
});

// Response with truncation:
{
  package_stats: {
    total_tokens_estimate: 9800,
    truncated: true,
    truncation_reason: "Content truncated to fit 10000 token budget"
  },
  // Required docs summarized
  // Reference docs omitted
  // Only top 3 decisions included
}
```

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2024-12-17 | Initial implementation package spec |
