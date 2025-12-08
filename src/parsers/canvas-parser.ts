import { CanvasFile, CanvasNode, CanvasEdge, MCPError } from '../models/types.js';

/**
 * Parse a canvas JSON file
 */
export function parseCanvas(content: string): CanvasFile {
  try {
    const data = JSON.parse(content);
    return {
      nodes: data.nodes || [],
      edges: data.edges || [],
    };
  } catch (e) {
    throw new MCPError(`Failed to parse canvas JSON: ${e}`, 'PARSE_ERROR', 500);
  }
}

/**
 * Serialize a canvas to JSON
 */
export function serializeCanvas(canvas: CanvasFile): string {
  return JSON.stringify(canvas, null, 2);
}

/**
 * Find a node by its file path
 */
export function findNodeByFile(canvas: CanvasFile, filePath: string): CanvasNode | undefined {
  return canvas.nodes.find(node => node.type === 'file' && node.file === filePath);
}

/**
 * Find a node by accomplishment ID (searches file paths for the ID)
 */
export function findNodeByAccomplishmentId(canvas: CanvasFile, accomplishmentId: string): CanvasNode | undefined {
  // We need to look at the actual file content to match by ID
  // For now, we'll search by checking if the file path contains the ID pattern
  // This is a simplified approach - in practice, we'd need to read the files
  return canvas.nodes.find(node => {
    if (node.type !== 'file') return false;
    // This is a placeholder - actual implementation will need to read files
    return false;
  });
}

/**
 * Get all edges where the given node is the source (blocker)
 */
export function getOutgoingEdges(canvas: CanvasFile, nodeId: string): CanvasEdge[] {
  return canvas.edges.filter(edge => edge.fromNode === nodeId);
}

/**
 * Get all edges where the given node is the target (blocked)
 */
export function getIncomingEdges(canvas: CanvasFile, nodeId: string): CanvasEdge[] {
  return canvas.edges.filter(edge => edge.toNode === nodeId);
}

/**
 * Add a node to the canvas
 */
export function addNode(canvas: CanvasFile, node: CanvasNode): CanvasFile {
  return {
    ...canvas,
    nodes: [...canvas.nodes, node],
  };
}

/**
 * Remove a node from the canvas (also removes associated edges)
 */
export function removeNode(canvas: CanvasFile, nodeId: string): CanvasFile {
  return {
    nodes: canvas.nodes.filter(node => node.id !== nodeId),
    edges: canvas.edges.filter(edge => edge.fromNode !== nodeId && edge.toNode !== nodeId),
  };
}

/**
 * Update a node's position
 */
export function updateNodePosition(canvas: CanvasFile, nodeId: string, x: number, y: number): CanvasFile {
  return {
    ...canvas,
    nodes: canvas.nodes.map(node => 
      node.id === nodeId ? { ...node, x, y } : node
    ),
  };
}

/**
 * Add an edge to the canvas
 */
export function addEdge(canvas: CanvasFile, edge: CanvasEdge): CanvasFile {
  return {
    ...canvas,
    edges: [...canvas.edges, edge],
  };
}

/**
 * Remove an edge from the canvas
 */
export function removeEdge(canvas: CanvasFile, fromNodeId: string, toNodeId: string): CanvasFile {
  return {
    ...canvas,
    edges: canvas.edges.filter(edge => 
      !(edge.fromNode === fromNodeId && edge.toNode === toNodeId)
    ),
  };
}

/**
 * Find edge between two nodes
 */
export function findEdge(canvas: CanvasFile, fromNodeId: string, toNodeId: string): CanvasEdge | undefined {
  return canvas.edges.find(edge => 
    edge.fromNode === fromNodeId && edge.toNode === toNodeId
  );
}

/**
 * Get all file nodes from canvas
 */
export function getFileNodes(canvas: CanvasFile): CanvasNode[] {
  return canvas.nodes.filter(node => node.type === 'file');
}

/**
 * Check if adding an edge would create a cycle
 */
export function wouldCreateCycle(canvas: CanvasFile, fromNodeId: string, toNodeId: string): boolean {
  // DFS to check if there's a path from toNodeId to fromNodeId
  const visited = new Set<string>();
  const stack = [toNodeId];
  
  while (stack.length > 0) {
    const current = stack.pop()!;
    
    if (current === fromNodeId) {
      return true; // Found a cycle
    }
    
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    
    // Get all nodes that this node blocks (outgoing edges)
    const outgoing = getOutgoingEdges(canvas, current);
    for (const edge of outgoing) {
      stack.push(edge.toNode);
    }
  }
  
  return false;
}

