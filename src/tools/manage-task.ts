import { z } from 'zod';
import { Config, MCPError } from '../models/types.js';
import { addTask, updateTask, removeTask } from '../services/task-service.js';
import { generateTaskId } from '../parsers/markdown-parser.js';

// Schema for the tool
export const manageTaskSchema = z.object({
  operation: z.enum(['add', 'update', 'remove']),
  accomplishment_id: z.string(),
  task_id: z.string().optional(),
  data: z.object({
    name: z.string().optional(),
    goal: z.string().optional(),
    description: z.string().optional(),
    technical_notes: z.string().optional(),
    estimate: z.number().optional(),
    status: z.enum(['Open', 'InProgress', 'Complete', 'OnHold']).optional(),
    notes: z.string().optional(),
  }).optional(),
});

export type ManageTaskInput = z.infer<typeof manageTaskSchema>;

export const manageTaskDefinition = {
  name: 'manage_task',
  description: 'Add, update, or remove tasks within an accomplishment. For add: provide accomplishment_id and data with name and goal. For update/remove: provide accomplishment_id and task_id.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['add', 'update', 'remove'],
        description: 'The operation to perform',
      },
      accomplishment_id: {
        type: 'string',
        description: 'ID of the parent accomplishment',
      },
      task_id: {
        type: 'string',
        description: 'Task ID (required for update/remove). Format: ACC-XXX:Task N:Name',
      },
      data: {
        type: 'object',
        description: 'Task data (required for add, optional for update)',
        properties: {
          name: { type: 'string', description: 'Task name' },
          goal: { type: 'string', description: 'What the task achieves' },
          description: { type: 'string', description: 'Task details' },
          technical_notes: { type: 'string', description: 'Implementation notes' },
          estimate: { type: 'number', description: 'Hours estimate' },
          status: { 
            type: 'string', 
            enum: ['Open', 'InProgress', 'Complete', 'OnHold'],
            description: 'Task status' 
          },
          notes: { type: 'string', description: 'Additional notes' },
        },
      },
    },
    required: ['operation', 'accomplishment_id'],
  },
};

export async function handleManageTask(
  config: Config,
  input: ManageTaskInput
): Promise<unknown> {
  const { operation, accomplishment_id, task_id, data } = input;

  switch (operation) {
    case 'add': {
      if (!data?.name || !data?.goal) {
        throw new MCPError(
          'Add operation requires data with name and goal',
          'VALIDATION_ERROR',
          400
        );
      }
      
      const task = await addTask(config, accomplishment_id, {
        name: data.name,
        goal: data.goal,
        description: data.description,
        technical_notes: data.technical_notes,
        estimate: data.estimate,
        status: data.status,
        notes: data.notes,
      });
      
      return {
        success: true,
        operation: 'add',
        accomplishment_id,
        task: {
          task_id: generateTaskId(accomplishment_id, task),
          number: task.number,
          name: task.name,
          status: task.status,
        },
      };
    }

    case 'update': {
      if (!task_id) {
        throw new MCPError(
          'Update operation requires task_id',
          'VALIDATION_ERROR',
          400
        );
      }
      
      const task = await updateTask(config, accomplishment_id, task_id, data || {});
      
      return {
        success: true,
        operation: 'update',
        accomplishment_id,
        task: {
          task_id: generateTaskId(accomplishment_id, task),
          number: task.number,
          name: task.name,
          status: task.status,
        },
      };
    }

    case 'remove': {
      if (!task_id) {
        throw new MCPError(
          'Remove operation requires task_id',
          'VALIDATION_ERROR',
          400
        );
      }
      
      await removeTask(config, accomplishment_id, task_id);
      
      return {
        success: true,
        operation: 'remove',
        accomplishment_id,
        task_id,
      };
    }

    default:
      throw new MCPError(`Unknown operation: ${operation}`, 'VALIDATION_ERROR', 400);
  }
}

