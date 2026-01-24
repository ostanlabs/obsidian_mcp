/**
 * Tests for V2 Canvas Manager
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CanvasManager, type Position, type NodeDimensions, type CanvasOperation } from './canvas-manager.js';
import type { EntityId, VaultPath, CanvasPath, CanvasFile } from '../../models/v2-types.js';
import * as fs from 'fs/promises';
import { writeFileAtomic, triggerObsidianReload } from '../../utils/file-utils.js';

// Mock fs module
vi.mock('fs/promises');

// Mock file-utils module (for writeFileAtomic and triggerObsidianReload)
vi.mock('../../utils/file-utils.js', () => ({
  writeFileAtomic: vi.fn().mockResolvedValue(undefined),
  triggerObsidianReload: vi.fn(),
}));

describe('CanvasManager', () => {
  let manager: CanvasManager;
  let mockEntityPathResolver: (entityId: EntityId) => Promise<VaultPath | null>;
  let mockCanvasData: CanvasFile;

  const VAULT_PATH = '/test-vault';
  const DEFAULT_CANVAS = 'projects/main.canvas';

  beforeEach(() => {
    vi.resetAllMocks();
    
    mockEntityPathResolver = vi.fn().mockResolvedValue(null);
    manager = new CanvasManager(VAULT_PATH, DEFAULT_CANVAS, mockEntityPathResolver);
    
    // Default empty canvas
    mockCanvasData = { nodes: [], edges: [] };
    
    // Setup fs mocks
    vi.mocked(fs.readFile).mockImplementation(async () => JSON.stringify(mockCanvasData));
    vi.mocked(fs.access).mockResolvedValue(undefined);

    // Reset file-utils mocks
    vi.mocked(writeFileAtomic).mockResolvedValue(undefined);
    vi.mocked(triggerObsidianReload).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addNode', () => {
    it('should add a new node to empty canvas', async () => {
      const filePath = 'accomplishments/stories/S-001.md' as VaultPath;
      
      const nodeId = await manager.addNode(filePath);
      
      expect(nodeId).toBeTruthy();
      expect(writeFileAtomic).toHaveBeenCalledTimes(1);

      const writtenData = JSON.parse(vi.mocked(writeFileAtomic).mock.calls[0][1] as string);
      expect(writtenData.nodes).toHaveLength(1);
      expect(writtenData.nodes[0].file).toBe(filePath);
      expect(writtenData.nodes[0].type).toBe('file');
    });

    it('should return existing node ID if node already exists', async () => {
      const filePath = 'accomplishments/stories/S-001.md' as VaultPath;
      const existingNodeId = 'existing-node-123';
      
      mockCanvasData = {
        nodes: [{ id: existingNodeId, type: 'file', file: filePath, x: 0, y: 0, width: 400, height: 300 }],
        edges: [],
      };
      
      const nodeId = await manager.addNode(filePath);
      
      expect(nodeId).toBe(existingNodeId);
      expect(writeFileAtomic).not.toHaveBeenCalled();
    });

    it('should use custom position and dimensions', async () => {
      const filePath = 'accomplishments/stories/S-001.md' as VaultPath;
      const position: Position = { x: 100, y: 200 };
      const dimensions: NodeDimensions = { width: 500, height: 400 };
      
      await manager.addNode(filePath, undefined, position, dimensions);

      const writtenData = JSON.parse(vi.mocked(writeFileAtomic).mock.calls[0][1] as string);
      expect(writtenData.nodes[0].x).toBe(100);
      expect(writtenData.nodes[0].y).toBe(200);
      expect(writtenData.nodes[0].width).toBe(500);
      expect(writtenData.nodes[0].height).toBe(400);
    });

    it('should use specified canvas path', async () => {
      const filePath = 'accomplishments/stories/S-001.md' as VaultPath;
      const customCanvas = 'projects/custom.canvas' as CanvasPath;
      
      await manager.addNode(filePath, customCanvas);
      
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('custom.canvas'),
        'utf-8'
      );
    });
  });

  describe('removeNode', () => {
    it('should remove existing node', async () => {
      const filePath = 'accomplishments/stories/S-001.md' as VaultPath;
      const nodeId = 'node-to-remove';
      
      mockCanvasData = {
        nodes: [{ id: nodeId, type: 'file', file: filePath, x: 0, y: 0, width: 400, height: 300 }],
        edges: [],
      };
      
      const result = await manager.removeNode(filePath);
      
      expect(result).toBe(true);
      const writtenData = JSON.parse(vi.mocked(writeFileAtomic).mock.calls[0][1] as string);
      expect(writtenData.nodes).toHaveLength(0);
    });

    it('should return false if node does not exist', async () => {
      const result = await manager.removeNode('nonexistent.md' as VaultPath);
      
      expect(result).toBe(false);
      expect(writeFileAtomic).not.toHaveBeenCalled();
    });

    it('should remove connected edges when removing node', async () => {
      const filePath = 'accomplishments/stories/S-001.md' as VaultPath;
      const nodeId = 'node-to-remove';
      const otherNodeId = 'other-node';

      mockCanvasData = {
        nodes: [
          { id: nodeId, type: 'file', file: filePath, x: 0, y: 0, width: 400, height: 300 },
          { id: otherNodeId, type: 'file', file: 'other.md', x: 500, y: 0, width: 400, height: 300 },
        ],
        edges: [
          { id: 'edge-1', fromNode: nodeId, toNode: otherNodeId, fromSide: 'right', toSide: 'left' },
          { id: 'edge-2', fromNode: otherNodeId, toNode: nodeId, fromSide: 'right', toSide: 'left' },
        ],
      };

      await manager.removeNode(filePath);

      const writtenData = JSON.parse(vi.mocked(writeFileAtomic).mock.calls[0][1] as string);
      expect(writtenData.edges).toHaveLength(0);
    });
  });

  describe('updateNodePath', () => {
    it('should update node file path', async () => {
      const oldPath = 'accomplishments/S-001.md' as VaultPath;
      const newPath = 'accomplishments/stories/S-001.md' as VaultPath;
      const nodeId = 'node-123';

      mockCanvasData = {
        nodes: [{ id: nodeId, type: 'file', file: oldPath, x: 0, y: 0, width: 400, height: 300 }],
        edges: [],
      };

      const result = await manager.updateNodePath(oldPath, newPath);

      expect(result).toBe(true);
      const writtenData = JSON.parse(vi.mocked(writeFileAtomic).mock.calls[0][1] as string);
      expect(writtenData.nodes[0].file).toBe(newPath);
    });

    it('should return false if node does not exist', async () => {
      const result = await manager.updateNodePath(
        'nonexistent.md' as VaultPath,
        'new-path.md' as VaultPath
      );

      expect(result).toBe(false);
      expect(writeFileAtomic).not.toHaveBeenCalled();
    });
  });

  describe('addEdge', () => {
    it('should add edge between two existing nodes', async () => {
      const fromPath = 'accomplishments/stories/S-001.md' as VaultPath;
      const toPath = 'accomplishments/stories/S-002.md' as VaultPath;

      mockCanvasData = {
        nodes: [
          { id: 'node-1', type: 'file', file: fromPath, x: 0, y: 0, width: 400, height: 300 },
          { id: 'node-2', type: 'file', file: toPath, x: 500, y: 0, width: 400, height: 300 },
        ],
        edges: [],
      };

      const edgeId = await manager.addEdge(fromPath, toPath);

      expect(edgeId).toBeTruthy();
      const writtenData = JSON.parse(vi.mocked(writeFileAtomic).mock.calls[0][1] as string);
      expect(writtenData.edges).toHaveLength(1);
      expect(writtenData.edges[0].fromNode).toBe('node-1');
      expect(writtenData.edges[0].toNode).toBe('node-2');
    });

    it('should return null if from node does not exist', async () => {
      mockCanvasData = {
        nodes: [{ id: 'node-2', type: 'file', file: 'to.md', x: 0, y: 0, width: 400, height: 300 }],
        edges: [],
      };

      const edgeId = await manager.addEdge('from.md' as VaultPath, 'to.md' as VaultPath);

      expect(edgeId).toBeNull();
    });

    it('should return existing edge ID if edge already exists', async () => {
      const fromPath = 'from.md' as VaultPath;
      const toPath = 'to.md' as VaultPath;
      const existingEdgeId = 'existing-edge';

      mockCanvasData = {
        nodes: [
          { id: 'node-1', type: 'file', file: fromPath, x: 0, y: 0, width: 400, height: 300 },
          { id: 'node-2', type: 'file', file: toPath, x: 500, y: 0, width: 400, height: 300 },
        ],
        edges: [
          { id: existingEdgeId, fromNode: 'node-1', toNode: 'node-2', fromSide: 'right', toSide: 'left' },
        ],
      };

      const edgeId = await manager.addEdge(fromPath, toPath);

      expect(edgeId).toBe(existingEdgeId);
      expect(writeFileAtomic).not.toHaveBeenCalled();
    });
  });

  describe('removeEdge', () => {
    it('should remove existing edge', async () => {
      const fromPath = 'from.md' as VaultPath;
      const toPath = 'to.md' as VaultPath;

      mockCanvasData = {
        nodes: [
          { id: 'node-1', type: 'file', file: fromPath, x: 0, y: 0, width: 400, height: 300 },
          { id: 'node-2', type: 'file', file: toPath, x: 500, y: 0, width: 400, height: 300 },
        ],
        edges: [
          { id: 'edge-1', fromNode: 'node-1', toNode: 'node-2', fromSide: 'right', toSide: 'left' },
        ],
      };

      const result = await manager.removeEdge(fromPath, toPath);

      expect(result).toBe(true);
      const writtenData = JSON.parse(vi.mocked(writeFileAtomic).mock.calls[0][1] as string);
      expect(writtenData.edges).toHaveLength(0);
    });

    it('should return false if edge does not exist', async () => {
      mockCanvasData = {
        nodes: [
          { id: 'node-1', type: 'file', file: 'from.md', x: 0, y: 0, width: 400, height: 300 },
          { id: 'node-2', type: 'file', file: 'to.md', x: 500, y: 0, width: 400, height: 300 },
        ],
        edges: [],
      };

      const result = await manager.removeEdge('from.md' as VaultPath, 'to.md' as VaultPath);

      expect(result).toBe(false);
    });
  });

  describe('batchUpdate', () => {
    it('should apply multiple operations atomically', async () => {
      const operations: CanvasOperation[] = [
        { type: 'add_node', filePath: 'file1.md' },
        { type: 'add_node', filePath: 'file2.md' },
      ];

      const result = await manager.batchUpdate(operations);

      expect(result.success).toBe(true);
      expect(result.nodesAdded).toBe(2);
      expect(writeFileAtomic).toHaveBeenCalledTimes(1); // Single write

      const writtenData = JSON.parse(vi.mocked(writeFileAtomic).mock.calls[0][1] as string);
      expect(writtenData.nodes).toHaveLength(2);
    });

    it('should handle mixed operations', async () => {
      mockCanvasData = {
        nodes: [
          { id: 'node-1', type: 'file', file: 'existing.md', x: 0, y: 0, width: 400, height: 300 },
        ],
        edges: [],
      };

      const operations: CanvasOperation[] = [
        { type: 'add_node', filePath: 'new.md' },
        { type: 'update_node_path', oldPath: 'existing.md', newPath: 'renamed.md' },
      ];

      const result = await manager.batchUpdate(operations);

      expect(result.success).toBe(true);
      expect(result.nodesAdded).toBe(1);
      expect(result.nodesUpdated).toBe(1);
    });

    it('should track removed nodes and edges', async () => {
      mockCanvasData = {
        nodes: [
          { id: 'node-1', type: 'file', file: 'file1.md', x: 0, y: 0, width: 400, height: 300 },
          { id: 'node-2', type: 'file', file: 'file2.md', x: 500, y: 0, width: 400, height: 300 },
        ],
        edges: [
          { id: 'edge-1', fromNode: 'node-1', toNode: 'node-2', fromSide: 'right', toSide: 'left' },
        ],
      };

      const operations: CanvasOperation[] = [
        { type: 'remove_node', filePath: 'file1.md' },
      ];

      const result = await manager.batchUpdate(operations);

      expect(result.nodesRemoved).toBe(1);
      // Edge should also be removed since node was removed
      const writtenData = JSON.parse(vi.mocked(writeFileAtomic).mock.calls[0][1] as string);
      expect(writtenData.edges).toHaveLength(0);
    });
  });

  describe('Query Methods', () => {
    it('should get node by file path', async () => {
      const filePath = 'test.md' as VaultPath;
      mockCanvasData = {
        nodes: [{ id: 'node-1', type: 'file', file: filePath, x: 0, y: 0, width: 400, height: 300 }],
        edges: [],
      };

      const node = await manager.getNodeByFilePath(filePath);

      expect(node).not.toBeNull();
      expect(node?.id).toBe('node-1');
    });

    it('should return null for non-existent node', async () => {
      const node = await manager.getNodeByFilePath('nonexistent.md' as VaultPath);
      expect(node).toBeNull();
    });

    it('should get all file nodes', async () => {
      mockCanvasData = {
        nodes: [
          { id: 'node-1', type: 'file', file: 'file1.md', x: 0, y: 0, width: 400, height: 300 },
          { id: 'node-2', type: 'file', file: 'file2.md', x: 500, y: 0, width: 400, height: 300 },
          { id: 'node-3', type: 'text', text: 'Some text', x: 1000, y: 0, width: 200, height: 100 } as any,
        ],
        edges: [],
      };

      const nodes = await manager.getAllFileNodes();

      expect(nodes).toHaveLength(2);
      expect(nodes.every(n => n.type === 'file')).toBe(true);
    });

    it('should check if canvas exists', async () => {
      const exists = await manager.canvasExists();
      expect(exists).toBe(true);

      vi.mocked(fs.access).mockRejectedValueOnce(new Error('ENOENT'));
      const notExists = await manager.canvasExists('nonexistent.canvas' as CanvasPath);
      expect(notExists).toBe(false);
    });
  });

  describe('getDimensionsForType', () => {
    it('should return correct dimensions for milestone', () => {
      const dims = manager.getDimensionsForType('milestone');
      expect(dims.width).toBe(500);
      expect(dims.height).toBe(400);
    });

    it('should return correct dimensions for story', () => {
      const dims = manager.getDimensionsForType('story');
      expect(dims.width).toBe(400);
      expect(dims.height).toBe(300);
    });

    it('should return default dimensions for unknown type', () => {
      const dims = manager.getDimensionsForType('unknown');
      expect(dims.width).toBe(400);
      expect(dims.height).toBe(300);
    });
  });

  describe('Canvas I/O Edge Cases', () => {
    it('should return empty canvas when file does not exist', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValueOnce(error);

      // Should not throw, should work with empty canvas
      const nodeId = await manager.addNode('new-file.md' as VaultPath);
      expect(nodeId).toBeTruthy();
    });

    it('should throw on other read errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(fs.readFile).mockRejectedValueOnce(error);

      await expect(manager.addNode('file.md' as VaultPath)).rejects.toThrow('Permission denied');
    });
  });
});
