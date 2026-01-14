/**
 * Integration Tests for tools/index.ts
 *
 * Tests the tool definitions, exports, and utility tool handlers.
 * These tests exercise the utility tools that are kept after V1 deprecation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import type { Config } from '../models/types.js';

// Import from tools/index.ts to test the exports
import {
  allToolDefinitions,
  utilityToolDefinitions,
  entityToolDefinitions,
  handleReadDocs,
  handleUpdateDoc,
  handleListWorkspaces,
  handleListFiles,
  readDocsDefinition,
  updateDocDefinition,
  listWorkspacesDefinition,
  listFilesDefinition,
} from './index.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('Tools Index Integration Tests', () => {
  let tempDir: string;
  let config: Config;

  beforeEach(async () => {
    // Create temp directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tools-index-test-'));

    // Create workspace structure
    const docsPath = path.join(tempDir, 'docs');
    await fs.mkdir(docsPath, { recursive: true });
    await fs.mkdir(path.join(docsPath, 'subfolder'), { recursive: true });

    // Create workspaces.json
    const workspacesConfig = {
      docs: {
        path: docsPath,
        description: 'Documentation workspace',
      },
      empty: {
        path: path.join(tempDir, 'empty'),
        description: 'Empty workspace',
      },
    };
    await fs.mkdir(path.join(tempDir, 'empty'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'workspaces.json'),
      JSON.stringify(workspacesConfig, null, 2)
    );

    // Create test documents
    await fs.writeFile(
      path.join(docsPath, 'test-doc.md'),
      'Line 0\nLine 1\nLine 2\nLine 3\nLine 4'
    );
    await fs.writeFile(
      path.join(docsPath, 'subfolder', 'nested-doc.md'),
      '# Nested Document\n\nContent here.'
    );

    config = {
      vaultPath: tempDir,
      workspaces: workspacesConfig,
      defaultCanvas: 'canvas.canvas',
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // Tool Definitions Tests
  // ===========================================================================

  describe('Tool Definitions', () => {
    it('should export allToolDefinitions with all tools', () => {
      expect(allToolDefinitions).toBeDefined();
      expect(Array.isArray(allToolDefinitions)).toBe(true);
      expect(allToolDefinitions.length).toBeGreaterThan(0);

      // Should include both utility and entity tools
      const toolNames = allToolDefinitions.map((t) => t.name);
      expect(toolNames).toContain('read_docs');
      expect(toolNames).toContain('update_doc');
      expect(toolNames).toContain('list_workspaces');
      expect(toolNames).toContain('list_files');
      expect(toolNames).toContain('create_entity');
      expect(toolNames).toContain('search_entities');
    });

    it('should export utilityToolDefinitions with utility tools', () => {
      expect(utilityToolDefinitions).toBeDefined();
      expect(Array.isArray(utilityToolDefinitions)).toBe(true);
      expect(utilityToolDefinitions.length).toBe(4);

      const toolNames = utilityToolDefinitions.map((t) => t.name);
      expect(toolNames).toContain('read_docs');
      expect(toolNames).toContain('update_doc');
      expect(toolNames).toContain('list_workspaces');
      expect(toolNames).toContain('list_files');
    });

    it('should export entityToolDefinitions with entity tools', () => {
      expect(entityToolDefinitions).toBeDefined();
      expect(Array.isArray(entityToolDefinitions)).toBe(true);
      expect(entityToolDefinitions.length).toBeGreaterThan(0);

      const toolNames = entityToolDefinitions.map((t) => t.name);
      // Entity management (consolidated)
      expect(toolNames).toContain('create_entity');
      expect(toolNames).toContain('update_entity');
      // Batch operations (consolidated)
      expect(toolNames).toContain('batch_update');
      // Project understanding
      expect(toolNames).toContain('get_project_overview');
      expect(toolNames).toContain('analyze_project_state');
      // Search & navigation (consolidated)
      expect(toolNames).toContain('search_entities');
      expect(toolNames).toContain('get_entity');
      expect(toolNames).toContain('get_entities'); // Bulk retrieval
      // Decision & document (consolidated)
      expect(toolNames).toContain('manage_documents');
      // Feature coverage
      expect(toolNames).toContain('get_feature_coverage');
    });

    it('should have batch_update with include_entities and fields options', () => {
      const batchUpdateTool = entityToolDefinitions.find((t) => t.name === 'batch_update');
      expect(batchUpdateTool).toBeDefined();
      const options = batchUpdateTool?.inputSchema.properties?.options as { properties?: Record<string, unknown> } | undefined;
      const optionsProps = options?.properties;
      expect(optionsProps?.include_entities).toBeDefined();
      expect(optionsProps?.fields).toBeDefined();
    });

    it('should have get_feature_coverage with summary_only, feature_ids, and fields options', () => {
      const featureCoverageTool = entityToolDefinitions.find((t) => t.name === 'get_feature_coverage');
      expect(featureCoverageTool).toBeDefined();
      const props = featureCoverageTool?.inputSchema.properties;
      expect(props?.summary_only).toBeDefined();
      expect(props?.feature_ids).toBeDefined();
      expect(props?.fields).toBeDefined();
    });

    it('should have get_entities tool with ids and fields parameters', () => {
      const getEntitiesTool = entityToolDefinitions.find((t) => t.name === 'get_entities');
      expect(getEntitiesTool).toBeDefined();
      const props = getEntitiesTool?.inputSchema.properties;
      expect(props?.ids).toBeDefined();
      expect(props?.fields).toBeDefined();
      expect(getEntitiesTool?.inputSchema.required).toContain('ids');
    });

    it('should have valid inputSchema for each tool definition', () => {
      for (const tool of allToolDefinitions) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('should export individual tool definitions', () => {
      expect(readDocsDefinition).toBeDefined();
      expect(readDocsDefinition.name).toBe('read_docs');

      expect(updateDocDefinition).toBeDefined();
      expect(updateDocDefinition.name).toBe('update_doc');

      expect(listWorkspacesDefinition).toBeDefined();
      expect(listWorkspacesDefinition.name).toBe('list_workspaces');

      expect(listFilesDefinition).toBeDefined();
      expect(listFilesDefinition.name).toBe('list_files');
    });
  });

  // ===========================================================================
  // list_workspaces Tool Tests
  // ===========================================================================

  describe('list_workspaces Tool', () => {
    it('should list all configured workspaces', async () => {
      const result = await handleListWorkspaces(config, {});

      expect(result.workspaces).toBeDefined();
      expect(Array.isArray(result.workspaces)).toBe(true);
      expect(result.count).toBe(2);

      const workspaceNames = result.workspaces.map((w) => w.name);
      expect(workspaceNames).toContain('docs');
      expect(workspaceNames).toContain('empty');

      const docsWorkspace = result.workspaces.find((w) => w.name === 'docs');
      expect(docsWorkspace?.description).toBe('Documentation workspace');
    });

    it('should include config_last_changed timestamp', async () => {
      const result = await handleListWorkspaces(config, {});

      expect(result.config_last_changed).toBeDefined();
      expect(typeof result.config_last_changed).toBe('string');
    });
  });

  // ===========================================================================
  // list_files Tool Tests
  // ===========================================================================

  describe('list_files Tool', () => {
    it('should list all markdown files in a workspace', async () => {
      const result = await handleListFiles(config, { workspace: 'docs' });

      expect(result.workspace).toBe('docs');
      expect(result.workspace_description).toBe('Documentation workspace');
      expect(result.count).toBe(2);
      expect(result.files.length).toBe(2);

      const fileNames = result.files.map((f) => f.name);
      expect(fileNames).toContain('test-doc.md');
      expect(fileNames).toContain('subfolder/nested-doc.md');
    });

    it('should include last_changed for each file', async () => {
      const result = await handleListFiles(config, { workspace: 'docs' });

      for (const file of result.files) {
        expect(file.last_changed).toBeDefined();
        expect(typeof file.last_changed).toBe('string');
      }
    });

    it('should return empty list for empty workspace', async () => {
      const result = await handleListFiles(config, { workspace: 'empty' });

      expect(result.count).toBe(0);
      expect(result.files).toEqual([]);
    });

    it('should throw error for missing workspace parameter', async () => {
      await expect(handleListFiles(config, {} as any)).rejects.toThrow(
        'workspace parameter is required'
      );
    });

    it('should throw error for non-existent workspace', async () => {
      await expect(
        handleListFiles(config, { workspace: 'nonexistent' })
      ).rejects.toThrow('Workspace not found: nonexistent');
    });
  });

  // ===========================================================================
  // read_docs Tool Tests
  // ===========================================================================

  describe('read_docs Tool', () => {
    it('should read entire document content', async () => {
      const result = await handleReadDocs(config, {
        workspace: 'docs',
        doc_name: 'test-doc.md',
      });

      expect(result.workspace).toBe('docs');
      expect(result.workspace_description).toBe('Documentation workspace');
      expect(result.doc_name).toBe('test-doc.md');
      expect(result.content).toBe('Line 0\nLine 1\nLine 2\nLine 3\nLine 4');
      expect(result.line_count).toBe(5);
      expect(result.last_changed).toBeDefined();
    });

    it('should add .md extension if missing', async () => {
      const result = await handleReadDocs(config, {
        workspace: 'docs',
        doc_name: 'test-doc',
      });

      expect(result.doc_name).toBe('test-doc.md');
      expect(result.content).toContain('Line 0');
    });

    it('should read document with line range', async () => {
      const result = await handleReadDocs(config, {
        workspace: 'docs',
        doc_name: 'test-doc.md',
        from_line: 1,
        to_line: 3,
      });

      expect(result.content).toBe('Line 1\nLine 2');
      expect(result.range).toEqual({ from_line: 1, to_line: 3 });
      expect(result.line_count).toBe(5); // Total lines in file
    });

    it('should read nested document', async () => {
      const result = await handleReadDocs(config, {
        workspace: 'docs',
        doc_name: 'subfolder/nested-doc.md',
      });

      expect(result.content).toContain('# Nested Document');
    });

    it('should throw error for missing workspace parameter', async () => {
      await expect(
        handleReadDocs(config, { doc_name: 'test.md' } as any)
      ).rejects.toThrow('workspace parameter is required');
    });

    it('should throw error for missing doc_name parameter', async () => {
      await expect(
        handleReadDocs(config, { workspace: 'docs' } as any)
      ).rejects.toThrow('doc_name parameter is required');
    });

    it('should throw error for non-existent workspace', async () => {
      await expect(
        handleReadDocs(config, { workspace: 'nonexistent', doc_name: 'test.md' })
      ).rejects.toThrow('Workspace not found: nonexistent');
    });

    it('should throw error for non-existent document', async () => {
      await expect(
        handleReadDocs(config, { workspace: 'docs', doc_name: 'nonexistent.md' })
      ).rejects.toThrow('Document not found: nonexistent.md in workspace docs');
    });
  });

  // ===========================================================================
  // update_doc Tool Tests
  // ===========================================================================

  describe('update_doc Tool', () => {
    it('should create a new document', async () => {
      const result = await handleUpdateDoc(config, {
        workspace: 'docs',
        name: 'new-doc.md',
        operation: 'create',
        content: 'New document content\nLine 2',
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe('create');
      expect(result.doc_name).toBe('new-doc.md');
      expect(result.line_count).toBe(2);

      // Verify file was created
      const readResult = await handleReadDocs(config, {
        workspace: 'docs',
        doc_name: 'new-doc.md',
      });
      expect(readResult.content).toBe('New document content\nLine 2');
    });

    it('should add .md extension when creating', async () => {
      const result = await handleUpdateDoc(config, {
        workspace: 'docs',
        name: 'auto-ext',
        operation: 'create',
        content: 'Content',
      });

      expect(result.doc_name).toBe('auto-ext.md');
    });

    it('should throw error when creating existing document', async () => {
      await expect(
        handleUpdateDoc(config, {
          workspace: 'docs',
          name: 'test-doc.md',
          operation: 'create',
          content: 'Content',
        })
      ).rejects.toThrow('Document already exists: test-doc.md in workspace docs');
    });

    it('should replace entire document content', async () => {
      const result = await handleUpdateDoc(config, {
        workspace: 'docs',
        name: 'test-doc.md',
        operation: 'replace',
        content: 'Replaced content',
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe('replace');
      expect(result.line_count).toBe(1);

      const readResult = await handleReadDocs(config, {
        workspace: 'docs',
        doc_name: 'test-doc.md',
      });
      expect(readResult.content).toBe('Replaced content');
    });

    it('should throw error when replacing non-existent document', async () => {
      await expect(
        handleUpdateDoc(config, {
          workspace: 'docs',
          name: 'nonexistent.md',
          operation: 'replace',
          content: 'Content',
        })
      ).rejects.toThrow('Document not found: nonexistent.md in workspace docs');
    });

    it('should delete a document', async () => {
      // First create a doc to delete
      await handleUpdateDoc(config, {
        workspace: 'docs',
        name: 'to-delete.md',
        operation: 'create',
        content: 'To be deleted',
      });

      const result = await handleUpdateDoc(config, {
        workspace: 'docs',
        name: 'to-delete.md',
        operation: 'delete',
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe('delete');

      // Verify file was deleted
      await expect(
        handleReadDocs(config, { workspace: 'docs', doc_name: 'to-delete.md' })
      ).rejects.toThrow('Document not found');
    });

    it('should throw error when deleting non-existent document', async () => {
      await expect(
        handleUpdateDoc(config, {
          workspace: 'docs',
          name: 'nonexistent.md',
          operation: 'delete',
        })
      ).rejects.toThrow('Document not found: nonexistent.md in workspace docs');
    });

    it('should insert content at specific line', async () => {
      const result = await handleUpdateDoc(config, {
        workspace: 'docs',
        name: 'test-doc.md',
        operation: 'insert_at',
        content: 'Inserted line',
        start_line: 2,
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe('insert_at');
      expect(result.affected_range).toEqual({ start_line: 2, end_line: 3 });

      const readResult = await handleReadDocs(config, {
        workspace: 'docs',
        doc_name: 'test-doc.md',
      });
      const lines = readResult.content.split('\n');
      expect(lines[2]).toBe('Inserted line');
      expect(lines.length).toBe(6); // Original 5 + 1 inserted
    });

    it('should replace content at specific line range', async () => {
      // Reset test-doc first
      await handleUpdateDoc(config, {
        workspace: 'docs',
        name: 'test-doc.md',
        operation: 'replace',
        content: 'Line 0\nLine 1\nLine 2\nLine 3\nLine 4',
      });

      const result = await handleUpdateDoc(config, {
        workspace: 'docs',
        name: 'test-doc.md',
        operation: 'replace_at',
        content: 'New Line A\nNew Line B',
        start_line: 1,
        end_line: 3,
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe('replace_at');
      expect(result.affected_range).toEqual({ start_line: 1, end_line: 3 });

      const readResult = await handleReadDocs(config, {
        workspace: 'docs',
        doc_name: 'test-doc.md',
      });
      const lines = readResult.content.split('\n');
      expect(lines[0]).toBe('Line 0');
      expect(lines[1]).toBe('New Line A');
      expect(lines[2]).toBe('New Line B');
      expect(lines[3]).toBe('Line 3');
    });

    it('should throw error for missing required parameters', async () => {
      await expect(
        handleUpdateDoc(config, { name: 'test.md', operation: 'create' } as any)
      ).rejects.toThrow('workspace parameter is required');

      await expect(
        handleUpdateDoc(config, { workspace: 'docs', operation: 'create' } as any)
      ).rejects.toThrow('name parameter is required');

      await expect(
        handleUpdateDoc(config, {
          workspace: 'docs',
          name: 'test.md',
          operation: 'create',
        })
      ).rejects.toThrow('content is required for create operation');

      await expect(
        handleUpdateDoc(config, {
          workspace: 'docs',
          name: 'test-doc.md',
          operation: 'insert_at',
          content: 'test',
        })
      ).rejects.toThrow('start_line is required for insert_at operation');

      await expect(
        handleUpdateDoc(config, {
          workspace: 'docs',
          name: 'test-doc.md',
          operation: 'replace_at',
          content: 'test',
          start_line: 0,
        })
      ).rejects.toThrow('end_line is required for replace_at operation');
    });

    it('should throw error for unknown operation', async () => {
      await expect(
        handleUpdateDoc(config, {
          workspace: 'docs',
          name: 'test.md',
          operation: 'unknown' as any,
        })
      ).rejects.toThrow('Unknown operation: unknown');
    });

    it('should throw error for non-existent workspace', async () => {
      await expect(
        handleUpdateDoc(config, {
          workspace: 'nonexistent',
          name: 'test.md',
          operation: 'create',
          content: 'test',
        })
      ).rejects.toThrow('Workspace not found: nonexistent');
    });
  });
});

