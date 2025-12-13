import { z } from 'zod';
import { Config, CreateAccomplishmentData, Effort, Priority, AccomplishmentStatus, TaskStatus } from '../models/types.js';
import { createAccomplishment } from '../services/accomplishment-service.js';
import { addTask } from '../services/task-service.js';
import { addDependency } from '../services/dependency-service.js';

// Schema for batch operations
const accomplishmentDataSchema = z.object({
  title: z.string(),
  effort: z.enum(['Business', 'Infra', 'Engineering', 'Research']),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  status: z.enum(['Not Started', 'In Progress', 'Completed', 'Blocked']).optional(),
  outcome: z.string().optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
  canvas_source: z.string().optional(),
});

const taskDataSchema = z.object({
  accomplishment_ref: z.string(),
  name: z.string(),
  goal: z.string(),
  description: z.string().optional(),
  technical_notes: z.string().optional(),
  estimate: z.number().optional(),
  status: z.enum(['Open', 'InProgress', 'Done', 'Blocked']).optional(),
});

const dependencyDataSchema = z.object({
  blocker_ref: z.string(),
  blocked_ref: z.string(),
});

export const batchOperationsSchema = z.object({
  accomplishments: z.array(accomplishmentDataSchema).optional(),
  tasks: z.array(taskDataSchema).optional(),
  dependencies: z.array(dependencyDataSchema).optional(),
});

export type BatchOperationsInput = z.infer<typeof batchOperationsSchema>;

export const batchOperationsDefinition = {
  name: 'batch_operations',
  description: `Create multiple accomplishments, tasks, and dependencies in a single operation.
This is the PREFERRED method for creating multiple items - more efficient and reduces file operations.

Features:
- Use $0, $1, $2, etc. to reference accomplishments created in the same batch by their index
- Dependencies between batch items are resolved automatically
- Pass depends_on directly when creating accomplishments to set up the dependency chain

Example: Create 3 accomplishments with dependencies and tasks:
{
  "accomplishments": [
    { "title": "Setup DB", "effort": "Engineering", "priority": "High" },
    { "title": "Build API", "effort": "Engineering", "depends_on": ["$0"] },
    { "title": "Create UI", "effort": "Engineering", "depends_on": ["$1"] }
  ],
  "tasks": [
    { "accomplishment_ref": "$0", "name": "Install Postgres", "goal": "DB running locally" },
    { "accomplishment_ref": "$0", "name": "Create schema", "goal": "Tables created" },
    { "accomplishment_ref": "$1", "name": "Setup Express", "goal": "Server running" }
  ]
}`,
  inputSchema: {
    type: 'object',
    properties: {
      accomplishments: {
        type: 'array',
        description: 'Accomplishments to create. Use $0, $1, etc. in depends_on to reference other batch items.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Accomplishment title' },
            effort: { type: 'string', enum: ['Business', 'Infra', 'Engineering', 'Research'] },
            priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
            status: { type: 'string', enum: ['Not Started', 'In Progress', 'Completed', 'Blocked'] },
            outcome: { type: 'string', description: 'Desired outcome' },
            acceptance_criteria: { type: 'array', items: { type: 'string' } },
            depends_on: { type: 'array', items: { type: 'string' }, description: 'IDs or batch refs ($0, $1) of blockers' },
            canvas_source: { type: 'string' },
          },
          required: ['title', 'effort'],
        },
      },
      tasks: {
        type: 'array',
        description: 'Tasks to create. Use accomplishment_ref to specify which accomplishment.',
        items: {
          type: 'object',
          properties: {
            accomplishment_ref: { type: 'string', description: 'ACC-XXX or $0, $1, etc. for batch reference' },
            name: { type: 'string' },
            goal: { type: 'string' },
            description: { type: 'string' },
            technical_notes: { type: 'string' },
            estimate: { type: 'number', description: 'Hours estimate' },
            status: { type: 'string', enum: ['Open', 'InProgress', 'Done', 'Blocked'] },
          },
          required: ['accomplishment_ref', 'name', 'goal'],
        },
      },
      dependencies: {
        type: 'array',
        description: 'Additional dependencies to create (beyond those in depends_on)',
        items: {
          type: 'object',
          properties: {
            blocker_ref: { type: 'string', description: 'ACC-XXX or $0, $1' },
            blocked_ref: { type: 'string', description: 'ACC-XXX or $0, $1' },
          },
          required: ['blocker_ref', 'blocked_ref'],
        },
      },
    },
  },
};

