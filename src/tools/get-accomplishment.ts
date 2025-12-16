import { z } from 'zod';
import { Config, Accomplishment, ValidationError } from '../models/types.js';
import { getAccomplishment as getAccomplishmentService } from '../services/accomplishment-service.js';
import { generateTaskId } from '../parsers/markdown-parser.js';

// Schema for the tool - supports single id or array of ids
export const getAccomplishmentSchema = z.object({
  id: z.string().optional(),
  ids: z.array(z.string()).optional(),
}).refine(data => data.id || data.ids, {
  message: 'Either id or ids must be provided',
});

export type GetAccomplishmentInput = z.infer<typeof getAccomplishmentSchema>;

export const getAccomplishmentDefinition = {
  name: 'get_accomplishment',
  description: 'Get full details of accomplishment(s). Use "id" for a single accomplishment or "ids" for bulk retrieval.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Single accomplishment ID (e.g., ACC-001)',
      },
      ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of accomplishment IDs for bulk retrieval',
      },
    },
    required: [],
  },
};

/**
 * Format accomplishment for response
 */
function formatAccomplishment(accomplishment: Accomplishment) {
  return {
    id: accomplishment.frontmatter.id,
    title: accomplishment.frontmatter.title,
    type: accomplishment.frontmatter.type,
    effort: accomplishment.frontmatter.effort,
    status: accomplishment.frontmatter.status,
    priority: accomplishment.frontmatter.priority,
    inProgress: accomplishment.frontmatter.inProgress,
    depends_on: accomplishment.frontmatter.depends_on,
    is_blocked: accomplishment.is_blocked,
    created: accomplishment.frontmatter.created,
    updated: accomplishment.frontmatter.updated,
    canvas_source: accomplishment.frontmatter.canvas_source,
    outcome: accomplishment.outcome,
    acceptance_criteria: accomplishment.acceptance_criteria,
    tasks: accomplishment.tasks.map(task => ({
      task_id: generateTaskId(accomplishment.frontmatter.id, task),
      number: task.number,
      name: task.name,
      goal: task.goal,
      description: task.description,
      technical_notes: task.technical_notes,
      estimate: task.estimate,
      status: task.status,
      notes: task.notes,
    })),
    notes: accomplishment.notes,
  };
}

export async function handleGetAccomplishment(
  config: Config,
  input: GetAccomplishmentInput
): Promise<unknown> {
  // Validate input
  if (!input.id && !input.ids) {
    throw new ValidationError('Either id or ids must be provided');
  }

  // Single ID mode
  if (input.id) {
    const accomplishment = await getAccomplishmentService(config, input.id);
    return formatAccomplishment(accomplishment);
  }

  // Bulk IDs mode
  const results = await Promise.all(
    input.ids!.map(async (id) => {
      try {
        const accomplishment = await getAccomplishmentService(config, id);
        return formatAccomplishment(accomplishment);
      } catch (error) {
        // Return error info for this ID instead of failing entire request
        return {
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    })
  );

  return {
    count: results.length,
    accomplishments: results,
  };
}

