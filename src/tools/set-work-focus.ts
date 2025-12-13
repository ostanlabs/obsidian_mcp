import { z } from 'zod';
import { Config, MCPError } from '../models/types.js';
import { getAccomplishment, updateAccomplishment } from '../services/accomplishment-service.js';
import { setTaskStatus } from '../services/task-service.js';
import { updateStatusIndicator } from '../services/status-indicator-service.js';

// Schema for the tool
export const setWorkFocusSchema = z.object({
  accomplishment_id: z.string(),
  in_progress: z.boolean().optional(),
  task_id: z.string().optional(),
  task_status: z.enum(['Open', 'InProgress', 'Complete', 'OnHold']).optional(),
});

export type SetWorkFocusInput = z.infer<typeof setWorkFocusSchema>;

export const setWorkFocusDefinition = {
  name: 'set_work_focus',
  description: "Set an accomplishment's inProgress flag (red border in Obsidian) and/or update a task's status. Setting a task to InProgress automatically sets the accomplishment's inProgress to true.",
  inputSchema: {
    type: 'object',
    properties: {
      accomplishment_id: {
        type: 'string',
        description: 'ID of the accomplishment',
      },
      in_progress: {
        type: 'boolean',
        description: "Set the accomplishment's inProgress flag",
      },
      task_id: {
        type: 'string',
        description: 'Task ID to update (optional). Format: ACC-XXX:Task N:Name',
      },
      task_status: {
        type: 'string',
        enum: ['Open', 'InProgress', 'Complete', 'OnHold'],
        description: 'New status for the task (required if task_id provided)',
      },
    },
    required: ['accomplishment_id'],
  },
};

export async function handleSetWorkFocus(
  config: Config,
  input: SetWorkFocusInput
): Promise<unknown> {
  const { accomplishment_id, in_progress, task_id, task_status } = input;

  let accomplishment = await getAccomplishment(config, accomplishment_id);
  let updatedTask = null;

  // Handle task status update
  if (task_id && task_status) {
    const result = await setTaskStatus(config, accomplishment_id, task_id, task_status);
    accomplishment = result.accomplishment;
    updatedTask = result.task;
  }

  // Handle accomplishment inProgress update (if explicitly set and not already handled by task)
  if (in_progress !== undefined) {
    // Only update if different from current or if task didn't already set it
    if (accomplishment.frontmatter.inProgress !== in_progress) {
      accomplishment = await updateAccomplishment(config, accomplishment_id, {
        inProgress: in_progress,
      });
    }
  }

  // Update status indicator on canvas
  await updateStatusIndicator(
    config,
    accomplishment.frontmatter.id,
    accomplishment.frontmatter.status,
    accomplishment.frontmatter.canvas_source
  );

  const response: Record<string, unknown> = {
    success: true,
    accomplishment: {
      id: accomplishment.frontmatter.id,
      title: accomplishment.frontmatter.title,
      inProgress: accomplishment.frontmatter.inProgress,
      status: accomplishment.frontmatter.status,
    },
  };

  if (updatedTask) {
    response.task = {
      task_id,
      name: updatedTask.name,
      status: updatedTask.status,
    };
  }

  return response;
}