interface CreatedAccomplishment {
  id: string;
  title: string;
}

interface CreatedTask {
  task_id: string;
  accomplishment_id: string;
  name: string;
}

interface CreatedDependency {
  blocker_id: string;
  blocked_id: string;
}

interface BatchResult {
  success: boolean;
  created_accomplishments: CreatedAccomplishment[];
  created_tasks: CreatedTask[];
  created_dependencies: CreatedDependency[];
  errors: string[];
}

function resolveRef(ref: string, batchIds: Map<number, string>): string | null {
  if (ref.startsWith('$')) {
    const index = parseInt(ref.slice(1), 10);
    return batchIds.get(index) || null;
  }
  return ref;
}

function generateTaskId(accId: string, taskNumber: number, taskName: string): string {
  return `${accId}:Task ${taskNumber}:${taskName}`;
}

export async function handleBatchOperations(
  config: Config,
  input: BatchOperationsInput
): Promise<BatchResult> {
  const result: BatchResult = {
    success: true,
    created_accomplishments: [],
    created_tasks: [],
    created_dependencies: [],
    errors: [],
  };

  const batchIds = new Map<number, string>();

  // Phase 1: Create accomplishments
  if (input.accomplishments) {
    for (let i = 0; i < input.accomplishments.length; i++) {
      const accData = input.accomplishments[i];
      try {
        const resolvedDependsOn: string[] = [];
        if (accData.depends_on) {
          for (const dep of accData.depends_on) {
            const resolved = resolveRef(dep, batchIds);
            if (resolved) {
              resolvedDependsOn.push(resolved);
            } else if (dep.startsWith('$')) {
              result.errors.push(`Cannot resolve reference ${dep} - not yet created`);
            } else {
              resolvedDependsOn.push(dep);
            }
          }
        }

        const createData: CreateAccomplishmentData = {
          title: accData.title,
          effort: accData.effort as Effort,
          priority: accData.priority as Priority | undefined,
          status: accData.status as AccomplishmentStatus | undefined,
          outcome: accData.outcome,
          acceptance_criteria: accData.acceptance_criteria,
          depends_on: resolvedDependsOn,
          canvas_source: accData.canvas_source,
        };

        const accomplishment = await createAccomplishment(config, createData);
        batchIds.set(i, accomplishment.frontmatter.id);
        result.created_accomplishments.push({
          id: accomplishment.frontmatter.id,
          title: accomplishment.frontmatter.title,
        });

        for (const blockerId of resolvedDependsOn) {
          result.created_dependencies.push({
            blocker_id: blockerId,
            blocked_id: accomplishment.frontmatter.id,
          });
        }
      } catch (error) {
        result.success = false;
        result.errors.push(`Failed to create accomplishment "${accData.title}": ${error}`);
      }
    }
  }

  // Phase 2: Create tasks
  if (input.tasks) {
    for (const taskData of input.tasks) {
      try {
        const accId = resolveRef(taskData.accomplishment_ref, batchIds);
        if (!accId) {
          result.errors.push(`Cannot resolve accomplishment reference: ${taskData.accomplishment_ref}`);
          continue;
        }

        const task = await addTask(config, accId, {
          name: taskData.name,
          goal: taskData.goal,
          description: taskData.description,
          technical_notes: taskData.technical_notes,
          estimate: taskData.estimate,
          status: taskData.status as TaskStatus | undefined,
        });

        result.created_tasks.push({
          task_id: generateTaskId(accId, task.number, task.name),
          accomplishment_id: accId,
          name: task.name,
        });
      } catch (error) {
        result.success = false;
        result.errors.push(`Failed to create task "${taskData.name}": ${error}`);
      }
    }
  }

  // Phase 3: Create additional dependencies
  if (input.dependencies) {
    for (const depData of input.dependencies) {
      try {
        const blockerId = resolveRef(depData.blocker_ref, batchIds);
        const blockedId = resolveRef(depData.blocked_ref, batchIds);

        if (!blockerId) {
          result.errors.push(`Cannot resolve blocker reference: ${depData.blocker_ref}`);
          continue;
        }
        if (!blockedId) {
          result.errors.push(`Cannot resolve blocked reference: ${depData.blocked_ref}`);
          continue;
        }

        await addDependency(config, blockerId, blockedId);
        result.created_dependencies.push({ blocker_id: blockerId, blocked_id: blockedId });
      } catch (error) {
        result.success = false;
        result.errors.push(`Failed to create dependency: ${error}`);
      }
    }
  }

  return result;
}
