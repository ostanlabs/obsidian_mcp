/**
 * Tests for Workstream Normalizer Service
 *
 * Tests normalization mappings and edge cases as specified in MCP_PLUGIN_ALIGNMENT.md Section 9.
 */

import { describe, it, expect } from 'vitest';
import {
  WorkstreamNormalizer,
  workstreamNormalizer,
  CANONICAL_WORKSTREAMS,
} from './workstream-normalizer.js';

describe('WorkstreamNormalizer', () => {
  describe('normalize', () => {
    describe('infrastructure/infra normalization', () => {
      it('should normalize "infrastructure" to "infra"', () => {
        const result = workstreamNormalizer.normalize('infrastructure');
        expect(result.normalized).toBe('infra');
        expect(result.wasNormalized).toBe(true);
        expect(result.message).toContain('normalized');
      });

      it('should keep "infra" as "infra"', () => {
        const result = workstreamNormalizer.normalize('infra');
        expect(result.normalized).toBe('infra');
        expect(result.wasNormalized).toBe(false);
        expect(result.message).toBeUndefined();
      });

      it('should handle case-insensitive "INFRASTRUCTURE"', () => {
        const result = workstreamNormalizer.normalize('INFRASTRUCTURE');
        expect(result.normalized).toBe('infra');
        expect(result.wasNormalized).toBe(true);
      });
    });

    describe('engineering normalization', () => {
      it('should normalize "eng" to "engineering"', () => {
        const result = workstreamNormalizer.normalize('eng');
        expect(result.normalized).toBe('engineering');
        expect(result.wasNormalized).toBe(true);
      });

      it('should keep "engineering" as "engineering"', () => {
        const result = workstreamNormalizer.normalize('engineering');
        expect(result.normalized).toBe('engineering');
        expect(result.wasNormalized).toBe(false);
      });
    });

    describe('business normalization', () => {
      it('should normalize "biz" to "business"', () => {
        const result = workstreamNormalizer.normalize('biz');
        expect(result.normalized).toBe('business');
        expect(result.wasNormalized).toBe(true);
      });

      it('should keep "business" as "business"', () => {
        const result = workstreamNormalizer.normalize('business');
        expect(result.normalized).toBe('business');
        expect(result.wasNormalized).toBe(false);
      });
    });

    describe('operations normalization', () => {
      it('should normalize "ops" to "operations"', () => {
        const result = workstreamNormalizer.normalize('ops');
        expect(result.normalized).toBe('operations');
        expect(result.wasNormalized).toBe(true);
      });

      it('should keep "operations" as "operations"', () => {
        const result = workstreamNormalizer.normalize('operations');
        expect(result.normalized).toBe('operations');
        expect(result.wasNormalized).toBe(false);
      });
    });

    describe('research normalization', () => {
      it('should normalize "r&d" to "research"', () => {
        const result = workstreamNormalizer.normalize('r&d');
        expect(result.normalized).toBe('research');
        expect(result.wasNormalized).toBe(true);
      });

      it('should normalize "rnd" to "research"', () => {
        const result = workstreamNormalizer.normalize('rnd');
        expect(result.normalized).toBe('research');
        expect(result.wasNormalized).toBe(true);
      });

      it('should keep "research" as "research"', () => {
        const result = workstreamNormalizer.normalize('research');
        expect(result.normalized).toBe('research');
        expect(result.wasNormalized).toBe(false);
      });
    });

    describe('design normalization', () => {
      it('should normalize "ux" to "design"', () => {
        const result = workstreamNormalizer.normalize('ux');
        expect(result.normalized).toBe('design');
        expect(result.wasNormalized).toBe(true);
      });

      it('should normalize "ui" to "design"', () => {
        const result = workstreamNormalizer.normalize('ui');
        expect(result.normalized).toBe('design');
        expect(result.wasNormalized).toBe(true);
      });

      it('should keep "design" as "design"', () => {
        const result = workstreamNormalizer.normalize('design');
        expect(result.normalized).toBe('design');
        expect(result.wasNormalized).toBe(false);
      });
    });

    describe('marketing normalization', () => {
      it('should normalize "mktg" to "marketing"', () => {
        const result = workstreamNormalizer.normalize('mktg');
        expect(result.normalized).toBe('marketing');
        expect(result.wasNormalized).toBe(true);
      });

      it('should keep "marketing" as "marketing"', () => {
        const result = workstreamNormalizer.normalize('marketing');
        expect(result.normalized).toBe('marketing');
        expect(result.wasNormalized).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should normalize empty string to "default"', () => {
        const result = workstreamNormalizer.normalize('');
        expect(result.normalized).toBe('default');
        expect(result.wasNormalized).toBe(true);
      });

      it('should normalize null to "default"', () => {
        const result = workstreamNormalizer.normalize(null);
        expect(result.normalized).toBe('default');
        expect(result.wasNormalized).toBe(true);
      });

      it('should normalize undefined to "default"', () => {
        const result = workstreamNormalizer.normalize(undefined);
        expect(result.normalized).toBe('default');
        expect(result.wasNormalized).toBe(true);
      });
    });
  });
});

