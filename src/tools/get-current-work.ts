import { z } from 'zod';
import { Config } from '../models/types.js';
import { listAllAccomplishments } from '../services/accomplishment-service.js';
import { generateTaskId } from '../parsers/markdown-parser.js';

// Schema for the tool (no parameters)
export const getCurrentWorkSchema = z.object({});

export type GetCurrentWorkInput = z.infer<typeof getCurrentWorkSchema>;

export const getCurrentWorkDefinition = {
  name: 'get_current_work',
  description: 'Get all accomplishments with inProgress=true and all tasks with status=InProgress. Shows what is currently being actively worked on.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleGetCurrentWork(
  config: Config,
  _input: GetCurrentWorkInput
): Promise<unknown> {
  const allAccomplishments = await listAllAccomplishments(config);

  // Filter accomplishments that are in progress
  const inProgressAccomplishments = allAccomplishments.filter(
    a => a.frontmatter.inProgress
  );

  // Build response with accomplishments and their in-progress tasks
  const accomplishments = inProgressAccomplishments.map(acc => {
    const inProgressTasks = acc.tasks
      .filter(t => t.status === 'InProgress')
      .map(t => ({
        task_id: generateTaskId(acc.frontmatter.id, t),
        number: t.number,
        name: t.name,
        goal: t.goal,
        estimate: t.estimate,
      }));

    return {
      id: acc.frontmatter.id,
      title: acc.frontmatter.title,
      status: acc.frontmatter.status,
      priority: acc.frontmatter.priority,
      effort: acc.frontmatter.effort,
      updated: acc.frontmatter.updated,
      tasks_in_progress: inProgressTasks,
      total_tasks: acc.tasks.length,
      completed_tasks: acc.tasks.filter(t => t.status === 'Complete').length,
    };
  });

  // Also find any InProgress tasks in accomplishments that aren't marked inProgress
  // (edge case, but good to surface)
  const orphanedInProgressTasks: Array<{
    accomplishment_id: string;
    accomplishment_title: string;
    task_id: string;
    task_name: string;
  }> = [];

  for (const acc of allAccomplishments) {
    if (!acc.frontmatter.inProgress) {
      for (const task of acc.tasks) {
        if (task.status === 'InProgress') {
          orphanedInProgressTasks.push({
            accomplishment_id: acc.frontmatter.id,
            accomplishment_title: acc.frontmatter.title,
            task_id: generateTaskId(acc.frontmatter.id, task),
            task_name: task.name,
          });
        }
      }
    }
  }

  return {
    accomplishments,
    orphaned_in_progress_tasks: orphanedInProgressTasks,
    summary: {
      accomplishments_in_progress: accomplishments.length,
      total_tasks_in_progress: accomplishments.reduce(
        (sum, a) => sum + a.tasks_in_progress.length,
        0
      ) + orphanedInProgressTasks.length,
    },
  };
}

