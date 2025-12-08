import { z } from 'zod';
import { Config, AccomplishmentStatus } from '../models/types.js';
import { listAccomplishments as listAccomplishmentsService } from '../services/accomplishment-service.js';

// Schema for the tool
export const listAccomplishmentsSchema = z.object({
  status: z.enum(['Not Started', 'In Progress', 'Completed', 'Blocked']).optional(),
  canvas_source: z.string().optional(),
});

export type ListAccomplishmentsInput = z.infer<typeof listAccomplishmentsSchema>;

export const listAccomplishmentsDefinition = {
  name: 'list_accomplishments',
  description: 'List all accomplishments with optional filtering by status or canvas source.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
        description: 'Filter by status',
      },
      canvas_source: {
        type: 'string',
        description: 'Filter by canvas file path',
      },
    },
    required: [],
  },
};

export async function handleListAccomplishments(
  config: Config,
  input: ListAccomplishmentsInput
): Promise<unknown> {
  const summaries = await listAccomplishmentsService(
    config,
    input.status as AccomplishmentStatus | undefined,
    input.canvas_source
  );

  return {
    count: summaries.length,
    accomplishments: summaries,
  };
}

