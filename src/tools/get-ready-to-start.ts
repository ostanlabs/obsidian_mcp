import { z } from 'zod';
import { Config } from '../models/types.js';
import { listAllAccomplishments } from '../services/accomplishment-service.js';

// Schema for the tool (no parameters)
export const getReadyToStartSchema = z.object({});

export type GetReadyToStartInput = z.infer<typeof getReadyToStartSchema>;

export const getReadyToStartDefinition = {
  name: 'get_ready_to_start',
  description: 'Get accomplishments that are ready to begin work: status is "Not Started" and all dependencies are completed (or no dependencies).',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleGetReadyToStart(
  config: Config,
  _input: GetReadyToStartInput
): Promise<unknown> {
  const allAccomplishments = await listAllAccomplishments(config);

  // Filter for ready to start:
  // - Status is "Not Started"
  // - Not blocked (all dependencies completed or no dependencies)
  const readyItems = allAccomplishments.filter(acc => {
    if (acc.frontmatter.status !== 'Not Started') {
      return false;
    }
    // is_blocked is computed in listAllAccomplishments
    return !acc.is_blocked;
  });

  // Sort by priority (Critical > High > Medium > Low)
  const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  readyItems.sort((a, b) => {
    const aOrder = priorityOrder[a.frontmatter.priority as keyof typeof priorityOrder] ?? 4;
    const bOrder = priorityOrder[b.frontmatter.priority as keyof typeof priorityOrder] ?? 4;
    return aOrder - bOrder;
  });

  const items = readyItems.map(acc => ({
    id: acc.frontmatter.id,
    title: acc.frontmatter.title,
    priority: acc.frontmatter.priority,
    effort: acc.frontmatter.effort,
    updated: acc.frontmatter.updated,
    task_count: acc.tasks.length,
    outcome: acc.outcome,
  }));

  return {
    count: items.length,
    ready_items: items,
  };
}

