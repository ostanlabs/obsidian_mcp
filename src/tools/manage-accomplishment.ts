import { z } from 'zod';
import { Config, MCPError } from '../models/types.js';
import {
  createAccomplishment,
  getAccomplishment,
  updateAccomplishment,
  deleteAccomplishment,
} from '../services/accomplishment-service.js';
import {
  updateStatusIndicator,
  removeStatusIndicator,
} from '../services/status-indicator-service.js';

// Schema for the tool
export const manageAccomplishmentSchema = z.object({
  operation: z.enum(['create', 'update', 'delete']),
  id: z.string().optional(),
  data: z.object({
    title: z.string().optional(),
    effort: z.enum(['Business', 'Infra', 'Engineering', 'Research']).optional(),
    priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
    status: z.enum(['Not Started', 'In Progress', 'Completed', 'Blocked']).optional(),
    inProgress: z.boolean().optional(),
    outcome: z.string().optional(),
    acceptance_criteria: z.array(z.string()).optional(),
    depends_on: z.array(z.string()).optional(),
    canvas_source: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
});

export type ManageAccomplishmentInput = z.infer<typeof manageAccomplishmentSchema>;

export const manageAccomplishmentDefinition = {
  name: 'manage_accomplishment',
  description: `Create, update, or delete a SINGLE accomplishment.

NOTE: For creating MULTIPLE accomplishments, use batch_operations instead - it's more efficient.

When creating, pass depends_on to set up dependencies in one step (no need for separate manage_dependency calls).
Example: { "operation": "create", "data": { "title": "Build API", "effort": "Engineering", "depends_on": ["ACC-001"] } }`,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['create', 'update', 'delete'],
        description: 'The operation to perform',
      },
      id: {
        type: 'string',
        description: 'Accomplishment ID (required for update/delete)',
      },
      data: {
        type: 'object',
        description: 'Accomplishment data (required for create, optional for update)',
        properties: {
          title: { type: 'string', description: 'Accomplishment title' },
          effort: {
            type: 'string',
            enum: ['Business', 'Infra', 'Engineering', 'Research'],
            description: 'Effort type'
          },
          priority: {
            type: 'string',
            enum: ['Low', 'Medium', 'High', 'Critical'],
            description: 'Priority level'
          },
          status: {
            type: 'string',
            enum: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
            description: 'Status'
          },
          inProgress: { type: 'boolean', description: 'Whether actively being worked on' },
          outcome: { type: 'string', description: 'Outcome description' },
          acceptance_criteria: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of acceptance criteria'
          },
          depends_on: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of accomplishments this depends on - creates edges automatically'
          },
          canvas_source: { type: 'string', description: 'Canvas file path' },
          notes: { type: 'string', description: 'Additional notes' },
        },
      },
    },
    required: ['operation'],
  },
};

export async function handleManageAccomplishment(
  config: Config,
  input: ManageAccomplishmentInput
): Promise<unknown> {
  const { operation, id, data } = input;

  switch (operation) {
    case 'create': {
      if (!data?.title || !data?.effort) {
        throw new MCPError(
          'Create operation requires data with title and effort',
          'VALIDATION_ERROR',
          400
        );
      }

      const accomplishment = await createAccomplishment(config, {
        title: data.title,
        effort: data.effort,
        priority: data.priority,
        status: data.status,
        outcome: data.outcome,
        acceptance_criteria: data.acceptance_criteria,
        depends_on: data.depends_on,
        canvas_source: data.canvas_source,
      });

      // Update status indicator on canvas
      await updateStatusIndicator(
        config,
        accomplishment.frontmatter.id,
        accomplishment.frontmatter.status,
        data.canvas_source
      );

      return {
        success: true,
        operation: 'create',
        accomplishment: {
          id: accomplishment.frontmatter.id,
          title: accomplishment.frontmatter.title,
          status: accomplishment.frontmatter.status,
          effort: accomplishment.frontmatter.effort,
          priority: accomplishment.frontmatter.priority,
        },
      };
    }

    case 'update': {
      if (!id) {
        throw new MCPError(
          'Update operation requires id',
          'VALIDATION_ERROR',
          400
        );
      }

      const accomplishment = await updateAccomplishment(config, id, data || {});

      // Update status indicator on canvas
      await updateStatusIndicator(
        config,
        accomplishment.frontmatter.id,
        accomplishment.frontmatter.status,
        accomplishment.frontmatter.canvas_source
      );

      return {
        success: true,
        operation: 'update',
        accomplishment: {
          id: accomplishment.frontmatter.id,
          title: accomplishment.frontmatter.title,
          status: accomplishment.frontmatter.status,
          effort: accomplishment.frontmatter.effort,
          priority: accomplishment.frontmatter.priority,
          inProgress: accomplishment.frontmatter.inProgress,
        },
      };
    }

    case 'delete': {
      if (!id) {
        throw new MCPError(
          'Delete operation requires id',
          'VALIDATION_ERROR',
          400
        );
      }

      // Get accomplishment first to know the canvas source
      const acc = await getAccomplishment(config, id);
      const canvasSource = acc.frontmatter.canvas_source;

      await deleteAccomplishment(config, id);

      // Remove status indicator from canvas
      await removeStatusIndicator(config, id, canvasSource);

      return {
        success: true,
        operation: 'delete',
        id,
      };
    }

    default:
      throw new MCPError(`Unknown operation: ${operation}`, 'VALIDATION_ERROR', 400);
  }
}

