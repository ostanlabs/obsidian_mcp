import { z } from 'zod';
import { Config } from '../models/types.js';
import { listAllAccomplishments } from '../services/accomplishment-service.js';
import { generateTaskId } from '../parsers/markdown-parser.js';

// Schema for the tool
export const getAccomplishmentsGraphSchema = z.object({
  canvas_source: z.string().optional(),
});

export type GetAccomplishmentsGraphInput = z.infer<typeof getAccomplishmentsGraphSchema>;

export const getAccomplishmentsGraphDefinition = {
  name: 'get_accomplishments_graph',
  description: 'Get the dependency graph of accomplishments with connected component analysis. Returns the main (largest) connected graph and any orphaned graphs (disconnected components). Each node contains a map of task IDs to task names. Single unconnected nodes are also returned as orphaned graphs.',
  inputSchema: {
    type: 'object',
    properties: {
      canvas_source: {
        type: 'string',
        description: 'Canvas file path to filter by (optional, defaults to all)',
      },
    },
    required: [],
  },
};

interface GraphNode {
  id: string;
  title: string;
  status: string;
  priority: string;
  effort: string;
  is_blocked: boolean;
  in_progress: boolean;
  tasks: Record<string, string>; // task_id -> task_name
}

interface GraphEdge {
  from: string; // blocker accomplishment ID
  to: string;   // blocked accomplishment ID
}

interface ConnectedGraph {
  node_count: number;
  edge_count: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Find connected components using Union-Find algorithm
 */
function findConnectedComponents(
  nodeIds: string[],
  edges: GraphEdge[]
): Map<string, Set<string>> {
  // Initialize: each node is its own parent
  const parent = new Map<string, string>();
  for (const id of nodeIds) {
    parent.set(id, id);
  }

  // Find root with path compression
  function find(x: string): string {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  // Union two nodes
  function union(x: string, y: string): void {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) {
      parent.set(rootX, rootY);
    }
  }

  // Union all connected nodes via edges
  for (const edge of edges) {
    union(edge.from, edge.to);
  }

  // Group nodes by their root
  const components = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    const root = find(id);
    if (!components.has(root)) {
      components.set(root, new Set());
    }
    components.get(root)!.add(id);
  }

  return components;
}

export async function handleGetAccomplishmentsGraph(
  config: Config,
  input: GetAccomplishmentsGraphInput
): Promise<unknown> {
  let accomplishments = await listAllAccomplishments(config);

  // Filter by canvas source if provided
  if (input.canvas_source) {
    accomplishments = accomplishments.filter(
      a => a.frontmatter.canvas_source === input.canvas_source
    );
  }

  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  const nodeIds = new Set<string>();

  // Build nodes
  for (const acc of accomplishments) {
    const accId = acc.frontmatter.id;
    nodeIds.add(accId);

    // Build task map: task_id -> task_name
    const tasks: Record<string, string> = {};
    for (const task of acc.tasks) {
      const taskId = generateTaskId(accId, task);
      tasks[taskId] = task.name;
    }

    const node: GraphNode = {
      id: accId,
      title: acc.frontmatter.title,
      status: acc.frontmatter.status,
      priority: acc.frontmatter.priority,
      effort: acc.frontmatter.effort,
      is_blocked: acc.is_blocked || false,
      in_progress: acc.frontmatter.inProgress,
      tasks,
    };

    allNodes.push(node);
    nodeMap.set(accId, node);
  }

  // Build edges from depends_on relationships
  for (const acc of accomplishments) {
    const blockedId = acc.frontmatter.id;

    for (const blockerId of acc.frontmatter.depends_on) {
      // Only add edge if both nodes exist in our filtered set
      if (nodeIds.has(blockerId)) {
        allEdges.push({
          from: blockerId,
          to: blockedId,
        });
      }
    }
  }

  // Find connected components
  const components = findConnectedComponents(Array.from(nodeIds), allEdges);

  // Convert components to graphs and find the largest
  const graphs: ConnectedGraph[] = [];

  for (const [, componentNodeIds] of components) {
    const componentNodes = Array.from(componentNodeIds)
      .map(id => nodeMap.get(id)!)
      .filter(Boolean);

    const componentEdges = allEdges.filter(
      edge => componentNodeIds.has(edge.from) && componentNodeIds.has(edge.to)
    );

    graphs.push({
      node_count: componentNodes.length,
      edge_count: componentEdges.length,
      nodes: componentNodes,
      edges: componentEdges,
    });
  }

  // Sort by node count descending to find the largest
  graphs.sort((a, b) => b.node_count - a.node_count);

  // The largest graph is the main graph, rest are orphaned
  const mainGraph = graphs[0] || { node_count: 0, edge_count: 0, nodes: [], edges: [] };
  const orphanedGraphs = graphs.slice(1);

  return {
    total_node_count: allNodes.length,
    total_edge_count: allEdges.length,
    main_graph: mainGraph,
    orphaned_graphs: orphanedGraphs,
    orphaned_graph_count: orphanedGraphs.length,
  };
}

