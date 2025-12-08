import { z } from 'zod';
import { Config } from '../models/types.js';
import { getAccomplishment as getAccomplishmentService } from '../services/accomplishment-service.js';
import { generateTaskId } from '../parsers/markdown-parser.js';

// Schema for the tool
export const getAccomplishmentSchema = z.object({
  id: z.string(),
});

export type GetAccomplishmentInput = z.infer<typeof getAccomplishmentSchema>;

export const getAccomplishmentDefinition = {
  name: 'get_accomplishment',
  description: 'Get full details of a single accomplishment including frontmatter, outcome, acceptance criteria, tasks, and notes.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Accomplishment ID (e.g., ACC-001)',
      },
    },
    required: ['id'],
  },
};

export async function handleGetAccomplishment(
  config: Config,
  input: GetAccomplishmentInput
): Promise<unknown> {
  const accomplishment = await getAccomplishmentService(config, input.id);

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

