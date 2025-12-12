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
  description: 'Get the full dependency graph of accomplishments. Returns nodes (accomplishments with their tasks) and edges (dependencies). Each node contains a map of task IDs to task names for easy reference.',
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

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
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

    nodes.push({
      id: accId,
      title: acc.frontmatter.title,
      status: acc.frontmatter.status,
      priority: acc.frontmatter.priority,
      effort: acc.frontmatter.effort,
      is_blocked: acc.is_blocked || false,
      in_progress: acc.frontmatter.inProgress,
      tasks,
    });
  }

  // Build edges from depends_on relationships
  for (const acc of accomplishments) {
    const blockedId = acc.frontmatter.id;
    
    for (const blockerId of acc.frontmatter.depends_on) {
      // Only add edge if both nodes exist in our filtered set
      if (nodeIds.has(blockerId)) {
        edges.push({
          from: blockerId,
          to: blockedId,
        });
      }
    }
  }

  return {
    node_count: nodes.length,
    edge_count: edges.length,
    nodes,
    edges,
  };
}

