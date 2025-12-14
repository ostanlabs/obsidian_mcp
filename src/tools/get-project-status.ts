import { z } from 'zod';
import { Config } from '../models/types.js';
import { listAllAccomplishments } from '../services/accomplishment-service.js';

// Schema for the tool
export const getProjectStatusSchema = z.object({
  canvas_source: z.string().optional(),
});

export type GetProjectStatusInput = z.infer<typeof getProjectStatusSchema>;

export const getProjectStatusDefinition = {
  name: 'get_project_status',
  description: 'Get project overview and statistics: counts by status, effort type, blocked items, ready to start, and task progress.',
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

export async function handleGetProjectStatus(
  config: Config,
  input: GetProjectStatusInput
): Promise<unknown> {
  let accomplishments = await listAllAccomplishments(config);

  // Filter by canvas source if provided
  if (input.canvas_source) {
    accomplishments = accomplishments.filter(
      a => a.frontmatter.canvas_source === input.canvas_source
    );
  }

  // Count by status
  const byStatus: Record<string, number> = {
    'Not Started': 0,
    'In Progress': 0,
    'Completed': 0,
    'Blocked': 0,
  };

  // Count by effort
  const byEffort: Record<string, number> = {
    Business: 0,
    Engineering: 0,
    Infra: 0,
    Research: 0,
  };

  // Count by priority
  const byPriority: Record<string, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };

  let blockedCount = 0;
  let readyToStartCount = 0;
  let inProgressCount = 0;
  let totalTasks = 0;
  let completedTasks = 0;
  let lastUpdated: string | null = null;

  for (const acc of accomplishments) {
    // Track most recent update
    if (!lastUpdated || acc.frontmatter.updated > lastUpdated) {
      lastUpdated = acc.frontmatter.updated;
    }
    // Status counts
    byStatus[acc.frontmatter.status] = (byStatus[acc.frontmatter.status] || 0) + 1;

    // Effort counts
    byEffort[acc.frontmatter.effort] = (byEffort[acc.frontmatter.effort] || 0) + 1;

    // Priority counts
    byPriority[acc.frontmatter.priority] = (byPriority[acc.frontmatter.priority] || 0) + 1;

    // Blocked count
    if (acc.is_blocked) {
      blockedCount++;
    }

    // Ready to start count
    if (acc.frontmatter.status === 'Not Started' && !acc.is_blocked) {
      readyToStartCount++;
    }

    // In progress count
    if (acc.frontmatter.inProgress) {
      inProgressCount++;
    }

    // Task counts
    totalTasks += acc.tasks.length;
    completedTasks += acc.tasks.filter(t => t.status === 'Complete').length;
  }

  return {
    canvas_source: input.canvas_source || config.defaultCanvas,
    total_accomplishments: accomplishments.length,
    by_status: byStatus,
    by_effort: byEffort,
    by_priority: byPriority,
    blocked_count: blockedCount,
    ready_to_start_count: readyToStartCount,
    in_progress_count: inProgressCount,
    total_tasks: totalTasks,
    completed_tasks: completedTasks,
    task_completion_percentage: totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0,
    last_updated: lastUpdated,
  };
}

