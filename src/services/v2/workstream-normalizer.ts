/**
 * Workstream Normalizer Service
 *
 * Normalizes workstream values to canonical forms for consistency.
 * Automatically applied during entity creation/update.
 *
 * Normalization mappings (case-insensitive):
 * - infrastructure, infra → infra
 * - eng, engineering → engineering
 * - biz, business → business
 * - ops, operations → operations
 * - research, r&d → research
 * - design, ux → design
 * - marketing, mktg → marketing
 * - default (fallback for unknown values)
 */

// =============================================================================
// Types
// =============================================================================

export interface NormalizationResult {
  /** The normalized workstream value */
  normalized: string;
  /** The original value before normalization */
  original: string;
  /** Whether normalization was applied */
  wasNormalized: boolean;
  /** Message describing the normalization (for Agent feedback) */
  message?: string;
}

// =============================================================================
// Normalization Mappings
// =============================================================================

/**
 * Canonical workstream values.
 * These are the standard values that should be used across all entities.
 */
export const CANONICAL_WORKSTREAMS = [
  'infra',
  'engineering',
  'business',
  'operations',
  'research',
  'design',
  'marketing',
  'default',
] as const;

export type CanonicalWorkstream = (typeof CANONICAL_WORKSTREAMS)[number];

/**
 * Mapping of aliases to canonical workstream values.
 * Keys are lowercase for case-insensitive matching.
 */
const WORKSTREAM_ALIASES: Record<string, CanonicalWorkstream> = {
  // Infrastructure
  infrastructure: 'infra',
  infra: 'infra',

  // Engineering
  eng: 'engineering',
  engineering: 'engineering',

  // Business
  biz: 'business',
  business: 'business',

  // Operations
  ops: 'operations',
  operations: 'operations',

  // Research
  research: 'research',
  'r&d': 'research',
  rnd: 'research',

  // Design
  design: 'design',
  ux: 'design',
  ui: 'design',

  // Marketing
  marketing: 'marketing',
  mktg: 'marketing',

  // Default
  default: 'default',
};

// =============================================================================
// Normalizer Class
// =============================================================================

/**
 * Normalizes workstream values to canonical forms.
 */
export class WorkstreamNormalizer {
  /**
   * Normalize a workstream value to its canonical form.
   *
   * @param workstream - The workstream value to normalize
   * @returns NormalizationResult with the normalized value and metadata
   */
  normalize(workstream: string | undefined | null): NormalizationResult {
    // Handle missing/empty values
    if (!workstream || workstream.trim() === '') {
      return {
        normalized: 'default',
        original: workstream || '',
        wasNormalized: true,
        message: 'Empty workstream normalized to "default"',
      };
    }

    const original = workstream;
    const lowercased = workstream.toLowerCase().trim();

    // Check if it's a known alias
    const canonical = WORKSTREAM_ALIASES[lowercased];

    if (canonical) {
      const wasNormalized = lowercased !== canonical;
      return {
        normalized: canonical,
        original,
        wasNormalized,
        message: wasNormalized
          ? `Workstream "${original}" normalized to "${canonical}"`
          : undefined,
      };
    }

    // Unknown workstream - keep as-is but warn
    return {
      normalized: lowercased,
      original,
      wasNormalized: original !== lowercased,
      message: `Unknown workstream "${original}" - consider using one of: ${CANONICAL_WORKSTREAMS.join(', ')}`,
    };
  }

  /**
   * Check if a workstream value is canonical (no normalization needed).
   */
  isCanonical(workstream: string): boolean {
    return CANONICAL_WORKSTREAMS.includes(workstream as CanonicalWorkstream);
  }

  /**
   * Get all canonical workstream values.
   */
  getCanonicalWorkstreams(): readonly string[] {
    return CANONICAL_WORKSTREAMS;
  }

  /**
   * Get all known aliases for a canonical workstream.
   */
  getAliasesFor(canonical: CanonicalWorkstream): string[] {
    return Object.entries(WORKSTREAM_ALIASES)
      .filter(([_, value]) => value === canonical)
      .map(([key]) => key);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/** Default normalizer instance */
export const workstreamNormalizer = new WorkstreamNormalizer();

